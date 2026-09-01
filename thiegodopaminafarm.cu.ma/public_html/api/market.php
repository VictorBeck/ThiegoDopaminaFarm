<?php
/**
 * THIEGO DOPAMINA FARM — api/market.php
 * Mercado entre jogadores (item C1 do plano de conteúdo).
 *
 * Rotas:
 *   GET  ?route=list    — anúncios ativos de todos os jogadores (limit 100),
 *                         com flag `mine` para os do próprio usuário.
 *   POST ?route=list    — cria um anúncio de venda de item (coins ou dopamine).
 *   POST ?route=buy     — compra um anúncio ativo (apenas coins por enquanto).
 *   POST ?route=cancel  — cancela um anúncio próprio e devolve o item.
 *   GET  ?route=mine    — lista os anúncios do jogador (todos os status).
 *
 * Segurança: statements sempre preparados, CSRF obrigatório em todo POST,
 * rate limit na criação de anúncios e transações com FOR UPDATE na compra
 * e no cancelamento (evita corrida de compra e gasto duplo).
 */

require_once __DIR__ . '/tdf_db.php';

$pdo = tdf_pdo();
tdf_bootstrap();

$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$uid = tdf_current_user($pdo);
if (!$uid) tdf_err(401, 'Não autenticado.');
tdf_require_not_banned($pdo, $uid);

/** Exige CSRF válido em requisições POST (header X-CSRF-Token ou body `csrf`). */
function tdf_market_require_csrf(PDO $pdo): void
{
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');
}

/** Converte uma linha de market_listings no shape público usado pelas rotas de listagem. */
function tdf_market_shape(array $r, int $uid, bool $withStatus = false): array
{
    $out = [
        'id' => (int) $r['id'],
        'seller_id' => (int) $r['seller_id'],
        'seller_name' => (string) ($r['seller_name'] ?? ''),
        'item_type' => (string) $r['item_type'],
        'item_id' => (int) $r['item_id'],
        'item_name' => (string) ($r['item_name'] ?? ''),
        'item_icon' => (string) ($r['item_icon'] ?? ''),
        'item_rarity' => (string) ($r['item_rarity'] ?? ''),
        'qty' => (int) $r['qty'],
        'price_currency' => (string) $r['price_currency'],
        'price_amount' => (float) $r['price_amount'],
        'created_at' => (string) $r['created_at'],
        'mine' => (int) $r['seller_id'] === $uid,
    ];
    if ($withStatus) {
        $out['status'] = (string) $r['status'];
    }
    return $out;
}

/* ------------------------------------------------------------
   1) GET ?route=list — anúncios ativos de todos os jogadores
   ------------------------------------------------------------ */
if ($method === 'GET' && $route === 'list') {
    $st = $pdo->prepare(
        'SELECT ml.id, ml.seller_id, u.username AS seller_name, ml.item_type, ml.item_id,
                i.name AS item_name, i.icon AS item_icon, i.rarity AS item_rarity,
                ml.qty, ml.price_currency, ml.price_amount, ml.created_at
         FROM market_listings ml
         JOIN users u ON u.id = ml.seller_id
         LEFT JOIN items i ON i.id = ml.item_id AND ml.item_type = \'item\'
         WHERE ml.status = \'active\'
         ORDER BY ml.created_at DESC
         LIMIT 100'
    );
    $st->execute();
    $listings = array_map(fn($r) => tdf_market_shape($r, $uid), $st->fetchAll());
    tdf_json(['ok' => true, 'listings' => $listings]);
}

/* ------------------------------------------------------------
   2) POST ?route=list — criar anúncio de venda de item
   ------------------------------------------------------------ */
if ($method === 'POST' && $route === 'list') {
    tdf_market_require_csrf($pdo);
    $b = tdf_body();

    // rate limit: no máximo 30 anúncios por hora por jogador
    if (!tdf_rate_limit($pdo, 'market_list:' . $uid, 30, 3600)) {
        tdf_err(429, 'Muitos anúncios criados. Tente novamente mais tarde.');
    }

    $itemType = (string) ($b['item_type'] ?? 'item');
    if ($itemType !== 'item') {
        // equipamento tem estado próprio (nível, thiego equipado) — complexo demais por enquanto
        tdf_err(422, 'Anúncio de equipamento ainda não é suportado.');
    }
    $itemId = (int) ($b['item_id'] ?? 0);
    $qty = max(1, (int) ($b['qty'] ?? 1));
    $currency = (string) ($b['price_currency'] ?? 'coins');
    $price = (float) ($b['price_amount'] ?? 0);

    // validações de preço
    if (!in_array($currency, ['coins', 'dopamine'], true)) {
        tdf_err(422, 'Moeda de preço inválida.');
    }
    if (!is_finite($price) || $price <= 0) {
        tdf_err(422, 'Preço deve ser maior que zero.');
    }
    if ($price > 1000000000) {
        tdf_err(422, 'Preço acima do limite permitido.');
    }
    if ($currency === 'dopamine' && $price > 1000000) {
        // dopamina é escala log10 (número pequeno) — limite menor
        tdf_err(422, 'Preço em dopamina acima do limite (1e6).');
    }

    // o item precisa existir no catálogo
    $it = $pdo->prepare('SELECT id FROM items WHERE id = :id');
    $it->execute([':id' => $itemId]);
    if (!$it->fetch()) tdf_err(404, 'Item não encontrado.');

    // retira o item do inventário e cria o anúncio na mesma transação
    $pdo->beginTransaction();
    try {
        if (!tdf_take_item($pdo, $uid, $itemId, $qty)) {
            $pdo->rollBack();
            tdf_err(409, 'sem_item');
        }
        $ins = $pdo->prepare(
            'INSERT INTO market_listings (seller_id, item_type, item_id, qty, price_currency, price_amount, status)
             VALUES (:s, :t, :i, :q, :c, :p, \'active\')'
        );
        $ins->execute([
            ':s' => $uid,
            ':t' => $itemType,
            ':i' => $itemId,
            ':q' => $qty,
            ':c' => $currency,
            ':p' => $price,
        ]);
        $listingId = (int) $pdo->lastInsertId();
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    tdf_log($pdo, $uid, 'market_list', [
        'listing' => $listingId, 'item' => $itemId, 'qty' => $qty,
        'currency' => $currency, 'price' => $price,
    ]);
    tdf_json(['ok' => true, 'listing_id' => $listingId]);
}

/* ------------------------------------------------------------
   3) POST ?route=buy — comprar um anúncio ativo (apenas coins)
   ------------------------------------------------------------ */
if ($method === 'POST' && $route === 'buy') {
    tdf_market_require_csrf($pdo);
    $b = tdf_body();
    $listingId = (int) ($b['listing_id'] ?? 0);
    if ($listingId <= 0) tdf_err(422, 'Anúncio inválido.');

    $pdo->beginTransaction();
    try {
        // trava a linha do anúncio: impede que dois compradores comprem ao mesmo tempo
        $st = $pdo->prepare(
            'SELECT ml.*, i.name AS item_name
             FROM market_listings ml
             LEFT JOIN items i ON i.id = ml.item_id AND ml.item_type = \'item\'
             WHERE ml.id = :id
             FOR UPDATE'
        );
        $st->execute([':id' => $listingId]);
        $listing = $st->fetch();
        if (!$listing) {
            $pdo->rollBack();
            tdf_err(404, 'Anúncio não encontrado.');
        }
        // status deixou de ser 'active' (vendido/cancelado ou corrida de compra)
        if ($listing['status'] !== 'active') {
            $pdo->rollBack();
            tdf_err(409, 'Anúncio indisponível.');
        }
        $sellerId = (int) $listing['seller_id'];
        if ($sellerId === $uid) {
            $pdo->rollBack();
            tdf_err(422, 'próprio anúncio');
        }
        if ($listing['price_currency'] !== 'coins') {
            $pdo->rollBack();
            tdf_err(422, 'comprar com dopamine não suportado ainda');
        }
        $price = (int) $listing['price_amount'];

        // verifica o saldo do comprador (linha travada contra gasto duplo)
        $bal = $pdo->prepare('SELECT battle_coins FROM user_progress WHERE user_id = :u FOR UPDATE');
        $bal->execute([':u' => $uid]);
        if ((int) ($bal->fetch()['battle_coins'] ?? 0) < $price) {
            $pdo->rollBack();
            tdf_err(409, 'sem_coins');
        }

        // debita o comprador e credita o vendedor
        tdf_add_coins($pdo, $uid, -$price);
        tdf_add_coins($pdo, $sellerId, $price);

        // entrega o item ao comprador
        tdf_grant_item($pdo, $uid, (int) $listing['item_id'], (int) $listing['qty']);

        // marca o anúncio como vendido
        $upd = $pdo->prepare('UPDATE market_listings SET status = \'sold\' WHERE id = :id');
        $upd->execute([':id' => $listingId]);

        $itemName = (string) ($listing['item_name'] ?? '');
        $qty = (int) $listing['qty'];
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    tdf_log($pdo, $uid, 'market_buy', [
        'listing' => $listingId, 'item' => (int) $listing['item_id'],
        'qty' => (int) $listing['qty'], 'price' => $price, 'seller' => $sellerId,
    ]);
    tdf_log($pdo, $sellerId, 'market_sold', [
        'listing' => $listingId, 'item' => (int) $listing['item_id'],
        'qty' => (int) $listing['qty'], 'price' => $price, 'buyer' => $uid,
    ]);
    tdf_notify($pdo, $sellerId, 'Item vendido!', 'Seu anúncio foi vendido por ' . $price . ' battle coins.');
    tdf_json(['ok' => true, 'item' => $itemName, 'qty' => $qty]);
}

/* ------------------------------------------------------------
   4) POST ?route=cancel — cancelar anúncio próprio (devolve item)
   ------------------------------------------------------------ */
if ($method === 'POST' && $route === 'cancel') {
    tdf_market_require_csrf($pdo);
    $b = tdf_body();
    $listingId = (int) ($b['listing_id'] ?? 0);
    if ($listingId <= 0) tdf_err(422, 'Anúncio inválido.');

    $pdo->beginTransaction();
    try {
        // apenas o dono pode cancelar (seller_id = uid)
        $st = $pdo->prepare(
            'SELECT * FROM market_listings WHERE id = :id AND seller_id = :s FOR UPDATE'
        );
        $st->execute([':id' => $listingId, ':s' => $uid]);
        $listing = $st->fetch();
        if (!$listing) {
            $pdo->rollBack();
            tdf_err(404, 'Anúncio não encontrado.');
        }
        if ($listing['status'] !== 'active') {
            $pdo->rollBack();
            tdf_err(409, 'Anúncio já encerrado.');
        }
        // devolve o item ao inventário e marca como cancelado
        tdf_grant_item($pdo, $uid, (int) $listing['item_id'], (int) $listing['qty']);
        $upd = $pdo->prepare('UPDATE market_listings SET status = \'cancelled\' WHERE id = :id');
        $upd->execute([':id' => $listingId]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    tdf_log($pdo, $uid, 'market_cancel', [
        'listing' => $listingId, 'item' => (int) $listing['item_id'], 'qty' => (int) $listing['qty'],
    ]);
    tdf_json(['ok' => true]);
}

/* ------------------------------------------------------------
   5) GET ?route=mine — anúncios do jogador (todos os status)
   ------------------------------------------------------------ */
if ($method === 'GET' && $route === 'mine') {
    $st = $pdo->prepare(
        'SELECT ml.id, ml.seller_id, ml.status, u.username AS seller_name, ml.item_type, ml.item_id,
                i.name AS item_name, i.icon AS item_icon, i.rarity AS item_rarity,
                ml.qty, ml.price_currency, ml.price_amount, ml.created_at
         FROM market_listings ml
         JOIN users u ON u.id = ml.seller_id
         LEFT JOIN items i ON i.id = ml.item_id AND ml.item_type = \'item\'
         WHERE ml.seller_id = :u
         ORDER BY ml.created_at DESC
         LIMIT 100'
    );
    $st->execute([':u' => $uid]);
    $listings = array_map(fn($r) => tdf_market_shape($r, $uid, true), $st->fetchAll());
    tdf_json(['ok' => true, 'listings' => $listings]);
}

tdf_err(404, 'Rota não encontrada.');

<?php
/**
 * THIEGO DOPAMINA FARM — api/inventory.php
 * Inventário de itens, equipamento/remover, upgrade, vender e
 * desmontar (equipamentos -> fragmentos da raridade).
 */

require_once __DIR__ . '/tdf_db.php';
require_once __DIR__ . '/progress.php';

$pdo = tdf_pdo();
tdf_bootstrap();

$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$uid = tdf_current_user($pdo);
if (!$uid) tdf_err(401, 'Não autenticado.');

function tdf_inv_require_csrf(PDO $pdo, int $uid): void
{
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');
}

function tdf_fragment_slug(string $rarity): string
{
    return match ($rarity) {
        'comum', 'incomum' => 'fragmento-comum',
        'raro' => 'fragmento-raro',
        'epico' => 'fragmento-epico',
        'lendario', 'mitico' => 'fragmento-lendario',
        'divino' => 'fragmento-divino',
        'celestial', 'transcendente' => 'fragmento-celestial',
        'infinito' => 'fragmento-infinito',
        default => 'fragmento-comum',
    };
}

if ($method === 'GET' && $route === 'list') {
    $inv = $pdo->prepare(
        'SELECT i.id AS item_id, i.slug, i.name, i.icon, i.category, i.rarity, i.slot, i.stats, i.effects, i.sell_value, i.description,
                COALESCE(inv.qty,0) AS qty
         FROM inventory inv JOIN items i ON i.id = inv.item_id
         WHERE inv.user_id = :u ORDER BY i.category, i.rarity, i.name'
    );
    $inv->execute([':u' => $uid]);
    $items = [];
    foreach ($inv->fetchAll() as $r) {
        $items[] = [
            'item_id' => (int) $r['item_id'],
            'slug' => $r['slug'],
            'name' => $r['name'],
            'icon' => $r['icon'],
            'category' => $r['category'],
            'rarity' => $r['rarity'],
            'slot' => $r['slot'],
            'stats' => json_decode((string) $r['stats'], true),
            'effects' => json_decode((string) $r['effects'], true),
            'sell_value' => (int) $r['sell_value'],
            'description' => $r['description'],
            'qty' => (int) $r['qty'],
        ];
    }
    $eq = $pdo->prepare(
        'SELECT e.id AS equipment_id, e.thiego_id AS ut_id, e.slot, e.level AS eq_level,
                i.id AS item_id, i.slug, i.name, i.icon, i.rarity, i.stats, i.effects,
                t.name AS thiego_name
         FROM equipment e JOIN items i ON i.id = e.item_id
         JOIN user_thiegos ut ON ut.id = e.thiego_id
         JOIN thiegos t ON t.id = ut.thiego_id
         WHERE e.user_id = :u ORDER BY t.name, e.slot'
    );
    $eq->execute([':u' => $uid]);
    tdf_json(['ok' => true, 'items' => $items, 'equipment' => $eq->fetchAll()]);
}

if ($method === 'POST' && $route === 'equip') {
    tdf_inv_require_csrf($pdo, $uid);
    $b = tdf_body();
    $utId = (int) ($b['ut_id'] ?? 0);
    $itemId = (int) ($b['item_id'] ?? 0);

    $ut = $pdo->prepare('SELECT id FROM user_thiegos WHERE id = :id AND user_id = :u');
    $ut->execute([':id' => $utId, ':u' => $uid]);
    if (!$ut->fetch()) tdf_err(404, 'Thiego não encontrado.');

    $it = $pdo->prepare('SELECT * FROM items WHERE id = :id');
    $it->execute([':id' => $itemId]);
    $item = $it->fetch();
    if (!$item) tdf_err(404, 'Item não encontrado.');
    if (!in_array($item['category'], ['weapon', 'armor', 'accessory'], true)) {
        tdf_err(422, 'Este item não é equipável.');
    }

    $has = $pdo->prepare('SELECT qty FROM inventory WHERE user_id = :u AND item_id = :i FOR UPDATE');
    $has->execute([':u' => $uid, ':i' => $itemId]);
    $qty = (int) ($has->fetch()['qty'] ?? 0);
    if ($qty < 1) tdf_err(409, 'Você não possui este item.');

    $slot = $item['slot'] ?: $item['category'];
    $pdo->beginTransaction();
    try {
        // troca: devolve o item antigo do slot
        $old = $pdo->prepare('SELECT id, item_id FROM equipment WHERE user_id = :u AND thiego_id = :ut AND slot = :s FOR UPDATE');
        $old->execute([':u' => $uid, ':ut' => $utId, ':s' => $slot]);
        if ($oldRow = $old->fetch()) {
            $pdo->prepare('DELETE FROM equipment WHERE id = :id')->execute([':id' => $oldRow['id']]);
            tdf_grant_item($pdo, $uid, (int) $oldRow['item_id'], 1);
        }
        tdf_take_item($pdo, $uid, $itemId, 1);
        $pdo->prepare('INSERT INTO equipment (user_id, item_id, thiego_id, slot) VALUES (:u, :i, :ut, :s)')
            ->execute([':u' => $uid, ':i' => $itemId, ':ut' => $utId, ':s' => $slot]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    tdf_log($pdo, $uid, 'equip', ['ut' => $utId, 'item' => $item['slug'], 'slot' => $slot]);
    tdf_json(['ok' => true, 'slot' => $slot]);
}

if ($method === 'POST' && $route === 'unequip') {
    tdf_inv_require_csrf($pdo, $uid);
    $b = tdf_body();
    $eqId = (int) ($b['equipment_id'] ?? 0);
    $st = $pdo->prepare('SELECT id, item_id FROM equipment WHERE id = :id AND user_id = :u FOR UPDATE');
    $st->execute([':id' => $eqId, ':u' => $uid]);
    $row = $st->fetch();
    if (!$row) tdf_err(404, 'Equipamento não encontrado.');
    $pdo->beginTransaction();
    try {
        $pdo->prepare('DELETE FROM equipment WHERE id = :id')->execute([':id' => $eqId]);
        tdf_grant_item($pdo, $uid, (int) $row['item_id'], 1);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    tdf_json(['ok' => true]);
}

if ($method === 'POST' && $route === 'upgrade') {
    tdf_inv_require_csrf($pdo, $uid);
    $b = tdf_body();
    $eqId = (int) ($b['equipment_id'] ?? 0);
    $st = $pdo->prepare('SELECT e.id, e.level, e.item_id, i.rarity, i.name FROM equipment e JOIN items i ON i.id = e.item_id WHERE e.id = :id AND e.user_id = :u FOR UPDATE');
    $st->execute([':id' => $eqId, ':u' => $uid]);
    $row = $st->fetch();
    if (!$row) tdf_err(404, 'Equipamento não encontrado.');
    if ((int) $row['level'] >= 20) tdf_err(409, 'Nível máximo do equipamento (20).');

    $cost = 30 + (int) $row['level'] * 40;
    $q = $pdo->prepare('SELECT battle_coins FROM user_progress WHERE user_id = :u FOR UPDATE');
    $q->execute([':u' => $uid]);
    if ((int) $q->fetch()['battle_coins'] < $cost) tdf_err(409, 'Battle Coins insuficientes (precisa ' . $cost . ').');

    $pdo->beginTransaction();
    try {
        $pdo->prepare('UPDATE user_progress SET battle_coins = battle_coins - :c WHERE user_id = :u')->execute([':c' => $cost, ':u' => $uid]);
        $pdo->prepare('UPDATE equipment SET level = level + 1 WHERE id = :id')->execute([':id' => $eqId]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    tdf_log($pdo, $uid, 'equip_upgrade', ['item' => $row['name'], 'level' => (int) $row['level'] + 1, 'cost' => $cost]);
    tdf_json(['ok' => true, 'level' => (int) $row['level'] + 1, 'cost' => $cost]);
}

if ($method === 'POST' && $route === 'sell') {
    tdf_inv_require_csrf($pdo, $uid);
    $b = tdf_body();
    $itemId = (int) ($b['item_id'] ?? 0);
    $qty = max(1, (int) ($b['qty'] ?? 1));
    $st = $pdo->prepare('SELECT sell_value FROM items WHERE id = :id');
    $st->execute([':id' => $itemId]);
    $sv = (int) ($st->fetch()['sell_value'] ?? 0);
    if ($sv <= 0) tdf_err(422, 'Item não pode ser vendido.');

    $pdo->beginTransaction();
    try {
        if (!tdf_take_item($pdo, $uid, $itemId, $qty)) {
            $pdo->rollBack();
            tdf_err(409, 'Quantidade insuficiente.');
        }
        $gained = tdf_add_coins($pdo, $uid, $sv * $qty);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    tdf_log($pdo, $uid, 'sell', ['item' => $itemId, 'qty' => $qty, 'coins' => $sv * $qty]);
    tdf_json(['ok' => true, 'coins' => $gained, 'gained' => $sv * $qty]);
}

if ($method === 'POST' && $route === 'disassemble') {
    tdf_inv_require_csrf($pdo, $uid);
    $b = tdf_body();
    $equipmentId = (int) ($b['equipment_id'] ?? 0);

    // desmonta um equipamento equipado (remove de equipment + fragmentos)
    if ($equipmentId > 0) {
        $st = $pdo->prepare('SELECT e.id, e.item_id, i.slug, i.rarity FROM equipment e JOIN items i ON i.id = e.item_id WHERE e.id = :id AND e.user_id = :u FOR UPDATE');
        $st->execute([':id' => $equipmentId, ':u' => $uid]);
        $eq = $st->fetch();
        if (!$eq) tdf_err(404, 'Equipamento não encontrado.');
        $frag = $pdo->prepare('SELECT id FROM items WHERE slug = :s');
        $frag->execute([':s' => tdf_fragment_slug($eq['rarity'])]);
        $fragId = (int) ($frag->fetch()['id'] ?? 0);
        if ($fragId <= 0) tdf_err(422, 'Sem fragmento para esta raridade.');

        $pdo->beginTransaction();
        try {
            $pdo->prepare('DELETE FROM equipment WHERE id = :id')->execute([':id' => $equipmentId]);
            tdf_grant_item($pdo, $uid, $fragId, 1);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        tdf_log($pdo, $uid, 'disassemble', ['equipment' => $equipmentId, 'rarity' => $eq['rarity'], 'fragments' => 1]);
        tdf_json(['ok' => true, 'fragments' => 1]);
    }

    // desmonta itens empilhados do inventário (legado: item_id + qty)
    $itemId = (int) ($b['item_id'] ?? 0);
    $qty = max(1, (int) ($b['qty'] ?? 1));
    $st = $pdo->prepare('SELECT slug, rarity, category FROM items WHERE id = :id');
    $st->execute([':id' => $itemId]);
    $item = $st->fetch();
    if (!$item || !in_array($item['category'], ['weapon', 'armor', 'accessory'], true)) {
        tdf_err(422, 'Apenas equipamentos podem ser desmontados.');
    }
    $frag = $pdo->prepare('SELECT id FROM items WHERE slug = :s');
    $frag->execute([':s' => tdf_fragment_slug($item['rarity'])]);
    $fragId = (int) ($frag->fetch()['id'] ?? 0);
    if ($fragId <= 0) tdf_err(422, 'Sem fragmento para esta raridade.');

    $pdo->beginTransaction();
    try {
        if (!tdf_take_item($pdo, $uid, $itemId, $qty)) {
            $pdo->rollBack();
            tdf_err(409, 'Quantidade insuficiente.');
        }
        tdf_grant_item($pdo, $uid, $fragId, $qty);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    tdf_json(['ok' => true, 'fragments' => $qty]);
}

tdf_err(404, 'Rota não encontrada.');
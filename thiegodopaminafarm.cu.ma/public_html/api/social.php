<?php
/**
 * THIEGO DOPAMINA FARM — api/social.php
 * Sistema social: amizades (pedido/aceitar/remover) e parties (criar,
 * entrar por código, sair, expulsar, dissolver).
 * GET  status → resumo de amigos/convites/party
 * POST friends_add    {identifier}
 * POST friends_accept {friend_id}
 * POST friends_decline{friend_id}
 * POST friends_remove {friend_id}
 * POST party_create   {name}
 * POST party_join     {code}
 * POST party_leave
 * POST party_kick     {member_id}
 * POST party_disband
 */

require_once __DIR__ . '/tdf_db.php';

$pdo = tdf_pdo();
tdf_bootstrap();

$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$uid = tdf_current_user($pdo);
if (!$uid) tdf_err(401, 'Não autenticado.');

function tdf_social_require_csrf(PDO $pdo, int $uid): void
{
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');
}

/** Resolve identifier (username ou email) para user_id. */
function tdf_user_by_identifier(PDO $pdo, string $identifier): ?int
{
    $id = trim($identifier);
    if ($id === '') return null;
    $st = $pdo->prepare('SELECT id FROM users WHERE username = :u OR email = :e LIMIT 1');
    $st->execute([':u' => $id, ':e' => $id]);
    $row = $st->fetch();
    return $row ? (int) $row['id'] : null;
}

/** Resumo social do usuário. */
function tdf_social_status(PDO $pdo, int $uid): array
{
    // amigos ativos (ambos os lados)
    $st = $pdo->prepare(
        'SELECT f.friend_id AS fid, u.username, u.is_admin
         FROM friendships f JOIN users u ON u.id = f.friend_id
         WHERE f.user_id = :u AND f.status = \'active\'
         UNION
         SELECT f.user_id AS fid, u.username, u.is_admin
         FROM friendships f JOIN users u ON u.id = f.user_id
         WHERE f.friend_id = :u2 AND f.status = \'active\''
    );
    $st->execute([':u' => $uid, ':u2' => $uid]);
    $friends = [];
    foreach ($st->fetchAll() as $f) {
        $friends[] = ['id' => (int) $f['fid'], 'username' => $f['username'], 'admin' => (int) $f['is_admin'] === 1];
    }

    // convites recebidos
    $st = $pdo->prepare(
        'SELECT f.id AS fid, f.user_id, u.username, u.is_admin FROM friendships f
         JOIN users u ON u.id = f.user_id
         WHERE f.friend_id = :u AND f.status = \'pending\''
    );
    $st->execute([':u' => $uid]);
    $invites = [];
    foreach ($st->fetchAll() as $f) {
        $invites[] = ['id' => (int) $f['fid'], 'from_id' => (int) $f['user_id'], 'username' => $f['username'], 'admin' => (int) $f['is_admin'] === 1];
    }

    // pedidos enviados aguardando resposta
    $st = $pdo->prepare(
        'SELECT f.friend_id AS fid, u.username FROM friendships f JOIN users u ON u.id = f.friend_id
         WHERE f.user_id = :u AND f.status = \'pending\''
    );
    $st->execute([':u' => $uid]);
    $sent = [];
    foreach ($st->fetchAll() as $f) {
        $sent[] = ['id' => (int) $f['fid'], 'username' => $f['username']];
    }

    // party atual
    $party = null;
    $st = $pdo->prepare(
        'SELECT p.id, p.name, p.code, p.leader_id, p.max_members, u.username AS leader_name
         FROM party_members pm JOIN parties p ON p.id = pm.party_id
         JOIN users u ON u.id = p.leader_id
         WHERE pm.user_id = :u LIMIT 1'
    );
    $st->execute([':u' => $uid]);
    $p = $st->fetch();
    if ($p) {
        $members = [];
        $ms = $pdo->prepare(
            'SELECT pm.user_id, u.username, u.is_admin, pm.joined_at
             FROM party_members pm JOIN users u ON u.id = pm.user_id
             WHERE pm.party_id = :pid ORDER BY (pm.user_id = :leader) DESC, pm.joined_at ASC'
        );
        $ms->execute([':pid' => (int) $p['id'], ':leader' => (int) $p['leader_id']]);
        foreach ($ms->fetchAll() as $m) {
            $members[] = [
                'user_id' => (int) $m['user_id'],
                'username' => $m['username'],
                'admin' => (int) $m['is_admin'] === 1,
                'is_leader' => (int) $m['user_id'] === (int) $p['leader_id'],
            ];
        }
        $party = [
            'id' => (int) $p['id'],
            'name' => $p['name'],
            'code' => $p['code'],
            'leader_id' => (int) $p['leader_id'],
            'leader_name' => $p['leader_name'],
            'max_members' => (int) $p['max_members'],
            'members' => $members,
        ];
    }

    return [
        'ok' => true,
        'friends' => $friends,
        'invites' => $invites,
        'sent' => $sent,
        'party' => $party,
    ];
}

if ($method === 'GET' && $route === 'status') {
    tdf_json(tdf_social_status($pdo, $uid));
}

if ($method === 'POST' && $route === 'friends_add') {
    tdf_social_require_csrf($pdo, $uid);
    $b = tdf_body();
    $identifier = (string) ($b['identifier'] ?? '');
    $target = tdf_user_by_identifier($pdo, $identifier);
    if (!$target) tdf_err(404, 'Usuário não encontrado.');
    if ($target === $uid) tdf_err(422, 'Você não pode se adicionar.');
    if (tdf_social_status($pdo, $uid)['party'] === null) {} // no-op

    // já é amigo?
    $chk = $pdo->prepare('SELECT id, status FROM friendships WHERE (user_id = :a1 AND friend_id = :b1) OR (user_id = :b2 AND friend_id = :a2)');
    $chk->execute([':a1' => $uid, ':b1' => $target, ':b2' => $target, ':a2' => $uid]);
    $existing = $chk->fetch();
    if ($existing) {
        if ($existing['status'] === 'active') tdf_err(409, 'Vocês já são amigos.');
        // pendente: se o outro pediu para mim, aceito; se eu pedi, aguardando
        $st2 = $pdo->prepare('SELECT user_id FROM friendships WHERE id = :id');
        $st2->execute([':id' => (int) $existing['id']]);
        $from = (int) $st2->fetch()['user_id'];
        if ($from === $target) {
            $pdo->prepare("UPDATE friendships SET status = 'active' WHERE id = :id")->execute([':id' => (int) $existing['id']]);
            tdf_log($pdo, $uid, 'friend_accept_via_add', ['friend' => $target]);
            tdf_json(['ok' => true, 'status' => 'accepted']);
        }
        tdf_err(409, 'Pedido já enviado, aguardando resposta.');
    }

    $ins = $pdo->prepare('INSERT INTO friendships (user_id, friend_id, status) VALUES (:a, :b, \'pending\')');
    $ins->execute([':a' => $uid, ':b' => $target]);
    tdf_notify($pdo, $target, 'Pedido de amizade', 'Alguém quer ser seu amigo!');
    tdf_log($pdo, $uid, 'friend_request', ['friend' => $target]);
    tdf_json(['ok' => true, 'status' => 'pending']);
}

if ($method === 'POST' && $route === 'friends_accept') {
    tdf_social_require_csrf($pdo, $uid);
    $b = tdf_body();
    $fid = (int) ($b['friend_id'] ?? 0);
    $st = $pdo->prepare('SELECT id, user_id, friend_id FROM friendships WHERE id = :id AND friend_id = :u AND status = \'pending\'');
    $st->execute([':id' => $fid, ':u' => $uid]);
    $row = $st->fetch();
    if (!$row) tdf_err(404, 'Convite não encontrado.');
    $pdo->prepare("UPDATE friendships SET status = 'active' WHERE id = :id")->execute([':id' => $fid]);
    tdf_notify($pdo, (int) $row['user_id'], 'Amizade aceita', 'Vocês agora são amigos!');
    tdf_log($pdo, $uid, 'friend_accept', ['friend' => (int) $row['user_id']]);
    tdf_json(['ok' => true]);
}

if ($method === 'POST' && $route === 'friends_decline') {
    tdf_social_require_csrf($pdo, $uid);
    $b = tdf_body();
    $fid = (int) ($b['friend_id'] ?? 0);
    $st = $pdo->prepare('SELECT id FROM friendships WHERE id = :id AND friend_id = :u AND status = \'pending\'');
    $st->execute([':id' => $fid, ':u' => $uid]);
    if ($st->fetch()) {
        $pdo->prepare('DELETE FROM friendships WHERE id = :id')->execute([':id' => $fid]);
    }
    tdf_json(['ok' => true]);
}

if ($method === 'POST' && $route === 'friends_remove') {
    tdf_social_require_csrf($pdo, $uid);
    $b = tdf_body();
    $fid = (int) ($b['friend_id'] ?? 0);
    $pdo->prepare('DELETE FROM friendships WHERE (user_id = :u1 AND friend_id = :f1) OR (user_id = :f2 AND friend_id = :u2)')
        ->execute([':u1' => $uid, ':f1' => $fid, ':f2' => $fid, ':u2' => $uid]);
    tdf_json(['ok' => true]);
}

if ($method === 'POST' && $route === 'party_create') {
    tdf_social_require_csrf($pdo, $uid);
    $b = tdf_body();
    $name = trim(mb_substr((string) ($b['name'] ?? 'Party'), 0, 40));
    if ($name === '') $name = 'Party do ' . (tdf_user_by_identifier($pdo, $uid) ? '' : '');
    // nome padrão com username
    $st = $pdo->prepare('SELECT username FROM users WHERE id = :u');
    $st->execute([':u' => $uid]);
    $uname = (string) ($st->fetch()['username'] ?? 'Thiego');
    if ($name === 'Party') $name = 'Party do ' . $uname;

    // já está numa party?
    $inP = $pdo->prepare('SELECT COUNT(*) FROM party_members WHERE user_id = :u');
    $inP->execute([':u' => $uid]);
    if ((int) $inP->fetchColumn() > 0) tdf_err(409, 'Você já está numa party.');

    // código único
    do {
        $code = strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
        $c = $pdo->prepare('SELECT COUNT(*) FROM parties WHERE code = :c');
        $c->execute([':c' => $code]);
    } while ((int) $c->fetchColumn() > 0);

    $pdo->beginTransaction();
    try {
        $ins = $pdo->prepare('INSERT INTO parties (name, code, leader_id) VALUES (:n, :c, :l)');
        $ins->execute([':n' => $name, ':c' => $code, ':l' => $uid]);
        $partyId = (int) $pdo->lastInsertId();
        $pdo->prepare('INSERT INTO party_members (party_id, user_id) VALUES (:p, :u)')
            ->execute([':p' => $partyId, ':u' => $uid]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    tdf_log($pdo, $uid, 'party_create', ['party' => $partyId, 'code' => $code]);
    tdf_json(['ok' => true, 'party' => ['id' => $partyId, 'name' => $name, 'code' => $code]]);
}

if ($method === 'POST' && $route === 'party_join') {
    tdf_social_require_csrf($pdo, $uid);
    $b = tdf_body();
    $code = strtoupper(trim((string) ($b['code'] ?? '')));
    if ($code === '') tdf_err(422, 'Informe o código da party.');

    $st = $pdo->prepare('SELECT id, name, max_members FROM parties WHERE code = :c');
    $st->execute([':c' => $code]);
    $party = $st->fetch();
    if (!$party) tdf_err(404, 'Party não encontrada.');

    $inP = $pdo->prepare('SELECT COUNT(*) FROM party_members WHERE user_id = :u');
    $inP->execute([':u' => $uid]);
    if ((int) $inP->fetchColumn() > 0) tdf_err(409, 'Você já está numa party.');

    $cnt = $pdo->prepare('SELECT COUNT(*) FROM party_members WHERE party_id = :p');
    $cnt->execute([':p' => (int) $party['id']]);
    if ((int) $cnt->fetchColumn() >= (int) $party['max_members']) tdf_err(409, 'Party cheia.');

    $pdo->prepare('INSERT INTO party_members (party_id, user_id) VALUES (:p, :u)')
        ->execute([':p' => (int) $party['id'], ':u' => $uid]);
    $leader = $pdo->prepare('SELECT leader_id FROM parties WHERE id = :id');
    $leader->execute([':id' => (int) $party['id']]);
    tdf_notify($pdo, (int) $leader->fetch()['leader_id'], 'Novo membro', 'Alguém entrou na sua party.');
    tdf_log($pdo, $uid, 'party_join', ['party' => (int) $party['id']]);
    tdf_json(['ok' => true]);
}

if ($method === 'POST' && $route === 'party_leave') {
    tdf_social_require_csrf($pdo, $uid);
    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare('SELECT party_id FROM party_members WHERE user_id = :u LIMIT 1');
        $st->execute([':u' => $uid]);
        $partyId = (int) ($st->fetch()['party_id'] ?? 0);
        if ($partyId > 0) {
            $leader = $pdo->prepare('SELECT leader_id FROM parties WHERE id = :id');
            $leader->execute([':id' => $partyId]);
            $isLeader = (int) $leader->fetch()['leader_id'] === $uid;
            $pdo->prepare('DELETE FROM party_members WHERE user_id = :u')->execute([':u' => $uid]);
            if ($isLeader) {
                // líder saiu: transfere liderança ou dissolve
                $nxt = $pdo->prepare('SELECT user_id FROM party_members WHERE party_id = :p ORDER BY joined_at ASC LIMIT 1');
                $nxt->execute([':p' => $partyId]);
                $nextLeader = $nxt->fetch();
                if ($nextLeader) {
                    $pdo->prepare('UPDATE parties SET leader_id = :l WHERE id = :id')
                        ->execute([':l' => (int) $nextLeader['user_id'], ':id' => $partyId]);
                } else {
                    $pdo->prepare('DELETE FROM parties WHERE id = :id')->execute([':id' => $partyId]);
                }
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    tdf_json(['ok' => true]);
}

if ($method === 'POST' && $route === 'party_kick') {
    tdf_social_require_csrf($pdo, $uid);
    $b = tdf_body();
    $memberId = (int) ($b['member_id'] ?? 0);
    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare('SELECT p.id AS party_id, p.leader_id FROM party_members pm JOIN parties p ON p.id = pm.party_id WHERE pm.user_id = :u LIMIT 1');
        $st->execute([':u' => $uid]);
        $p = $st->fetch();
        if (!$p || (int) $p['leader_id'] !== $uid) {
            $pdo->rollBack();
            tdf_err(403, 'Só o líder pode expulsar.');
        }
        $pdo->prepare('DELETE FROM party_members WHERE party_id = :p AND user_id = :m')->execute([':p' => (int) $p['party_id'], ':m' => $memberId]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    tdf_json(['ok' => true]);
}

if ($method === 'POST' && $route === 'party_disband') {
    tdf_social_require_csrf($pdo, $uid);
    $st = $pdo->prepare('SELECT id FROM parties WHERE leader_id = :u LIMIT 1');
    $st->execute([':u' => $uid]);
    $p = $st->fetch();
    if (!$p) tdf_err(404, 'Party não encontrada ou você não é o líder.');
    $pdo->prepare('DELETE FROM parties WHERE id = :id')->execute([':id' => (int) $p['id']]);
    tdf_json(['ok' => true]);
}

tdf_err(404, 'Rota não encontrada.');
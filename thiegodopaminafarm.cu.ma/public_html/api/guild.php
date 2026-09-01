<?php
/**
 * THIEGO DOPAMINA FARM — api/guild.php
 * C2: Guildas — farms coletivas. Até 20 membros. Líder cria; membros
 * contribuem produção (contribution) e ganham XP de guilda (nível 1-20).
 * Boss semanal: cada membro ataca 1x/dia; ao derrotar, todos ganham.
 * ROTAS:
 *   GET  status       → guilda do jogador + boss semanal
 *   POST create       → {name, tag} custa 2000 coins
 *   POST invite       → {identifier} (username) — entra direto
 *   POST join_by_tag  → {tag} entrar pelo código
 *   POST leave        → sair (líder transfere ou dissolve)
 *   POST kick         → {user_id} expulsar (líder/officer)
 *   POST promote      → {user_id, role} (líder)
 *   POST contribute   → {log10} contribuir produção
 *   POST boss_attack  → atacar boss semanal (1x/dia)
 *   GET  leaderboard  → ranking de guildas
 */

require_once __DIR__ . '/tdf_db.php';
require_once __DIR__ . '/progress.php';

$pdo = tdf_pdo();
tdf_bootstrap();

$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$uid = tdf_current_user($pdo);
if (!$uid) tdf_err(401, 'Não autenticado.');
tdf_require_not_banned($pdo, $uid);

const TDF_GUILD_MAX_MEMBERS = 20;
const TDF_GUILD_MAX_LEVEL = 20;

/** Guilda do jogador + papel, ou null. */
function tdf_my_guild(PDO $pdo, int $uid): ?array
{
    $st = $pdo->prepare(
        'SELECT g.*, gm.role, gm.contribution
         FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id
         WHERE gm.user_id = :u'
    );
    $st->execute([':u' => $uid]);
    $row = $st->fetch();
    if (!$row) return null;
    $q = $pdo->prepare('SELECT COUNT(*) FROM guild_members WHERE guild_id = :g');
    $q->execute([':g' => $row['id']]);
    $row['member_count'] = (int) $q->fetchColumn();
    return $row;
}

/** Boss semanal da guilda (cria se não existir). */
function tdf_guild_boss(PDO $pdo, int $guildId, int $guildLevel): array
{
    $week = date('oW');
    $st = $pdo->prepare('SELECT * FROM guild_boss WHERE guild_id = :g AND week_key = :w');
    $st->execute([':g' => $guildId, ':w' => $week]);
    $boss = $st->fetch();
    if ($boss) return $boss;
    $hp = (int) (50000 * max(1, $guildLevel));
    $ins = $pdo->prepare('INSERT INTO guild_boss (guild_id, slug, name, hp_total, hp_left, week_key, defeated) VALUES (:g, :s, :n, :h1, :h2, :w, 0)');
    $ins->execute([':g' => $guildId, ':s' => 'guild_boss_' . $week, ':n' => 'Boss da Semana ' . $week, ':h1' => $hp, ':h2' => $hp, ':w' => $week]);
    $q2 = $pdo->prepare('SELECT * FROM guild_boss WHERE guild_id = :g AND week_key = :w');
    $q2->execute([':g' => $guildId, ':w' => $week]);
    return $q2->fetch();
}

if ($method === 'GET' && $route === 'status') {
    $guild = tdf_my_guild($pdo, $uid);
    if (!$guild) {
        tdf_json(['ok' => true, 'guild' => null, 'boss' => null]);
    }
    $members = [];
    $st = $pdo->prepare('SELECT u.id, u.username, gm.role, gm.contribution, gm.joined_at FROM guild_members gm JOIN users u ON u.id = gm.user_id WHERE gm.guild_id = :g ORDER BY gm.role, gm.contribution DESC');
    $st->execute([':g' => $guild['id']]);
    foreach ($st->fetchAll() as $m) {
        $members[] = ['id' => (int) $m['id'], 'username' => $m['username'], 'role' => $m['role'], 'contribution' => (int) $m['contribution'], 'joined_at' => $m['joined_at']];
    }
    $boss = tdf_guild_boss($pdo, (int) $guild['id'], (int) $guild['level']);
    tdf_json([
        'ok' => true,
        'guild' => [
            'id' => (int) $guild['id'],
            'name' => $guild['name'],
            'tag' => $guild['tag'],
            'level' => (int) $guild['level'],
            'xp' => (int) $guild['xp'],
            'xp_for_next' => (int) $guild['level'] * 500,
            'my_role' => $guild['role'],
            'member_count' => $guild['member_count'],
            'max_members' => TDF_GUILD_MAX_MEMBERS,
            'members' => $members,
        ],
        'boss' => [
            'name' => $boss['name'],
            'hp_total' => (float) $boss['hp_total'],
            'hp_left' => (float) $boss['hp_left'],
            'defeated' => (int) $boss['defeated'] === 1,
            'week_key' => $boss['week_key'],
        ],
    ]);
}

if ($method === 'POST' && $route === 'create') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');
    if (!tdf_rate_limit($pdo, 'guild_create:' . $uid, 1, 3600)) tdf_err(429, 'Aguarde antes de criar outra guilda.');

    $name = trim((string) ($b['name'] ?? ''));
    $tag = strtoupper(trim((string) ($b['tag'] ?? '')));
    if (!preg_match('/^[A-Za-z0-9 _\-À-ÿ]{3,40}$/u', $name)) tdf_err(422, 'Nome inválido (3-40 caracteres).');
    if (!preg_match('/^[A-Z0-9]{2,6}$/', $tag)) tdf_err(422, 'Tag inválida (2-6 letras/números, sem acentos).');

    $dup = $pdo->prepare('SELECT id FROM guilds WHERE tag = :t');
    $dup->execute([':t' => $tag]);
    if ($dup->fetch()) tdf_err(409, 'Tag já em uso.');
    if (tdf_my_guild($pdo, $uid)) tdf_err(409, 'Você já está em uma guilda.');

    $st = $pdo->prepare('SELECT battle_coins FROM user_progress WHERE user_id = :u');
    $st->execute([':u' => $uid]);
    $coins = (int) ($st->fetch()['battle_coins'] ?? 0);
    if ($coins < 2000) tdf_err(409, 'Sem coins suficientes (custa 2000).');

    $pdo->beginTransaction();
    try {
        tdf_add_coins($pdo, $uid, -2000);
        $ins = $pdo->prepare('INSERT INTO guilds (name, tag, leader_id) VALUES (:n, :t, :l)');
        $ins->execute([':n' => $name, ':t' => $tag, ':l' => $uid]);
        $gid = (int) $pdo->lastInsertId();
        $m = $pdo->prepare('INSERT INTO guild_members (guild_id, user_id, role) VALUES (:g, :u, \'leader\')');
        $m->execute([':g' => $gid, ':u' => $uid]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    tdf_log($pdo, $uid, 'guild_create', ['name' => $name, 'tag' => $tag]);
    tdf_json(['ok' => true, 'guild_id' => $gid]);
}

if ($method === 'POST' && $route === 'invite') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');

    $guild = tdf_my_guild($pdo, $uid);
    if (!$guild) tdf_err(403, 'Você não está em uma guilda.');
    if (!in_array($guild['role'], ['leader', 'officer'], true)) tdf_err(403, 'Apenas líder/officer podem convidar.');
    if ($guild['member_count'] >= TDF_GUILD_MAX_MEMBERS) tdf_err(409, 'Guilda cheia.');

    $identifier = trim((string) ($b['identifier'] ?? ''));
    if ($identifier === '') tdf_err(422, 'Informe o username do convidado.');
    $st = $pdo->prepare('SELECT id FROM users WHERE username = :u LIMIT 1');
    $st->execute([':u' => $identifier]);
    $target = $st->fetch();
    if (!$target) tdf_err(404, 'Usuário não encontrado.');
    $targetId = (int) $target['id'];
    if ($targetId === $uid) tdf_err(422, 'Não pode se convidar.');

    $inGuild = tdf_my_guild($pdo, $targetId);
    if ($inGuild) tdf_err(409, 'O usuário já está em uma guilda.');

    $m = $pdo->prepare('INSERT INTO guild_members (guild_id, user_id, role) VALUES (:g, :u, \'member\')');
    $m->execute([':g' => $guild['id'], ':u' => $targetId]);
    tdf_notify($pdo, $targetId, '🏰 Convite aceito', 'Você entrou na guilda ' . $guild['name'] . ' [' . $guild['tag'] . ']!');
    tdf_log($pdo, $uid, 'guild_invite', ['target' => $targetId]);
    tdf_json(['ok' => true]);
}

if ($method === 'POST' && $route === 'join_by_tag') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');

    $tag = strtoupper(trim((string) ($b['tag'] ?? '')));
    if (!preg_match('/^[A-Z0-9]{2,6}$/', $tag)) tdf_err(422, 'Tag inválida.');
    if (tdf_my_guild($pdo, $uid)) tdf_err(409, 'Você já está em uma guilda.');

    $st = $pdo->prepare('SELECT id, name FROM guilds WHERE tag = :t');
    $st->execute([':t' => $tag]);
    $g = $st->fetch();
    if (!$g) tdf_err(404, 'Guilda não encontrada.');

    $q = $pdo->prepare('SELECT COUNT(*) FROM guild_members WHERE guild_id = :g');
    $q->execute([':g' => $g['id']]);
    if ((int) $q->fetchColumn() >= TDF_GUILD_MAX_MEMBERS) tdf_err(409, 'Guilda cheia.');

    $m = $pdo->prepare('INSERT INTO guild_members (guild_id, user_id, role) VALUES (:g, :u, \'member\')');
    $m->execute([':g' => $g['id'], ':u' => $uid]);
    tdf_log($pdo, $uid, 'guild_join', ['guild' => $g['name']]);
    tdf_json(['ok' => true, 'guild_name' => $g['name']]);
}

if ($method === 'POST' && $route === 'leave') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');

    $guild = tdf_my_guild($pdo, $uid);
    if (!$guild) tdf_err(403, 'Você não está em uma guilda.');
    $gid = (int) $guild['id'];

    $pdo->beginTransaction();
    try {
        if ($guild['role'] === 'leader') {
            // transfere para o membro mais antigo ou dissolve
            $q = $pdo->prepare('SELECT user_id FROM guild_members WHERE guild_id = :g AND user_id <> :u ORDER BY joined_at ASC LIMIT 1');
            $q->execute([':g' => $gid, ':u' => $uid]);
            $next = $q->fetch();
            if ($next) {
                $pdo->prepare('UPDATE guild_members SET role = \'leader\' WHERE guild_id = :g AND user_id = :u')
                    ->execute([':g' => $gid, ':u' => $next['user_id']]);
                $pdo->prepare('UPDATE guilds SET leader_id = :l WHERE id = :g')
                    ->execute([':l' => $next['user_id'], ':g' => $gid]);
            } else {
                $pdo->prepare('DELETE FROM guild_boss WHERE guild_id = :g')->execute([':g' => $gid]);
                $pdo->prepare('DELETE FROM guild_members WHERE guild_id = :g')->execute([':g' => $gid]);
                $pdo->prepare('DELETE FROM guilds WHERE id = :g')->execute([':g' => $gid]);
                $pdo->commit();
                tdf_log($pdo, $uid, 'guild_disband', ['guild' => $gid]);
                tdf_json(['ok' => true, 'disbanded' => true]);
            }
        }
        $pdo->prepare('DELETE FROM guild_members WHERE guild_id = :g AND user_id = :u')
            ->execute([':g' => $gid, ':u' => $uid]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    tdf_log($pdo, $uid, 'guild_leave', ['guild' => $gid]);
    tdf_json(['ok' => true]);
}

if ($method === 'POST' && $route === 'kick') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');

    $guild = tdf_my_guild($pdo, $uid);
    if (!$guild) tdf_err(403, 'Você não está em uma guilda.');
    if (!in_array($guild['role'], ['leader', 'officer'], true)) tdf_err(403, 'Apenas líder/officer podem expulsar.');

    $targetId = (int) ($b['user_id'] ?? 0);
    if ($targetId <= 0 || $targetId === $uid) tdf_err(422, 'user_id inválido.');

    $q = $pdo->prepare('SELECT role FROM guild_members WHERE guild_id = :g AND user_id = :u');
    $q->execute([':g' => $guild['id'], ':u' => $targetId]);
    $targetRole = $q->fetch();
    if (!$targetRole) tdf_err(404, 'Membro não encontrado.');
    if ($targetRole['role'] === 'leader') tdf_err(403, 'Não pode expulsar o líder.');
    if ($guild['role'] === 'officer' && $targetRole['role'] === 'officer') tdf_err(403, 'Officer não pode expulsar outro officer.');

    $pdo->prepare('DELETE FROM guild_members WHERE guild_id = :g AND user_id = :u')
        ->execute([':g' => $guild['id'], ':u' => $targetId]);
    tdf_log($pdo, $uid, 'guild_kick', ['target' => $targetId]);
    tdf_json(['ok' => true]);
}

if ($method === 'POST' && $route === 'promote') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');

    $guild = tdf_my_guild($pdo, $uid);
    if (!$guild || $guild['role'] !== 'leader') tdf_err(403, 'Apenas o líder pode promover.');

    $targetId = (int) ($b['user_id'] ?? 0);
    $role = ($b['role'] ?? 'officer') === 'officer' ? 'officer' : 'member';
    if ($targetId <= 0 || $targetId === $uid) tdf_err(422, 'user_id inválido.');

    $up = $pdo->prepare('UPDATE guild_members SET role = :r WHERE guild_id = :g AND user_id = :u');
    $up->execute([':r' => $role, ':g' => $guild['id'], ':u' => $targetId]);
    tdf_log($pdo, $uid, 'guild_promote', ['target' => $targetId, 'role' => $role]);
    tdf_json(['ok' => true]);
}

if ($method === 'POST' && $route === 'contribute') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');
    if (!tdf_rate_limit($pdo, 'guild_contrib:' . $uid, 10, 3600)) tdf_err(429, 'Contribuindo rápido demais.');

    $guild = tdf_my_guild($pdo, $uid);
    if (!$guild) tdf_err(403, 'Você não está em uma guilda.');

    $log10 = (float) ($b['log10'] ?? 0);
    if (!is_finite($log10) || $log10 < 0 || $log10 > 1000) tdf_err(422, 'log10 inválido (0-1000).');

    $xpGain = (int) floor($log10);
    $gid = (int) $guild['id'];

    $pdo->beginTransaction();
    try {
        $pdo->prepare('UPDATE guild_members SET contribution = contribution + :l WHERE guild_id = :g AND user_id = :u')
            ->execute([':l' => (int) $log10, ':g' => $gid, ':u' => $uid]);

        $st = $pdo->prepare('SELECT level, xp FROM guilds WHERE id = :g FOR UPDATE');
        $st->execute([':g' => $gid]);
        $g = $st->fetch();
        $level = (int) $g['level'];
        $xp = (int) $g['xp'] + $xpGain;
        $leveled = 0;
        while ($level < TDF_GUILD_MAX_LEVEL && $xp >= $level * 500) {
            $xp -= $level * 500;
            $level++;
            $leveled++;
        }
        $pdo->prepare('UPDATE guilds SET level = :l, xp = :x WHERE id = :g')
            ->execute([':l' => $level, ':x' => $xp, ':g' => $gid]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    if ($leveled > 0) {
        // notifica todos os membros
        $q = $pdo->prepare('SELECT user_id FROM guild_members WHERE guild_id = :g');
        $q->execute([':g' => $gid]);
        foreach ($q->fetchAll() as $m) {
            tdf_notify($pdo, (int) $m['user_id'], '🏰 Guilda subiu!', 'A guilda alcançou o nível ' . $level . '!');
        }
        tdf_webhook("Guild #{$gid} reached level {$level}", 'info');
    }
    tdf_log($pdo, $uid, 'guild_contribute', ['guild' => $gid, 'log10' => round($log10, 2)]);
    tdf_json(['ok' => true, 'guild_level' => $level, 'guild_xp' => $xp]);
}

if ($method === 'POST' && $route === 'boss_attack') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');
    if (!tdf_rate_limit($pdo, 'guild_boss:' . $uid, 1, 86400)) tdf_err(429, 'Você já atacou o boss hoje.');

    $guild = tdf_my_guild($pdo, $uid);
    if (!$guild) tdf_err(403, 'Você não está em uma guilda.');

    $boss = tdf_guild_boss($pdo, (int) $guild['id'], (int) $guild['level']);
    if ((int) $boss['defeated'] === 1) tdf_err(409, 'Boss já foi derrotado esta semana.');

    // dano: (level conta * 10 + prestige * 5) * (1 + guild_level * 0.05)
    $st = $pdo->prepare('SELECT level, prestige FROM user_progress WHERE user_id = :u');
    $st->execute([':u' => $uid]);
    $prog = $st->fetch();
    $damage = (int) (((int) ($prog['level'] ?? 1) * 10 + (int) ($prog['prestige'] ?? 0) * 5) * (1 + (int) $guild['level'] * 0.05));
    $damage = max(1, $damage);

    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare('SELECT hp_left, defeated FROM guild_boss WHERE id = :id FOR UPDATE');
        $q->execute([':id' => $boss['id']]);
        $cur = $q->fetch();
        $hpLeft = max(0, (float) $cur['hp_left'] - $damage);
        $defeated = $hpLeft <= 0 ? 1 : 0;
        $pdo->prepare('UPDATE guild_boss SET hp_left = :h, defeated = :d WHERE id = :id')
            ->execute([':h' => $hpLeft, ':d' => $defeated, ':id' => $boss['id']]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    $result = ['ok' => true, 'damage' => $damage, 'boss_hp_left' => (float) $hpLeft, 'defeated' => $defeated === 1];
    if ($defeated === 1) {
        $q = $pdo->prepare('SELECT user_id FROM guild_members WHERE guild_id = :g');
        $q->execute([':g' => $guild['id']]);
        $reward = ['battle_coins' => 200 * (int) $guild['level'], 'xp' => 500, 'dopamine_log10' => 3];
        foreach ($q->fetchAll() as $m) {
            tdf_grant_reward($pdo, (int) $m['user_id'], $reward);
            tdf_notify($pdo, (int) $m['user_id'], '💀 Boss derrotado!', 'A guilda derrotou o boss semanal! Recompensa concedida.');
        }
        tdf_webhook("Guild #{$guild['id']} defeated the weekly boss", 'info');
        $result['reward'] = $reward;
    }
    tdf_log($pdo, $uid, 'guild_boss_attack', ['guild' => $guild['id'], 'damage' => $damage, 'defeated' => $defeated === 1]);
    tdf_json($result);
}

if ($method === 'GET' && $route === 'leaderboard') {
    $rows = $pdo->query(
        'SELECT g.id, g.name, g.tag, g.level, g.xp,
                (SELECT COUNT(*) FROM guild_members gm WHERE gm.guild_id = g.id) AS members
         FROM guilds g ORDER BY g.level DESC, g.xp DESC LIMIT 50'
    )->fetchAll();
    $list = [];
    $rank = 0;
    foreach ($rows as $r) {
        $rank++;
        $list[] = ['rank' => $rank, 'id' => (int) $r['id'], 'name' => $r['name'], 'tag' => $r['tag'], 'level' => (int) $r['level'], 'xp' => (int) $r['xp'], 'members' => (int) $r['members']];
    }
    tdf_json(['ok' => true, 'guilds' => $list]);
}

tdf_err(404, 'Rota não encontrada.');
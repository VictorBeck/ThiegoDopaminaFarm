<?php
/**
 * THIEGO DOPAMINA FARM — api/leaderboard.php
 * Rankings:
 *   mode=dopamine -> por total de dopamina (log10) da conta
 *   mode=battle   -> por rating PvP da temporada ativa
 * Formato compatível com o frontend: {ok, online, logged, list, me}
 */

require_once __DIR__ . '/tdf_db.php';

$pdo = tdf_pdo();
tdf_bootstrap();

$mode = $_GET['mode'] ?? 'dopamine';
$limit = min(100, max(1, (int) ($_GET['limit'] ?? 50)));
$uid = tdf_current_user($pdo);

$me = null;
$list = [];

if ($mode === 'battle') {
    $season = $pdo->query('SELECT id, name FROM seasons WHERE active = 1 ORDER BY id DESC LIMIT 1')->fetch();
    if (!$season) tdf_err(422, 'Nenhuma temporada ativa.');
    $st = $pdo->prepare(
        'SELECT u.id AS user_id, u.username, br.rating, br.wins, br.losses, br.streak
         FROM battle_rating br JOIN users u ON u.id = br.user_id
         WHERE br.season_id = :s ORDER BY br.rating DESC, br.wins DESC LIMIT :lim'
    );
    $st->bindValue(':s', (int) $season['id'], PDO::PARAM_INT);
    $st->bindValue(':lim', $limit, PDO::PARAM_INT);
    $st->execute();
    $rank = 0;
    foreach ($st->fetchAll() as $r) {
        $rank++;
        $row = ['rank' => $rank, 'username' => $r['username'], 'value' => (int) $r['rating'], 'wins' => (int) $r['wins'], 'losses' => (int) $r['losses'], 'streak' => (int) $r['streak']];
        $list[] = $row;
        if ($uid && (int) ($r['user_id'] ?? 0) === $uid) $me = $row;
    }
    if ($uid && !$me) {
        $myRating = $pdo->prepare('SELECT rating FROM battle_rating WHERE user_id = :u AND season_id = :s');
        $myRating->execute([':u' => $uid, ':s' => (int) $season['id']]);
        $val = (int) ($myRating->fetch()['rating'] ?? 1000);
        if ($val <= 0) $val = 1000;
        $q = $pdo->prepare('SELECT COUNT(*) + 1 FROM battle_rating WHERE season_id = :s AND rating > :r');
        $q->execute([':s' => (int) $season['id'], ':r' => $val]);
        $me = ['rank' => (int) $q->fetchColumn(), 'value' => $val, 'wins' => 0, 'losses' => 0, 'streak' => 0];
    }
    tdf_json(['ok' => true, 'online' => true, 'logged' => $uid !== null, 'mode' => 'battle', 'season' => $season['name'], 'list' => $list, 'me' => $me]);
}

// dopamine
$st = $pdo->prepare(
    'SELECT u.id AS user_id, u.username, p.total_dopamine_log10, p.level, p.prestige
     FROM user_progress p JOIN users u ON u.id = p.user_id
     WHERE p.total_dopamine_log10 > 0
     ORDER BY p.total_dopamine_log10 DESC LIMIT :lim'
);
$st->bindValue(':lim', $limit, PDO::PARAM_INT);
$st->execute();
$rank = 0;
foreach ($st->fetchAll() as $r) {
    $rank++;
    $row = ['rank' => $rank, 'username' => $r['username'], 'value' => round((float) $r['total_dopamine_log10'], 2), 'level' => (int) $r['level'], 'prestige' => (int) $r['prestige']];
    $list[] = $row;
    if ($uid && (int) $r['user_id'] === $uid) $me = $row;
}
if ($uid && !$me) {
    $q = $pdo->prepare('SELECT COUNT(*) + 1 FROM user_progress WHERE total_dopamine_log10 > (SELECT total_dopamine_log10 FROM user_progress WHERE user_id = :u)');
    $q->execute([':u' => $uid]);
    $my = $pdo->prepare('SELECT total_dopamine_log10, level, prestige FROM user_progress WHERE user_id = :u');
    $my->execute([':u' => $uid]);
    $m = $my->fetch();
    $me = ['rank' => (int) $q->fetchColumn(), 'value' => round((float) ($m['total_dopamine_log10'] ?? 0), 2), 'level' => (int) ($m['level'] ?? 1), 'prestige' => (int) ($m['prestige'] ?? 0)];
}
tdf_json(['ok' => true, 'online' => true, 'logged' => $uid !== null, 'mode' => 'dopamine', 'list' => $list, 'me' => $me]);
<?php
/**
 * THIEGO DOPAMINA FARM — api/minigame.php
 * C3: Minigames diários (reação, memória, timing).
 * 1 tentativa por minigame por dia. Recompensa em coins + dopamine.
 * ROTAS:
 *   GET  status → status de cada minigame hoje (jogou? recorde?)
 *   POST score  → {game, score} submeter pontuação e receber recompensa
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

$GAMES = ['reaction', 'memory', 'timing'];

function tdf_minigame_reward(string $game, int $score): array
{
    // score 0-1000 escala recompensa
    $coins = (int) floor($score * 0.5);
    $xp = (int) floor($score * 1.5);
    $dop = 0;
    if ($score >= 800) $dop = 2;
    elseif ($score >= 500) $dop = 1;
    return ['battle_coins' => min(500, $coins), 'xp' => min(1500, $xp), 'dopamine_log10' => $dop];
}

/* ---------- status ---------- */
if ($method === 'GET' && $route === 'status') {
    $today = date('Y-m-d');
    $out = [];
    foreach ($GAMES as $g) {
        $st = $pdo->prepare('SELECT best, played_at FROM minigame_scores WHERE user_id = :u AND game = :g');
        $st->execute([':u' => $uid, ':g' => $g]);
        $row = $st->fetch();
        $out[$g] = [
            'best' => $row ? (int) $row['best'] : 0,
            'played_today' => $row ? ((string) $row['played_at'] === $today) : false,
        ];
    }
    tdf_json(['ok' => true, 'games' => $out]);
}

/* ---------- submeter score ---------- */
if ($method === 'POST' && $route === 'score') {
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');

    if (!tdf_rate_limit($pdo, 'minigame:' . $uid, 6, 86400)) {
        tdf_err(429, 'Máximo de 6 submissões de minigame por dia.');
    }

    $game = (string) ($b['game'] ?? '');
    if (!in_array($game, $GAMES, true)) tdf_err(422, 'Minigame inválido.');

    $score = (int) ($b['score'] ?? 0);
    if ($score < 0 || $score > 10000) tdf_err(422, 'Score inválido (0-10000).');

    $today = date('Y-m-d');

    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare('SELECT best, played_at FROM minigame_scores WHERE user_id = :u AND game = :g FOR UPDATE');
        $st->execute([':u' => $uid, ':g' => $game]);
        $row = $st->fetch();

        if ($row) {
            // Já jogou antes hoje? Não pode rejogar
            if ((string) $row['played_at'] === $today) {
                $pdo->rollBack();
                tdf_err(409, 'Você já jogou ' . $game . ' hoje.');
            }
            // Atualiza: se score > best, atualiza best; sempre atualiza played_at
            $newBest = max((int) $row['best'], $score);
            $up = $pdo->prepare('UPDATE minigame_scores SET best = :b, played_at = :d WHERE user_id = :u AND game = :g');
            $up->execute([':b' => $newBest, ':d' => $today, ':u' => $uid, ':g' => $game]);
        } else {
            // Primeira vez
            $ins = $pdo->prepare('INSERT INTO minigame_scores (user_id, game, best, played_at) VALUES (:u, :g, :b, :d)');
            $ins->execute([':u' => $uid, ':g' => $game, ':b' => $score, ':d' => $today]);
        }

        $reward = tdf_minigame_reward($game, $score);
        $granted = tdf_grant_reward($pdo, $uid, $reward);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    $xp = tdf_apply_xp($pdo, $uid, $reward['xp']);
    tdf_log($pdo, $uid, 'minigame_score', ['game' => $game, 'score' => $score, 'reward' => $granted]);
    tdf_json([
        'ok' => true,
        'game' => $game,
        'score' => $score,
        'reward' => $granted,
        'leveled' => $xp['leveled'],
        'level' => $xp['level'],
    ]);
}

tdf_err(404, 'Rota não encontrada.');
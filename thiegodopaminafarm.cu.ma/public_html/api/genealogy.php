<?php
/**
 * THIEGO DOPAMINA FARM — api/genealogy.php
 * Árvore genealógica: GET tree, POST unlock (nó), POST respec
 * (refund de 50% dos pontos). Efeitos globais via multiplicadores.
 */

require_once __DIR__ . '/tdf_db.php';
require_once __DIR__ . '/progress.php';

$pdo = tdf_pdo();
tdf_bootstrap();

$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$uid = tdf_current_user($pdo);
if (!$uid) tdf_err(401, 'Não autenticado.');

function tdf_gene_require_csrf(PDO $pdo, int $uid): void
{
    $b = tdf_body();
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($b['csrf'] ?? ''));
    if (!tdf_check_csrf($pdo, $csrf)) tdf_err(403, 'Token CSRF inválido.');
}

if ($method === 'GET' && $route === 'tree') {
    $prog = tdf_user_progress($pdo, $uid);
    $nodes = $pdo->query('SELECT * FROM genealogy_nodes ORDER BY id')->fetchAll();
    $mine = $pdo->prepare('SELECT node_id, level FROM user_genealogy WHERE user_id = :u');
    $mine->execute([':u' => $uid]);
    $levels = [];
    foreach ($mine->fetchAll() as $m) $levels[(int) $m['node_id']] = (int) $m['level'];
    $costs = [];
    foreach ($nodes as $n) $costs[(int) $n['id']] = (int) $n['cost'];

    $tree = [];
    foreach ($nodes as $n) {
        $cur = $levels[(int) $n['id']] ?? 0;
        $parent = null;
        if ($n['requires_id']) {
            $parent = $pdo->prepare('SELECT slug FROM genealogy_nodes WHERE id = :id');
            $parent->execute([':id' => $n['requires_id']]);
            $parent = $parent->fetch()['slug'] ?? null;
        }
        $parentOk = !$n['requires_id'] || (($levels[(int) $n['requires_id']] ?? 0) > 0)
            || (($costs[(int) $n['requires_id']] ?? 0) === 0);
        $tree[] = [
            'slug' => $n['slug'],
            'name' => $n['name'],
            'icon' => $n['icon'],
            'description' => $n['description'],
            'effect_type' => $n['effect_type'],
            'effect_value' => (float) $n['effect_value'],
            'cost' => (int) $n['cost'],
            'max_level' => (int) $n['max_level'],
            'branch' => $n['branch'],
            'pos_x' => (float) $n['pos_x'],
            'pos_y' => (float) $n['pos_y'],
            'requires' => $parent,
            'level' => $cur,
            'locked' => !$parentOk || $cur >= (int) $n['max_level'],
        ];
    }
    tdf_json(['ok' => true, 'genealogy_points' => (int) $prog['genealogy_points'], 'tree' => $tree]);
}

if ($method === 'POST' && $route === 'unlock') {
    tdf_gene_require_csrf($pdo, $uid);
    $b = tdf_body();
    $slug = (string) ($b['slug'] ?? '');
    $st = $pdo->prepare('SELECT * FROM genealogy_nodes WHERE slug = :s');
    $st->execute([':s' => $slug]);
    $node = $st->fetch();
    if (!$node) tdf_err(404, 'Nó não encontrado.');
    if ((int) tdf_user_progress($pdo, $uid)['level'] < 3) tdf_err(409, 'Genealogia desbloqueia no nível 3.');

    $pdo->beginTransaction();
    try {
        $cur = $pdo->prepare('SELECT level FROM user_genealogy WHERE user_id = :u AND node_id = :n FOR UPDATE');
        $cur->execute([':u' => $uid, ':n' => $node['id']]);
        $level = (int) ($cur->fetch()['level'] ?? 0);
        if ($level >= (int) $node['max_level']) {
            $pdo->rollBack();
            tdf_err(409, 'Nó no nível máximo.');
        }
        if ($node['requires_id']) {
            $par = $pdo->prepare('SELECT cost FROM genealogy_nodes WHERE id = :id');
            $par->execute([':id' => $node['requires_id']]);
            $parCost = (int) ($par->fetch()['cost'] ?? 0);
            $owned = $pdo->prepare('SELECT level FROM user_genealogy WHERE user_id = :u AND node_id = :n');
            $owned->execute([':u' => $uid, ':n' => $node['requires_id']]);
            $parLevel = (int) ($owned->fetch()['level'] ?? 0);
            if ($parLevel < 1 && $parCost > 0) {
                $pdo->rollBack();
                tdf_err(409, 'Pré-requisito não desbloqueado.');
            }
            if ($parLevel < 1) {
                // auto-concede nós de custo 0 (ex.: origem) e seus ancestrais
                $grant = $pdo->prepare('INSERT IGNORE INTO user_genealogy (user_id, node_id, level) VALUES (:u, :n, 1)');
                $grant->execute([':u' => $uid, ':n' => $node['requires_id']]);
            }
        }
        if ((int) $node['cost'] > 0) {
            $g = $pdo->prepare('SELECT genealogy_points FROM user_progress WHERE user_id = :u FOR UPDATE');
            $g->execute([':u' => $uid]);
            if ((int) $g->fetch()['genealogy_points'] < (int) $node['cost']) {
                $pdo->rollBack();
                tdf_err(409, 'Pontos de genealogia insuficientes (precisa ' . $node['cost'] . ').');
            }
            $pdo->prepare('UPDATE user_progress SET genealogy_points = genealogy_points - :c WHERE user_id = :u')
                ->execute([':c' => (int) $node['cost'], ':u' => $uid]);
        }
        $pdo->prepare('INSERT INTO user_genealogy (user_id, node_id, level) VALUES (:u, :n, 1)
                       ON DUPLICATE KEY UPDATE level = level + 1')
            ->execute([':u' => $uid, ':n' => $node['id']]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    $total = tdf_metric_value($pdo, $uid, 'genealogy_node');
    tdf_mission_tick($pdo, $uid, 'genealogy_node', $total);
    tdf_achievement_check($pdo, $uid, 'genealogy_node', $total);
    tdf_log($pdo, $uid, 'genealogy_unlock', ['node' => $slug, 'level' => $level + 1, 'cost' => (int) $node['cost']]);
    tdf_json(['ok' => true, 'slug' => $slug, 'level' => $level + 1, 'cost' => (int) $node['cost']]);
}

if ($method === 'POST' && $route === 'respec') {
    tdf_gene_require_csrf($pdo, $uid);
    $pdo->beginTransaction();
    try {
        $spent = 0;
        $g = $pdo->prepare(
            'SELECT gn.cost, ug.level FROM user_genealogy ug JOIN genealogy_nodes gn ON gn.id = ug.node_id
             WHERE ug.user_id = :u'
        );
        $g->execute([':u' => $uid]);
        foreach ($g->fetchAll() as $r) {
            $spent += (int) $r['cost'] * (int) $r['level'];
        }
        $refund = (int) floor($spent / 2);
        $pdo->prepare('DELETE FROM user_genealogy WHERE user_id = :u')->execute([':u' => $uid]);
        $pdo->prepare('UPDATE user_progress SET genealogy_points = genealogy_points + :r WHERE user_id = :u')
            ->execute([':r' => $refund, ':u' => $uid]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    tdf_log($pdo, $uid, 'genealogy_respec', ['refund' => $refund, 'spent' => $spent]);
    tdf_json(['ok' => true, 'refund' => $refund]);
}

tdf_err(404, 'Rota não encontrada.');
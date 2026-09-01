<?php
/**
 * THIEGO DOPAMINA FARM — api/ranking.php
 *
 * Ranking global REAL do easter egg, integrado à sessão do próprio jogo
 * (api/auth.php — cookie tdf_session, sem autenticação separada).
 *
 *   GET  api/ranking.php?mode=global|today|week|month&sort=score|prestige
 *   POST api/ranking.php  (body JSON) { log10, prestige, evolution, playtime, flags }
 *
 * Segurança: validação de crescimento, rate limit e prepare statements.
 * Nunca confia cegamente no cliente: score_log10 é validado contra tempo
 * jogado e histórico anterior.
 */

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/db.php';

if (!$GLOBALS['TDF_DB_OK'] || !($GLOBALS['TDF_PDO'] instanceof PDO)) {
    echo json_encode(['ok' => false, 'error' => 'db_offline', 'online' => false], JSON_UNESCAPED_UNICODE);
    exit;
}

$pdo = $GLOBALS['TDF_PDO'];
$uid = (int) (tdf_current_user($pdo) ?? 0);

/* ------------------------------------------------------------------ GET */
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $mode = preg_replace('/[^a-z]/', '', $_GET['mode'] ?? 'global');
    $sort = ($_GET['sort'] ?? 'score') === 'prestige' ? 'prestige' : 'score';

    $timeCond = '';
    if ($mode === 'today') {
        $timeCond = 'r.updated_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)';
    } elseif ($mode === 'week') {
        $timeCond = 'r.updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
    } elseif ($mode === 'month') {
        $timeCond = 'r.updated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
    }

    $order = $sort === 'prestige' ? 'prestige DESC, score_log10 DESC' : 'score_log10 DESC';

    // Admins com admin_mode = 1 ficam invisíveis no ranking e nas contagens.
    $hiddenCond = 'NOT (COALESCE(u.is_admin,0) = 1 AND COALESCE(u.admin_mode,0) = 1)';

    // Condições combinadas (sem o prefixo WHERE): para a listagem e contagens.
    $listWhere = '';
    if ($hiddenCond !== '' || $timeCond !== '') {
        $listWhere = 'WHERE ' . implode(' AND ', array_filter([$hiddenCond, $timeCond], fn($c) => $c !== ''));
    }

    $list = [];
    try {
        $rows = $pdo->query(
            "SELECT r.usuario_id, r.nome, r.score_log10, r.prestige, r.evolution, r.updated_at,
                    COALESCE(u.is_admin, 0) AS is_admin
             FROM tblRankingDopamina r
             LEFT JOIN users u ON u.id = r.usuario_id
             {$listWhere} ORDER BY {$order} LIMIT 100"
        )->fetchAll();
    } catch (Throwable $e) {
        $rows = [];
    }

    $rank = 0;
    $lastScore = null;
    $lastPrestige = null;
    foreach ($rows as $r) {
        $isSame = $sort === 'prestige'
            ? ($r['prestige'] !== null && $r['prestige'] === $lastPrestige && $r['score_log10'] === $lastScore)
            : ($r['score_log10'] === $lastScore);
        if (!$isSame) {
            $rank = count($list) + 1;
        }
        $lastScore = $r['score_log10'];
        $lastPrestige = $r['prestige'];
        $list[] = [
            'rank' => $rank,
            'name' => mb_substr((string) $r['nome'], 0, 40, 'UTF-8'),
            'log10' => (float) $r['score_log10'],
            'prestige' => (int) $r['prestige'],
            'evolution' => (int) $r['evolution'],
            'updated' => (string) $r['updated_at'],
            'admin' => (int) $r['is_admin'] === 1,
        ];
    }

    // Posição do jogador logado dentro do mesmo filtro.
    $me = null;
    $buffs = null;
    if ($uid > 0) {
        try {
            $stmt = $pdo->prepare(
                "SELECT r.nome, r.score_log10, r.prestige, r.evolution, r.save_text, r.save_version, r.save_revision, r.save_checksum, r.save_updated_at, r.updated_at,
                        COALESCE(u.is_admin, 0) AS is_admin, COALESCE(u.admin_mode, 0) AS admin_mode
                 FROM tblRankingDopamina r
                 LEFT JOIN users u ON u.id = r.usuario_id
                 WHERE r.usuario_id = :id LIMIT 1"
            );
            $stmt->execute([':id' => $uid]);
            $my = $stmt->fetch();
            if ($my) {
                // condição anti-admin-visível: ignora admins com admin_mode = 1
                $hidden = 'NOT (COALESCE(u.is_admin,0) = 1 AND COALESCE(u.admin_mode,0) = 1)';
                if ($sort === 'prestige') {
                    // placeholders distintos (:p1/:p2) porque o MySQL nativo não reutiliza o mesmo nome.
                    $cond = 'prestige > :p1 OR (prestige = :p2 AND score_log10 > :s)';
                    $params = [
                        ':s' => (float) $my['score_log10'],
                        ':p1' => (int) $my['prestige'],
                        ':p2' => (int) $my['prestige'],
                    ];
                } else {
                    $cond = 'score_log10 > :s';
                    $params = [':s' => (float) $my['score_log10']];
                }
                $cnt = $pdo->prepare("SELECT COUNT(*) AS c FROM tblRankingDopamina r LEFT JOIN users u ON u.id = r.usuario_id WHERE {$hidden}" . ($timeCond !== '' ? " AND {$timeCond}" : '') . " AND ({$cond})");
                $cnt->execute($params);
                $me = [
                    'rank' => ((int) $cnt->fetch()['c']) + 1,
                    'name' => mb_substr((string) $my['nome'], 0, 40, 'UTF-8'),
                    'log10' => (float) $my['score_log10'],
                    'prestige' => (int) $my['prestige'],
                    'evolution' => (int) $my['evolution'],
                    'updated' => (string) $my['updated_at'],
                    'admin' => (int) $my['is_admin'] === 1,
                    'admin_mode' => (int) $my['admin_mode'] === 1,
                    'save' => $my['save_text'] ?? null,
                    'save_at' => $my['save_updated_at'] ?? null,
                    'save_version' => (int) ($my['save_version'] ?? 0),
                    'save_revision' => (int) ($my['save_revision'] ?? 0),
                    'save_checksum' => $my['save_checksum'] ?? null,
                ];

                // Buffs de top 3 (rank real, global — sem filtro de janela):
                // top 3 de dopamina ganham buff de produção; top 3 de prestige
                // ganham buff de ganho de prestige. ADMIN em admin_mode NUNCA recebe buff.
                $isAdminHidden = (int) $my['is_admin'] === 1 && (int) $my['admin_mode'] === 1;
                $qDr = $pdo->prepare("SELECT COUNT(*) AS c FROM tblRankingDopamina r LEFT JOIN users u ON u.id = r.usuario_id WHERE {$hidden} AND score_log10 > :s");
                $qDr->execute([':s' => (float) $my['score_log10']]);
                $dopRank = (int) $qDr->fetch()['c'] + 1;
                $qPr = $pdo->prepare("SELECT COUNT(*) AS c FROM tblRankingDopamina r LEFT JOIN users u ON u.id = r.usuario_id WHERE {$hidden} AND (prestige > :p OR (prestige = :p2 AND score_log10 > :s))");
                $qPr->execute([':p' => (int) $my['prestige'], ':p2' => (int) $my['prestige'], ':s' => (float) $my['score_log10']]);
                $presRank = (int) $qPr->fetch()['c'] + 1;
                $buffVal = [1 => 0.25, 2 => 0.15, 3 => 0.10];
                $buffs = ['dopamine' => 0.0, 'prestige' => 0.0];
                if (!$isAdminHidden) {
                    if (isset($buffVal[$dopRank])) $buffs['dopamine'] = $buffVal[$dopRank];
                    if (isset($buffVal[$presRank])) $buffs['prestige'] = $buffVal[$presRank];
                }
            }
        } catch (Throwable $e) {
            $me = null;
        }
    }

    echo json_encode([
        'ok' => true,
        'online' => true,
        'logged' => $uid > 0,
        'mode' => $mode,
        'sort' => $sort,
        'list' => $list,
        'me' => $me,
        'buffs' => $buffs,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

/* ----------------------------------------------------------------- POST */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($uid <= 0) {
        tdf_err(401, 'not_logged');
    }
    tdf_require_not_banned($pdo, $uid);
    tdf_require_not_frozen($pdo, $uid);

    // D5: admin em admin_mode NÃO pontua no ranking (nunca contamina o jogo real)
    $adm = $pdo->prepare('SELECT is_admin, admin_mode FROM users WHERE id = :u');
    $adm->execute([':u' => $uid]);
    $admRow = $adm->fetch();
    if ($admRow && (int) $admRow['is_admin'] === 1 && (int) ($admRow['admin_mode'] ?? 0) === 1) {
        tdf_err(403, 'admin_mode');
    }

    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        tdf_err(400, 'bad_json');
    }

    $log10 = (float) ($body['log10'] ?? -1);
    $prestige = (int) ($body['prestige'] ?? -1);
    $evolution = (int) ($body['evolution'] ?? 0);
    $playtime = (float) ($body['playtime'] ?? -1);
    $flags = (int) ($body['flags'] ?? 0);
    $save = isset($body['save']) ? (string) $body['save'] : null;

    if (!is_finite($log10) || $log10 < 0 || $log10 > 1200) {
        tdf_err(400, 'score_invalid');
    }
    if ($prestige < 0 || $prestige > 1000000) {
        tdf_err(400, 'prestige_invalid');
    }
    if ($evolution < 0 || $evolution > 100) {
        tdf_err(400, 'evolution_invalid');
    }
    if (!is_finite($playtime) || $playtime < 0 || $playtime > 100000000) {
        tdf_err(400, 'time_invalid');
    }
    if ($flags > 0) {
        tdf_err(400, 'flagged');
    }

    // Save opcional: JSON do estado v4, validado em profundidade (nunca
    // executa código). Guarda o progresso real para restaurar em outro PC.
    $saveValid = null; // null = não enviado; false = inválido; array = válido
    if ($save !== null) {
        $saveValid = tdf_validate_save($save);
        if (!$saveValid['ok']) {
            tdf_err(400, $saveValid['error']);
        }
    }
    // Concorrência opcional: base_revision é a revisão que o cliente carregou.
    // Se o servidor já avançou além dela, o save é recusado (conflict) e o
    // cliente decide (adotar o save do servidor ou forçar, se for maior).
    $baseRevision = isset($body['base_revision']) ? (int) $body['base_revision'] : null;
    $force = !empty($body['force']);

    try {
        $stmt = $pdo->prepare('SELECT *, UNIX_TIMESTAMP(last_submit) AS last_submit_ts FROM tblRankingDopamina WHERE usuario_id = :id LIMIT 1');
        $stmt->execute([':id' => $uid]);
        $row = $stmt->fetch();
    } catch (Throwable $e) {
        $row = false;
    }

    // Referência de relógio: a do BANCO (last_submit usa NOW() do MySQL).
    // Comparar time() PHP contra a string last_submit quebraria o rate
    // limit se o fuso do PHP diferir do fuso do MySQL (drift constante).
    $now = 0;
    try {
        $now = (int) $pdo->query('SELECT UNIX_TIMESTAMP(NOW())')->fetchColumn();
    } catch (Throwable $e) {
        $now = 0;
    }
    if ($now <= 0) {
        $now = time();
    }
    // Rate limit entre submissões (elapsed medido inteiramente no clock do MySQL).
    // Com save no payload (submitSave/autosave do jogo) o intervalo é
    // curto (15s, igual ao throttle do cliente); score puro do ranking
    // mantém 90s para evitar abuso de posição.
    $minInterval = $saveValid !== null ? 15 : 90;
    $elapsed = max(0, $now - (int) (is_array($row) ? ($row['last_submit_ts'] ?? 0) : 0));
    if ($elapsed < $minInterval) {
        tdf_err(429, 'rate_limit');
    }
    $hours = $elapsed / 3600;

    // ---- Validações ABSOLUTAS de sanidade: ANTES de gravar qualquer coisa ----
    // Se rodassem depois do tdf_save_put, um save inflado que falha aqui já
    // teria sido gravado no banco (HTTP 400 com save persistido = inconsistência
    // + buraco de anti-cheat: o cheat entra pelo save mesmo levando 400).
    // validação absoluta de sanidade (aplica sempre): log10 alto exige
    // tempo de jogo plausível, mesmo com save (anti-cheat de ranking)
    if ($log10 > 24 && $playtime < 5400) {
        tdf_err(400, 'impossible');
    }
    // D4: plausibilidade absoluta — nenhum jogador honesto ultrapassa isso
    // (20 + 5·log10(1+horas)) com folga ×1.4. Valida SEMPRE (com ou sem save).
    $saneMax = (20 + 5 * log10(1 + max(0.001, $playtime / 3600))) * 1.4;
    if ($log10 > $saneMax) {
        tdf_webhook("Growth anomaly: user #{$uid} log10={$log10} playtime={$playtime}s (max {$saneMax})", 'critical');
        tdf_err(400, 'impossible');
    }
    // D4: checksum multi-conta — o mesmo save (checksum sha256) em várias
    // contas = multi-account/duplicação. Detecta e congela as envolvidas.
    if ($saveValid !== null && $saveValid['ok']) {
        $chk = hash('sha256', $save);
        $dup = $pdo->prepare(
            'SELECT usuario_id FROM tblRankingDopamina WHERE save_checksum = :c AND usuario_id <> :u LIMIT 1'
        );
        $dup->execute([':c' => $chk, ':u' => $uid]);
        if ($dup->fetch()) {
            $pdo->prepare('UPDATE users SET frozen = 1 WHERE id = :u')->execute([':u' => $uid]);
            tdf_webhook("Multi-account detected: user #{$uid} shared save checksum with another account", 'critical');
            tdf_err(403, 'multiaccount');
        }
    }

    // ---- SAVE (fonte de verdade do progresso) ----
    // O save completo é processado DEPOIS das validações absolutas e ANTES
    // das validações relativas de score: um save legítimo pode crescer rápido
    // (offline, cliques, upgrades) sem ser cheat. O writer único protege contra
    // regressão (monotônico) e versões antigas (revisão) — É o anti-cheat do save.
    $saveRevision = 0;
    $saveStored = false;
    if ($saveValid !== null) {
        $res = tdf_save_put($pdo, $uid, $save, $baseRevision, $force);
        if (($res['ok'] ?? false) && ($res['saved'] ?? false)) {
            $saveStored = true;
            $saveRevision = (int) $res['revision'];
        } elseif (($res['error'] ?? '') === 'conflict') {
            tdf_json([
                'ok' => false,
                'error' => 'conflict',
                'status' => 409,
                'server_revision' => $res['server_revision'] ?? 0,
                'server_saved_at' => $res['server_saved_at'] ?? null,
                'server_save' => $res['server_save'] ?? null,
            ], 409);
        } elseif (!($res['ok'] ?? false)) {
            tdf_err(400, $res['error']);
        }
        // score do ranking já foi atualizado (monotônico, GREATEST) pelo writer
    }

    // ---- Validações RELATIVAS de score: só para score puro (sem save) ----
    // Com save, o crescimento já foi validado pelo writer (monotônico) e o
    // score acompanha o save. As checagens abaixo evitam inflar o RANKING
    // com scores falsos sem save correspondente.
    if ($saveValid === null) {
        // Limites generosos porém reais: dopamina ×~4/h no máximo (log10 +0.6/h).
        $maxLogDelta = 0.6 + $hours * 0.8;
        if ($log10 > (float) $row['score_log10'] + $maxLogDelta) {
            tdf_err(400, 'growth_impossible');
        }
        $maxPrestigeDelta = 8 + $hours * 15;
        if ($prestige > (int) $row['prestige'] + $maxPrestigeDelta) {
            tdf_err(400, 'prestige_impossible');
        }
        if ($playtime + 5 < (float) $row['playtime_sec']) {
            tdf_err(400, 'time_rewind');
        }
        if ($prestige <= 0 && (int) $row['prestige'] > 0) {
            tdf_err(400, 'prestige_wipe');
        }
    }
    // validações absolutas já rodaram ANTES do save (ver topo do bloco) —
    // nada além das checagens relativas de score puro nesta fase.

    $nome = 'Thiego';
    try {
        $st = $pdo->prepare('SELECT username FROM users WHERE id = :id LIMIT 1');
        $st->execute([':id' => $uid]);
        $u = $st->fetch();
        if ($u && $u['username'] !== '') {
            $nome = $u['username'];
        }
    } catch (Throwable $e) {
        $nome = 'Thiego';
    }
    $nome = mb_substr($nome, 0, 40, 'UTF-8');

    try {
        // Nunca regride: score/prestige/evolution/playtime só sobem (máximo histórico),
        // garantindo que perda de save local ou erro de cliente não apague o registro.
        // save_text NÃO é manipulado aqui — o writer único (tdf_save_put) cuida dele.
        $upsert = $pdo->prepare(
            "INSERT INTO tblRankingDopamina
                (usuario_id, nome, score_log10, prestige, evolution, playtime_sec, last_submit, updated_at)
             VALUES (:id, :nome, :s, :p, :e, :t, NOW(), NOW())
             ON DUPLICATE KEY UPDATE
                nome = VALUES(nome),
                score_log10 = GREATEST(score_log10, VALUES(score_log10)),
                prestige = GREATEST(prestige, VALUES(prestige)),
                evolution = GREATEST(evolution, VALUES(evolution)),
                playtime_sec = GREATEST(playtime_sec, VALUES(playtime_sec)),
                last_submit = NOW(),
                updated_at = NOW()"
        );
        $upsert->execute([
            ':id' => $uid,
            ':nome' => $nome,
            ':s' => $log10,
            ':p' => $prestige,
            ':e' => $evolution,
            ':t' => $playtime,
        ]);
    } catch (Throwable $e) {
        tdf_err(500, 'db_write');
    }

    echo json_encode(['ok' => true, 'save_stored' => $saveStored, 'save_revision' => $saveRevision]);
    exit;
}

tdf_err(405, 'method_not_allowed');
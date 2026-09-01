<?php
/**
 * THIEGO DOPAMINA FARM — api/boss.php
 * BOSS MUNDIAL COLABORATIVO (tempo real via Ably)
 *
 * Estado autoritativo no banco (HP, fases, respawn) + broadcast
 * em tempo real via Ably REST (canal "boss").
 *
 * 20 bosses, cada um com um ATAQUE ÚNICO (mecânica própria).
 *
 * Rotas:
 *   GET  ?route=state        — estado do boss + minha participação
 *   POST ?route=attack       — atacar (dano = f(log10 totalEarned))
 *   GET  ?route=leaderboard  — top dano da fase atual
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/tdf_db.php';

$pdo = tdf_pdo();
tdf_bootstrap();

$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

/* ---------- bootstrap das tabelas do boss ---------- */
$pdo->exec("CREATE TABLE IF NOT EXISTS world_boss (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    phase INT UNSIGNED NOT NULL DEFAULT 1,
    name VARCHAR(80) NOT NULL DEFAULT '',
    hp DOUBLE NOT NULL DEFAULT 0,
    max_hp DOUBLE NOT NULL DEFAULT 0,
    state ENUM('alive','dead') NOT NULL DEFAULT 'alive',
    killed_by INT UNSIGNED NULL,
    killed_at INT UNSIGNED NULL,
    respawn_at INT UNSIGNED NULL,
    spawned_at INT UNSIGNED NOT NULL DEFAULT 0,
    extra VARCHAR(512) NULL,
    INDEX idx_boss_state (state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

// coluna extra pode faltar em tabela já criada
$hasExtra = $pdo->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'world_boss' AND COLUMN_NAME = 'extra'")->fetchColumn();
if (!$hasExtra) {
    $pdo->exec('ALTER TABLE world_boss ADD COLUMN extra VARCHAR(512) NULL');
}

$pdo->exec("CREATE TABLE IF NOT EXISTS boss_participation (
    boss_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    damage DOUBLE NOT NULL DEFAULT 0,
    attacks INT UNSIGNED NOT NULL DEFAULT 0,
    last_attack_at INT UNSIGNED NOT NULL DEFAULT 0,
    rewards_claimed TINYINT NOT NULL DEFAULT 0,
    PRIMARY KEY (boss_id, user_id),
    INDEX idx_boss_part_user (user_id),
    CONSTRAINT fk_part_boss FOREIGN KEY (boss_id) REFERENCES world_boss(id) ON DELETE CASCADE,
    CONSTRAINT fk_part_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

/* ============================================================
   DEFINIÇÕES DOS 20 BOSSES (cada um com ataque único)
   ============================================================ */
function boss_defs(): array
{
    return [
        1  => ['name' => 'Capivara Hiperativa',        'icon' => '🦫',  'hp' => 2500,   'mech' => 'regen',   'atk' => 'Sprint Capivaral',     'desc' => 'Regenera 2% do HP a cada golpe recebido.'],
        2  => ['name' => 'Thiego Duplicado',           'icon' => '👯',  'hp' => 7000,   'mech' => 'dodge',   'atk' => 'Clique Fantasma',      'desc' => '20% dos seus cliques erram (dano 0).'],
        3  => ['name' => 'Reator Dopamínico Furioso',  'icon' => '⚛️',  'hp' => 19000,  'mech' => 'shield',  'atk' => 'Fusão de Dopamina',    'desc' => 'Golpes abaixo de 100 viram apenas 10 de dano.'],
        4  => ['name' => 'Portal do Thiego Enlouquecido', 'icon' => '🌀', 'hp' => 50000, 'mech' => 'quantum', 'atk' => 'Distorção Temporal',  'desc' => 'Seu dano é multiplicado por 0.5x a 1.5x a cada golpe.'],
        5  => ['name' => 'Singularidade do Vício',     'icon' => '🕳️',  'hp' => 130000, 'mech' => 'absorb',  'atk' => 'Colapso Gravitacional', 'desc' => 'Absorve 15% do dano como escudo.'],
        6  => ['name' => 'Buraco Negro Dopamínico',    'icon' => '⚫',  'hp' => 350000, 'mech' => 'drain',   'atk' => 'Horizonte de Eventos',  'desc' => 'Drena 8% do dano causado para se curar.'],
        7  => ['name' => 'Deus da Dopamina Corrompido','icon' => '😈',  'hp' => 900000, 'mech' => 'reflect', 'atk' => 'Punição Divina',        'desc' => 'Reflete 12% do dano: você perde 1 energia por golpe.'],
        8  => ['name' => 'Consciência Coletiva',       'icon' => '🧠',  'hp' => 2400000, 'mech' => 'swarm',   'atk' => 'Mente Colmeia',         'desc' => 'Regenera 3% do HP para cada jogador atacando na fase.'],
        9  => ['name' => 'O Vício Absoluto',           'icon' => '💉',  'hp' => 6500000, 'mech' => 'berserk', 'atk' => 'Overdose Final',        'desc' => 'Abaixo de 30% do HP, fica furioso: seu dano cai 30%.'],
        10 => ['name' => 'Thiego Supremo Final',       'icon' => '👑',  'hp' => 17000000,'mech' => 'titan',   'atk' => 'Julgamento Final',      'desc' => 'Dano total reduzido em 30% + regenera 1% do HP por golpe.'],
        11 => ['name' => 'Capivara Alpha',             'icon' => '🦫🔥','hp' => 46000000,'mech' => 'enrage',  'atk' => 'Carga Alfa',            'desc' => 'Fica 0.5% mais resistente a cada ataque acumulado.'],
        12 => ['name' => 'Thiego das Trevas',          'icon' => '🌑',  'hp' => 120000000,'mech' => 'night',  'atk' => 'Modo Escuro',          'desc' => 'Em modo escuro, seu dano cai 40%.'],
        13 => ['name' => 'Dopamina Sintética',         'icon' => '🧪',  'hp' => 320000000,'mech' => 'fake',   'atk' => 'Falsificação',         'desc' => 'Apenas 65% do seu dano realmente conta.'],
        14 => ['name' => 'Thiego Ciborgue',            'icon' => '🤖',  'hp' => 850000000,'mech' => 'armor',  'atk' => 'Cromo Blindado',       'desc' => 'Armadura cibernética reduz seu dano em 25%.'],
        15 => ['name' => 'TikTok da Morte',            'icon' => '🎵',  'hp' => 2300000000,'mech' => 'viral',  'atk' => 'Loop Viral',           'desc' => 'Cada ataque aumenta a resistência dele em 0.5% (até 50%).'],
        16 => ['name' => 'Algoritmo Voraz',            'icon' => '📈',  'hp' => 6200000000,'mech' => 'feed',   'atk' => 'Consumo de Dados',     'desc' => 'Abaixo de 50% do HP, cura 5% do dano causado.'],
        17 => ['name' => 'Capivara Necromante',        'icon' => '💀',  'hp' => 17000000000,'mech' => 'revive','atk' => 'Ritual Sombrio',       'desc' => 'Ao morrer, revive UMA vez com 25% do HP.'],
        18 => ['name' => 'Thiego do Futuro',           'icon' => '🕐',  'hp' => 46000000000,'mech' => 'time',  'atk' => 'Reversão Temporal',    'desc' => 'A cada 25 golpes, restaura 10% do HP total.'],
        19 => ['name' => 'Dopamina Quântica',          'icon' => '✨',  'hp' => 120000000000,'mech' => 'crit', 'atk' => 'Superposição',         'desc' => '50% de chance do seu golpe causar o DOBRO de dano.'],
        20 => ['name' => 'O Vício Primordial',         'icon' => '🌋',  'hp' => 330000000000,'mech' => 'titan2','atk' => 'Fúria Primordial',    'desc' => 'HP 1.5x maior, dano reduzido 40% e regenera 2% por golpe.'],
    ];
}

function boss_def(int $phase): array
{
    $defs = boss_defs();
    if ($phase > 20) {
        // pós-20: escala infinita reusando a mecânica titan2 com HP maior
        $d = $defs[20];
        $d['name'] = 'Vício Primordial ' . roman($phase);
        $d['hp'] = (float) $defs[20]['hp'] * pow(2.6, $phase - 20);
        $d['desc'] = 'Além do fim: o vazio absoluto.';
        return $d;
    }
    return $defs[$phase];
}

function roman(int $n): string
{
    $map = [1000 => 'M', 900 => 'CM', 500 => 'D', 400 => 'CD', 100 => 'C', 90 => 'XC', 50 => 'L', 40 => 'XL', 10 => 'X', 9 => 'IX', 5 => 'V', 4 => 'IV', 1 => 'I'];
    $r = '';
    foreach ($map as $v => $s) {
        while ($n >= $v) { $r .= $s; $n -= $v; }
    }
    return $r;
}

/* ============================================================
   HELPERS
   ============================================================ */

/** Pega o boss atual; revive automaticamente se o respawn passou. */
function boss_current(PDO $pdo): array
{
    $now = time();
    $st = $pdo->query('SELECT * FROM world_boss ORDER BY id DESC LIMIT 1');
    $boss = $st->fetch();
    if ($boss) {
        if ($boss['state'] === 'dead' && $boss['respawn_at'] !== null && (int) $boss['respawn_at'] <= $now) {
            $phase = (int) $boss['phase'] + 1;
            $def = boss_def($phase);
            $hp = (float) $def['hp'];
            $up = $pdo->prepare('UPDATE world_boss SET phase = :p, name = :n, hp = :hp1, max_hp = :hp2, state = \'alive\', killed_by = NULL, killed_at = NULL, respawn_at = NULL, spawned_at = :t, extra = NULL WHERE id = :id');
            $up->execute([':p' => $phase, ':n' => $def['name'], ':hp1' => $hp, ':hp2' => $hp, ':t' => $now, ':id' => $boss['id']]);
            $boss['phase'] = $phase;
            $boss['name'] = $def['name'];
            $boss['hp'] = $hp;
            $boss['max_hp'] = $hp;
            $boss['state'] = 'alive';
            $boss['killed_by'] = null;
            $boss['killed_at'] = null;
            $boss['respawn_at'] = null;
            $boss['spawned_at'] = $now;
            $boss['extra'] = null;
            boss_publish($pdo, ['type' => 'spawn', 'phase' => $phase, 'name' => $def['name'], 'icon' => $def['icon'], 'hp' => $hp, 'maxHp' => $hp]);
        }
        return $boss;
    }
    // cria o primeiro boss
    $def = boss_def(1);
    $hp = (float) $def['hp'];
    $pdo->prepare('INSERT INTO world_boss (phase, name, hp, max_hp, state, spawned_at) VALUES (1, :n, :hp1, :hp2, \'alive\', :t)')
        ->execute([':n' => $def['name'], ':hp1' => $hp, ':hp2' => $hp, ':t' => $now]);
    $id = (int) $pdo->lastInsertId();
    $boss = [
        'id' => $id, 'phase' => 1, 'name' => $def['name'], 'hp' => $hp,
        'max_hp' => $hp, 'state' => 'alive', 'killed_by' => null,
        'killed_at' => null, 'respawn_at' => null, 'spawned_at' => $now, 'extra' => null,
    ];
    boss_publish($pdo, ['type' => 'spawn', 'phase' => 1, 'name' => $def['name'], 'icon' => $def['icon'], 'hp' => $hp, 'maxHp' => $hp]);
    return $boss;
}

/** Publica mensagem no canal Ably "boss". */
function boss_publish(PDO $pdo, array $data): void
{
    $env = tdf_env();
    $ablyKey = $env['ABLY_KEY'] ?? '';
    if (!$ablyKey) return;
    try {
        $ch = curl_init('https://rest.ably.io/channels/boss/messages');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode(['name' => 'boss', 'data' => $data]),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_USERPWD => $ablyKey,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        curl_exec($ch);
        curl_close($ch);
    } catch (Throwable $e) { /* broadcast não derruba a requisição */ }
}

/** Dano bruto de um ataque: log10 do totalEarned escalado + bônus. */
function boss_damage(PDO $pdo, int $userId): float
{
    $st = $pdo->prepare('SELECT total_dopamine_log10, prestige, evolution_tier FROM user_progress WHERE user_id = :u');
    $st->execute([':u' => $userId]);
    $row = $st->fetch();
    if (!$row) return 1.0;
    $log = (float) ($row['total_dopamine_log10'] ?? 0);
    $prestige = (int) ($row['prestige'] ?? 0);
    $tier = (int) ($row['evolution_tier'] ?? 0);
    if ($log <= 0) return 1.0;
    return max(1.0, round($log * (1 + $prestige * 0.05) * (1 + $tier * 0.10), 2));
}

/** Estado extra persistente do boss (para mecânicas acumulativas). */
function boss_extra(array $boss): array
{
    $e = json_decode((string) ($boss['extra'] ?? ''), true);
    return is_array($e) ? $e : [];
}

function boss_save_extra(PDO $pdo, array $boss, array $extra): void
{
    $pdo->prepare('UPDATE world_boss SET extra = :e WHERE id = :id')
        ->execute([':e' => json_encode($extra), ':id' => $boss['id']]);
}

/**
 * Aplica a mecânica (ataque único) do boss.
 * Retorna [danoAplicado, hpNovo, mechMsg|null]
 */
function boss_apply_mech(string $mech, array &$boss, float $damage, PDO $pdo, int $userId, array $extra): array
{
    $hp = (float) $boss['hp'];
    $maxHp = (float) $boss['max_hp'];
    $msg = null;
    $applied = $damage;
    $changedExtra = null;

    switch ($mech) {
        case 'regen':
            $heal = $maxHp * 0.02;
            $hp = min($maxHp, $hp + $heal);
            $msg = '🦫 Capivara usou SPRINT CAPIVARAL! Regenerou ' . fmt_short($heal) . ' HP.';
            break;

        case 'dodge':
            if (mt_rand(1, 100) <= 20) {
                $applied = 0;
                $msg = '👯 CLIQUE FANTASMA! Thiego Duplicado desviou do golpe.';
            }
            break;

        case 'shield':
            if ($damage < 100) {
                $applied = 10;
                $msg = '⚛️ FUSÃO DE DOPAMINA! O escudo reduziu seu golpe para 10.';
            }
            break;

        case 'quantum':
            $mult = round(mt_rand(50, 150) / 100, 2);
            $applied = round($damage * $mult, 2);
            $msg = '🌀 DISTORÇÃO TEMPORAL! Seu dano foi multiplicado por ' . $mult . 'x.';
            break;

        case 'absorb':
            $shield = round($damage * 0.15, 2);
            $applied = round($damage - $shield, 2);
            $msg = '🕳️ COLAPSO GRAVITACIONAL! Absorveu ' . fmt_short($shield) . ' de dano como escudo.';
            break;

        case 'drain':
            $heal = round($damage * 0.08, 2);
            $hp = min($maxHp, $hp + $heal);
            $msg = '⚫ HORIZONTE DE EVENTOS! Drenou ' . fmt_short($heal) . ' HP do seu golpe.';
            break;

        case 'reflect':
            $reflected = round($damage * 0.12, 2);
            $applied = round($damage - $reflected, 2);
            $pdo->prepare('UPDATE user_progress SET energy = GREATEST(energy - 1, 0) WHERE user_id = :u')->execute([':u' => $userId]);
            $msg = '😈 PUNIÇÃO DIVINA! Refletiu ' . fmt_short($reflected) . ' e drenou 1 energia.';
            break;

        case 'swarm':
            $attackers = (int) $pdo->query('SELECT COUNT(DISTINCT user_id) FROM boss_participation WHERE boss_id = ' . (int) $boss['id'])->fetchColumn();
            $heal = $maxHp * 0.03 * max(1, $attackers);
            $hp = min($maxHp, $hp + $heal);
            $msg = '🧠 MENTE COLMEIA! ' . $attackers . ' jogadores na luta → regenerou ' . fmt_short($heal) . ' HP.';
            break;

        case 'berserk':
            if ($hp / $maxHp < 0.30) {
                $applied = round($damage * 0.7, 2);
                $msg = '💉 OVERDOSE FINAL! O Vício Absoluto está furioso — dano -30%.';
            }
            break;

        case 'titan':
            $applied = round($damage * 0.7, 2);
            $hp = min($maxHp, $hp + $maxHp * 0.01);
            $msg = '👑 JULGAMENTO FINAL! Dano -30% e regenerou 1% do HP.';
            break;

        case 'enrage':
            $count = (int) ($extra['count'] ?? 0) + 1;
            $resist = min(0.5, $count * 0.005);
            $applied = round($damage * (1 - $resist), 2);
            $extra['count'] = $count;
            $changedExtra = $extra;
            $msg = '🦫🔥 CARGA ALFA! Resistência acumulada: ' . round($resist * 100) . '%.';
            break;

        case 'night':
            $applied = round($damage * 0.6, 2);
            $msg = '🌑 MODO ESCURO! Seu dano caiu 40%.';
            break;

        case 'fake':
            $applied = round($damage * 0.65, 2);
            $msg = '🧪 FALSIFICAÇÃO! Apenas 65% do dano contou.';
            break;

        case 'armor':
            $applied = round($damage * 0.75, 2);
            $msg = '🤖 CROMO BLINDADO! Dano -25%.';
            break;

        case 'viral':
            $count = (int) ($extra['viral'] ?? 0) + 1;
            $resist = min(0.5, $count * 0.005);
            $applied = round($damage * (1 - $resist), 2);
            $extra['viral'] = $count;
            $changedExtra = $extra;
            $msg = '🎵 LOOP VIRAL! Resistência: ' . round($resist * 100) . '%.';
            break;

        case 'feed':
            if ($hp / $maxHp < 0.50) {
                $heal = round($damage * 0.05, 2);
                $hp = min($maxHp, $hp + $heal);
                $msg = '📈 CONSUMO DE DADOS! Comeu ' . fmt_short($heal) . ' HP do seu golpe.';
            }
            break;

        case 'revive':
            // lida no fluxo de morte (fora daqui)
            break;

        case 'time':
            $count = (int) ($extra['time'] ?? 0) + 1;
            if ($count % 25 === 0) {
                $heal = $maxHp * 0.10;
                $hp = min($maxHp, $hp + $heal);
                $msg = '🕐 REVERSÃO TEMPORAL! Restaurou 10% do HP.';
            }
            $extra['time'] = $count;
            $changedExtra = $extra;
            break;

        case 'crit':
            if (mt_rand(1, 100) <= 50) {
                $applied = round($damage * 2, 2);
                $msg = '✨ SUPERPOSIÇÃO! Crítico quântico: DANO x2!';
            }
            break;

        case 'titan2':
            $applied = round($damage * 0.6, 2);
            $hp = min($maxHp, $hp + $maxHp * 0.02);
            $msg = '🌋 FÚRIA PRIMORDIAL! Dano -40% e regenerou 2% do HP.';
            break;
    }

    if ($changedExtra !== null) {
        boss_save_extra($pdo, $boss, $changedExtra);
        $boss['extra'] = json_encode($changedExtra);
    }
    $boss['hp'] = $hp;

    return [$applied, $hp, $msg];
}

function fmt_short(float $n): string
{
    if ($n >= 1e9) return round($n / 1e9, 1) . 'B';
    if ($n >= 1e6) return round($n / 1e6, 1) . 'M';
    if ($n >= 1e3) return round($n / 1e3, 1) . 'k';
    return (string) round($n);
}

/** Credita recompensas a todos os participantes quando o boss morre. */
function boss_credit_rewards(PDO $pdo, int $bossId, int $phase): void
{
    $parts = $pdo->prepare('SELECT user_id, damage FROM boss_participation WHERE boss_id = :b AND rewards_claimed = 0');
    $parts->execute([':b' => $bossId]);
    $rows = $parts->fetchAll();
    foreach ($rows as $r) {
        $uid = (int) $r['user_id'];
        $dmg = (float) $r['damage'];
        $coins = (int) round($dmg * $phase * 2);
        $xp = (int) round($dmg * $phase * 5);
        $up = $pdo->prepare('UPDATE user_progress SET battle_coins = battle_coins + :c, xp = xp + :x WHERE user_id = :u');
        $up->execute([':c' => $coins, ':x' => $xp, ':u' => $uid]);
        $pdo->prepare('UPDATE boss_participation SET rewards_claimed = 1 WHERE boss_id = :b AND user_id = :u')
            ->execute([':b' => $bossId, ':u' => $uid]);
    }
}

/* ---------- state ---------- */
if ($method === 'GET' && $route === 'state') {
    $boss = boss_current($pdo);
    $userId = tdf_current_user($pdo);
    $def = boss_def((int) $boss['phase']);

    $mine = null;
    $rank = null;
    if ($userId && $boss) {
        $st = $pdo->prepare('SELECT damage, attacks, rewards_claimed FROM boss_participation WHERE boss_id = :b AND user_id = :u');
        $st->execute([':b' => $boss['id'], ':u' => $userId]);
        $mine = $st->fetch() ?: null;

        $rk = $pdo->prepare('SELECT COUNT(*) + 1 AS r FROM boss_participation WHERE boss_id = :b AND damage > (SELECT COALESCE(MAX(damage),0) FROM boss_participation WHERE boss_id = :b2 AND user_id = :u)');
        $rk->execute([':b' => $boss['id'], ':b2' => $boss['id'], ':u' => $userId]);
        $rank = (int) ($rk->fetchColumn() ?: 0);
    }

    tdf_json([
        'ok' => true,
        'boss' => [
            'id' => (int) $boss['id'],
            'phase' => (int) $boss['phase'],
            'name' => $boss['name'],
            'icon' => $def['icon'],
            'hp' => (float) $boss['hp'],
            'maxHp' => (float) $boss['max_hp'],
            'state' => $boss['state'],
            'killedBy' => $boss['killed_by'],
            'respawnAt' => $boss['respawn_at'] ? (int) $boss['respawn_at'] : null,
            'atk' => $def['atk'],
            'atkDesc' => $def['desc'],
            'mech' => $def['mech'],
        ],
        'me' => $mine ? ['damage' => (float) $mine['damage'], 'attacks' => (int) $mine['attacks'], 'rewardsClaimed' => (int) $mine['rewards_claimed']] : null,
        'rank' => $rank,
    ]);
}

/* ---------- attack ---------- */
if ($method === 'POST' && $route === 'attack') {
    $userId = tdf_current_user($pdo);
    if (!$userId) tdf_err(401, 'Faça login para atacar o boss.');

    $boss = boss_current($pdo);
    if (!$boss || $boss['state'] !== 'alive') {
        tdf_json(['ok' => false, 'error' => 'boss morto', 'respawn_at' => $boss['respawn_at'] ?? null]);
    }

    // rate limit: 1 ataque por 1s por usuário
    $st = $pdo->prepare('SELECT last_attack_at FROM boss_participation WHERE boss_id = :b AND user_id = :u');
    $st->execute([':b' => $boss['id'], ':u' => $userId]);
    $last = (int) ($st->fetchColumn() ?: 0);
    $now = time();
    if ($now - $last < 1) {
        tdf_json(['ok' => false, 'error' => 'calma, um ataque por vez!', 'cooldown' => 1 - ($now - $last)]);
    }

    $def = boss_def((int) $boss['phase']);
    $rawDamage = boss_damage($pdo, $userId);
    $extra = boss_extra($boss);
    [$damage, $hpAfterMech, $mechMsg] = boss_apply_mech($def['mech'], $boss, $rawDamage, $pdo, $userId, $extra);

    // atualiza participação
    $upsert = $pdo->prepare('INSERT INTO boss_participation (boss_id, user_id, damage, attacks, last_attack_at)
        VALUES (:b, :u, :d, 1, :t)
        ON DUPLICATE KEY UPDATE damage = damage + :d2, attacks = attacks + 1, last_attack_at = :t2');
    $upsert->execute([':b' => $boss['id'], ':u' => $userId, ':d' => $damage, ':t' => $now, ':d2' => $damage, ':t2' => $now]);

    // persiste HP: HP pós-mecânica MENOS o dano aplicado (com trava contra regen infinito)
    $newHp = max(0, min((float) $boss['max_hp'], $hpAfterMech - $damage));
    $upd = $pdo->prepare('UPDATE world_boss SET hp = :hp WHERE id = :id');
    $upd->execute([':hp' => $newHp, ':id' => $boss['id']]);

    $un = $pdo->prepare('SELECT username FROM users WHERE id = :u');
    $un->execute([':u' => $userId]);
    $username = (string) ($un->fetchColumn() ?: 'jogador');

    $killed = false;
    $reviveMsg = null;

    // mecânica revive: ao chegar a 0, revive 1x com 25%
    if ($newHp <= 0 && $def['mech'] === 'revive' && (int) ($extra['revived'] ?? 0) === 0) {
        $reviveHp = (float) $boss['max_hp'] * 0.25;
        $extra['revived'] = 1;
        boss_save_extra($pdo, $boss, $extra);
        $upd2 = $pdo->prepare('UPDATE world_boss SET hp = :hp WHERE id = :id');
        $upd2->execute([':hp' => $reviveHp, ':id' => $boss['id']]);
        $newHp = $reviveHp;
        $reviveMsg = '💀 RITUAL SOMBRIO! Capivara Necromante reviviu com 25% do HP!';
        boss_publish($pdo, [
            'type' => 'revive',
            'phase' => (int) $boss['phase'],
            'name' => $boss['name'],
            'icon' => $def['icon'],
            'hp' => $reviveHp,
            'maxHp' => (float) $boss['max_hp'],
            'msg' => $reviveMsg,
        ]);
    }

    if ($newHp <= 0) {
        // boss morreu!
        $killed = true;
        $respawnIn = 180;
        $upd2 = $pdo->prepare('UPDATE world_boss SET state = \'dead\', killed_by = :k, killed_at = :t, respawn_at = :r, hp = 0 WHERE id = :id');
        $upd2->execute([':k' => $userId, ':t' => $now, ':r' => $now + $respawnIn, ':id' => $boss['id']]);
        boss_credit_rewards($pdo, (int) $boss['id'], (int) $boss['phase']);
        $pdo->prepare('UPDATE user_stats SET bosses_killed = bosses_killed + 1 WHERE user_id = :u')->execute([':u' => $userId]);
        boss_publish($pdo, [
            'type' => 'dead',
            'phase' => (int) $boss['phase'],
            'name' => $boss['name'],
            'icon' => $def['icon'],
            'killedBy' => $username,
            'respawnIn' => $respawnIn,
            'respawnAt' => $now + $respawnIn,
        ]);
    } else {
        boss_publish($pdo, [
            'type' => 'attack',
            'name' => $username,
            'damage' => $damage,
            'hp' => $newHp,
            'maxHp' => (float) $boss['max_hp'],
            'mech' => $def['mech'],
            'mechMsg' => $mechMsg,
        ]);
    }

    tdf_json([
        'ok' => true,
        'damage' => $damage,
        'rawDamage' => $rawDamage,
        'mech' => $def['mech'],
        'mechMsg' => $mechMsg,
        'reviveMsg' => $reviveMsg,
        'hp' => $newHp,
        'maxHp' => (float) $boss['max_hp'],
        'killed' => $killed,
        'killedBy' => $killed ? $username : null,
        'respawnAt' => $killed ? $now + 180 : null,
    ]);
}

/* ---------- leaderboard ---------- */
if ($method === 'GET' && $route === 'leaderboard') {
    $boss = boss_current($pdo);
    if (!$boss) tdf_json(['ok' => true, 'top' => []]);
    $st = $pdo->query(
        'SELECT u.username, p.damage, p.attacks
         FROM boss_participation p
         JOIN users u ON u.id = p.user_id
         WHERE p.boss_id = ' . (int) $boss['id'] . '
         ORDER BY p.damage DESC
         LIMIT 20'
    );
    tdf_json(['ok' => true, 'top' => $st->fetchAll()]);
}

/* ---------- desconhecido ---------- */
tdf_json(['ok' => false, 'error' => 'rota desconhecida']);
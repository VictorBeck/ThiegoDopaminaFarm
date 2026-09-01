<?php
/**
 * THIEGO DOPAMINA FARM — api/thiego_lib.php
 * Funções puras de Thiego (stats por nível, equipamentos, build efetiva)
 * reutilizadas por thiegos.php, battle_engine.php e pvp.php.
 * SEM dispatcher de rotas — seguro para require.
 */

require_once __DIR__ . '/tdf_db.php';

/** Stats base de um thiego escaladas pelo nível */
function tdf_thiego_stats(PDO $pdo, int $thiegoId, int $level): array
{
    $st = $pdo->prepare('SELECT * FROM thiego_stats WHERE thiego_id = :id');
    $st->execute([':id' => $thiegoId]);
    $s = $st->fetch();
    if (!$s) return ['hp' => 100, 'atk' => 20, 'def' => 10, 'spd' => 10, 'crit' => 0.05, 'acc' => 0.92, 'eva' => 0.08, 'crit_dmg' => 1.5];
    $g = json_decode($s['growth'], true) ?: [];
    $lvl = max(1, (int) $level);
    $scale = 1 + (($g['hp'] ?? 0.10) * ($lvl - 1));
    $atkScale = 1 + (($g['atk'] ?? 0.10) * ($lvl - 1));
    $defScale = 1 + (($g['def'] ?? 0.08) * ($lvl - 1));
    $spdScale = 1 + (($g['spd'] ?? 0.04) * ($lvl - 1));
    return [
        'hp' => (int) round((float) $s['hp'] * $scale),
        'atk' => (int) round((float) $s['atk'] * $atkScale),
        'def' => (int) round((float) $s['def'] * $defScale),
        'spd' => (int) round((float) $s['spd'] * $spdScale),
        'crit' => (float) $s['crit'],
        'acc' => (float) $s['acc'],
        'eva' => (float) $s['eva'],
        'crit_dmg' => (float) $s['crit_dmg'],
    ];
}

/** Valor de um atributo após equipamentos (flat + level do equipamento) */
function tdf_apply_equipment(array $stats, array $equipmentList): array
{
    foreach ($equipmentList as $eq) {
        $eStats = json_decode((string) ($eq['stats'] ?? 'null'), true) ?: [];
        $mult = 1 + (0.10 * max(0, (int) $eq['eq_level']));
        foreach ($eStats as $k => $v) {
            if (array_key_exists($k, $stats)) {
                if (in_array($k, ['crit', 'eva'], true)) {
                    $stats[$k] = min(0.9, (float) $stats[$k] + (float) $v * $mult);
                } elseif (in_array($k, ['crit_dmg'], true)) {
                    $stats[$k] += (float) $v * $mult;
                } else {
                    $stats[$k] = (int) round((float) $stats[$k] + (float) $v * $mult);
                }
            } else {
                $stats[$k] = (float) $v * $mult;
            }
        }
        $eFx = json_decode((string) ($eq['effects'] ?? 'null'), true) ?: [];
        if (!empty($eFx['atk_bonus'])) $stats['atk'] = (int) round($stats['atk'] * (1 + (float) $eFx['atk_bonus']));
        if (!empty($eFx['crit_bonus'])) $stats['crit_dmg'] += (float) $eFx['crit_bonus'];
    }
    return $stats;
}

/** Equipamentos equipados em um thiego do usuário (id do user_thiego) */
function tdf_user_equipment(PDO $pdo, int $userId, int $userThiegoId): array
{
    $st = $pdo->prepare(
        'SELECT e.id AS equipment_id, e.item_id, e.level AS eq_level, e.slot,
                i.slug, i.name, i.icon, i.rarity, i.category, i.stats, i.effects
         FROM equipment e JOIN items i ON i.id = e.item_id
         WHERE e.user_id = :u AND e.thiego_id = :ut'
    );
    $st->execute([':u' => $userId, ':ut' => $userThiegoId]);
    return $st->fetchAll();
}

/** Build completa de um thiego do usuário (stats finais + habilidades + equip) */
function tdf_thiego_build(PDO $pdo, int $userId, int $userThiegoId): ?array
{
    $st = $pdo->prepare(
        'SELECT ut.id AS ut_id, ut.thiego_id, ut.level, ut.xp,
                t.slug, t.name, t.image, t.type, t.rarity, t.role, t.description, t.quote, t.is_boss
         FROM user_thiegos ut JOIN thiegos t ON t.id = ut.thiego_id
         WHERE ut.user_id = :u AND ut.id = :ut'
    );
    $st->execute([':u' => $userId, ':ut' => $userThiegoId]);
    $row = $st->fetch();
    if (!$row) return null;

    $stats = tdf_thiego_stats($pdo, (int) $row['thiego_id'], (int) $row['level']);
    $equipment = tdf_user_equipment($pdo, $userId, $userThiegoId);
    $stats = tdf_apply_equipment($stats, $equipment);

    // multiplicadores globais da genealogia
    $gene = tdf_genealogy_multipliers($pdo, $userId);
    $stats['hp'] = (int) round($stats['hp'] * $gene['hp_pct']);
    $stats['atk'] = (int) round($stats['atk'] * $gene['atk_pct']);
    $stats['def'] = (int) round($stats['def'] * $gene['def_pct']);
    $stats['crit'] = min(0.9, $stats['crit'] + $gene['crit_pct']);

    $q = $pdo->prepare('SELECT slot, name, description, power, cooldown, energy_cost, effect_type, effect_value, effect_target, animation FROM abilities WHERE thiego_id = :t ORDER BY id');
    $q->execute([':t' => $row['thiego_id']]);
    $abilities = $q->fetchAll();

    return [
        'ut_id' => (int) $row['ut_id'],
        'thiego_id' => (int) $row['thiego_id'],
        'slug' => $row['slug'],
        'name' => $row['name'],
        'image' => $row['image'],
        'type' => $row['type'],
        'rarity' => $row['rarity'],
        'role' => $row['role'],
        'description' => $row['description'],
        'quote' => $row['quote'],
        'level' => (int) $row['level'],
        'xp' => (int) $row['xp'],
        'stats' => $stats,
        'abilities' => $abilities,
        'equipment' => $equipment,
        'genealogy' => $gene,
    ];
}

/** Concede XP de combate a um thiego do usuário; auto-level até 100 */
function tdf_thiego_gain_xp(PDO $pdo, int $userId, int $thiegoId, int $xpGain): array
{
    $st = $pdo->prepare('SELECT id, level, xp FROM user_thiegos WHERE user_id = :u AND thiego_id = :t FOR UPDATE');
    $st->execute([':u' => $userId, ':t' => $thiegoId]);
    $row = $st->fetch();
    if (!$row) return ['level' => 1, 'xp' => 0, 'leveled' => 0];
    $level = (int) $row['level'];
    $xp = (int) $row['xp'] + max(0, (int) $xpGain);
    $leveled = 0;
    while ($level < 100) {
        $need = (int) floor(50 * pow($level, 1.3));
        if ($xp < $need) break;
        $xp -= $need;
        $level++;
        $leveled++;
    }
    if ($leveled > 0 || $xp !== (int) $row['xp']) {
        $up = $pdo->prepare('UPDATE user_thiegos SET level = :l, xp = :x WHERE id = :id');
        $up->execute([':l' => $level, ':x' => $xp, ':id' => $row['id']]);
    }
    return ['level' => $level, 'xp' => $xp, 'leveled' => $leveled];
}
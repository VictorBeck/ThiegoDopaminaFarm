<?php
/**
 * THIEGO DOPAMINA FARM — api/battle_engine.php
 * Motor de batalha por turnos, 1v1 (time de até 3). Autoritativo no
 * servidor: resolve toda a batalha e grava log. Lê builds do time do
 * jogador via thiegos.php e encontra o inimigo (playable/boss).
 */

require_once __DIR__ . '/tdf_db.php';
require_once __DIR__ . '/thiego_lib.php';

$TDF_EFFECTS = ['damage', 'true', 'aoe', 'drain', 'heal', 'buff_atk', 'buff_def', 'buff_spd', 'crit_up', 'shield', 'debuff_atk', 'debuff_def', 'debuff_spd', 'stun', 'dot', 'cleanse', 'execute', 'taunt', 'berserk', 'revive', 'ult_charge'];
$TDF_SLOT_CD = ['basic' => 0, 'skill1' => 'skill1', 'skill2' => 'skill2', 'special' => 'special'];

/** Converte um build (de thiegos.php) em combatente de batalha */
function tdf_make_combatant(array $build, string $key): array
{
    $s = $build['stats'];
    $firstHit = 0.0;
    $thorns = 0.0;
    $coinBonus = 0.0;
    foreach ((array) ($build['equipment'] ?? []) as $eq) {
        $fx = json_decode((string) ($eq['effects'] ?? 'null'), true) ?: [];
        $firstHit += (float) ($fx['first_hit_damage'] ?? 0);
        $thorns += (float) ($fx['thorns'] ?? 0);
        $coinBonus += (float) ($fx['coin_bonus'] ?? 0);
    }
    return [
        'key' => $key,
        'ut_id' => $build['ut_id'] ?? null,
        'thiego_id' => $build['thiego_id'] ?? null,
        'slug' => $build['slug'],
        'name' => $build['name'],
        'image' => $build['image'],
        'type' => $build['type'],
        'rarity' => $build['rarity'],
        'level' => $build['level'],
        'maxhp' => (int) $s['hp'],
        'hp' => (int) $s['hp'],
        'atk' => (int) $s['atk'],
        'def' => (int) $s['def'],
        'spd' => (int) $s['spd'],
        'crit' => (float) $s['crit'],
        'acc' => (float) $s['acc'],
        'eva' => (float) $s['eva'],
        'crit_dmg' => (float) $s['crit_dmg'],
        'defending' => false,
        'atk_buff' => 0.0,
        'def_buff' => 0.0,
        'def_debuff' => 0.0,
        'spd_debuff' => 0.0,
        'spd_buff' => 0.0,
        'crit_buff' => 0.0,
        'shield' => 0,
        'stunned' => 0,
        'taunt' => 0,
        'dot' => [],          // [['dmg'=>int,'left'=>int], ...]
        'combo' => 0,         // golpes seguidos no mesmo alvo
        'combo_target' => null,
        'ult_charge' => 0,    // 0..100 — ativa o ULTIMATE
        'ult_used' => false,
        'last_slot' => null,
        'first_hit_mult' => $firstHit,
        'thorns' => $thorns,
        'coin_bonus' => $coinBonus,
        'has_attacked' => false,
        'cd' => ['skill1' => 0, 'skill2' => 0, 'special' => 0],
        'abilities' => $build['abilities'],
        'consumables' => [], // [item_id => ['name'=>..., 'heal'=>..., 'qty'=>...]]
        'item_used' => false,
    ];
}

/** Multiplicador de tipo entre atacante e defensor */
function tdf_type_mult(PDO $pdo, string $attacker, string $defender): float
{
    $st = $pdo->prepare('SELECT mult FROM type_advantages WHERE attacker = :a AND defender = :d');
    $st->execute([':a' => $attacker, ':d' => $defender]);
    $row = $st->fetch();
    return $row ? (float) $row['mult'] : 1.0;
}

/** Rótulo de eficácia de tipo para o log de batalha */
function tdf_type_label(float $mult): string
{
    if ($mult >= 2.0) return 'SUPER EFICAZ x2 ⚡⚡';
    if ($mult >= 1.5) return 'SUPER EFICAZ ⚡';
    if ($mult >= 1.25) return 'EFICAZ ▲';
    if ($mult <= 0.25) return 'FRACO x0.25 🛡🛡';
    if ($mult <= 0.5) return 'FRACO x0.5 🛡';
    if ($mult <= 0.75) return 'POUCO EFICAZ ▼';
    return '';
}

/** Anexa consumíveis de cura ao combatente do jogador (pool compartilhado) */
function tdf_attach_consumables(PDO $pdo, int $userId, array &$combatant): void
{
    $st = $pdo->prepare(
        'SELECT i.id, i.name, i.effects, inv.qty FROM inventory inv JOIN items i ON i.id = inv.item_id
         WHERE inv.user_id = :u AND i.category = \'consumable\' AND inv.qty > 0'
    );
    $st->execute([':u' => $userId]);
    $combatant['consumables'] = [];
    foreach ($st->fetchAll() as $r) {
        $fx = json_decode((string) $r['effects'], true) ?: [];
        if (isset($fx['heal'])) {
            $combatant['consumables'][(int) $r['id']] = [
                'name' => $r['name'],
                'heal' => (float) $fx['heal'],
                'qty' => (int) $r['qty'],
            ];
        }
    }
}

/** Constrói o estado inicial de uma batalha */
function tdf_battle_state(PDO $pdo, array $playerBuilds, array $enemyBuilds): array
{
    $state = [
        'seed' => random_int(1, 999999999),
        'turn' => 0,
        'max_turns' => 60,
        'combatants' => [
            'player' => [],
            'enemy' => [],
        ],
        'log' => [],
        'hp_trail' => [],
        'boss_phases_applied' => [],
        'status' => 'active',
    ];
    foreach ($playerBuilds as $i => $b) $state['combatants']['player'][] = tdf_make_combatant($b, 'p' . $i);
    foreach ($enemyBuilds as $i => $b) $state['combatants']['enemy'][] = tdf_make_combatant($b, 'e' . $i);
    // referência de time para revive (por referência via chave)
    foreach ($state['combatants'] as $side => &$team) {
        foreach ($team as &$c) {
            $c['team_side'] = $side;
            $c['team_ref'] = null; // preenchido em tdf_apply_effect via &$state
        }
        unset($c);
    }
    unset($team);
    $state['hp_trail'][] = tdf_hp_snapshot($state, 0, 'sys', '⚔ A batalha começou!');
    return $state;
}

/** Snapshot de HP de ambos os lados (para replay animado no cliente) */
function tdf_hp_snapshot(array $state, int $turn, string $side, string $msg): array
{
    $hp = ['player' => [], 'enemy' => []];
    foreach (['player', 'enemy'] as $s) {
        foreach ($state['combatants'][$s] as $c) {
            $hp[$s][] = ['name' => $c['name'], 'hp' => (int) $c['hp'], 'maxhp' => (int) $c['maxhp']];
        }
    }
    return ['turn' => $turn, 'side' => $side, 'msg' => $msg, 'hp' => $hp];
}

/** Registra evento no log E no trail de HP (mantidos em sincronia 1:1) */
function tdf_trail(array &$state, int $turn, string $side, string $msg): void
{
    $state['log'][] = ['turn' => $turn, 'side' => $side, 'msg' => $msg];
    $state['hp_trail'][] = tdf_hp_snapshot($state, $turn, $side, $msg);
    if (count($state['log']) > 200) {
        $state['log'] = array_slice($state['log'], -200);
        $state['hp_trail'] = array_slice($state['hp_trail'], -200);
    }
}

/** Acha habilidades por slot; retorna [nome, power, cooldown, effect_type, effect_value] */
function tdf_ability_by_slot(array $abilities, string $slot): ?array
{
    foreach ($abilities as $ab) {
        if (($ab['slot'] ?? '') === $slot) return $ab;
    }
    // fallback: basic
    foreach ($abilities as $ab) {
        if (($ab['slot'] ?? '') === 'basic') return $ab;
    }
    return $abilities[0] ?? null;
}

/** Lista de combatentes vivos de um lado */
function tdf_alive(array $team): array
{
    return array_values(array_filter($team, fn($c) => $c['hp'] > 0));
}

/** Alvo vivo: provocado (taunt) tem prioridade; senão o de menor HP ou o único */
function tdf_pick_target(array $enemyTeam): ?array
{
    $alive = tdf_alive($enemyTeam);
    if (!$alive) return null;
    // alvo provocado
    foreach ($alive as $c) {
        if ((int) ($c['taunt'] ?? 0) > 0) return $c;
    }
    usort($alive, fn($a, $b) => $a['hp'] <=> $b['hp']);
    return $alive[0];
}

/** Calcula dano de um ataque */
function tdf_calc_damage(PDO $pdo, array $atk, array $def, float $power, float $variance, bool $ignoreDef = false): array
{
    $tm = tdf_type_mult($pdo, $atk['type'], $def['type']);
    // berserk: +30% ATK por ponto de atk_buff negativo é aplicado pelo efeito; aqui usamos o buff normal
    $berserkMult = 1.0;
    if ((int) ($atk['berserk'] ?? 0) > 0) {
        $missingPct = 1 - ((float) $atk['hp'] / max(1, (float) $atk['maxhp']));
        $berserkMult = 1 + $missingPct * 0.6; // até +60% quando quase morto
    }
    // combo: +8% por golpe consecutivo no mesmo alvo (máx +80%)
    $comboMult = 1 + min(0.8, (int) ($atk['combo'] ?? 0) * 0.08);
    // ULTIMATE: x2 se o boost está pronto (consumido após o golpe)
    $ultMult = 1.0;
    if ((float) ($atk['ult_ready'] ?? 0) > 0) {
        $ultMult = 2.0;
        $atk['ult_ready'] = 0;
    }
    $raw = $atk['atk'] * (1 + $atk['atk_buff']) * $power * $tm * $variance * $berserkMult * $comboMult * $ultMult;
    $crit = false;
    if (mt_rand(1, 10000) <= (int) round(($atk['crit'] + ($atk['crit_buff'] ?? 0)) * 10000)) {
        $crit = true;
        $raw *= $atk['crit_dmg'];
    }
    // execute: +50% de dano se o alvo estiver abaixo de 30% HP
    $execute = false;
    if ($def['hp'] > 0 && $def['hp'] <= $def['maxhp'] * 0.30) {
        $execute = true;
        $raw *= 1.5;
    }
    // acerto
    $acc = $atk['acc'] - $def['eva'];
    $acc = min(0.98, max(0.5, $acc));
    if (mt_rand(1, 10000) > (int) round($acc * 10000)) {
        return ['dmg' => 0, 'crit' => false, 'miss' => true, 'type' => $tm, 'execute' => false];
    }
    $defense = $ignoreDef ? 0 : ($def['def'] * (1 + $def['def_buff']) * (1 - $def['def_debuff']));
    $dmg = max(1, (int) round($raw - $defense * 0.5));
    if ($def['defending']) $dmg = (int) floor($dmg * 0.5);
    return ['dmg' => $dmg, 'crit' => $crit, 'miss' => false, 'type' => $tm, 'execute' => $execute];
}

/** Aplica dano respeitando escudo; retorna HP perdido e escudo absorvido */
function tdf_apply_damage(array &$def, int $dmg): array
{
    $dmg = max(0, $dmg);
    $absorbed = 0;
    $shield = (int) ($def['shield'] ?? 0);
    if ($shield > 0) {
        $absorbed = min($shield, $dmg);
        $def['shield'] = $shield - $absorbed;
        $dmg -= $absorbed;
    }
    $def['hp'] -= $dmg;
    return ['hp' => $dmg, 'shield' => $absorbed];
}

/** Aplica efeito de habilidade num combatente alvo (retorna mensagem) */
function tdf_apply_effect(PDO $pdo, array &$atk, array &$def, array $ab, float $power): array
{
    $effect = $ab['effect_type'] ?? 'damage';
    $val = (float) ($ab['effect_value'] ?? 0);
    $msg = '';
    // buffs/cura/proteção afetam quem usa a habilidade; dano/debuff afetam o alvo
    switch ($effect) {
        case 'damage':
        case 'true':
        case 'aoe':
        case 'drain':
            if (!$atk['has_attacked']) {
                $atk['has_attacked'] = true;
                $power *= 1 + (float) ($atk['first_hit_mult'] ?? 0);
            }
            $res = tdf_calc_damage($pdo, $atk, $def, $power, 0.9 + mt_rand(-100, 100) / 1000, $effect === 'true');
            if ($res['miss']) {
                $atk['combo'] = 0;
                $atk['combo_target'] = null;
                return ['msg' => $atk['name'] . ' errou!', 'dmg' => 0];
            }
            $apply = tdf_apply_damage($def, $res['dmg']);
            $lost = $apply['hp'];
            // combo: golpes seguidos no mesmo alvo
            if ($atk['combo_target'] === $def['key']) {
                $atk['combo']++;
            } else {
                $atk['combo'] = 1;
                $atk['combo_target'] = $def['key'];
            }
            // carga de ultimate: +12 por golpe
            $atk['ult_charge'] = min(100, (int) ($atk['ult_charge'] ?? 0) + 12);
            $typeLbl = tdf_type_label((float) $res['type']);
            $suffix = ($res['crit'] ? ' CRÍTICO' : '') . ($typeLbl ? ' [' . $typeLbl . ']' : '') . ($apply['shield'] > 0 ? ' [escudo -' . $apply['shield'] . ']' : '')
                . ($res['execute'] ? ' [EXECUÇÃO!]' : '') . ($atk['combo'] > 1 ? ' [COMBO x' . $atk['combo'] . ']' : '');
            if ($effect === 'drain' && $lost > 0) {
                $heal = (int) round($lost * $val);
                $atk['hp'] = min($atk['maxhp'], $atk['hp'] + $heal);
                $suffix .= ' +' . $heal . ' HP';
            }
            $msg = $atk['name'] . ' usou ' . $ab['name'] . ' (' . $lost . $suffix . ')';
            // espinhos
            if ($lost > 0 && (float) ($def['thorns'] ?? 0) > 0) {
                $thorn = max(1, (int) round($lost * (float) $def['thorns']));
                $atk['hp'] -= $thorn;
                $msg .= ' [espinhos -' . $thorn . ']';
            }
            return ['msg' => $msg, 'dmg' => $lost];
        case 'stun':
            $chance = min(1.0, max(0.2, $val));
            if (mt_rand(1, 100) <= (int) round($chance * 100)) {
                $def['stunned'] = 1;
                $msg = $atk['name'] . ' usou ' . $ab['name'] . ' — ' . $def['name'] . ' ficou ATORDOADO!';
            } else {
                $msg = $atk['name'] . ' tentou atordoar ' . $def['name'] . ' mas falhou.';
            }
            $atk['ult_charge'] = min(100, (int) ($atk['ult_charge'] ?? 0) + 6);
            return ['msg' => $msg];
        case 'dot':
            $dmgPerTick = (int) round($def['maxhp'] * min(0.2, max(0.03, $val)));
            $turns = max(2, min(4, (int) round($val * 10)));
            $def['dot'][] = ['dmg' => max(1, $dmgPerTick), 'left' => $turns];
            $msg = $atk['name'] . ' usou ' . $ab['name'] . ' — ' . $def['name'] . ' sofre dano contínuo (' . $dmgPerTick . '/turno x' . $turns . ')';
            $atk['ult_charge'] = min(100, (int) ($atk['ult_charge'] ?? 0) + 8);
            return ['msg' => $msg];
        case 'cleanse':
            $atk['def_debuff'] = 0;
            $atk['spd_debuff'] = 0;
            $atk['atk_buff'] = max(0, $atk['atk_buff']);
            $atk['dot'] = [];
            $msg = $atk['name'] . ' usou ' . $ab['name'] . ' — removeu TODOS os debuffs!';
            return ['msg' => $msg];
        case 'execute':
            // dano + bônus se alvo < 30% (o multiplicador já está no calc; aqui só loga)
            $res = tdf_calc_damage($pdo, $atk, $def, $power, 0.9 + mt_rand(-100, 100) / 1000);
            if ($res['miss']) { $atk['combo'] = 0; return ['msg' => $atk['name'] . ' errou!', 'dmg' => 0]; }
            $apply = tdf_apply_damage($def, $res['dmg']);
            $typeLbl = tdf_type_label((float) $res['type']);
            $suffix = ($res['execute'] ? ' [EXECUÇÃO! x1.5]' : '') . ($res['crit'] ? ' CRÍTICO' : '') . ($typeLbl ? ' [' . $typeLbl . ']' : '');
            $msg = $atk['name'] . ' usou ' . $ab['name'] . ' (' . $apply['hp'] . $suffix . ')';
            return ['msg' => $msg, 'dmg' => $apply['hp']];
        case 'taunt':
            $atk['taunt'] = 1;
            $msg = $atk['name'] . ' usou ' . $ab['name'] . ' — PROVOCOU o inimigo (alvo prioritário)!';
            return ['msg' => $msg];
        case 'berserk':
            $atk['berserk'] = 1;
            $msg = $atk['name'] . ' entrou em MODO BERSERK (+ATK conforme perde HP)!';
            return ['msg' => $msg];
        case 'revive':
            // reviver aliado caído com X% do HP
            $revived = false;
            foreach ($atk['team_ref'] ?? [] as $i => $ally) {
                if ($ally['hp'] <= 0) {
                    $reviveHp = (int) round($ally['maxhp'] * min(0.5, max(0.15, $val)));
                    $ally['hp'] = $reviveHp;
                    $ally['defending'] = false;
                    $ally['stunned'] = 0;
                    $msg = $atk['name'] . ' usou ' . $ab['name'] . ' — ' . $ally['name'] . ' VOLTOU À LUTA (+' . $reviveHp . ' HP)!';
                    $revived = true;
                    break;
                }
            }
            if (!$revived) $msg = $atk['name'] . ' usou ' . $ab['name'] . ' — ninguém para reviver.';
            return ['msg' => $msg];
        case 'ult_charge':
            $atk['ult_charge'] = min(100, (int) ($atk['ult_charge'] ?? 0) + (int) round($val * 100));
            $msg = $atk['name'] . ' focou energia (ULT ' . $atk['ult_charge'] . '%)!';
            return ['msg' => $msg];
        case 'debuff_atk':
            $def['atk_buff'] = max(-0.6, $def['atk_buff'] - $val);
            $msg = $atk['name'] . ' reduziu o ATK de ' . $def['name'] . ' (-' . round($val * 100) . '%)';
            return ['msg' => $msg];
        case 'debuff_def':
            $def['def_debuff'] = min(0.6, $def['def_debuff'] + $val);
            $msg = $atk['name'] . ' reduziu a DEF de ' . $def['name'] . ' (-' . round($val * 100) . '%)';
            return ['msg' => $msg];
        case 'debuff_spd':
            $def['spd_debuff'] = min(0.6, $def['spd_debuff'] + $val);
            $msg = $atk['name'] . ' reduziu a VEL de ' . $def['name'] . ' (-' . round($val * 100) . '%)';
            return ['msg' => $msg];
        case 'heal':
            $heal = (int) round($atk['maxhp'] * $val);
            $atk['hp'] = min($atk['maxhp'], $atk['hp'] + $heal);
            $msg = $atk['name'] . ' curou a si mesmo (+' . $heal . ' HP)';
            return ['msg' => $msg];
        case 'buff_atk':
            $atk['atk_buff'] = min(0.6, $atk['atk_buff'] + $val);
            $msg = $atk['name'] . ' aumentou o ATK (+' . round($val * 100) . '%)';
            return ['msg' => $msg];
        case 'buff_def':
            $atk['def_buff'] = min(0.6, $atk['def_buff'] + $val);
            $msg = $atk['name'] . ' aumentou a DEF (+' . round($val * 100) . '%)';
            return ['msg' => $msg];
        case 'buff_spd':
            $atk['spd_buff'] = min(0.6, $atk['spd_buff'] + $val);
            $msg = $atk['name'] . ' aumentou a VEL (+' . round($val * 100) . '%)';
            return ['msg' => $msg];
        case 'crit_up':
            $atk['crit_buff'] = min(0.6, $atk['crit_buff'] + $val);
            $msg = $atk['name'] . ' aumentou o CRIT (+' . round($val * 100) . '%)';
            return ['msg' => $msg];
        case 'shield':
            $sh = (int) round($atk['maxhp'] * $val);
            $atk['shield'] += $sh;
            $msg = $atk['name'] . ' criou um escudo (' . $sh . ')';
            return ['msg' => $msg];
        default:
            $res = tdf_calc_damage($pdo, $atk, $def, $power, 0.9 + mt_rand(-100, 100) / 1000);
            $lost = tdf_apply_damage($def, $res['dmg'])['hp'];
            return ['msg' => $atk['name'] . ' atacou (' . $lost . ')', 'dmg' => $lost];
    }
}

/** Ação automática de um combatente */
function tdf_auto_action(array &$c, array &$team, array &$enemyTeam): array
{
    // atordoado: perde a vez
    if ((int) ($c['stunned'] ?? 0) > 0) {
        $c['stunned'] = 0;
        return ['action' => 'skip', 'reason' => 'stunned'];
    }
    $cd = $c['cd'];
    // item de cura se HP baixo
    if ($c['hp'] <= $c['maxhp'] * 0.45 && !empty($c['consumables']) && !$c['item_used']) {
        $item = reset($c['consumables']);
        return ['action' => 'item', 'item_key' => key($c['consumables']), 'item' => $item];
    }
    // ULTIMATE: se a carga está cheia, o próximo golpe de dano é x2
    if ((int) ($c['ult_charge'] ?? 0) >= 100 && !$c['ult_used']) {
        $c['ult_used'] = true;
        $c['ult_charge'] = 0;
        $c['ult_boost'] = 2.0;
    }
    if ($cd['special'] === 0) return ['action' => 'ability', 'slot' => 'special'];
    if ($cd['skill2'] === 0) return ['action' => 'ability', 'slot' => 'skill2'];
    if ($cd['skill1'] === 0) return ['action' => 'ability', 'slot' => 'skill1'];
    return ['action' => 'attack'];
}

/** Processa dano contínuo (dot) no início do turno de um combatente */
function tdf_process_dot(array &$state, int $turn, string $side, array &$c): void
{
    if (empty($c['dot'])) return;
    $total = 0;
    $kept = [];
    foreach ($c['dot'] as $d) {
        $total += (int) $d['dmg'];
        $d['left']--;
        if ($d['left'] > 0) $kept[] = $d;
    }
    $c['dot'] = $kept;
    $apply = tdf_apply_damage($c, $total);
    tdf_trail($state, $turn, $side, $c['name'] . ' sofreu dano contínuo (' . $total . ($apply['shield'] > 0 ? ' [escudo -' . $apply['shield'] . ']' : '') . ')');
}

/** Resolve a batalha inteira (auto). Retorna estado final. */
function tdf_battle_resolve(PDO $pdo, array $state, int $userId): array
{
    mt_srand((int) $state['seed']);
    $maxTurns = (int) $state['max_turns'];
    $phaseMap = null;

    // fases do boss (lado enemy): thiego boss_phase
    $enemy = $state['combatants']['enemy'][0] ?? null;
    if ($enemy && $enemy['thiego_id']) {
        $st = $pdo->prepare('SELECT boss_phase FROM thiegos WHERE id = :id');
        $st->execute([':id' => $enemy['thiego_id']]);
        $bp = $st->fetch()['boss_phase'] ?? null;
        $phaseMap = $bp ? json_decode((string) $bp, true) : null;
        if (!is_array($phaseMap)) $phaseMap = null;
    }

    $all = ['player', 'enemy'];

    while ($state['status'] === 'active' && $state['turn'] < $maxTurns) {
        $state['turn']++;
        $turn = $state['turn'];

        // ordem por VEL efetiva
        $order = [];
        foreach ($all as $side) {
            foreach ($state['combatants'][$side] as $oc) {
                if ($oc['hp'] > 0) {
                    $effSpd = $oc['spd'] * (1 + ($oc['spd_buff'] ?? 0)) * (1 - $oc['spd_debuff']);
                    $order[] = ['side' => $side, 'idx' => $oc['key'], 'spd' => $effSpd];
                }
            }
        }
        usort($order, function ($a, $b) {
            if ($b['spd'] === $a['spd']) return mt_rand(0, 1) ? -1 : 1;
            return $b['spd'] <=> $a['spd'];
        });

        foreach ($order as $o) {
            $side = $o['side'];
            // índice real do combatente (posição muda? não, keys fixas)
            $team = &$state['combatants'][$side];
            $idx = null;
            foreach ($team as $i => $scan) if ($scan['key'] === $o['idx']) { $idx = $i; break; }
            if ($idx === null) continue;
            $c = &$team[$idx];
            if ($c['hp'] <= 0) continue;

            // cooldowns
            foreach (['skill1', 'skill2', 'special'] as $s) $c['cd'][$s] = max(0, $c['cd'][$s] - 1);

            // dano contínuo (dot)
            tdf_process_dot($state, $turn, $side, $c);
            if ($c['hp'] <= 0) {
                tdf_trail($state, $turn, $side, $c['name'] . ' caiu pelo dano contínuo!');
                if (!tdf_alive($state['combatants']['enemy'])) { $state['status'] = 'player'; break 2; }
                if (!tdf_alive($state['combatants']['player'])) { $state['status'] = 'enemy'; break 2; }
                continue;
            }

            // ULTIMATE boost
            $ultBoost = (float) ($c['ult_boost'] ?? 1.0);
            if ($ultBoost > 1.0) {
                // aplica ao próximo dano: marcar flag no combatente (usada em tdf_apply_effect)
                $c['ult_ready'] = 1.0;
            }

            // fases do boss ao iniciar o turno dele
            if ($side === 'enemy' && $phaseMap) {
                foreach ($phaseMap as $phaseName => $ph) {
                    if (in_array($phaseName, $state['boss_phases_applied'], true)) continue;
                    $pct = (float) ($ph['pct'] ?? 0);
                    if ($c['hp'] > 0 && $c['hp'] <= $c['maxhp'] * $pct) {
                        $state['boss_phases_applied'][] = $phaseName;
                        if (!empty($ph['buff_atk'])) $c['atk_buff'] = min(0.6, $c['atk_buff'] + (float) $ph['buff_atk']);
                        if (!empty($ph['heal_pct'])) {
                            $heal = (int) round($c['maxhp'] * (float) $ph['heal_pct']);
                            $c['hp'] = min($c['maxhp'], $c['hp'] + $heal);
                        }
                        $logMsg = $c['name'] . ' entrou em ' . strtoupper($phaseName) . '!';
                        tdf_trail($state, $turn, 'enemy', $logMsg);
                    }
                }
            }

            $enemySide = $side === 'player' ? 'enemy' : 'player';
            $enemyTeam = &$state['combatants'][$enemySide];
            if (!tdf_alive($enemyTeam)) break;

            $choice = tdf_auto_action($c, $team, $enemyTeam);
            $msg = '';

            if ($choice['action'] === 'skip') {
                $msg = $c['name'] . ' está ATORDOADO e perdeu a vez!';
            } elseif ($choice['action'] === 'item') {
                $ik = $choice['item_key'];
                if (isset($c['consumables'][$ik]) && $c['consumables'][$ik]['qty'] > 0) {
                    $c['item_used'] = true;
                    $heal = $c['consumables'][$ik]['heal'];
                    $amount = (int) round($c['maxhp'] * $heal);
                    $c['hp'] = min($c['maxhp'], $c['hp'] + $amount);
                    $c['consumables'][$ik]['qty']--;
                    if ($c['consumables'][$ik]['qty'] <= 0) unset($c['consumables'][$ik]);
                    if (!isset($state['items_used']) || !is_array($state['items_used'])) $state['items_used'] = [];
                    $state['items_used'][] = ['item_id' => (int) $ik, 'qty' => 1, 'side' => $side];
                    tdf_trail($state, $turn, $side, $c['name'] . ' usou ' . $choice['item']['name'] . ' (+' . $amount . ' HP)');
                } else {
                    tdf_trail($state, $turn, $side, $c['name'] . ' se preparou.');
                }
            } elseif ($choice['action'] === 'ability') {
                $slot = $choice['slot'];
                $ab = tdf_ability_by_slot($c['abilities'], $slot);
                if ($ab && $c['cd'][$slot] === 0) {
                    if (($ab['effect_type'] ?? '') === 'aoe') {
                        $msgs = [];
                        $total = 0;
                        foreach ($enemyTeam as $ei => &$e) {
                            if ($e['hp'] <= 0) continue;
                            $r2 = tdf_apply_effect($pdo, $c, $e, $ab, (float) $ab['power']);
                            $msgs[] = $r2['msg'];
                            $total += (int) ($r2['dmg'] ?? 0);
                        }
                        unset($e);
                        $msg = $msgs
                            ? $c['name'] . ' usou ' . $ab['name'] . ' (AoE total: ' . $total . ') | ' . implode(' | ', $msgs)
                            : $c['name'] . ' se preparou.';
                        $c['cd'][$slot] = (int) $ab['cooldown'];
                    } else {
                        $target = tdf_pick_target($enemyTeam);
                        if ($target) {
                            // localizar índice do alvo
                            $ti = null;
                            foreach ($enemyTeam as $i => $e) if ($e['key'] === $target['key']) { $ti = $i; break; }
                            $res = tdf_apply_effect($pdo, $c, $enemyTeam[$ti], $ab, (float) $ab['power']);
                            $msg = $res['msg'];
                            $c['cd'][$slot] = (int) $ab['cooldown'];
                        } else {
                            $msg = $c['name'] . ' se preparou.';
                        }
                    }
                } else {
                    // cai em ataque básico
                    $target = tdf_pick_target($enemyTeam);
                    if ($target) {
                        $ti = null;
                        foreach ($enemyTeam as $i => $e) if ($e['key'] === $target['key']) { $ti = $i; break; }
                        $basic = tdf_ability_by_slot($c['abilities'], 'basic');
                        $res = tdf_apply_effect($pdo, $c, $enemyTeam[$ti], $basic, (float) $basic['power']);
                        $msg = $res['msg'];
                    }
                }
            } else { // attack
                $target = tdf_pick_target($enemyTeam);
                if ($target) {
                    $ti = null;
                    foreach ($enemyTeam as $i => $e) if ($e['key'] === $target['key']) { $ti = $i; break; }
                    $basic = tdf_ability_by_slot($c['abilities'], 'basic');
                    $res = tdf_apply_effect($pdo, $c, $enemyTeam[$ti], $basic, (float) $basic['power']);
                    $msg = $res['msg'];
                }
            }
            if ($msg !== '') tdf_trail($state, $turn, $side, $msg);
            $c['defending'] = false;

            // fim?
            if (!tdf_alive($state['combatants']['enemy'])) { $state['status'] = 'player'; break 2; }
            if (!tdf_alive($state['combatants']['player'])) { $state['status'] = 'enemy'; break 2; }
        }

        // timeout
        if ($state['turn'] >= $maxTurns) {
            $state['status'] = 'draw';
            tdf_trail($state, $turn, 'sys', 'Limite de turnos atingido. Empate.');
        }
    }

    return $state;
}

/** Aplica UMA ação de um combatente atacante sobre o time defensor (compartilhada).
 *  $action = ['type'=>'attack'|'ability'|'item'|'switch', ...] */
function tdf_apply_side_action(PDO $pdo, array &$atk, array &$defTeam, array $action): string
{
    $msg = '';
    if ($action['type'] === 'ability') {
        $slot = $action['slot'] ?? 'basic';
        $ab = tdf_ability_by_slot($atk['abilities'], $slot);
        $cdVal = ($slot === 'basic') ? 0 : ($atk['cd'][$slot] ?? 0);
        if ($ab && $cdVal === 0) {
            if (($ab['effect_type'] ?? '') === 'aoe') {
                $msgs = [];
                $total = 0;
                foreach ($defTeam as $ei => &$e) {
                    if ($e['hp'] <= 0) continue;
                    $r2 = tdf_apply_effect($pdo, $atk, $e, $ab, (float) $ab['power']);
                    $msgs[] = $r2['msg'];
                    $total += (int) ($r2['dmg'] ?? 0);
                }
                unset($e);
                $msg = $msgs ? $atk['name'] . ' usou ' . $ab['name'] . ' (AoE: ' . $total . ') | ' . implode(' | ', $msgs) : $atk['name'] . ' se preparou.';
                $atk['cd'][$slot] = (int) $ab['cooldown'];
            } else {
                $target = tdf_pick_target($defTeam);
                if ($target) {
                    $ti = null;
                    foreach ($defTeam as $i => $e) if ($e['key'] === $target['key']) { $ti = $i; break; }
                    $res = tdf_apply_effect($pdo, $atk, $defTeam[$ti], $ab, (float) $ab['power']);
                    $msg = $res['msg'];
                    $atk['cd'][$slot] = (int) $ab['cooldown'];
                } else { $msg = $atk['name'] . ' se preparou.'; }
            }
        } else {
            $target = tdf_pick_target($defTeam);
            $basic = tdf_ability_by_slot($atk['abilities'], 'basic');
            $ti = null;
            if ($target) foreach ($defTeam as $i => $e) if ($e['key'] === $target['key']) { $ti = $i; break; }
            $res = $ti !== null ? tdf_apply_effect($pdo, $atk, $defTeam[$ti], $basic, (float) $basic['power']) : ['msg' => $atk['name'] . ' se preparou.'];
            $msg = $res['msg'];
        }
    } elseif ($action['type'] === 'item') {
        $ik = (int) ($action['item_key'] ?? 0);
        if (isset($atk['consumables'][$ik]) && $atk['consumables'][$ik]['qty'] > 0) {
            $atk['item_used'] = true;
            $heal = $atk['consumables'][$ik]['heal'];
            $amount = (int) round($atk['maxhp'] * $heal);
            $atk['hp'] = min($atk['maxhp'], $atk['hp'] + $amount);
            $atk['consumables'][$ik]['qty']--;
            if ($atk['consumables'][$ik]['qty'] <= 0) unset($atk['consumables'][$ik]);
            $msg = $atk['name'] . ' usou item (+' . $amount . ' HP)';
        } else { $msg = $atk['name'] . ' se preparou.'; }
    } else {
        // attack básico
        $target = tdf_pick_target($defTeam);
        $basic = tdf_ability_by_slot($atk['abilities'], 'basic');
        $ti = null;
        if ($target) foreach ($defTeam as $i => $e) if ($e['key'] === $target['key']) { $ti = $i; break; }
        $res = $ti !== null ? tdf_apply_effect($pdo, $atk, $defTeam[$ti], $basic, (float) $basic['power']) : ['msg' => $atk['name'] . ' se preparou.'];
        $msg = $res['msg'];
    }
    $atk['defending'] = false;
    return $msg;
}

/** Ação de batalha PvP assíncrona: aplica a ação de UM lado humano e vira o
 *  turno para o oponente. Retorna estado atualizado.
 *  $actingUid = id do jogador que está agindo nesta chamada. */
function tdf_pvp_turn(PDO $pdo, array &$state, int $actingUid, array $action): array
{
    mt_srand((int) $state['seed'] + $state['turn'] + 1);
    $pvp = $state['pvp'] ?? [];
    $p1 = (int) ($pvp['p1_uid'] ?? 0);
    $p2 = (int) ($pvp['p2_uid'] ?? 0);
    $turnOwner = (int) ($pvp['turn_owner'] ?? $p1);

    // só o dono da vez pode agir
    if ($actingUid !== $turnOwner) {
        $state['pvp_error'] = 'not_your_turn';
        return $state;
    }

    $state['turn']++;
    $turn = $state['turn'];

    $playerTeam = &$state['combatants']['player'];
    $enemyTeam = &$state['combatants']['enemy'];

    // quem age: se actingUid == p1, ataca do lado player; senão, do lado enemy
    $atkSide = $actingUid === $p1 ? 'player' : 'enemy';
    $atkTeam = &$state['combatants'][$atkSide];
    $defTeam = &$state['combatants'][$atkSide === 'player' ? 'enemy' : 'player'];

    $atk = null;
    foreach ($atkTeam as $i => $c) {
        if ($c['hp'] > 0) { $atk = &$atkTeam[$i]; break; }
    }
    if (!$atk) { $state['status'] = $atkSide === 'player' ? 'enemy' : 'player'; return $state; }

    foreach (['skill1', 'skill2', 'special'] as $s) $atk['cd'][$s] = max(0, $atk['cd'][$s] - 1);

    // troca de thiego
    if ($action['type'] === 'switch') {
        $si = (int) ($action['switch_idx'] ?? 0);
        $oldKey = $atk['key'];
        if ($si >= 0 && $si < count($atkTeam) && $atkTeam[$si]['hp'] > 0 && $atkTeam[$si]['key'] !== $oldKey) {
            $msg = $atk['name'] . ' voltou. ' . $atkTeam[$si]['name'] . ' entrou!';
            tdf_trail($state, $turn, $atkSide, $msg);
        } else {
            tdf_trail($state, $turn, $atkSide, $atk['name'] . ' hesitou.');
        }
    } else {
        $msg = tdf_apply_side_action($pdo, $atk, $defTeam, $action);
        if ($msg !== '') tdf_trail($state, $turn, $atkSide, $msg);
    }

    // fim?
    if (!tdf_alive($state['combatants']['enemy'])) { $state['status'] = 'player'; }
    elseif (!tdf_alive($state['combatants']['player'])) { $state['status'] = 'enemy'; }
    elseif ($state['turn'] >= $state['max_turns']) {
        $state['status'] = 'draw';
        tdf_trail($state, $turn, 'sys', 'Limite de turnos atingido. Empate.');
    }

    // vira o turno
    $pvp['turn_owner'] = $turnOwner === $p1 ? $p2 : $p1;
    $state['pvp'] = $pvp;
    return $state;
}
function tdf_manual_turn(PDO $pdo, array &$state, array $action, int $userId): array
{
    mt_srand((int) $state['seed'] + $state['turn'] + 1);
    $state['turn']++;
    $turn = $state['turn'];

    // fases do boss (só meio do turno, antes do inimigo agir)
    $enemy0 = &$state['combatants']['enemy'][0];
    if ($enemy0 && $enemy0['thiego_id'] && $enemy0['hp'] > 0) {
        $st = $pdo->prepare('SELECT boss_phase FROM thiegos WHERE id = :id');
        $st->execute([':id' => $enemy0['thiego_id']]);
        $bp = $st->fetch()['boss_phase'] ?? null;
        $phaseMap = $bp ? json_decode((string) $bp, true) : null;
        if (is_array($phaseMap)) {
            foreach ($phaseMap as $phaseName => $ph) {
                if (in_array($phaseName, $state['boss_phases_applied'] ?? [], true)) continue;
                $pct = (float) ($ph['pct'] ?? 0);
                if ($enemy0['hp'] > 0 && $enemy0['hp'] <= $enemy0['maxhp'] * $pct) {
                    $state['boss_phases_applied'][] = $phaseName;
                    if (!empty($ph['buff_atk'])) $enemy0['atk_buff'] = min(0.6, $enemy0['atk_buff'] + (float) $ph['buff_atk']);
                    if (!empty($ph['heal_pct'])) {
                        $heal = (int) round($enemy0['maxhp'] * (float) $ph['heal_pct']);
                        $enemy0['hp'] = min($enemy0['maxhp'], $enemy0['hp'] + $heal);
                    }
                    tdf_trail($state, $turn, 'enemy', $enemy0['name'] . ' entrou em ' . strtoupper($phaseName) . '!');
                }
            }
        }
    }

    // --- ação do jogador ---
    $player = null;
    $pIdx = null;
    foreach ($state['combatants']['player'] as $i => $c) {
        if ($c['hp'] > 0) { $player = &$state['combatants']['player'][$i]; $pIdx = $i; break; }
    }
    if ($player) {
        foreach (['skill1', 'skill2', 'special'] as $s) $player['cd'][$s] = max(0, $player['cd'][$s] - 1);
        $enemyTeam = &$state['combatants']['enemy'];

        if ($action['type'] === 'ability') {
            $slot = $action['slot'] ?? 'basic';
            $ab = tdf_ability_by_slot($player['abilities'], $slot);
            if ($ab && $player['cd'][$slot] === 0) {
                if (($ab['effect_type'] ?? '') === 'aoe') {
                    $msgs = [];
                    $total = 0;
                    foreach ($enemyTeam as $ei => &$e) {
                        if ($e['hp'] <= 0) continue;
                        $r2 = tdf_apply_effect($pdo, $player, $e, $ab, (float) $ab['power']);
                        $msgs[] = $r2['msg'];
                        $total += (int) ($r2['dmg'] ?? 0);
                    }
                    unset($e);
                    $msg = $msgs ? $player['name'] . ' usou ' . $ab['name'] . ' (AoE: ' . $total . ') | ' . implode(' | ', $msgs) : $player['name'] . ' se preparou.';
                    $player['cd'][$slot] = (int) $ab['cooldown'];
                } else {
                    $target = tdf_pick_target($enemyTeam);
                    if ($target) {
                        $ti = null;
                        foreach ($enemyTeam as $i => $e) if ($e['key'] === $target['key']) { $ti = $i; break; }
                        $res = tdf_apply_effect($pdo, $player, $enemyTeam[$ti], $ab, (float) $ab['power']);
                        $msg = $res['msg'];
                        $player['cd'][$slot] = (int) $ab['cooldown'];
                    } else { $msg = $player['name'] . ' se preparou.'; }
                }
            } else {
                $target = tdf_pick_target($enemyTeam);
                $basic = tdf_ability_by_slot($player['abilities'], 'basic');
                $ti = null;
                if ($target) foreach ($enemyTeam as $i => $e) if ($e['key'] === $target['key']) { $ti = $i; break; }
                $res = $ti !== null ? tdf_apply_effect($pdo, $player, $enemyTeam[$ti], $basic, (float) $basic['power']) : ['msg' => $player['name'] . ' se preparou.'];
                $msg = $res['msg'];
            }
        } elseif ($action['type'] === 'item') {
            $ik = (int) ($action['item_key'] ?? 0);
            if (isset($player['consumables'][$ik]) && $player['consumables'][$ik]['qty'] > 0) {
                $player['item_used'] = true;
                $heal = $player['consumables'][$ik]['heal'];
                $amount = (int) round($player['maxhp'] * $heal);
                $player['hp'] = min($player['maxhp'], $player['hp'] + $amount);
                $player['consumables'][$ik]['qty']--;
                if ($player['consumables'][$ik]['qty'] <= 0) unset($player['consumables'][$ik]);
                if (!isset($state['items_used']) || !is_array($state['items_used'])) $state['items_used'] = [];
                $state['items_used'][] = ['item_id' => $ik, 'qty' => 1, 'side' => 'player'];
                $msg = $player['name'] . ' usou item (+' . $amount . ' HP)';
            } else { $msg = $player['name'] . ' se preparou.'; }
        } elseif ($action['type'] === 'switch') {
            $si = (int) ($action['switch_idx'] ?? 0);
            if ($si >= 0 && $si < count($state['combatants']['player']) && $state['combatants']['player'][$si]['hp'] > 0 && $si !== $pIdx) {
                $msg = $player['name'] . ' voltou. ' . $state['combatants']['player'][$si]['name'] . ' entrou!';
            } else { $msg = $player['name'] . ' hesitou.'; }
        } else {
            // attack básico
            $target = tdf_pick_target($enemyTeam);
            $basic = tdf_ability_by_slot($player['abilities'], 'basic');
            $ti = null;
            if ($target) foreach ($enemyTeam as $i => $e) if ($e['key'] === $target['key']) { $ti = $i; break; }
            $res = $ti !== null ? tdf_apply_effect($pdo, $player, $enemyTeam[$ti], $basic, (float) $basic['power']) : ['msg' => $player['name'] . ' se preparou.'];
            $msg = $res['msg'];
        }
        $player['defending'] = false;
        if ($msg !== '') tdf_trail($state, $turn, 'player', $msg);
    }

    // --- verifica fim ---
    if (!tdf_alive($state['combatants']['enemy'])) { $state['status'] = 'player'; return $state; }
    if (!tdf_alive($state['combatants']['player'])) { $state['status'] = 'enemy'; return $state; }

    // --- ação do inimigo (auto) ---
    $enemy = null;
    foreach ($state['combatants']['enemy'] as $i => $c) {
        if ($c['hp'] > 0) { $enemy = &$state['combatants']['enemy'][$i]; break; }
    }
    if ($enemy) {
        foreach (['skill1', 'skill2', 'special'] as $s) $enemy['cd'][$s] = max(0, $enemy['cd'][$s] - 1);
        $playerTeam = &$state['combatants']['player'];
        $choice = tdf_auto_action($enemy, $state['combatants']['enemy'], $playerTeam);
        $msg = '';
        if ($choice['action'] === 'item') {
            $ik = $choice['item_key'];
            if (isset($enemy['consumables'][$ik]) && $enemy['consumables'][$ik]['qty'] > 0) {
                $enemy['item_used'] = true;
                $heal = $enemy['consumables'][$ik]['heal'];
                $amount = (int) round($enemy['maxhp'] * $heal);
                $enemy['hp'] = min($enemy['maxhp'], $enemy['hp'] + $amount);
                $enemy['consumables'][$ik]['qty']--;
                if ($enemy['consumables'][$ik]['qty'] <= 0) unset($enemy['consumables'][$ik]);
                $msg = $enemy['name'] . ' usou item (+' . $amount . ' HP)';
            } else { $msg = $enemy['name'] . ' se preparou.'; }
        } elseif ($choice['action'] === 'ability') {
            $slot = $choice['slot'];
            $ab = tdf_ability_by_slot($enemy['abilities'], $slot);
            if ($ab && $enemy['cd'][$slot] === 0) {
                $target = tdf_pick_target($playerTeam);
                if ($target) {
                    $ti = null;
                    foreach ($playerTeam as $i => $e) if ($e['key'] === $target['key']) { $ti = $i; break; }
                    $res = tdf_apply_effect($pdo, $enemy, $playerTeam[$ti], $ab, (float) $ab['power']);
                    $msg = $res['msg'];
                    $enemy['cd'][$slot] = (int) $ab['cooldown'];
                } else { $msg = $enemy['name'] . ' se preparou.'; }
            } else {
                $target = tdf_pick_target($playerTeam);
                $basic = tdf_ability_by_slot($enemy['abilities'], 'basic');
                $ti = null;
                if ($target) foreach ($playerTeam as $i => $e) if ($e['key'] === $target['key']) { $ti = $i; break; }
                $res = $ti !== null ? tdf_apply_effect($pdo, $enemy, $playerTeam[$ti], $basic, (float) $basic['power']) : ['msg' => $enemy['name'] . ' se preparou.'];
                $msg = $res['msg'];
            }
        } else {
            $target = tdf_pick_target($playerTeam);
            $basic = tdf_ability_by_slot($enemy['abilities'], 'basic');
            $ti = null;
            if ($target) foreach ($playerTeam as $i => $e) if ($e['key'] === $target['key']) { $ti = $i; break; }
            $res = $ti !== null ? tdf_apply_effect($pdo, $enemy, $playerTeam[$ti], $basic, (float) $basic['power']) : ['msg' => $enemy['name'] . ' se preparou.'];
            $msg = $res['msg'];
        }
        $enemy['defending'] = false;
        if ($msg !== '') tdf_trail($state, $turn, 'enemy', $msg);
    }

    // --- verifica fim pós-inimigo ---
    if (!tdf_alive($state['combatants']['enemy'])) { $state['status'] = 'player'; return $state; }
    if (!tdf_alive($state['combatants']['player'])) { $state['status'] = 'enemy'; return $state; }
    if ($state['turn'] >= $state['max_turns']) {
        $state['status'] = 'draw';
        tdf_trail($state, $turn, 'sys', 'Limite de turnos atingido. Empate.');
    }
    return $state;
}
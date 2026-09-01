<?php
/**
 * THIEGO DOPAMINA FARM — api/tdf_db.php
 * Conexão EXCLUSIVA com o banco do jogo (gwncsbql_thiego).
 * Nenhuma dependência externa. Cria o schema automaticamente
 * (idempotente) na primeira execução.
 */

require_once __DIR__ . '/config.php';

function tdf_pdo(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $env = tdf_env();
    $host = $env['DB_HOST'] ?? 'localhost';
    $name = $env['DB_NAME'] ?? 'gwncsbql_thiego';
    $user = $env['DB_USER'] ?? 'gwncsbql_thiego';
    $pass = $env['DB_PASS'] ?? '';

    $pdo = new PDO(
        "mysql:host={$host};dbname={$name};charset=utf8mb4",
        $user,
        $pass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
    return $pdo;
}

/* ============================================================
   SCHEMA — criado de forma idempotente (CREATE IF NOT EXISTS)
   ============================================================ */
function tdf_bootstrap(): void
{
    $pdo = tdf_pdo();
    $pdo->exec("SET NAMES utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(32) NOT NULL UNIQUE,
        email VARCHAR(190) NOT NULL UNIQUE,
        pass_hash VARCHAR(255) NOT NULL,
        is_admin TINYINT NOT NULL DEFAULT 0,
        last_login_at DATETIME NULL,
        last_ip VARCHAR(64) NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $pdo->exec("CREATE TABLE IF NOT EXISTS sessions (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        token_hash CHAR(64) NOT NULL UNIQUE,
        csrf_token CHAR(64) NOT NULL,
        expires_at INT UNSIGNED NOT NULL,
        ip VARCHAR(64) NOT NULL DEFAULT '',
        user_agent VARCHAR(255) NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_sess_user (user_id),
        CONSTRAINT fk_sess_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS rate_limits (
        bucket VARCHAR(96) PRIMARY KEY,
        hits INT UNSIGNED NOT NULL DEFAULT 0,
        window_start INT UNSIGNED NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS user_progress (
        user_id INT UNSIGNED PRIMARY KEY,
        level INT UNSIGNED NOT NULL DEFAULT 1,
        xp BIGINT NOT NULL DEFAULT 0,
        total_dopamine_log10 DOUBLE NOT NULL DEFAULT 0,
        prestige INT UNSIGNED NOT NULL DEFAULT 0,
        prestige_points INT UNSIGNED NOT NULL DEFAULT 0,
        evolution_tier INT UNSIGNED NOT NULL DEFAULT 0,
        playtime_sec BIGINT NOT NULL DEFAULT 0,
        dopamine_bonus_log10 DOUBLE NOT NULL DEFAULT 0,
        battle_coins INT NOT NULL DEFAULT 0,
        genealogy_points INT UNSIGNED NOT NULL DEFAULT 0,
        energy INT NOT NULL DEFAULT 10,
        energy_updated_at INT UNSIGNED NOT NULL DEFAULT 0,
        ng_cycle INT UNSIGNED NOT NULL DEFAULT 0,
        challenge_phase INT UNSIGNED NOT NULL DEFAULT 1,
        last_sync_at INT UNSIGNED NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_prog_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS user_stats (
        user_id INT UNSIGNED PRIMARY KEY,
        wins INT UNSIGNED NOT NULL DEFAULT 0,
        losses INT UNSIGNED NOT NULL DEFAULT 0,
        draws INT UNSIGNED NOT NULL DEFAULT 0,
        battles INT UNSIGNED NOT NULL DEFAULT 0,
        boxes_opened INT UNSIGNED NOT NULL DEFAULT 0,
        bosses_killed INT UNSIGNED NOT NULL DEFAULT 0,
        best_rating INT NOT NULL DEFAULT 0,
        best_win_streak INT UNSIGNED NOT NULL DEFAULT 0,
        CONSTRAINT fk_stats_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS thiegos (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(64) NOT NULL UNIQUE,
        name VARCHAR(80) NOT NULL,
        image VARCHAR(255) NOT NULL,
        type VARCHAR(24) NOT NULL,
        rarity VARCHAR(24) NOT NULL,
        role VARCHAR(16) NOT NULL DEFAULT 'playable',
        unlock_level INT UNSIGNED NOT NULL DEFAULT 0,
        unlock_metric VARCHAR(16) NOT NULL DEFAULT 'level',
        unlock_value DOUBLE NOT NULL DEFAULT 0,
        tier_order INT NOT NULL DEFAULT 0,
        description VARCHAR(512) NOT NULL DEFAULT '',
        quote VARCHAR(512) NOT NULL DEFAULT '',
        is_boss TINYINT NOT NULL DEFAULT 0,
        boss_phase JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS thiego_stats (
        thiego_id INT UNSIGNED PRIMARY KEY,
        hp INT NOT NULL DEFAULT 100,
        atk INT NOT NULL DEFAULT 20,
        def INT NOT NULL DEFAULT 10,
        spd INT NOT NULL DEFAULT 10,
        crit DOUBLE NOT NULL DEFAULT 0.05,
        acc DOUBLE NOT NULL DEFAULT 0.92,
        eva DOUBLE NOT NULL DEFAULT 0.08,
        crit_dmg DOUBLE NOT NULL DEFAULT 1.5,
        growth JSON NOT NULL,
        CONSTRAINT fk_ts_thiego FOREIGN KEY (thiego_id) REFERENCES thiegos(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS abilities (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        thiego_id INT UNSIGNED NOT NULL,
        slot VARCHAR(16) NOT NULL DEFAULT 'basic',
        name VARCHAR(80) NOT NULL,
        description VARCHAR(512) NOT NULL DEFAULT '',
        power DOUBLE NOT NULL DEFAULT 1,
        cooldown INT UNSIGNED NOT NULL DEFAULT 0,
        energy_cost INT NOT NULL DEFAULT 0,
        effect_type VARCHAR(24) NOT NULL DEFAULT 'damage',
        effect_value DOUBLE NOT NULL DEFAULT 0,
        effect_target VARCHAR(16) NOT NULL DEFAULT 'enemy',
        animation VARCHAR(24) NOT NULL DEFAULT 'hit',
        INDEX idx_ab_thiego (thiego_id),
        CONSTRAINT fk_ab_thiego FOREIGN KEY (thiego_id) REFERENCES thiegos(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS user_thiegos (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        thiego_id INT UNSIGNED NOT NULL,
        level INT UNSIGNED NOT NULL DEFAULT 1,
        xp INT UNSIGNED NOT NULL DEFAULT 0,
        obtained_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_ut_user_thiego (user_id, thiego_id),
        INDEX idx_ut_user (user_id),
        CONSTRAINT fk_ut_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_ut_thiego FOREIGN KEY (thiego_id) REFERENCES thiegos(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS items (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(64) NOT NULL UNIQUE,
        name VARCHAR(80) NOT NULL,
        icon VARCHAR(8) NOT NULL DEFAULT '📦',
        category VARCHAR(24) NOT NULL DEFAULT 'material',
        rarity VARCHAR(24) NOT NULL DEFAULT 'comum',
        slot VARCHAR(16) NULL,
        stats JSON NULL,
        effects JSON NULL,
        sell_value INT NOT NULL DEFAULT 0,
        description VARCHAR(512) NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS inventory (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        item_id INT UNSIGNED NOT NULL,
        qty INT NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_inv_user_item (user_id, item_id),
        CONSTRAINT fk_inv_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_inv_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS equipment (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        item_id INT UNSIGNED NOT NULL,
        thiego_id INT UNSIGNED NOT NULL,
        slot VARCHAR(16) NOT NULL,
        level INT UNSIGNED NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_eq_user_thiego_slot (user_id, thiego_id, slot),
        INDEX idx_eq_user (user_id),
        CONSTRAINT fk_eq_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_eq_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
        CONSTRAINT fk_eq_thiego FOREIGN KEY (thiego_id) REFERENCES user_thiegos(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS loot_boxes (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(64) NOT NULL UNIQUE,
        name VARCHAR(80) NOT NULL,
        icon VARCHAR(8) NOT NULL DEFAULT '📦',
        rarity VARCHAR(24) NOT NULL,
        cost_type VARCHAR(16) NOT NULL DEFAULT 'battle_coins',
        cost INT UNSIGNED NOT NULL DEFAULT 100,
        pity_limit INT UNSIGNED NOT NULL DEFAULT 20,
        pity_guarantee VARCHAR(24) NOT NULL DEFAULT 'raro',
        unlock_level INT UNSIGNED NOT NULL DEFAULT 1,
        description VARCHAR(512) NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS loot_tables (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        box_id INT UNSIGNED NOT NULL,
        rarity VARCHAR(24) NOT NULL,
        reward_type VARCHAR(16) NOT NULL DEFAULT 'item',
        item_id INT UNSIGNED NULL,
        qty_min INT NOT NULL DEFAULT 1,
        qty_max INT NOT NULL DEFAULT 1,
        weight INT NOT NULL DEFAULT 100,
        INDEX idx_lt_box (box_id),
        CONSTRAINT fk_lt_box FOREIGN KEY (box_id) REFERENCES loot_boxes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS loot_history (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        box_id INT UNSIGNED NOT NULL,
        result JSON NOT NULL,
        rarity VARCHAR(24) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_lh_user (user_id, created_at),
        CONSTRAINT fk_lh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS pity_state (
        user_id INT UNSIGNED NOT NULL,
        box_id INT UNSIGNED NOT NULL,
        counter INT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, box_id),
        CONSTRAINT fk_pity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_pity_box FOREIGN KEY (box_id) REFERENCES loot_boxes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS seasons (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(32) NOT NULL UNIQUE,
        name VARCHAR(80) NOT NULL,
        starts_at INT UNSIGNED NOT NULL,
        ends_at INT UNSIGNED NOT NULL,
        active TINYINT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS battles (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        mode VARCHAR(16) NOT NULL DEFAULT 'pve',
        enemy_id INT UNSIGNED NULL,
        enemy_level INT UNSIGNED NOT NULL DEFAULT 1,
        ng_cycle INT UNSIGNED NOT NULL DEFAULT 0,
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        winner VARCHAR(10) NULL,
        state JSON NULL,
        result JSON NULL,
        energy_cost INT NOT NULL DEFAULT 1,
        season_id INT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at DATETIME NULL,
        INDEX idx_bt_user (user_id, status),
        CONSTRAINT fk_bt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS battle_participants (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        battle_id INT UNSIGNED NOT NULL,
        user_id INT UNSIGNED NOT NULL,
        thiego_id INT UNSIGNED NOT NULL,
        side VARCHAR(10) NOT NULL DEFAULT 'player',
        snapshot JSON NOT NULL,
        INDEX idx_bp_battle (battle_id),
        CONSTRAINT fk_bp_battle FOREIGN KEY (battle_id) REFERENCES battles(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS battle_actions (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        battle_id INT UNSIGNED NOT NULL,
        turn INT UNSIGNED NOT NULL,
        actor_side VARCHAR(10) NOT NULL,
        action VARCHAR(24) NOT NULL,
        target_side VARCHAR(10) NOT NULL DEFAULT 'enemy',
        value JSON NULL,
        message VARCHAR(512) NOT NULL DEFAULT '',
        INDEX idx_ba_battle (battle_id, turn),
        CONSTRAINT fk_ba_battle FOREIGN KEY (battle_id) REFERENCES battles(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS battle_rewards (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        battle_id INT UNSIGNED NOT NULL,
        user_id INT UNSIGNED NOT NULL,
        type VARCHAR(16) NOT NULL,
        item_id INT UNSIGNED NULL,
        qty INT NOT NULL DEFAULT 1,
        value DOUBLE NOT NULL DEFAULT 0,
        INDEX idx_br_battle (battle_id),
        CONSTRAINT fk_br_battle FOREIGN KEY (battle_id) REFERENCES battles(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS battle_rating (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        season_id INT UNSIGNED NOT NULL,
        rating INT NOT NULL DEFAULT 1000,
        wins INT UNSIGNED NOT NULL DEFAULT 0,
        losses INT UNSIGNED NOT NULL DEFAULT 0,
        streak INT NOT NULL DEFAULT 0,
        best_rating INT NOT NULL DEFAULT 1000,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_rating_user_season (user_id, season_id),
        CONSTRAINT fk_rating_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS genealogy_nodes (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(64) NOT NULL UNIQUE,
        name VARCHAR(80) NOT NULL,
        icon VARCHAR(8) NOT NULL DEFAULT '🌿',
        description VARCHAR(512) NOT NULL DEFAULT '',
        effect_type VARCHAR(32) NOT NULL,
        effect_value DOUBLE NOT NULL DEFAULT 0,
        cost INT UNSIGNED NOT NULL DEFAULT 1,
        requires_id INT UNSIGNED NULL,
        max_level INT UNSIGNED NOT NULL DEFAULT 1,
        branch VARCHAR(24) NOT NULL DEFAULT 'origem',
        pos_x DOUBLE NOT NULL DEFAULT 0,
        pos_y DOUBLE NOT NULL DEFAULT 0,
        CONSTRAINT fk_gn_requires FOREIGN KEY (requires_id) REFERENCES genealogy_nodes(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS user_genealogy (
        user_id INT UNSIGNED NOT NULL,
        node_id INT UNSIGNED NOT NULL,
        level INT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, node_id),
        CONSTRAINT fk_ug_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_ug_node FOREIGN KEY (node_id) REFERENCES genealogy_nodes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS missions (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(64) NOT NULL UNIQUE,
        name VARCHAR(80) NOT NULL,
        description VARCHAR(512) NOT NULL DEFAULT '',
        type VARCHAR(16) NOT NULL DEFAULT 'daily',
        metric VARCHAR(24) NOT NULL,
        target INT NOT NULL DEFAULT 1,
        reward JSON NOT NULL,
        unlock_level INT UNSIGNED NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS user_missions (
        user_id INT UNSIGNED NOT NULL,
        mission_id INT UNSIGNED NOT NULL,
        progress INT NOT NULL DEFAULT 0,
        claimed TINYINT NOT NULL DEFAULT 0,
        period_key VARCHAR(24) NOT NULL DEFAULT '',
        PRIMARY KEY (user_id, mission_id, period_key),
        CONSTRAINT fk_um_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_um_mission FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS achievements (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(64) NOT NULL UNIQUE,
        name VARCHAR(80) NOT NULL,
        description VARCHAR(512) NOT NULL DEFAULT '',
        metric VARCHAR(24) NOT NULL,
        target INT NOT NULL DEFAULT 1,
        reward JSON NULL,
        secret TINYINT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS user_achievements (
        user_id INT UNSIGNED NOT NULL,
        achievement_id INT UNSIGNED NOT NULL,
        unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, achievement_id),
        CONSTRAINT fk_ua_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_ua_ach FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS notifications (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        title VARCHAR(120) NOT NULL DEFAULT '',
        body VARCHAR(512) NOT NULL DEFAULT '',
        is_read TINYINT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_not_user (user_id, is_read),
        CONSTRAINT fk_not_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS game_logs (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NULL,
        action VARCHAR(48) NOT NULL,
        detail JSON NULL,
        ip VARCHAR(64) NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_gl_user (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS type_advantages (
        attacker VARCHAR(24) NOT NULL,
        defender VARCHAR(24) NOT NULL,
        mult DOUBLE NOT NULL DEFAULT 1.0,
        PRIMARY KEY (attacker, defender)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Amizades: status 'pending' = pedido enviado; 'active' = amigos.
    $pdo->exec("CREATE TABLE IF NOT EXISTS friendships (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        friend_id INT UNSIGNED NOT NULL,
        status VARCHAR(12) NOT NULL DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_friend_pair (user_id, friend_id),
        CONSTRAINT fk_fr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_fr_friend FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Parties (grupos): líder + membros.
    $pdo->exec("CREATE TABLE IF NOT EXISTS parties (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(40) NOT NULL,
        code VARCHAR(8) NOT NULL UNIQUE,
        leader_id INT UNSIGNED NOT NULL,
        max_members INT UNSIGNED NOT NULL DEFAULT 4,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_party_leader FOREIGN KEY (leader_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS party_members (
        party_id INT UNSIGNED NOT NULL,
        user_id INT UNSIGNED NOT NULL,
        joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (party_id, user_id),
        CONSTRAINT fk_pm_party FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
        CONSTRAINT fk_pm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Sugestões dos jogadores (expiram após 7 dias)
    $pdo->exec("CREATE TABLE IF NOT EXISTS suggestions (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        text VARCHAR(500) NOT NULL,
        likes INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_sug_created (created_at),
        CONSTRAINT fk_sug_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS suggestion_likes (
        user_id INT UNSIGNED NOT NULL,
        suggestion_id INT UNSIGNED NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, suggestion_id),
        CONSTRAINT fk_sl_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_sl_sug FOREIGN KEY (suggestion_id) REFERENCES suggestions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    /* ============================================================
       NOVAS TABELAS — PLANO DE CONTEÚDO (tools/PLANO_CONTEUDO.md)
       ============================================================ */

    // Ações de moderação (D3): warn/mute/ban/freeze aplicados por admins.
    $pdo->exec("CREATE TABLE IF NOT EXISTS moderation_actions (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        admin_id INT UNSIGNED NOT NULL,
        action ENUM('warn','mute','ban','freeze') NOT NULL,
        reason VARCHAR(500) NOT NULL DEFAULT '',
        duration_sec INT UNSIGNED NULL,
        expires_at INT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_mod_user (user_id),
        CONSTRAINT fk_mod_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_mod_admin FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Denúncias de jogadores (D6): fila para o admin revisar.
    $pdo->exec("CREATE TABLE IF NOT EXISTS reports (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        reporter_id INT UNSIGNED NOT NULL,
        target_id INT UNSIGNED NOT NULL,
        reason ENUM('cheating','harassment','spam','other') NOT NULL DEFAULT 'other',
        detail VARCHAR(500) NOT NULL DEFAULT '',
        status ENUM('open','dismissed','actioned') NOT NULL DEFAULT 'open',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_rep_status (status, created_at),
        CONSTRAINT fk_rep_reporter FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_rep_target FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Mercado entre jogadores (C1): anúncios de venda de itens/equipamentos.
    $pdo->exec("CREATE TABLE IF NOT EXISTS market_listings (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        seller_id INT UNSIGNED NOT NULL,
        item_type VARCHAR(16) NOT NULL DEFAULT 'item',
        item_id INT UNSIGNED NOT NULL,
        qty INT NOT NULL DEFAULT 1,
        price_currency ENUM('coins','dopamine') NOT NULL DEFAULT 'coins',
        price_amount DOUBLE NOT NULL DEFAULT 0,
        status ENUM('active','sold','cancelled') NOT NULL DEFAULT 'active',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_mkt_status (status, created_at),
        CONSTRAINT fk_mkt_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Season pass (B3): XP de temporada + tiers de recompensa por jogador.
    $pdo->exec("CREATE TABLE IF NOT EXISTS season_passes (
        user_id INT UNSIGNED NOT NULL,
        season_id INT UNSIGNED NOT NULL,
        xp INT NOT NULL DEFAULT 0,
        tier INT NOT NULL DEFAULT 0,
        premium TINYINT NOT NULL DEFAULT 0,
        claimed_rewards JSON NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, season_id),
        CONSTRAINT fk_sp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_sp_season FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Eventos globais da comunidade (B4).
    $pdo->exec("CREATE TABLE IF NOT EXISTS global_events (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(48) NOT NULL UNIQUE,
        title VARCHAR(120) NOT NULL,
        description VARCHAR(500) NOT NULL DEFAULT '',
        goal_log10 DOUBLE NOT NULL DEFAULT 0,
        reward_json JSON NULL,
        starts_at INT UNSIGNED NOT NULL,
        ends_at INT UNSIGNED NOT NULL,
        status ENUM('upcoming','active','finished') NOT NULL DEFAULT 'upcoming',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ge_status (status, ends_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Contribuições individuais para eventos globais (log10 somado).
    $pdo->exec("CREATE TABLE IF NOT EXISTS global_event_contributions (
        event_id INT UNSIGNED NOT NULL,
        user_id INT UNSIGNED NOT NULL,
        log10 DOUBLE NOT NULL DEFAULT 0,
        claimed TINYINT NOT NULL DEFAULT 0,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (event_id, user_id),
        CONSTRAINT fk_gec_event FOREIGN KEY (event_id) REFERENCES global_events(id) ON DELETE CASCADE,
        CONSTRAINT fk_gec_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Guildas (C2): farms coletivas com HQ, membros e boss semanal.
    $pdo->exec("CREATE TABLE IF NOT EXISTS guilds (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(40) NOT NULL,
        tag VARCHAR(6) NOT NULL,
        level INT UNSIGNED NOT NULL DEFAULT 1,
        xp BIGINT NOT NULL DEFAULT 0,
        leader_id INT UNSIGNED NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_guild_tag (tag),
        CONSTRAINT fk_guild_leader FOREIGN KEY (leader_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS guild_members (
        guild_id INT UNSIGNED NOT NULL,
        user_id INT UNSIGNED NOT NULL,
        role ENUM('leader','officer','member') NOT NULL DEFAULT 'member',
        contribution BIGINT NOT NULL DEFAULT 0,
        joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (guild_id, user_id),
        CONSTRAINT fk_gm_guild FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
        CONSTRAINT fk_gm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Boss de guilda semanal (C2): dano acumulado + recompensas por tier.
    $pdo->exec("CREATE TABLE IF NOT EXISTS guild_boss (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        guild_id INT UNSIGNED NOT NULL,
        slug VARCHAR(48) NOT NULL,
        name VARCHAR(80) NOT NULL,
        hp_total DOUBLE NOT NULL DEFAULT 0,
        hp_left DOUBLE NOT NULL DEFAULT 0,
        week_key VARCHAR(10) NOT NULL,
        defeated TINYINT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_gb_guild_week (guild_id, week_key),
        CONSTRAINT fk_gb_guild FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Minigames (C3): melhor pontuação por minigame/dia.
    $pdo->exec("CREATE TABLE IF NOT EXISTS minigame_scores (
        user_id INT UNSIGNED NOT NULL,
        game VARCHAR(24) NOT NULL,
        best INT NOT NULL DEFAULT 0,
        played_at DATE NOT NULL,
        PRIMARY KEY (user_id, game),
        CONSTRAINT fk_mgs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    /* rotina de upgrade simples: versão de schema em chave fixa */
    try {
        // migração idempotente: challenge_phase
        $col = $pdo->prepare("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_progress' AND column_name = 'challenge_phase'");
        $col->execute();
        if ((int) $col->fetchColumn() === 0) {
            $pdo->exec('ALTER TABLE user_progress ADD COLUMN challenge_phase INT UNSIGNED NOT NULL DEFAULT 1 AFTER ng_cycle');
        }
        // migração idempotente: admin_mode em users (1 = modo admin ativo)
        $colU = $pdo->prepare("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'admin_mode'");
        $colU->execute();
        if ((int) $colU->fetchColumn() === 0) {
            $pdo->exec("ALTER TABLE users ADD COLUMN admin_mode TINYINT NOT NULL DEFAULT 0 AFTER is_admin");
        }
        // D3: penalidades ativas em users (ban/mute/freeze com expiração)
        foreach ([
            ['banned_until', 'INT UNSIGNED NULL'],
            ['muted_until', 'INT UNSIGNED NULL'],
            ['frozen', 'TINYINT NOT NULL DEFAULT 0'],
        ] as [$colName, $def]) {
            $chk = $pdo->prepare("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = :c");
            $chk->execute([':c' => $colName]);
            if ((int) $chk->fetchColumn() === 0) {
                $pdo->exec("ALTER TABLE users ADD COLUMN {$colName} {$def}");
            }
        }
        // B1/B5/C4/C5/C6: novos campos de progresso no user_progress
        foreach ([
            ['daily_streak', 'INT UNSIGNED NOT NULL DEFAULT 0'],
            ['last_checkin_date', 'DATE NULL'],
            ['last_checkin_streak', 'INT UNSIGNED NOT NULL DEFAULT 0'],
            ['return_boost_until', 'INT UNSIGNED NOT NULL DEFAULT 0'],
            ['return_boost_mult', 'DOUBLE NOT NULL DEFAULT 1'],
        ] as [$colName, $def]) {
            $chk = $pdo->prepare("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_progress' AND column_name = :c");
            $chk->execute([':c' => $colName]);
            if ((int) $chk->fetchColumn() === 0) {
                $pdo->exec("ALTER TABLE user_progress ADD COLUMN {$colName} {$def}");
            }
        }

        // seed de missões rotativas (B2) se a tabela estiver vazia
        $cntM = $pdo->query("SELECT COUNT(*) FROM missions")->fetchColumn();
        if ((int) $cntM === 0) {
            $defs = [
                ['daily_battle', 'Batalhador Diário', 'daily', 'Vença {target} batalhas hoje.', 'battle_win', 3, '{"battle_coins": 100, "xp": 150}'],
                ['daily_coins', 'Coletor Diário', 'daily', 'Ganhe {target} battle coins hoje.', 'coins_gain', 500, '{"battle_coins": 60, "xp": 120}'],
                ['daily_box', 'Caçador de Caixas', 'daily', 'Abra {target} caixa(s) hoje.', 'box_open', 2, '{"battle_coins": 80, "xp": 130}'],
                ['daily_prestige', 'Ascensão Diária', 'daily', 'Prestigie {target} vez(es) hoje.', 'prestige', 2, '{"battle_coins": 90, "xp": 140, "dopamine_log10": 2}'],
                ['weekly_pvp', 'Guerreiro Semanal', 'weekly', 'Vença {target} batalhas PVP esta semana.', 'pvp_win', 5, '{"battle_coins": 500, "xp": 800}'],
                ['weekly_boss', 'Caçador de Boss', 'weekly', 'Derrote {target} boss(es) esta semana.', 'boss_win', 3, '{"battle_coins": 600, "dopamine_log10": 5, "xp": 1000}'],
                ['weekly_evo', 'Evolução Acelerada', 'weekly', 'Evolua {target} tiers esta semana.', 'evolution_tier', 8, '{"battle_coins": 400, "dopamine_log10": 4, "xp": 1200}'],
            ];
            $insM = $pdo->prepare('INSERT INTO missions (slug, name, type, description, metric, target, reward) VALUES (?, ?, ?, ?, ?, ?, ?)');
            foreach ($defs as $d) {
                $insM->execute($d);
            }
        }
        $pdo->exec("CREATE TABLE IF NOT EXISTS schema_meta (
            k VARCHAR(32) PRIMARY KEY,
            v VARCHAR(64) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $st = $pdo->prepare('INSERT INTO schema_meta (k, v) VALUES (:k, :v) ON DUPLICATE KEY UPDATE v = VALUES(v)');
        $st->execute([':k' => 'schema_version', ':v' => '1']);
    } catch (Throwable $e) {
        // não impede o funcionamento
    }

    /* Tabela do ranking + backup de saves (idempotente): usada pelo sync da
       expansão para guardar o save completo mesmo sem o beacon de unload. */
    try {
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS tblRankingDopamina (
                id INT AUTO_INCREMENT PRIMARY KEY,
                usuario_id INT NOT NULL UNIQUE,
                nome VARCHAR(60) NOT NULL,
                score_log10 DOUBLE NOT NULL DEFAULT 0,
                prestige INT NOT NULL DEFAULT 0,
                evolution INT NOT NULL DEFAULT 0,
                playtime_sec DOUBLE NOT NULL DEFAULT 0,
                last_submit TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_rank_score (score_log10),
                INDEX idx_rank_prestige (prestige),
                INDEX idx_rank_updated (updated_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
        $cols = $pdo->query('SHOW COLUMNS FROM tblRankingDopamina')->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('save_text', $cols, true)) {
            $pdo->exec('ALTER TABLE tblRankingDopamina ADD COLUMN save_text MEDIUMTEXT NULL AFTER evolution');
        }
        if (!in_array('save_updated_at', $cols, true)) {
            $pdo->exec('ALTER TABLE tblRankingDopamina ADD COLUMN save_updated_at TIMESTAMP NULL DEFAULT NULL AFTER save_text');
        }
        if (!in_array('save_version', $cols, true)) {
            $pdo->exec('ALTER TABLE tblRankingDopamina ADD COLUMN save_version INT NOT NULL DEFAULT 0 AFTER save_updated_at');
        }
        if (!in_array('save_revision', $cols, true)) {
            $pdo->exec('ALTER TABLE tblRankingDopamina ADD COLUMN save_revision INT NOT NULL DEFAULT 0 AFTER save_version');
        }
        if (!in_array('save_checksum', $cols, true)) {
            $pdo->exec('ALTER TABLE tblRankingDopamina ADD COLUMN save_checksum CHAR(64) NULL AFTER save_revision');
        }
        // Migração idempotente dos saves existentes (NUNCA apaga/reseta):
        // linhas legadas com save_text mas sem revisão/checksum ganham
        // revisão 1 + checksum sha256, preservando o conteúdo intacto.
        $pdo->exec(
            "UPDATE tblRankingDopamina
             SET save_revision = 1, save_checksum = SHA2(save_text, 256)
             WHERE save_revision = 0 AND save_text IS NOT NULL AND save_text <> ''"
        );
    } catch (Throwable $e) {
        // não impede o funcionamento
    }
}

/* ============================================================
   HELPERS COMUNS de progresso / economia
   ============================================================ */

/** XP necessária para subir do nível atual para o próximo */
function tdf_xp_for_level(int $level): int
{
    // Curva suavizada: menos grind, ainda balanceada
    // Antes: 40 * pow(1.12) → agora: 35 * pow(1.08)
    return (int) floor(35 * pow($level, 1.08));
}

/** Soma XP e calcula novos níveis (retorna [level, xp] atualizados).
 *  Reentrante: quando chamado DENTRO de uma transação existente (ex.:
 *  tdf_grant_reward dentro do check-in), apenas participa dela — tentar
 *  begin() aninhado no PDO/MySQL dá fatal "There is already an active
 *  transaction". No standalone comita; dentro, o dono da transação comita. */
function tdf_apply_xp(PDO $pdo, int $userId, int $xpGain): array
{
    $ownsTx = !$pdo->inTransaction();
    if ($ownsTx) {
        $pdo->beginTransaction();
    }
    try {
        $st = $pdo->prepare('SELECT level, xp FROM user_progress WHERE user_id = :u FOR UPDATE');
        $st->execute([':u' => $userId]);
        $row = $st->fetch();
        $level = (int) ($row['level'] ?? 1);
        $xp = (int) ($row['xp'] ?? 0) + max(0, $xpGain);
        $leveled = 0;
        while ($level < 999) {
            $need = tdf_xp_for_level($level);
            if ($xp < $need) break;
            $xp -= $need;
            $level++;
            $leveled++;
        }
        $up = $pdo->prepare('UPDATE user_progress SET level = :l, xp = :x WHERE user_id = :u');
        $up->execute([':l' => $level, ':x' => $xp, ':u' => $userId]);
        if ($ownsTx) {
            $pdo->commit();
        }
        return ['level' => $level, 'xp' => $xp, 'leveled' => $leveled, 'before' => $row['level'] ?? 1];
    } catch (Throwable $e) {
        if ($ownsTx && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/** Progresso do usuário com regeneração de energia aplicada */
function tdf_user_progress(PDO $pdo, int $userId): array
{
    $st = $pdo->prepare('SELECT * FROM user_progress WHERE user_id = :u');
    $st->execute([':u' => $userId]);
    $row = $st->fetch();
    if (!$row) {
        $ins = $pdo->prepare(
            'INSERT INTO user_progress (user_id, energy, energy_updated_at)
             VALUES (:u, 10, :t)'
        );
        $ins->execute([':u' => $userId, ':t' => time()]);
        $row = ['user_id' => $userId, 'level' => 1, 'xp' => 0, 'total_dopamine_log10' => 0,
            'prestige' => 0, 'prestige_points' => 0, 'evolution_tier' => 0, 'playtime_sec' => 0,
            'dopamine_bonus_log10' => 0, 'battle_coins' => 0, 'genealogy_points' => 0,
            'energy' => 10, 'energy_updated_at' => time(), 'ng_cycle' => 0, 'last_sync_at' => 0];
    }
    // regeneração: +1 energia a cada 5 minutos, máximo 10
    $now = time();
    $updated = (int) ($row['energy_updated_at'] ?? $now);
    $elapsed = max(0, $now - $updated);
    if ($elapsed >= 300) {
        $regens = (int) floor($elapsed / 300);
        $energy = min(10, (int) $row['energy'] + $regens);
        if ($energy !== (int) $row['energy']) {
            $up = $pdo->prepare('UPDATE user_progress SET energy = :e, energy_updated_at = :t WHERE user_id = :u');
            $up->execute([':e' => $energy, ':t' => $now, ':u' => $userId]);
            $row['energy'] = $energy;
        }
        $row['energy_updated_at'] = $now;
    }
    return $row;
}

/** Adiciona moeda (battle_coins) com lock de linha */
function tdf_add_coins(PDO $pdo, int $userId, int $amount): int
{
    $amount = (int) $amount;
    if ($amount === 0) return 0;
    $st = $pdo->prepare('SELECT battle_coins FROM user_progress WHERE user_id = :u FOR UPDATE');
    $st->execute([':u' => $userId]);
    $cur = (int) ($st->fetch()['battle_coins'] ?? 0);
    $next = max(0, $cur + $amount);
    $up = $pdo->prepare('UPDATE user_progress SET battle_coins = :c WHERE user_id = :u');
    $up->execute([':c' => $next, ':u' => $userId]);
    return $next;
}

/** Soma de valores em escala log10 sem overflow: log10(10^a + 10^b) */
function tdf_logadd(float $a, float $b): float
{
    if ($a <= 0) return max(0.0, $b);
    if ($b <= 0) return max(0.0, $a);
    $m = max($a, $b);
    return $m + log10(1 + pow(10, -abs($a - $b)));
}

/** Soma dopamina (em escala log10) ao bônus pendente (não usada direto no farm) */
function tdf_add_dopamine_bonus(PDO $pdo, int $userId, float $log10): void
{
    if (!is_finite($log10) || $log10 <= 0) return;
    $st = $pdo->prepare('SELECT dopamine_bonus_log10 FROM user_progress WHERE user_id = :u FOR UPDATE');
    $st->execute([':u' => $userId]);
    $cur = (float) ($st->fetch()['dopamine_bonus_log10'] ?? 0);
    $next = tdf_logadd($cur, $log10);
    $up = $pdo->prepare('UPDATE user_progress SET dopamine_bonus_log10 = :b WHERE user_id = :u');
    $up->execute([':b' => $next, ':u' => $userId]);
}

/** Concede item stackável no inventário (retorna qty total) */
function tdf_grant_item(PDO $pdo, int $userId, int $itemId, int $qty): int
{
    $qty = max(0, (int) $qty);
    if ($qty <= 0) return 0;
    $st = $pdo->prepare('SELECT id, qty FROM inventory WHERE user_id = :u AND item_id = :i FOR UPDATE');
    $st->execute([':u' => $userId, ':i' => $itemId]);
    $row = $st->fetch();
    if ($row) {
        $up = $pdo->prepare('UPDATE inventory SET qty = qty + :q WHERE id = :id');
        $up->execute([':q' => $qty, ':id' => $row['id']]);
        return (int) $row['qty'] + $qty;
    }
    $ins = $pdo->prepare('INSERT INTO inventory (user_id, item_id, qty) VALUES (:u, :i, :q)');
    $ins->execute([':u' => $userId, ':i' => $itemId, ':q' => $qty]);
    return $qty;
}

/** Remove item do inventário (retorna false se não tiver o suficiente) */
function tdf_take_item(PDO $pdo, int $userId, int $itemId, int $qty): bool
{
    $qty = max(0, (int) $qty);
    if ($qty <= 0) return true;
    $st = $pdo->prepare('SELECT id, qty FROM inventory WHERE user_id = :u AND item_id = :i FOR UPDATE');
    $st->execute([':u' => $userId, ':i' => $itemId]);
    $row = $st->fetch();
    if (!$row || (int) $row['qty'] < $qty) return false;
    $left = (int) $row['qty'] - $qty;
    if ($left <= 0) {
        $del = $pdo->prepare('DELETE FROM inventory WHERE id = :id');
        $del->execute([':id' => $row['id']]);
    } else {
        $up = $pdo->prepare('UPDATE inventory SET qty = :q WHERE id = :id');
        $up->execute([':q' => $left, ':id' => $row['id']]);
    }
    return true;
}

/** Consome energia (não negativa) */
function tdf_spend_energy(PDO $pdo, int $userId, int $amount): bool
{
    $amount = (int) $amount;
    if ($amount <= 0) return true;
    $st = $pdo->prepare('SELECT energy FROM user_progress WHERE user_id = :u FOR UPDATE');
    $st->execute([':u' => $userId]);
    $cur = (int) ($st->fetch()['energy'] ?? 0);
    if ($cur < $amount) return false;
    $up = $pdo->prepare('UPDATE user_progress SET energy = energy - :a, energy_updated_at = :t WHERE user_id = :u');
    $up->execute([':a' => $amount, ':t' => time(), ':u' => $userId]);
    return true;
}

/** Registra uma notificação */
function tdf_notify(PDO $pdo, int $userId, string $title, string $body): void
{
    $st = $pdo->prepare('INSERT INTO notifications (user_id, title, body) VALUES (:u, :t, :b)');
    $st->execute([':u' => $userId, ':t' => mb_substr($title, 0, 120), ':b' => mb_substr($body, 0, 512)]);
}

/** Shape público de usuário + progresso (usado em auth e demais endpoints) */
function tdf_user_shape(PDO $pdo, int $userId): array
{
    $st = $pdo->prepare('SELECT id, username, email, is_admin, admin_mode, created_at FROM users WHERE id = :u');
    $st->execute([':u' => $userId]);
    $user = $st->fetch();
    $prog = tdf_user_progress($pdo, $userId);
    $now = time();
    $energyNextIn = 0;
    if ((int) $prog['energy'] < 10) {
        $energyNextIn = max(0, 300 - ($now - (int) $prog['energy_updated_at']));
    }
    return [
        'user' => $user,
        'progress' => [
            'level' => (int) $prog['level'],
            'xp' => (int) $prog['xp'],
            'xp_for_next' => tdf_xp_for_level((int) $prog['level']),
            'total_dopamine_log10' => round((float) $prog['total_dopamine_log10'], 4),
            'prestige' => (int) $prog['prestige'],
            'prestige_points' => (int) $prog['prestige_points'],
            'evolution_tier' => (int) $prog['evolution_tier'],
            'playtime_sec' => (int) $prog['playtime_sec'],
            'dopamine_bonus_log10' => round((float) $prog['dopamine_bonus_log10'], 4),
            'battle_coins' => (int) $prog['battle_coins'],
            'genealogy_points' => (int) $prog['genealogy_points'],
            'genealogy_farm_pct' => round((float) tdf_genealogy_multipliers($pdo, $userId)['farm_pct'], 4),
            'energy' => (int) $prog['energy'],
            'energy_max' => 10,
            'energy_next_in' => $energyNextIn,
            'ng_cycle' => (int) $prog['ng_cycle'],
            'challenge_phase' => (int) ($prog['challenge_phase'] ?? 1),
        ],
    ];
}

/**
 * Valida um save v4 em profundidade (estrutura, tipos e faixas).
 * NUNCA executa código do save; apenas json_decode + checagens.
 * Retorna ['ok'=>true, 'save'=>array, 'log10'=>float, 'tier'=>int,
 *          'prestige'=>int, 'playtime'=>float, 'version'=>int]
 * ou ['ok'=>false, 'error'=>string].
 */
function tdf_validate_save(string $save): array
{
    if ($save === '' || strlen($save) > 200000) {
        return ['ok' => false, 'error' => 'save_too_big'];
    }
    $sv = json_decode($save, true);
    if (!is_array($sv)) {
        return ['ok' => false, 'error' => 'save_invalid'];
    }

    // versão do formato: 1..4
    if (!isset($sv['version']) || !is_numeric($sv['version'])) {
        return ['ok' => false, 'error' => 'save_version'];
    }
    $ver = (float) $sv['version'];
    if ($ver < 1 || $ver > 4) {
        return ['ok' => false, 'error' => 'save_version'];
    }

    // campos obrigatórios
    if (!array_key_exists('totalEarned', $sv) || !array_key_exists('tier', $sv) || !array_key_exists('gens', $sv)) {
        return ['ok' => false, 'error' => 'save_invalid'];
    }

    // totalEarned: {m,e} ou número — números grandes em escala log10 (cap 1200)
    $te = $sv['totalEarned'];
    $log10 = 0.0;
    if (is_array($te) && isset($te['m'], $te['e']) && is_numeric($te['m']) && is_numeric($te['e'])) {
        $m = (float) $te['m'];
        $e = (float) $te['e'];
        if ($m < 0 || $e < 0 || $e > 1200 || !is_finite($m) || !is_finite($e) || $m > 1e9) {
            return ['ok' => false, 'error' => 'money_invalid'];
        }
        $log10 = $m > 0 ? $e + log10($m) : 0.0;
    } elseif (is_numeric($te)) {
        $teF = (float) $te;
        if ($teF < 0 || !is_finite($teF) || $teF > 1e300) {
            return ['ok' => false, 'error' => 'money_invalid'];
        }
        $log10 = $teF > 0 ? log10($teF) : 0.0;
    } else {
        return ['ok' => false, 'error' => 'money_invalid'];
    }
    if ($log10 > 1200) {
        return ['ok' => false, 'error' => 'money_invalid'];
    }

    // tier de evolução
    $tier = $sv['tier'];
    if (!is_numeric($tier) || (int) $tier < 0 || (int) $tier > 100) {
        return ['ok' => false, 'error' => 'tier_invalid'];
    }

    // gens: array de inteiros 0..1e15 (até 64 geradores — o jogo tem 35 hoje)
    if (!is_array($sv['gens']) || count($sv['gens']) < 1 || count($sv['gens']) > 64) {
        return ['ok' => false, 'error' => 'gens_invalid'];
    }
    foreach ($sv['gens'] as $g) {
        if (!is_numeric($g) || (float) $g < 0 || (float) $g > 1e15 || floor((float) $g) != (float) $g) {
            return ['ok' => false, 'error' => 'gens_invalid'];
        }
    }

    // prestige (ascensões)
    $prestige = $sv['prestige'] ?? 0;
    if (!is_numeric($prestige) || (int) $prestige < 0 || (int) $prestige > 1000000) {
        return ['ok' => false, 'error' => 'prestige_invalid'];
    }

    // playTime
    $playTime = $sv['playTime'] ?? 0;
    if (!is_numeric($playTime) || (float) $playTime < 0 || (float) $playTime > 1e9) {
        return ['ok' => false, 'error' => 'time_invalid'];
    }

    return [
        'ok' => true,
        'save' => $sv,
        'log10' => $log10,
        'tier' => (int) $tier,
        'prestige' => (int) $prestige,
        'playtime' => (float) $playTime,
        'version' => (int) $ver,
    ];
}

/**
 * Writer ÚNICO do save da conta (via tblRankingDopamina, usado pelo
 * ranking.php e game.php — uma única fonte de verdade).
 * - Valida o payload em profundidade.
 * - Controle de concorrência por revisão: se o cliente informou uma base
 *   (revisão que ele carregou) e o servidor já avançou além dela, recusa
 *   (conflict) devolvendo o save atual — nunca sobrescreve cegamente.
 * - Saves legados (revisão 0) usam regra monotônica: nunca regride o score.
 * - Gravação atômica (transação + FOR UPDATE) com checksum sha256.
 * Retorna ['ok'=>true,'saved'=>true,'revision'=>int,'saved_at'=>string]
 * ou ['ok'=>false,'error'=>string, + campos de conflito quando aplicável].
 */
function tdf_save_put(PDO $pdo, int $uid, ?string $save, ?int $baseRevision = null, bool $force = false): array
{
    if ($save === null || $save === '') {
        return ['ok' => false, 'error' => 'no_save'];
    }
    $v = tdf_validate_save($save);
    if (!$v['ok']) {
        return ['ok' => false, 'error' => $v['error']];
    }

    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare('SELECT save_text, save_revision, save_updated_at, score_log10 FROM tblRankingDopamina WHERE usuario_id = :id FOR UPDATE');
        $st->execute([':id' => $uid]);
        $row = $st->fetch();

        $curRev = $row ? (int) $row['save_revision'] : 0;
        $curLog10 = $row ? (float) $row['score_log10'] : 0.0;

        if ($row) {
            $isLegacy = $curRev <= 0;
            if (!$force) {
                // Conflito por revisão: cliente está numa versão antiga do save.
                if (!$isLegacy && $baseRevision !== null && $baseRevision < $curRev) {
                    $pdo->rollBack();
                    return [
                        'ok' => false,
                        'error' => 'conflict',
                        'server_revision' => $curRev,
                        'server_saved_at' => (string) ($row['save_updated_at'] ?? ''),
                        'server_save' => (string) ($row['save_text'] ?? ''),
                    ];
                }
            }
            // A proteção monotônica NUNCA é pulada (nem com force): um save
            // regressivo não pode sobrescrever progresso maior no servidor.
            if ($v['log10'] + 0.001 < $curLog10) {
                $pdo->rollBack();
                return [
                    'ok' => false,
                    'error' => 'conflict',
                    'server_revision' => $curRev,
                    'server_saved_at' => (string) ($row['save_updated_at'] ?? ''),
                    'server_save' => (string) ($row['save_text'] ?? ''),
                ];
            }
            $newRev = $isLegacy ? 1 : $curRev + 1;
            $checksum = hash('sha256', $save);
            $nome = 'Thiego';
            try {
                $stU = $pdo->prepare('SELECT username FROM users WHERE id = :id LIMIT 1');
                $stU->execute([':id' => $uid]);
                $u = $stU->fetch();
                if ($u && $u['username'] !== '') {
                    $nome = $u['username'];
                }
            } catch (Throwable $e) {
                $nome = 'Thiego';
            }
            $nome = mb_substr($nome, 0, 40, 'UTF-8');
            $up = $pdo->prepare(
                'UPDATE tblRankingDopamina SET
                    nome = :nome,
                    score_log10 = GREATEST(score_log10, :s),
                    prestige = GREATEST(prestige, :p),
                    evolution = GREATEST(evolution, :e),
                    playtime_sec = GREATEST(playtime_sec, :t),
                    save_text = :sv,
                    save_version = :ver,
                    save_revision = :rev,
                    save_checksum = :chk,
                    save_updated_at = NOW(),
                    updated_at = NOW()
                 WHERE usuario_id = :id'
            );
            $up->execute([
                ':nome' => $nome,
                ':s' => $v['log10'],
                ':p' => $v['prestige'],
                ':e' => $v['tier'],
                ':t' => $v['playtime'],
                ':sv' => $save,
                ':ver' => $v['version'],
                ':rev' => $newRev,
                ':chk' => $checksum,
                ':id' => $uid,
            ]);
            $pdo->commit();
            return ['ok' => true, 'saved' => true, 'revision' => $newRev, 'saved_at' => date('Y-m-d H:i:s')];
        }

        // Linha não existe: cria (jogador novo).
        $newRev = 1;
        $checksum = hash('sha256', $save);
        $nome = 'Thiego';
        try {
            $stU = $pdo->prepare('SELECT username FROM users WHERE id = :id LIMIT 1');
            $stU->execute([':id' => $uid]);
            $u = $stU->fetch();
            if ($u && $u['username'] !== '') {
                $nome = $u['username'];
            }
        } catch (Throwable $e) {
            $nome = 'Thiego';
        }
        $nome = mb_substr($nome, 0, 40, 'UTF-8');
        $ins = $pdo->prepare(
            'INSERT INTO tblRankingDopamina
                (usuario_id, nome, score_log10, prestige, evolution, playtime_sec, save_text, save_version, save_revision, save_checksum, save_updated_at, last_submit, updated_at)
             VALUES (:id, :nome, :s, :p, :e, :t, :sv, :ver, :rev, :chk, NOW(), NOW(), NOW())'
        );
        $ins->execute([
            ':id' => $uid,
            ':nome' => $nome,
            ':s' => $v['log10'],
            ':p' => $v['prestige'],
            ':e' => $v['tier'],
            ':t' => $v['playtime'],
            ':sv' => $save,
            ':ver' => $v['version'],
            ':rev' => $newRev,
            ':chk' => $checksum,
        ]);
        $pdo->commit();
        return ['ok' => true, 'saved' => true, 'revision' => $newRev, 'saved_at' => date('Y-m-d H:i:s')];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        return ['ok' => false, 'error' => 'db_write'];
    }
}

/** Lê o save da conta (fonte de verdade). Retorna array|null. */
function tdf_save_get(PDO $pdo, int $uid): ?array
{
    try {
        $st = $pdo->prepare(
            'SELECT save_text, save_version, save_revision, save_checksum, save_updated_at
             FROM tblRankingDopamina WHERE usuario_id = :id LIMIT 1'
        );
        $st->execute([':id' => $uid]);
        $row = $st->fetch();
        if (!$row || !$row['save_text']) {
            return null;
        }
        return [
            'text' => (string) $row['save_text'],
            'version' => (int) $row['save_version'],
            'revision' => (int) $row['save_revision'],
            'checksum' => (string) $row['save_checksum'],
            'saved_at' => (string) $row['save_updated_at'],
        ];
    } catch (Throwable $e) {
        return null;
    }
}

/**
 * Backup monotônico do save completo na tblRankingDopamina.save_text.
 * (Wrapper de compatibilidade: delega para o writer único tdf_save_put.)
 * Retorna bool (gravou?).
 */
function tdf_store_save_backup(PDO $pdo, int $uid, ?string $save): bool
{
    $res = tdf_save_put($pdo, $uid, $save, null, false);
    return ($res['ok'] ?? false) && ($res['saved'] ?? false);
}

/** Multiplicadores globais da árvore genealógica: effect_type => 1 + total */
function tdf_genealogy_multipliers(PDO $pdo, int $userId): array
{
    $st = $pdo->prepare(
        'SELECT gn.effect_type, gn.effect_value, ug.level
         FROM user_genealogy ug JOIN genealogy_nodes gn ON gn.id = ug.node_id
         WHERE ug.user_id = :u AND ug.level > 0'
    );
    $st->execute([':u' => $userId]);
    $mult = ['hp_pct' => 1.0, 'atk_pct' => 1.0, 'def_pct' => 1.0, 'crit_pct' => 0.0,
        'farm_pct' => 1.0, 'coin_pct' => 1.0, 'xp_pct' => 1.0];
    foreach ($st->fetchAll() as $r) {
        $type = $r['effect_type'];
        $add = (float) $r['effect_value'] * (int) $r['level'];
        if ($type === 'crit_pct') {
            $mult['crit_pct'] += $add;
        } elseif (isset($mult[$type])) {
            $mult[$type] += $add;
        }
    }
    return $mult;
}

/**
 * Seed idempotente das NOVAS habilidades de batalha (efeitos avançados:
 * stun, dot, cleanse, execute, taunt, berserk, revive, ult_charge, crit_up).
 * Só roda se ainda não existir nenhuma habilidade com esses efeitos.
 * Chamado pelo battle.php no bootstrap de batalha.
 */
function tdf_seed_battle_abilities(PDO $pdo): void
{
    $has = $pdo->query("SELECT COUNT(*) FROM abilities WHERE effect_type IN ('stun','dot','cleanse','execute','taunt','berserk','revive','ult_charge')")->fetchColumn();
    if ((int) $has > 0) return;

    // nova habilidade extra (slot skill2) para cada thiego que ainda não tem 4 habilidades
    $thiegos = $pdo->query('SELECT id, name FROM thiegos ORDER BY id')->fetchAll();
    $pool = [
        ['name' => 'Capitão do Caos',      'effect_type' => 'stun',        'effect_value' => 0.75, 'power' => 1.2,  'desc' => '75% de chance de atordoar o inimigo por 1 turno.'],
        ['name' => 'Mordida Corrosiva',    'effect_type' => 'dot',         'effect_value' => 0.08, 'power' => 0.9,  'desc' => 'Causa dano contínuo (8% HP/turno) por 2-4 turnos.'],
        ['name' => 'Limpeza Radical',      'effect_type' => 'cleanse',     'effect_value' => 1,    'power' => 0,    'desc' => 'Remove TODOS os debuffs de si mesmo.'],
        ['name' => 'Golpe do Juízo',       'effect_type' => 'execute',     'effect_value' => 0.3,  'power' => 1.6,  'desc' => 'Dano alto; +50% se o inimigo estiver abaixo de 30% HP.'],
        ['name' => 'Grito de Guerra',      'effect_type' => 'taunt',       'effect_value' => 1,    'power' => 0,    'desc' => 'Provoca o inimigo: ele é forçado a atacar você.'],
        ['name' => 'Fúria Selvagem',       'effect_type' => 'berserk',     'effect_value' => 1,    'power' => 0,    'desc' => 'Entra em modo berserk: +60% ATK conforme perde HP.'],
        ['name' => 'Milagre da Dopamina',  'effect_type' => 'revive',      'effect_value' => 0.35, 'power' => 0,    'desc' => 'Revive um aliado caído com 35% do HP máximo.'],
        ['name' => 'Carga Absoluta',       'effect_type' => 'ult_charge',  'effect_value' => 0.5,  'power' => 0,    'desc' => '+50% de carga de ULTIMATE.'],
        ['name' => 'Olho Crítico',         'effect_type' => 'crit_up',     'effect_value' => 0.3,  'power' => 0,    'desc' => '+30% de chance de crítico.'],
        ['name' => 'Chicote Dopamínico',   'effect_type' => 'drain',       'effect_value' => 0.4,  'power' => 1.4,  'desc' => 'Dano que cura 40% do dano causado.'],
    ];

    $ins = $pdo->prepare('INSERT INTO abilities (thiego_id, slot, name, description, power, cooldown, energy_cost, effect_type, effect_value, effect_target, animation)
                          VALUES (:t, :slot, :n, :d, :p, :cd, 0, :e, :v, :target, :anim)');
    $upd = $pdo->prepare('UPDATE abilities SET name = :n, description = :d, power = :p, cooldown = :cd, effect_type = :e, effect_value = :v, effect_target = :target, animation = :anim WHERE id = :id');
    foreach ($thiegos as $th) {
        $cntSt = $pdo->prepare('SELECT COUNT(*) FROM abilities WHERE thiego_id = :t');
        $cntSt->execute([':t' => $th['id']]);
        $cnt = (int) $cntSt->fetchColumn();
        // 30% dos thiegos ganham uma habilidade nova (substitui a skill2 existente)
        $pick = $pool[array_rand($pool)];
        $anim = ['hit', 'special', 'buff'][array_rand(['hit', 'special', 'buff'])];
        $target = in_array($pick['effect_type'], ['heal', 'buff_atk', 'buff_def', 'buff_spd', 'crit_up', 'shield', 'cleanse', 'taunt', 'berserk', 'revive', 'ult_charge'], true) ? 'self' : 'enemy';

        if ($cnt >= 4 && mt_rand(1, 100) <= 30) {
            // substitui skill2 existente
            $get = $pdo->prepare('SELECT id FROM abilities WHERE thiego_id = :t AND slot = \'skill2\' LIMIT 1');
            $get->execute([':t' => $th['id']]);
            $oldId = $get->fetchColumn();
            if ($oldId) {
                $upd->execute([':id' => $oldId, ':n' => $pick['name'], ':d' => $pick['desc'], ':p' => $pick['power'], ':cd' => 3, ':e' => $pick['effect_type'], ':v' => $pick['effect_value'], ':target' => $target, ':anim' => $anim]);
            }
        } elseif ($cnt < 4) {
            $ins->execute([
                ':t' => $th['id'],
                ':slot' => 'skill2',
                ':n' => $pick['name'],
                ':d' => $pick['desc'],
                ':p' => $pick['power'],
                ':cd' => 3,
                ':e' => $pick['effect_type'],
                ':v' => $pick['effect_value'],
                ':target' => $target,
                ':anim' => $anim,
            ]);
        }
    }
}

/** Semeia a matriz de vantagens de tipo (8×8 balanceada — 0.5 a 2.0).
 *  Idempotente: faz UPSERT, só adiciona se não existir ou se o mult for diferente.
 */
function tdf_seed_type_advantages(PDO $pdo): void
{
    $matrix = [
        //   atacante        => [defensor => mult, ...]
        'caotico'     => ['caotico'=>1.0, 'celestial'=>0.75, 'cosmico'=>1.5, 'divino'=>1.25, 'dopamina'=>1.5, 'infinito'=>0.75, 'mistico'=>0.5, 'tecnologico'=>2.0],
        'celestial'   => ['caotico'=>1.5, 'celestial'=>1.0, 'cosmico'=>1.25, 'divino'=>0.5, 'dopamina'=>0.75, 'infinito'=>1.0, 'mistico'=>1.5, 'tecnologico'=>0.75],
        'cosmico'     => ['caotico'=>1.25, 'celestial'=>1.5, 'cosmico'=>1.0, 'divino'=>0.75, 'dopamina'=>0.5, 'infinito'=>1.0, 'mistico'=>1.5, 'tecnologico'=>1.25],
        'divino'      => ['caotico'=>1.25, 'celestial'=>2.0, 'cosmico'=>0.75, 'divino'=>1.0, 'dopamina'=>1.5, 'infinito'=>1.0, 'mistico'=>0.5, 'tecnologico'=>0.75],
        'dopamina'    => ['caotico'=>1.25, 'celestial'=>0.75, 'cosmico'=>1.5, 'divino'=>0.75, 'dopamina'=>1.0, 'infinito'=>2.0, 'mistico'=>1.5, 'tecnologico'=>0.5],
        'infinito'    => ['caotico'=>1.5, 'celestial'=>1.5, 'cosmico'=>1.5, 'divino'=>1.5, 'dopamina'=>0.25, 'infinito'=>1.0, 'mistico'=>1.5, 'tecnologico'=>1.5],
        'mistico'     => ['caotico'=>0.75, 'celestial'=>1.25, 'cosmico'=>1.5, 'divino'=>1.5, 'dopamina'=>0.5, 'infinito'=>1.0, 'mistico'=>1.0, 'tecnologico'=>1.5],
        'tecnologico' => ['caotico'=>0.5, 'celestial'=>1.5, 'cosmico'=>1.25, 'divino'=>0.75, 'dopamina'=>2.0, 'infinito'=>1.0, 'mistico'=>0.75, 'tecnologico'=>1.0],
    ];
    $st = $pdo->prepare('INSERT INTO type_advantages (attacker, defender, mult) VALUES (:a, :d, :m)
        ON DUPLICATE KEY UPDATE mult = VALUES(mult)');
    foreach ($matrix as $atk => $defs) {
        foreach ($defs as $def => $mult) {
            $st->execute([':a' => $atk, ':d' => $def, ':m' => $mult]);
        }
    }
}
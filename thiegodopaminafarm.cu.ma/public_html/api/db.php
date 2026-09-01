<?php
/**
 * THIEGO DOPAMINA FARM — api/db.php
 * Conexão EXCLUSIVA com o banco do jogo (gwncsbql_thiego) via api/tdf_db.php.
 * Sem nenhuma dependência externa. Cria a tabela do ranking (idempotente).
 */

$GLOBALS['TDF_DB_OK'] = false;

require_once __DIR__ . '/tdf_db.php';

try {
    $pdo = tdf_pdo();
    tdf_bootstrap();
    // Em Linux (lower_case_table_names=0) os nomes de tabela são case-sensitive:
    // se o dump veio do Windows, a tabela do ranking chega em minúsculas e o
    // CREATE TABLE IF NOT EXISTS criaria uma tabela duplicada e vazia. Renomeia
    // para o nome canônico usado por ranking.php antes de garantir a criação.
    if ((int) $pdo->query('SELECT @@lower_case_table_names')->fetchColumn() === 0) {
        $st = $pdo->prepare(
            "SELECT TABLE_NAME FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = 'tblrankingdopamina'"
        );
        $st->execute();
        $actual = (string) ($st->fetchColumn() ?: '');
        if ($actual !== '' && $actual !== 'tblRankingDopamina') {
            $pdo->exec('RENAME TABLE `' . $actual . '` TO `tblRankingDopamina`');
        }
    }
    // Garante a tabela do ranking (idempotente, não mexe nas outras tabelas).
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
    // Backup de save no servidor (idempotente): deixa o jogador trocar de
    // navegador/PC sem perder progresso. save_text guarda o JSON do save v4.
    $cols = $pdo->query('SHOW COLUMNS FROM tblRankingDopamina')->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('save_text', $cols, true)) {
        $pdo->exec('ALTER TABLE tblRankingDopamina ADD COLUMN save_text MEDIUMTEXT NULL AFTER evolution');
    }
    if (!in_array('save_updated_at', $cols, true)) {
        $pdo->exec('ALTER TABLE tblRankingDopamina ADD COLUMN save_updated_at TIMESTAMP NULL DEFAULT NULL AFTER save_text');
    }
    $GLOBALS['TDF_DB_OK'] = true;
} catch (Throwable $e) {
    $GLOBALS['TDF_DB_OK'] = false;
}

$GLOBALS['TDF_PDO'] = $pdo ?? null;

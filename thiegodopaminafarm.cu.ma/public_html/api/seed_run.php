<?php
/**
 * THIEGO DOPAMINA FARM — api/seed_run.php
 * Runner CLI do seed: tdf_seed() + tdf_seed_expansion() (idempotente).
 * Uso: php seed_run.php
 */
// Apenas CLI/Cron: nunca executável via HTTP (proteção do endpoint de manutenção).
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    echo 'cli only';
    exit;
}
require_once __DIR__ . '/seed.php';
tdf_seed();
tdf_seed_expansion();
echo "seed ok\n";
<?php
/**
 * THIEGO DOPAMINA FARM — api/realtime_config.php
 * Retorna configuracao do Ably Realtime se disponivel.
 * Lê ABLY_KEY do .env; se configurada, o cliente Ably.js
 * se conecta para chat, presenca e boss mundial.
 * Se não configurada, retorna {enabled: false} — fallback
 * silencioso ao polling existente.
 */

require_once __DIR__ . '/config.php';

$env = tdf_env();
$ablyKey = $env['ABLY_KEY'] ?? '';

if ($ablyKey === '') {
    tdf_json([
        'ok' => true,
        'enabled' => false,
    ]);
}

$parts = explode('.', $ablyKey, 2);
$appId = $parts[0] ?? '';

tdf_json([
    'ok' => true,
    'enabled' => true,
    'provider' => 'ably',
    'appId' => $appId,
    'host' => "wss://{$appId}.ably.io",
    'tokenEndpoint' => 'api/ably_token.php',
    'channels' => ['chat', 'boss', 'presence'],
]);
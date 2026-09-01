<?php
/**
 * THIEGO DOPAMINA FARM — api/ably_token.php
 * Gera um token temporário para o Ably Realtime.
 * Lê ABLY_KEY do .env, chama a API REST do Ably,
 * retorna {token: "..."} para o cliente JS.
 * Usado pelo js/realtime.js como authCallback.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/tdf_db.php';

$env = tdf_env();
$ablyKey = $env['ABLY_KEY'] ?? '';

if (!$ablyKey) {
    tdf_json(['ok' => false, 'error' => 'ABLY_KEY nao configurada']);
}

// O formato da chave é: appId.keyId:secret
$parts = explode(':', $ablyKey, 2);
$apiKey = $parts[0]; // appId.keyId
$secret = $parts[1] ?? '';
$appId = explode('.', $apiKey)[0];

// Ably token request REST API
$tokenUrl = "https://rest.ably.io/keys/{$apiKey}/requestToken";

$userId = tdf_current_user(tdf_pdo());
$body = tdf_body();
// clientId do cliente (para anônimos únicos), sanitizado
$reqClientId = trim((string) ($body['clientId'] ?? ''));
if (!preg_match('/^[A-Za-z0-9_\-]{1,64}$/', $reqClientId)) {
    $reqClientId = '';
}
$clientId = $reqClientId !== ''
    ? $reqClientId
    : 'tdf_' . ($userId ?: 'anon_' . bin2hex(random_bytes(4)));

$payload = json_encode([
    'ttl' => 3600 * 1000, // 1 hora em ms
    'keyName' => $apiKey,
    'timestamp' => (int) (microtime(true) * 1000),
    // capability DEVE ser string JSON (formato Ably)
    'capability' => json_encode(['*' => ['publish', 'subscribe', 'presence']]),
    'clientId' => $clientId,
]);

$ch = curl_init($tokenUrl);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_USERPWD => "{$apiKey}:{$secret}",
    CURLOPT_TIMEOUT => 10,
    CURLOPT_SSL_VERIFYPEER => true,
]);

$res = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode !== 200 && $httpCode !== 201 || !$res) {
    tdf_json(['ok' => false, 'error' => 'falha ao gerar token Ably', 'status' => $httpCode]);
}

$data = json_decode($res, true);
if (!$data || empty($data['token'])) {
    tdf_json(['ok' => false, 'error' => 'token Ably invalido']);
}

tdf_json([
    'ok' => true,
    'token' => $data['token'],
    'keyName' => $apiKey,
]);
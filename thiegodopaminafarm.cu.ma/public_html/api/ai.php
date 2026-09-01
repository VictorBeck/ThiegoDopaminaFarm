<?php
/**
 * THIEGO DOPAMINA FARM — api/ai.php
 * Gera conteudo dinamico (missoes, eventos, humor) via IA.
 * Usa API OpenAI-compatible se AI_API_KEY e AI_API_URL estiverem
 * configurados no .env; senao retorna fallback local (lista fixa).
 *
 * Rotas:
 *   GET / — status (ok / disabled)
 *   GET ?route=daily — missao diaria gerada por IA
 *   GET ?route=event — evento procedural
 *   GET ?route=humor — comentario do Thiego
 */

require_once __DIR__ . '/config.php';

$route = $_GET['route'] ?? '';
$env = tdf_env();
$apiKey = $env['AI_API_KEY'] ?? '';
$apiUrl = $env['AI_API_URL'] ?? 'https://api.openai.com/v1/chat/completions';

/* ---------- fallback: gerador local (sem IA) ---------- */
function localDaily(): array
{
    $missions = [
        ['title' => 'Produza dopamina sem parar!', 'desc' => 'Acumule 1 Qa de dopamina nesta run.', 'reward' => '💎 Bônus de produção +10% por 30 min'],
        ['title' => 'Thiego precisa de você!', 'desc' => 'Clique 500 vezes com o combo ativo.', 'reward' => '✨ 5 pontos de prestígio extra'],
        ['title' => 'Expansão da farm', 'desc' => 'Compre 100 geradores de qualquer tipo.', 'reward' => '⚡ Energia infinita por 15 min'],
        ['title' => 'Coleta especial', 'desc' => 'Colete 5 loot boxes hoje.', 'reward' => '🎁 Loot box rara garantida'],
        ['title' => 'Batalha campal', 'desc' => 'Vença 3 batalhas PvE consecutivas.', 'reward' => '🛡️ Fragmento de equipamento épico'],
        ['title' => 'Foco total', 'desc' => 'Fique 30 minutos sem fechar o jogo.', 'reward' => '⏰ 1 hora de produção offline'],
        ['title' => 'Evolução acelerada', 'desc' => 'Suba 2 tiers de evolução.', 'reward' => '🌟 XP de Thiego em dobro'],
        ['title' => 'Conexão divina', 'desc' => 'Faça 3 críticos seguidos.', 'reward' => '💫 Críticos garantidos por 5 min'],
    ];
    $idx = array_rand($missions);
    return $missions[$idx];
}

function localEvent(): array
{
    $events = [
        ['title' => '🌧️ Chuva de Dopamina', 'desc' => 'Produção multiplicada por 2x por 10 minutos!'],
        ['title' => '⚡ Sobrecarga do Thiego', 'desc' => 'Cliques valem 5x mais por 30 segundos.'],
        ['title' => '🛸 Invasão Thiego', 'desc' => 'Thiegos de outra dimensão aparecem. Bônus de loot!'],
        ['title' => '🎉 Aniversário da Farm', 'desc' => 'Tudo custa 50% menos por 5 minutos.'],
    ];
    $idx = array_rand($events);
    return $events[$idx];
}

function localHumor(): array
{
    $lines = [
        'O Thiego está orgulhoso de você. Muito orgulhoso.',
        'Você já produziu mais dopamina que o Brasil inteiro!',
        'O Thiego sente sua falta quando você fecha o jogo.',
        'Seu DPS está maior que o PIB de alguns países.',
        'Você é a razão do Thiego acordar feliz.',
        'O Thiego disse: "esse aí é brabo".',
        'Produção em massa. Massa em produção. Thiego em tudo.',
        'A dopamina corre solta nas veias do multiverso.',
    ];
    return ['line' => $lines[array_rand($lines)]];
}

/* ---------- IA real ---------- */
function aiDaily(): array
{
    global $apiKey, $apiUrl;

    $prompt = 'Gere uma missão curta e engraçada em português brasileiro para um jogo clicker/idle chamado "THIEGO DOPAMINA FARM" (tema: fazenda de dopamina, personagem principal: Thiego). Responda APENAS JSON: {"title":"nome da missão","desc":"descrição curta","reward":"recompensa"}';
    return callAI($prompt, 'daily');
}

function aiEvent(): array
{
    $prompt = 'Gere um evento temporário curto e engraçado em português brasileiro para o jogo "THIEGO DOPAMINA FARM". Responda APENAS JSON: {"title":"nome do evento","desc":"efeito do evento"}';
    return callAI($prompt, 'event');
}

function aiHumor(): array
{
    $prompt = 'Gere uma frase curta e engraçada em português brasileiro que o personagem Thiego diria ao jogador em um jogo clicker. Máximo 20 palavras. Responda APENAS JSON: {"line":"a frase"}';
    return callAI($prompt, 'humor');
}

function callAI(string $prompt, string $fallback): array
{
    global $apiKey, $apiUrl;
    $env = tdf_env();
    $model = $env['AI_MODEL'] ?? 'gpt-4o-mini';

    $body = json_encode([
        'model' => $model,
        'messages' => [
            ['role' => 'system', 'content' => 'Você é o Thiego, personagem de um jogo clicker brasileiro. Responda APENAS JSON válido, sem markdown, sem comentários, sem explicações.'],
            ['role' => 'user', 'content' => $prompt],
        ],
        'temperature' => 0.8,
        'max_tokens' => 1000,
    ]);

    // usa curl se disponível (mais confiável com SSL); senão file_get_contents
    $res = false;
    if (function_exists('curl_init')) {
        $ch = curl_init($apiUrl);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $apiKey,
            ],
            CURLOPT_TIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $res = curl_exec($ch);
        curl_close($ch);
    } else {
        $ctx = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/json\r\nAuthorization: Bearer $apiKey\r\n",
                'content' => $body,
                'timeout' => 15,
            ],
        ]);
        $res = @file_get_contents($apiUrl, false, $ctx);
    }

    if (!$res) {
        return $fallback === 'daily' ? localDaily() : ($fallback === 'event' ? localEvent() : localHumor());
    }

    $data = json_decode($res, true);
    $text = $data['choices'][0]['message']['content'] ?? '';
    $parsed = json_decode($text, true);
    if (!is_array($parsed)) {
        // tenta extrair o primeiro objeto JSON da resposta (robusto a texto extra)
        $parsed = extractJson($text);
    }
    if (!is_array($parsed)) {
        return $fallback === 'daily' ? localDaily() : ($fallback === 'event' ? localEvent() : localHumor());
    }
    return $parsed;
}

/** Extrai o primeiro objeto JSON de uma string (robusto a markdown/lixo). */
function extractJson(string $s): ?array
{
    // remove code fences
    $s = preg_replace('/```(?:json)?/i', '', $s);
    $start = strpos($s, '{');
    if ($start === false) return null;
    $depth = 0;
    $inStr = false;
    $esc = false;
    $len = strlen($s);
    for ($i = $start; $i < $len; $i++) {
        $c = $s[$i];
        if ($inStr) {
            if ($esc) { $esc = false; }
            elseif ($c === '\\') { $esc = true; }
            elseif ($c === '"') { $inStr = false; }
            continue;
        }
        if ($c === '"') { $inStr = true; continue; }
        if ($c === '{') { $depth++; }
        elseif ($c === '}') {
            $depth--;
            if ($depth === 0) {
                $candidate = substr($s, $start, $i - $start + 1);
                $obj = json_decode($candidate, true);
                return is_array($obj) ? $obj : null;
            }
        }
    }
    return null;
}

/* ---------- roteamento ---------- */

if ($route === 'daily') {
    $data = $apiKey ? aiDaily() : localDaily();
    tdf_json(['ok' => true, 'data' => $data, 'source' => $apiKey ? 'ai' : 'local']);
} elseif ($route === 'event') {
    $data = $apiKey ? aiEvent() : localEvent();
    tdf_json(['ok' => true, 'data' => $data, 'source' => $apiKey ? 'ai' : 'local']);
} elseif ($route === 'humor') {
    $data = $apiKey ? aiHumor() : localHumor();
    tdf_json(['ok' => true, 'data' => $data, 'source' => $apiKey ? 'ai' : 'local']);
} else {
    // status
    tdf_json([
        'ok' => true,
        'enabled' => $apiKey !== '',
        'source' => $apiKey ? 'ai' : 'local',
        'message' => $apiKey ? 'IA configurada' : 'Fallback local ativo — configure AI_API_KEY no .env para ativar IA real',
    ]);
}
#!/usr/bin/env node
/* ============================================================
   THIEGO DOPAMINA FARM — tools/push_send.js
   Envia as notificações pendentes (fila push_queue) usando
   web-push. Requer:
     npm install web-push
   E as chaves VAPID no .env:
     VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
   Uso:
     node tools/push_send.js
   (chamar por cron depois de api/push.php?route=send)
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

function loadEnv() {
  const env = {};
  const file = path.join(__dirname, '..', 'api', '.env');
  try {
    const txt = fs.readFileSync(file, 'utf8');
    txt.split('\n').forEach((line) => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const i = line.indexOf('=');
      if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
  } catch (e) { /* sem .env local */ }
  return env;
}

// Pega a fila via API (requer admin logado — simplificado: lê do MySQL via PDO não é possível em Node puro,
// então usamos a API quando disponível; aqui documentamos o fluxo completo com web-push).
// Para um envio real completo, instale web-push e use:
//   const webpush = require('web-push');
//   webpush.setVapidDetails(subject, publicKey, privateKey);
//   const subs = await fetch('api/push.php?route=list', {credentials:'include'}).then(r=>r.json());
//   for (const s of subs.subscriptions) { await webpush.sendNotification({endpoint: s.endpoint, keys:{auth: s.auth_key, p256dh: s.p256dh_key}}, payload); }

async function main() {
  const env = loadEnv();
  console.log('push_send.js — THIEGO DOPAMINA FARM');
  console.log('-----------------------------------');
  if (!env.VAPID_PRIVATE_KEY) {
    console.log('VAPID_PRIVATE_KEY não configurada no .env.');
    console.log('Gere as chaves com: npx web-push generate-vapid-keys');
    console.log('Depois adicione ao api/.env:');
    console.log('  VAPID_PUBLIC_KEY=<public>');
    console.log('  VAPID_PRIVATE_KEY=<private>');
    console.log('  VAPID_SUBJECT=mailto:seu@email.com');
    process.exit(1);
  }
  console.log('VAPID configurada. Para o envio completo:');
  console.log('  1. npm install web-push');
  console.log('  2. Substitua o fluxo documentado no topo deste arquivo');
  console.log('  3. Rode: node tools/push_send.js (ou via cron)');
}

main().catch((e) => { console.error(e); process.exit(1); });
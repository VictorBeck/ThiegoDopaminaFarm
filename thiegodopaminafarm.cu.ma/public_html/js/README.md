# THIEGO DOPAMINA FARM — REMASTER

Easter egg da fazenda de dopamina do Thiego — agora um clicker/idle completo e infinito, 100% autônomo (banco próprio `gwncsbql_thiego`).

## Como rodar
- Servir via Apache do XAMPP (ex.: `http://localhost/larpagem/`).
- **Login próprio da conta** (jogo) — sem login o ranking funciona em modo local; com login ele envia para o ranking global.
- Nenhuma dependência externa: sem CDNs, sem frameworks, sem assets fora de `assets/`.

## Estrutura
```
index.html            — página única (JS na ordem de carga)
api/db.php            — conexão exclusiva com o banco do jogo (gwncsbql_thiego) + tabela tblRankingDopamina
api/ranking.php       — GET top 100 global/today/week/month + POST de score (sessão, anti-cheat, rate limit)
js/numbers.js         — números gigantes {m, e} com expoente ilimitado
js/data.js            — registry central: geradores, upgrades, evoluções (52), conquistas, missões, títulos, eventos, encontros, humor
js/state.js           — save v4, sanitização, migração automática do save v1
js/economy.js         — fórmulas puras (dps, clique, crítico, combo, custos, prestige, offline, eventos)
js/game.js            — ações do jogador, loop, prestige infinito, missões, segredos
js/antiCheat.js       — detecção de crescimento impossível (usado pela API e pelo jogo)
js/leaderboard.js     — ranking global (API) com fallback local honesto
js/audio.js           — SFX/música sintetizados via WebAudio (zero arquivos)
js/fx.js              — partículas, números flutuantes, toasts, flash/shake, overlays
js/ui.js              — interface: 11 abas, HUD, modais, notificações
js/main.js            — boot, loop rAF, autosave, códigos secretos
css/                  — main, game, ui, animations, responsive
assets/               — imagens reais do Thiego (nomes com acento — encodeURI na carga)
```

## Mecânicas
- **Clique** com combo (2,6s de janela), crítico (5% base, cap 60%) e multiplicadores de evento.
- **9 geradores** com custo e crescimento geométrico + milestones (×2 a cada 10/25/50/…/1000).
- **~40 upgrades** em 7 categorias (clique, automação, evolução, ascensão, offline, eventos, meme).
- **52 evoluções** com todas as fotos reais dos assets, uma por estágio (custo crescente até ~3.8e78; multiplicadores até ~×6.6e5 acumulado).
- **Prestige infinito**: ganho = `10^(0.35·(log10(totalEarned) − 12))` pontos; cada ponto = +12% permanente (`1.12^points`, sem teto) + **árvore de 6 ramos × 5 níveis**.
- **~55 conquistas** (algumas secretas), **13 títulos**, **missões** diárias/semanais/especiais.
- **Eventos** (9 tipos: surto, dobro, chuva, glitch…, 2 raros com peso menor e feedback especial) e **encontros** (9 Thiegos, 3 secretos).
- **Milestones de dopamina**: recompensa única (bônus de produção) ao cruzar potências marcadas (1e3 → 1e100).
- **Milestones de gerador**: toast dourado ao cruzar ×10/×25/×50/…/×1000 (produção dobrada).
- **Day streak**: dias seguidos com atividade (sem punição por pular) + bônus progressivo.
- **Offline** com eficiência e teto por upgrades.
- **Códigos secretos**: Konami, `cotaprice`, `thiega`, `gestante`.
- **Config**: toggle de Animações desliga bursts/floats/shakes/flashes/overlays (toasts permanecem como feedback essencial).

## Ranking
- POST em `api/ranking.php` a cada ~90s (e no unload via `sendBeacon`).
- Métrica: **dopamina total produzida** em escala log10; opção de ordenar por ascensões.
- Validação server-side: sessão obrigatória, rate limit 90s, crescimento por hora plausível (`logDelta ≤ 0.6 + 0.8·h`, prestigeDelta ≤ 8 + 15·h), playtime não pode retroceder, primeiro envio exige ≥45s de jogo.
- Sem sessão → modo **local** (localStorage), sempre rotulado, nunca finge estar online.
- Tabela: `tblRankingDopamina` (criada automaticamente pelo `api/db.php`).

## Save
- Chave `thiego_dopamina_farm_v4` no localStorage; autosave 15s + on-unload.
- Migração automática do save antigo `thiego_dopamina_farm_v1` (ascensões convertidas ×6,116; 1h da produção antiga vira dopamina, cap 1e15).
- Export/import em JSON (máx. 2 MB); reset exige digitar `THIEGO`.

/* ============================================================
   THIEGO DOPAMINA FARM — data.js
   Registry central de conteúdo: assets, geradores, upgrades,
   evoluções, árvore de prestige, conquistas, missões,
   títulos, eventos e humor. TODOS os números de balanceamento
   vivem aqui — nada de números mágicos espalhados.
   ============================================================ */
(function () {
  'use strict';
  const T = window.TDF = {};
  const N = window.Num;

  /* ---------- assets ---------- */
  const ASSET_DIR = 'assets/';
  T.asset = function (name) { return ASSET_DIR + encodeURI(name); };

  /* ============================================================
     GERADORES
     baseProd: produção base por unidade (dopamina/s)
     growth:   multiplicador de custo por nível
     milestones [10,25,50,100,250,500,1000] → ×2 cada uma
     ============================================================ */
T.GENERATORS = [
    { name: 'Estagiário da Dopamina', icon: '🧪', desc: 'Ele aprende rápido. Muito rápido. Rápido demais.', baseCost: 15, growth: 1.15, baseProd: 0.1 },
    { name: 'Farmador Profissional', icon: '🧑‍🌾', desc: 'Fazenda em tempo integral. Demissão não existe.', baseCost: 110, growth: 1.15, baseProd: 0.9 },
    { name: 'Técnico do Thiego', icon: '🔧', desc: 'Conserta tudo com fita isolante e dopamina.', baseCost: 1_200, growth: 1.155, baseProd: 7 },
    { name: 'Engenheiro de Dopamina', icon: '👷', desc: 'Engenharia aplicada ao que importa: o Thiego.', baseCost: 13_000, growth: 1.16, baseProd: 52 },
    { name: 'Cientista Dopamínico', icon: '🔬', desc: 'Publicou 47 artigos sobre o Thiego. Ninguém entendeu.', baseCost: 140_000, growth: 1.165, baseProd: 380 },
    { name: 'Máquina de Dopamina', icon: '⚙️', desc: 'Tecnologia duvidosa. Funciona? Funciona.', baseCost: 1.6e6, growth: 1.17, baseProd: 2_800 },
    { name: 'Reator Dopamínico', icon: '☢️', desc: 'Coração pulsante da farm. NÃO TOQUE.', baseCost: 2e7, growth: 1.175, baseProd: 21_000 },
    { name: 'Portal do Thiego', icon: '🌀', desc: 'Thiegos de outros universos trabalham aqui.', baseCost: 2.8e8, growth: 1.18, baseProd: 160_000 },
    { name: 'Singularidade Dopamínica', icon: '🌌', desc: 'A física pediu demissão nesse exato momento.', baseCost: 4.1e9, growth: 1.185, baseProd: 1.3e6 },
    { name: 'Laboratório Quântico', icon: '⚛', desc: 'Partículas subatômicas de dopamina. O Nobel chorou.', baseCost: 5e10, growth: 1.19, baseProd: 1e7 },
    { name: 'Dimensão do Thiego', icon: '🪐', desc: 'Thiegos de 47 dimensões trabalham simultaneamente.', baseCost: 6e11, growth: 1.195, baseProd: 8e7 },
    { name: 'Matriz Dopamínica', icon: '🧬', desc: 'A matrix foi reprogramada. Agora só produz dopamina.', baseCost: 8e12, growth: 1.20, baseProd: 6.5e8 },
    { name: 'Fábrica de Clones do Thiego', icon: '🤖', desc: 'Clones do Thiego produzindo 24/7. Sem pausa. Sem sindicato.', baseCost: 1e14, growth: 1.205, baseProd: 5.5e9 },
    { name: 'Megaestrutura Thiego', icon: '🏗️', desc: 'Uma esfera de Dyson feita de dopamina pura.', baseCost: 1.5e15, growth: 1.21, baseProd: 4.5e10 },
    { name: 'Inteligência Dopamínica', icon: '🧠', desc: 'Uma IA que só pensa em produzir. E produz.', baseCost: 2.5e16, growth: 1.215, baseProd: 3.8e11 },
    { name: 'Cérebro de Colmeia', icon: '🐝', desc: 'Bilhões de mentes, um único objetivo: mais.', baseCost: 4e17, growth: 1.22, baseProd: 3.1e12 },
    { name: 'Núcleo Estelar', icon: '☄️', desc: 'Uma estrela compactada que emite dopamina no lugar de luz.', baseCost: 7e18, growth: 1.225, baseProd: 2.6e13 },
    { name: 'Buraco Negro Dopamínico', icon: '🕳️', desc: 'Atrai dopamina de todo o universo. Nada escapa.', baseCost: 1.2e20, growth: 1.23, baseProd: 2.1e14 },
    { name: 'Teia do Multiverso', icon: '🌐', desc: 'Farms paralelas em cada universo. Todas do Thiego.', baseCost: 2.2e21, growth: 1.235, baseProd: 1.7e15 },
    { name: 'Torre do Alvorecer', icon: '🗼', desc: 'O Thiego construiu uma torre até o além. Produz no caminho.', baseCost: 4e22, growth: 1.24, baseProd: 1.4e16 },
    { name: 'Plano Dimensional Puro', icon: '🌀', desc: 'Um plano de existência feito apenas de produção.', baseCost: 8e23, growth: 1.245, baseProd: 1.1e17 },
    { name: 'Constelação do Thiego', icon: '✨', desc: 'Estrelas alinhadas em forma de Thiego. Produzindo.', baseCost: 1.6e25, growth: 1.25, baseProd: 9e17 },
    { name: 'Deus da Dopamina', icon: '👑', desc: 'O próprio Thiego transcendental. Fim de jogo.', baseCost: 3.5e26, growth: 1.255, baseProd: 7.5e18 },
    { name: 'Mestre Cósmico', icon: '🌌', desc: 'O Thiego dominou todos os universos. Agora produz.', baseCost: 5.2e27, growth: 1.26, baseProd: 6.0e19 },
    { name: 'Entidade do Vazio', icon: '🕳️', desc: 'Um ser feito de pura dopamina vazia.', baseCost: 7.9e28, growth: 1.265, baseProd: 4.8e20 },
    { name: 'Avatar Absoluto', icon: '🗿', desc: 'A encarnação perfeita da produção.', baseCost: 1.2e30, growth: 1.27, baseProd: 3.8e21 },
    { name: 'Consciência Coletiva', icon: '🧠', desc: 'Todas as mentes do multiverso em uma.', baseCost: 1.8e31, growth: 1.275, baseProd: 3.1e22 },
    { name: 'Ser Transcendental', icon: '🌟', desc: 'Além do além. Produz do puro nada.', baseCost: 2.7e32, growth: 1.28, baseProd: 2.5e23 },
    { name: 'Deus Absoluto', icon: '⚡', desc: 'A dopamina se curvou diante dele.', baseCost: 4.0e33, growth: 1.285, baseProd: 2.0e24 },
    { name: 'Onipotente', icon: '👁️', desc: 'Onipresente, onisciente, oniprodutor.', baseCost: 6.0e34, growth: 1.29, baseProd: 1.6e25 },
    { name: 'O Infinito', icon: '♾️', desc: 'Não há fim. Só dopamina.', baseCost: 9.0e35, growth: 1.295, baseProd: 1.3e26 },
    { name: 'O Eterno', icon: '⌛', desc: 'Produz desde antes do tempo. Produz para sempre.', baseCost: 1.3e37, growth: 1.30, baseProd: 1.0e27 },
    { name: 'Supremacia Final', icon: '🏆', desc: 'O ápice de todo poder de produção.', baseCost: 2.0e38, growth: 1.305, baseProd: 8.1e27 },
    { name: 'O Fim Absoluto', icon: '🌑', desc: 'Depois dele, só resta dopamina.', baseCost: 3.0e39, growth: 1.31, baseProd: 6.4e28 },
    { name: 'Thiego Final', icon: '😎', desc: 'O próprio Thiego no seu poder máximo. Nada além.', baseCost: 4.5e40, growth: 1.315, baseProd: 5.2e29 },
  ];
  T.MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  T.MILESTONE_MULT = 2;

  /* ============================================================
     MILESTONES DE DOPAMINA (recompensa única ao cruzar)
     reward: segundos de produção atual (dopamina instantânea).
     Grande marco → feedback de jackpot.
     ============================================================ */
  T.DOPAMINE_MILESTONES = [
    { id: 'dop1', log10: 3, reward: 60 },
    { id: 'dop2', log10: 6, reward: 90 },
    { id: 'dop3', log10: 9, reward: 120 },
    { id: 'dop4', log10: 12, reward: 180 },
    { id: 'dop5', log10: 15, reward: 240 },
    { id: 'dop6', log10: 18, reward: 300 },
    { id: 'dop7', log10: 21, reward: 360 },
    { id: 'dop8', log10: 30, reward: 420 },
    { id: 'dop9', log10: 40, reward: 480 },
    { id: 'dop10', log10: 50, reward: 540 },
    { id: 'dop11', log10: 75, reward: 600 },
    { id: 'dop12', log10: 100, reward: 720 },
  ];

  /* ============================================================
     UPGRADES (permanentes dentro da run; resetam no prestige)
     effect.type aplicado em economy.js:
       clickMult / clickShare | prodMult / genMult | costRed / evoCost
       critChance / critMult / critBonus | comboTime / comboCap
       prestigeGain / prestigeMult | offlineEff / offlineCap
       eventFreq / eventDur / eventReward | perEvo
     ============================================================ */
  T.UPGRADES = [
    // --- CLIQUE ---
    { id: 'click1', cat: 'clique', name: 'Dedo de Manteiga', icon: '👆', desc: 'Seus dedos agora escorregam dopamina.', cost: 25, effect: { type: 'clickMult', value: 0.25 } },
    { id: 'crit1', cat: 'clique', name: 'Sorte de Iniciante', icon: '🍀', desc: 'Às vezes o Thiego se mexe sozinho. +crit chance.', cost: 150, effect: { type: 'critChance', value: 0.03 } },
    { id: 'critd1', cat: 'clique', name: 'Faca Cega Mas Fiel', icon: '🔪', desc: 'Corta a realidade em 2 pedaços. +mult crítico.', cost: 90, effect: { type: 'critMult', value: 1 } },
    { id: 'combo1', cat: 'clique', name: 'Cafeína do Thiego', icon: '☕', desc: 'O combo aguenta mais um cadinho.', cost: 300, effect: { type: 'comboTime', value: 1200 } },
    { id: 'click2', cat: 'clique', name: 'Saco de Recompensa', icon: '💼', desc: 'Dopamina por atacado.', cost: 1_100, effect: { type: 'clickMult', value: 0.35 } },
    { id: 'crit2', cat: 'clique', name: 'Óculos do Crítico', icon: '🕶️', desc: 'Agora você VÊ os críticos chegando. +crit chance.', cost: 4_500, effect: { type: 'critChance', value: 0.05 } },
    { id: 'critd2', cat: 'clique', name: 'Machado Dopamínico', icon: '🪓', desc: 'Crítico com raiva acumulada. +mult crítico.', cost: 9_000, effect: { type: 'critMult', value: 2 } },
    { id: 'combo2', cat: 'clique', name: 'Energético do Thiego', icon: '⚡', desc: '2 horas de energia em 2.5 segundos de combo.', cost: 12_000, effect: { type: 'comboTime', value: 2500 } },
    { id: 'click3', cat: 'clique', name: 'Mão Sincronizada', icon: '🤝', desc: 'Esquerda e direita em harmonia intergaláctica.', cost: 30_000, effect: { type: 'clickMult', value: 0.5 } },
    { id: 'combo3', cat: 'clique', name: 'QUERO MAIS', icon: '🔥', desc: 'O combo máximo deixou de ser máximo.', cost: 400_000, effect: { type: 'comboCap', value: 10 } },
    { id: 'crit3', cat: 'clique', name: 'Lente Divina', icon: '🔭', desc: 'Enxerga os pontos fracos do próprio universo. +crit chance.', cost: 500_000, effect: { type: 'critChance', value: 0.07 } },
    { id: 'share1', cat: 'clique', name: 'Economia de Escala', icon: '📈', desc: 'Sua máquina de dopamina também fortalece seu dedo. +% do dps no clique.', cost: 2.5e6, effect: { type: 'clickShare', value: 0.08, maxLevel: 3 } },
    { id: 'combo4', cat: 'clique', name: 'Furor Contínuo', icon: '🚀', desc: 'Combo sem fim. Sem. Fim.', cost: 9e6, effect: { type: 'comboCap', value: 25 } },
    { id: 'critd3', cat: 'clique', name: 'Crítico do Saber', icon: '🧠', desc: 'Você sabe a hora certa. +mult crítico.', cost: 4e7, effect: { type: 'critMult', value: 4 } },
    { id: 'click4', cat: 'clique', name: 'Luvas de Thiex', icon: '🥊', desc: 'Um soco. Uma farm. +clique massivo.', cost: 2.5e8, effect: { type: 'clickMult', value: 1.5 } },
    { id: 'click5', cat: 'clique', name: 'Mãos de Aço Puro', icon: '🦾', desc: 'O dedo virou um braço robótico. +clique massivo.', cost: 1e10, effect: { type: 'clickMult', value: 2.5 } },
    { id: 'click6', cat: 'clique', name: 'Soco Cósmico', icon: '💫', desc: 'Um clique que dobra o espaço-tempo. +clique.', cost: 1e12, effect: { type: 'clickMult', value: 4 } },
    { id: 'click7', cat: 'clique', name: 'Dedo do Além', icon: '☝️', desc: 'Um dedo de outro plano de existência clica por você.', cost: 5e13, effect: { type: 'clickMult', value: 6 } },
    { id: 'click8', cat: 'clique', name: 'Toque do Deus Thiego', icon: '🫲', desc: 'O próprio Thiego toca a tela. Clique absoluto.', cost: 2e15, effect: { type: 'clickMult', value: 10 } },
    { id: 'crit4', cat: 'clique', name: 'Ótica do Infinito', icon: '🔍', desc: 'Vê os críticos antes deles existirem. +crit.', cost: 5e10, effect: { type: 'critChance', value: 0.08 } },
    { id: 'crit5', cat: 'clique', name: 'Chance Absoluta', icon: '🎯', desc: 'O universo conspira a favor do crítico.', cost: 2e13, effect: { type: 'critChance', value: 0.1 } },
    { id: 'critd4', cat: 'clique', name: 'Crítico do Caos', icon: '💥', desc: 'Críticos que dobram o dano duas vezes. +mult.', cost: 1e12, effect: { type: 'critMult', value: 6 } },
    { id: 'critd5', cat: 'clique', name: 'Destruição Dopamínica', icon: '🔥', desc: 'O crítico virou uma explosão nuclear.', cost: 5e13, effect: { type: 'critMult', value: 10 } },
    { id: 'combo5', cat: 'clique', name: 'Fúria Infinita', icon: '♾️', desc: 'O combo cresceu além da compreensão.', cost: 1e11, effect: { type: 'comboCap', value: 40 } },
    { id: 'combo6', cat: 'clique', name: 'Combo Absoluto', icon: '🌌', desc: 'Combo sem teto. Literalmente.', cost: 1e14, effect: { type: 'comboCap', value: 60 } },
    { id: 'share2', cat: 'clique', name: 'Sinergia Total', icon: '🧬', desc: 'O dedo e a máquina se fundiram. +% do dps no clique.', cost: 5e10, effect: { type: 'clickShare', value: 0.12, maxLevel: 3 } },
    { id: 'share3', cat: 'clique', name: 'Ressonância Dopamínica', icon: '🔗', desc: 'Cada gerador amplifica seu clique. +% dps no clique.', cost: 1e14, effect: { type: 'clickShare', value: 0.2, maxLevel: 3 } },

    // --- AUTOMAÇÃO ---
    { id: 'gen1', cat: 'auto', name: 'Sindicato do Thiego', icon: '🏛️', desc: 'Todos os geradores trabalham felizes. +produção de geradores.', cost: 2_500, effect: { type: 'genMult', value: 0.4 } },
    { id: 'gen2', cat: 'auto', name: 'Lei de Thiego', icon: '📜', desc: 'Artigo 1: produza. Artigo 2: produza mais.', cost: 80_000, effect: { type: 'genMult', value: 0.55 } },
    { id: 'cost1', cat: 'auto', name: 'Compra em Grupo', icon: '🛒', desc: 'Desconto por volume. O Thiego aprova.', cost: 60_000, effect: { type: 'costRed', value: 0.05 } },
    { id: 'prod1', cat: 'auto', name: 'Produção 24/7', icon: '⏱️', desc: 'A farm não dorme. Você deveria.', cost: 4e6, effect: { type: 'prodMult', value: 0.5 } },
    { id: 'gen3', cat: 'auto', name: 'Reforma Trabalhista', icon: '⚖️', desc: 'Menos pausa, mais dopamina. +produção de geradores.', cost: 8e6, effect: { type: 'genMult', value: 0.7 } },
    { id: 'cost2', cat: 'auto', name: 'Negociador Profissional', icon: '💸', desc: 'Paga menos pelo mesmo Thiego.', cost: 4e8, effect: { type: 'costRed', value: 0.06 } },
    { id: 'prod2', cat: 'auto', name: 'Hora Extra Universal', icon: '🌍', desc: 'Todos os universos deram hora extra.', cost: 3e10, effect: { type: 'prodMult', value: 0.75 } },
    { id: 'gen4', cat: 'auto', name: 'Meta de Produção', icon: '🎯', desc: 'A meta é: produzir. Sempre.', cost: 5e11, effect: { type: 'genMult', value: 1 } },
    { id: 'prod3', cat: 'auto', name: 'Overdrive Dopamínico', icon: '🌪️', desc: 'A farm entrou em overdrive. Legalmente.', cost: 2e13, effect: { type: 'prodMult', value: 1.25 } },
    { id: 'gen5', cat: 'auto', name: 'Culto da Produção', icon: '⛩️', desc: 'Os geradores rezam pela dopamina. E funcionam.', cost: 1e14, effect: { type: 'genMult', value: 1.4 } },
    { id: 'prod6', cat: 'auto', name: 'Anomalia Produtiva', icon: '🌀', desc: 'A produção dobrou por conta própria. Ninguém questiona.', cost: 5e14, effect: { type: 'prodMult', value: 1.6 } },
    { id: 'cost3', cat: 'auto', name: 'Monopólio do Thiego', icon: '🏦', desc: 'O Thiego compra tudo no atacado. Até a loja.', cost: 2e15, effect: { type: 'costRed', value: 0.07 } },
    { id: 'gen6', cat: 'auto', name: 'Máquina Perpétua', icon: '🔄', desc: 'Movimento perpétuo. Produção perpétua. Dúvida zero.', cost: 1e16, effect: { type: 'genMult', value: 1.8 } },
    { id: 'prod7', cat: 'auto', name: 'Explosão Dopamínica', icon: '💥', desc: 'Produção em escala de supernova.', cost: 5e16, effect: { type: 'prodMult', value: 2.2 } },
    { id: 'cost4', cat: 'auto', name: 'Economia do Vazio', icon: '🕳️', desc: 'Os custos caem no vazio. Você economiza.', cost: 2e17, effect: { type: 'costRed', value: 0.08 } },
    { id: 'gen7', cat: 'auto', name: 'Exército Dimensional', icon: '🌐', desc: 'Geradores de todas as dimensões trabalham juntos.', cost: 1e18, effect: { type: 'genMult', value: 2.5 } },
    { id: 'prod8', cat: 'auto', name: 'Dopamina Quântica', icon: '⚛️', desc: 'Superposição de produção: produz e não produz. Produz.', cost: 1e19, effect: { type: 'prodMult', value: 3 } },
    { id: 'gen8', cat: 'auto', name: 'Divindade Produtiva', icon: '👑', desc: 'Os geradores transcenderam. E ainda trabalham.', cost: 1e21, effect: { type: 'genMult', value: 3.5 } },
    { id: 'cost5', cat: 'auto', name: 'Gratuidade Absoluta', icon: '🎁', desc: 'Quase de graça. Quase. Mas bem mais barato.', cost: 1e22, effect: { type: 'costRed', value: 0.1 } },
    { id: 'prod9', cat: 'auto', name: 'Produtor do Fim', icon: '🌟', desc: 'A última palavra em produção. Até a próxima.', cost: 1e24, effect: { type: 'prodMult', value: 4 } },

    // --- EVOLUÇÃO ---
    { id: 'evo1', cat: 'evo', name: 'Engenharia Reversa', icon: '🔄', desc: 'Evolui gastando menos dopamina.', cost: 300_000, effect: { type: 'evoCost', value: 0.05 } },
    { id: 'evo2', cat: 'evo', name: 'Evolução em Promoção', icon: '🏷️', desc: 'Liquidação de evoluções. Só essa semana (sempre).', cost: 3e9, effect: { type: 'evoCost', value: 0.06 } },
    { id: 'perEvo1', cat: 'evo', name: 'Essência do Thiego', icon: '👼', desc: 'Cada evolução conquistada alimenta sua produção.', cost: 1e8, effect: { type: 'perEvo', value: 0.02 } },
    { id: 'perEvo2', cat: 'evo', name: 'DNA Sobrecarregado', icon: '🧬', desc: 'O DNA do Thiego agora gera royalties.', cost: 1e13, effect: { type: 'perEvo', value: 0.025 } },
    { id: 'evo3', cat: 'evo', name: 'Evolução em Liquidação', icon: '🪧', desc: 'TUDO na promoção. Sempre. Em todos os universos.', cost: 5e13, effect: { type: 'evoCost', value: 0.07 } },
    { id: 'perEvo3', cat: 'evo', name: 'Legado do Thiego', icon: '🕰️', desc: 'Cada evolução passada alimenta o futuro.', cost: 1e16, effect: { type: 'perEvo', value: 0.03 } },
    { id: 'evo4', cat: 'evo', name: 'Evolução Quântica', icon: '⚛️', desc: 'Evolui em superposição: cara e vence.', cost: 5e16, effect: { type: 'evoCost', value: 0.08 } },
    { id: 'perEvo4', cat: 'evo', name: 'Apoteose', icon: '🌟', desc: 'O Thiego absoluto evolui sem esforço.', cost: 1e20, effect: { type: 'perEvo', value: 0.04 } },
    { id: 'evo5', cat: 'evo', name: 'Evolução Gratuita', icon: '🎰', desc: 'De graça. Não pergunte como.', cost: 1e22, effect: { type: 'evoCost', value: 0.1 } },

    // --- PRESTIGE ---
    { id: 'pres1', cat: 'prestige', name: 'Ambicioso', icon: '🌄', desc: '+ganho de pontos de ascensão.', cost: 1e12, effect: { type: 'prestigeGain', value: 0.10 } }, // P0: 0.25→0.10
    { id: 'pres2', cat: 'prestige', name: 'Ganância Iluminada', icon: '💡', desc: 'Dopamina ascendida também quer mais.', cost: 5e16, effect: { type: 'prestigeGain', value: 0.15 } }, // P0: 0.4→0.15
    { id: 'pres3', cat: 'prestige', name: 'Herança Ascendida', icon: '👑', desc: 'Seus pontos valem mais. Multiplicador de prestige ×.', cost: 1e15, effect: { type: 'prestigeMult', value: 0.15 } },
    { id: 'pres4', cat: 'prestige', name: 'Ambição Eterna', icon: '🌌', desc: 'A dopamina ascendida nunca se contenta. +ganho.', cost: 1e19, effect: { type: 'prestigeGain', value: 0.20 } }, // P0: 0.5→0.20
    { id: 'pres5', cat: 'prestige', name: 'Coroa Ascendida', icon: '👑', desc: 'Seus pontos valem ouro puro. Multiplicador +.', cost: 1e23, effect: { type: 'prestigeMult', value: 0.25 } },
    { id: 'pres6', cat: 'prestige', name: 'Ascensão Infinita', icon: '♾️', desc: 'Ganho de ascensão sem limites conhecidos.', cost: 1e27, effect: { type: 'prestigeGain', value: 0.25 } }, // P0: 0.75→0.25

    // --- OFFLINE ---
    { id: 'off1', cat: 'offline', name: 'Soneca Estratégica', icon: '🛌', desc: 'Dormir também é farmar. +eficiência offline.', cost: 50_000, effect: { type: 'offlineEff', value: 0.15 } },
    { id: 'off2', cat: 'offline', name: 'Férias do Chefe', icon: '🏖️', desc: 'Capacidade offline estendida: o Thiego segura a farm.', cost: 6e7, effect: { type: 'offlineCap', value: 12 } },
    { id: 'off3', cat: 'offline', name: 'Sono Profundo', icon: '😴', desc: 'Até dormindo a farm rende. +eficiência offline.', cost: 2e9, effect: { type: 'offlineEff', value: 0.2 } },
    { id: 'off4', cat: 'offline', name: 'Trabalho Remoto', icon: '💻', desc: 'O Thiego farma de qualquer lugar. Mesmo offline.', cost: 1e12, effect: { type: 'offlineCap', value: 24 } },
    { id: 'off5', cat: 'offline', name: 'Soneca Transcendental', icon: '🌌', desc: 'Dormir virou a forma mais produtiva de existir.', cost: 1e16, effect: { type: 'offlineEff', value: 0.3 } },

    // --- EVENTOS ---
    { id: 'evt1', cat: 'event', name: 'Atenção do Caos', icon: '🎲', desc: 'Os eventos vêm com mais frequência e duram mais.', cost: 3e6, effect: { type: 'eventFreq', value: 0.15 } },
    { id: 'evt2', cat: 'event', name: 'Domador de Eventos', icon: '🎪', desc: 'Eventos maiores, mais compridos, mais caóticos.', cost: 2.5e10, effect: { type: 'eventFreq', value: 0.2 } },
    { id: 'evt3', cat: 'event', name: 'Recompensa Caótica', icon: '💰', desc: 'O caos paga melhor agora. +recompensas de evento.', cost: 9e12, effect: { type: 'eventReward', value: 0.5 } },
    { id: 'evt4', cat: 'event', name: 'Caos Constante', icon: '🌪️', desc: 'O caos virou rotina. Eventos sem parar.', cost: 1e15, effect: { type: 'eventFreq', value: 0.25 } },
    { id: 'evt5', cat: 'event', name: 'Durar do Caos', icon: '⏳', desc: 'Os eventos duram mais que sua paciência.', cost: 1e18, effect: { type: 'eventDur', value: 0.5 } },
    { id: 'evt6', cat: 'event', name: 'Caos Milionário', icon: '💎', desc: 'Recompensas de evento em escala cósmica.', cost: 1e21, effect: { type: 'eventReward', value: 0.8 } },

    // --- MEME ---
    { id: 'meme1', cat: 'meme', name: 'Isso é um Investimento', icon: '📊', desc: '"Isso definitivamente é um investimento inteligente." — Você, agora.', cost: 1e5, effect: { type: 'prodMult', value: 0.35 } },
    { id: 'meme2', cat: 'meme', name: 'O Universo paga royalties', icon: '🌌', desc: 'O Thiego processou a física. E venceu.', cost: 1e10, effect: { type: 'prodMult', value: 0.6 } },
    { id: 'meme3', cat: 'meme', name: 'ERROR: THIEGO TOO POWERFUL', icon: '🖥️', desc: 'O jogo avisou. Você não ouviu.', cost: 1e17, effect: { type: 'prodMult', value: 1 } },
    { id: 'meme4', cat: 'meme', name: 'O Grande Reset (menor)', icon: '♻️', desc: 'Resetar é um estilo de vida. +produção total.', cost: 1e21, effect: { type: 'prodMult', value: 1.5 } },
    { id: 'meme5', cat: 'meme', name: 'Skibidi Dopamina', icon: '🕺', desc: 'O Thiego dançou. A produção explodiu.', cost: 1e25, effect: { type: 'prodMult', value: 2 } },
    { id: 'meme6', cat: 'meme', name: 'Todos São Thiego', icon: '🫂', desc: 'Você é Thiego. Eu sou Thiego. A produção é Thiego.', cost: 1e30, effect: { type: 'prodMult', value: 3 } },

    // --- BATALHA ---
    { id: 'bat1', cat: 'battle', name: 'Espada Afiação', icon: '⚔️', desc: 'Thiegos mais ofensivos. +ATQ em batalhas.', cost: 5_000, effect: { type: 'prodMult', value: 0.15 } },
    { id: 'bat2', cat: 'battle', name: 'Escudo Reforçado', icon: '🛡️', desc: 'Defesa que salva vidas. Thiegos mais resistentes.', cost: 20_000, effect: { type: 'prodMult', value: 0.2 } },
    { id: 'bat3', cat: 'battle', name: 'Fúria de Batalha', icon: '💢', desc: 'Raiva controlada = mais dano. +multiplicador de batalha.', cost: 500_000, effect: { type: 'prodMult', value: 0.3 } },

    // --- ECONOMIA ---
    { id: 'eco1', cat: 'economy', name: 'Mercado Livre', icon: '📈', desc: 'O mercado da dopamina está aquecido. +produção.', cost: 2_000, effect: { type: 'prodMult', value: 0.1 } },
    { id: 'eco2', cat: 'economy', name: 'Bolsa de Valores', icon: '💹', desc: 'Ações da Thiego S.A. estão subindo. +produção.', cost: 200_000, effect: { type: 'prodMult', value: 0.25 } },

    // --- EXPERIÊNCIA ---
    { id: 'xp1', cat: 'xp', name: 'Estudioso', icon: '📚', desc: 'Aprender mais rápido. +20% eficiência deXP.', cost: 10_000, effect: { type: 'offlineEff', value: 0.1 } },
    { id: 'xp2', cat: 'xp', name: 'Gênio Nato', icon: '🧠', desc: 'O cérebro do Thiego é incomparável. +30% XP.', cost: 1_000_000, effect: { type: 'offlineEff', value: 0.15 } },

    // --- LOOT ---
    { id: 'loot1', cat: 'loot', name: 'Olho de Águia', icon: '👁️', desc: 'Encontra itens melhores. +chance de loot raro.', cost: 50_000, effect: { type: 'eventReward', value: 0.25 } },
    { id: 'loot2', cat: 'loot', name: 'Mão de Moeda', icon: '🪙', desc: 'Sorte no loot. +recompensas de batalha.', cost: 2_000_000, effect: { type: 'eventReward', value: 0.4 } },

    // --- PRODUÇÃO EXTRA ---
    { id: 'prod4', cat: 'auto', name: 'Turbo Dopamínico', icon: '🚀', desc: 'A farm entrou em turbo. Legalmente.', cost: 1e15, effect: { type: 'prodMult', value: 1.5 } },
    { id: 'prod5', cat: 'auto', name: 'Hyperdrive', icon: '🛸', desc: 'Velocidade da luz é lenta comparada à dopamina.', cost: 1e19, effect: { type: 'prodMult', value: 2 } },
    { id: 'prod10', cat: 'auto', name: 'Dopamina Além', icon: '🔮', desc: 'Produção que não cabe mais no universo conhecido.', cost: 1e26, effect: { type: 'prodMult', value: 5 } },
    { id: 'gen9', cat: 'auto', name: 'Legião do Thiego', icon: '🪖', desc: 'Uma legião infinita de geradores do Thiego.', cost: 1e28, effect: { type: 'genMult', value: 5 } },
    { id: 'prod11', cat: 'auto', name: 'Sobrecarga Absoluta', icon: '🌠', desc: 'Produção além do além. Além de tudo.', cost: 1e32, effect: { type: 'prodMult', value: 8 } },

    // ============ BALANCEAMENTO: +50 UPGRADES ============
    // --- CLIQUE (faixas médias/altas) ---
    { id: 'click9', cat: 'clique', name: 'Luvas de Platina', icon: '🥇', desc: 'Dedos revestidos de ouro puro. +clique.', cost: 1e16, effect: { type: 'clickMult', value: 6 } },
    { id: 'click10', cat: 'clique', name: 'Toque Dimensional', icon: '🌌', desc: 'Cliques que vêm de outras dimensões.', cost: 5e18, effect: { type: 'clickMult', value: 10 } },
    { id: 'click11', cat: 'clique', name: 'Mãos do Multiverso', icon: '♾️', desc: 'Todas as versões de você clicam ao mesmo tempo.', cost: 1e22, effect: { type: 'clickMult', value: 15 } },
    { id: 'click12', cat: 'clique', name: 'Soco do Fim dos Tempos', icon: '💥', desc: 'O último clique. O definitivo.', cost: 1e26, effect: { type: 'clickMult', value: 25 } },
    { id: 'click13', cat: 'clique', name: 'Onipotência do Dedo', icon: '👆', desc: 'O dedo que move universos. E a farm.', cost: 1e30, effect: { type: 'clickMult', value: 40 } },
    { id: 'click14', cat: 'clique', name: 'Toque Absoluto', icon: '🫲', desc: 'Não é um clique. É uma declaração.', cost: 1e34, effect: { type: 'clickMult', value: 60 } },
    { id: 'crit6', cat: 'clique', name: 'Olho Onipotente', icon: '👁️', desc: '100% dos seus ataques viram críticos.', cost: 1e20, effect: { type: 'critChance', value: 0.12 } },
    { id: 'crit7', cat: 'clique', name: 'Chance do Caos Absoluto', icon: '🎲', desc: 'O caos agora é seu aliado.', cost: 1e27, effect: { type: 'critChance', value: 0.15 } },
    { id: 'critd6', cat: 'clique', name: 'Crítico do Vazio', icon: '🕳️', desc: 'Críticos que engolem a realidade.', cost: 1e24, effect: { type: 'critMult', value: 15 } },
    { id: 'critd7', cat: 'clique', name: 'Crítico Apocalíptico', icon: '☄️', desc: 'Quando crita, o jogo quase fecha.', cost: 1e31, effect: { type: 'critMult', value: 25 } },
    { id: 'combo7', cat: 'clique', name: 'Combo Infinito', icon: '🔗', desc: 'Combo sem fim. Sempre.', cost: 1e18, effect: { type: 'comboCap', value: 50 } },
    { id: 'combo8', cat: 'clique', name: 'Combo Imortal', icon: '♾️', desc: 'O combo transcendeu a matemática.', cost: 1e25, effect: { type: 'comboCap', value: 100 } },
    { id: 'share4', cat: 'clique', name: 'Simbiose Perfeita', icon: '🤝', desc: 'O dedo e a máquina são um só.', cost: 1e21, effect: { type: 'clickShare', value: 0.3, maxLevel: 3 } },

    // --- AUTOMAÇÃO (produção + geradores + custo) ---
    { id: 'gen10', cat: 'auto', name: 'Enxame Produtivo', icon: '🐝', desc: 'Um enxame de geradores trabalha em sincronia.', cost: 1e17, effect: { type: 'genMult', value: 2 } },
    { id: 'gen11', cat: 'auto', name: 'Fábrica Universal', icon: '🏭', desc: 'Uma fábrica em cada universo. Todas do Thiego.', cost: 1e20, effect: { type: 'genMult', value: 3 } },
    { id: 'gen12', cat: 'auto', name: 'Automação Celestial', icon: '🌟', desc: 'Os céus automatizaram a produção.', cost: 1e23, effect: { type: 'genMult', value: 4 } },
    { id: 'gen13', cat: 'auto', name: 'Produção Infinita', icon: '∞', desc: 'A produção literalmente não tem fim.', cost: 1e27, effect: { type: 'genMult', value: 6 } },
    { id: 'gen14', cat: 'auto', name: 'Colmeia Cósmica', icon: '🪐', desc: 'Galáxias inteiras trabalham para o Thiego.', cost: 1e31, effect: { type: 'genMult', value: 8 } },
    { id: 'gen15', cat: 'auto', name: 'Exército do Além', icon: '⚔️', desc: 'Um exército que nunca dorme. Nunca.', cost: 1e35, effect: { type: 'genMult', value: 12 } },
    { id: 'prod12', cat: 'auto', name: 'Catalisador Dopamínico', icon: '⚗️', desc: 'Multiplica a produção em cadeia.', cost: 1e18, effect: { type: 'prodMult', value: 2 } },
    { id: 'prod13', cat: 'auto', name: 'Reação em Cadeia', icon: '☢️', desc: 'Cada dopamina gera mais dopamina.', cost: 1e22, effect: { type: 'prodMult', value: 3 } },
    { id: 'prod14', cat: 'auto', name: 'Fusão Dopamínica', icon: '⚛️', desc: 'Fundindo átomos de dopamina.', cost: 1e25, effect: { type: 'prodMult', value: 4 } },
    { id: 'prod15', cat: 'auto', name: 'Produção Quântica Total', icon: '🔮', desc: 'Superposição de produção máxima.', cost: 1e29, effect: { type: 'prodMult', value: 6 } },
    { id: 'prod16', cat: 'auto', name: 'Big Dopamina Bang', icon: '💥', desc: 'O início de tudo. Produção infinita.', cost: 1e33, effect: { type: 'prodMult', value: 8 } },
    { id: 'prod17', cat: 'auto', name: 'Criação Contínua', icon: '✨', desc: 'Dopamina ex nihilo. Direto do nada.', cost: 1e37, effect: { type: 'prodMult', value: 12 } },
    { id: 'prod18', cat: 'auto', name: 'Manifesto da Dopamina', icon: '📜', desc: 'Decretado: a produção é infinita.', cost: 1e40, effect: { type: 'prodMult', value: 15 } },
    { id: 'cost6', cat: 'auto', name: 'Desconto Universal', icon: '🌐', desc: 'Tudo custa menos em todos os universos.', cost: 1e19, effect: { type: 'costRed', value: 0.08 } },
    { id: 'cost7', cat: 'auto', name: 'Promoção Cósmica', icon: '🎉', desc: 'Liquidação em toda a galáxia.', cost: 1e23, effect: { type: 'costRed', value: 0.09 } },
    { id: 'cost8', cat: 'auto', name: 'Gratuidade Cósmica', icon: '🎁', desc: 'Quase nada custa algo.', cost: 1e28, effect: { type: 'costRed', value: 0.1 } },

    // --- EVOLUÇÃO ---
    { id: 'evo6', cat: 'evo', name: 'Evolução Celestial', icon: '🌌', desc: 'Evolui em um piscar de olhos.', cost: 1e18, effect: { type: 'evoCost', value: 0.08 } },
    { id: 'evo7', cat: 'evo', name: 'Evolução Infinita', icon: '♾️', desc: 'As evoluções quase se pagam.', cost: 1e25, effect: { type: 'evoCost', value: 0.1 } },
    { id: 'perEvo5', cat: 'evo', name: 'Herança do Fim', icon: '🏆', desc: 'Cada evolução alimenta todas as outras.', cost: 1e22, effect: { type: 'perEvo', value: 0.05 } },
    { id: 'perEvo6', cat: 'evo', name: 'Evolução Recursiva', icon: '🌀', desc: 'A evolução evolui a evolução.', cost: 1e29, effect: { type: 'perEvo', value: 0.08 } },

    // --- PRESTIGE ---
    { id: 'pres7', cat: 'prestige', name: 'Ascensão Relâmpago', icon: '⚡', desc: 'Ganho de ascensão acelerado.', cost: 1e21, effect: { type: 'prestigeGain', value: 0.15 } }, // P0: 0.6→0.15
    { id: 'pres8', cat: 'prestige', name: 'Ganância Divina', icon: '😇', desc: 'Até os deuses querem mais pontos.', cost: 1e26, effect: { type: 'prestigeGain', value: 0.20 } }, // P0: 0.8→0.20
    { id: 'pres9', cat: 'prestige', name: 'Pontos Supremos', icon: '👑', desc: 'Seus pontos valem ouro cósmico.', cost: 1e30, effect: { type: 'prestigeMult', value: 0.3 } },
    { id: 'pres10', cat: 'prestige', name: 'Ascensão Absoluta', icon: '🌟', desc: 'O ápice da ascensão. Literalmente.', cost: 1e35, effect: { type: 'prestigeMult', value: 0.4 } },

    // --- OFFLINE ---
    { id: 'off6', cat: 'offline', name: 'Férias Eternas', icon: '🏝️', desc: 'Sua pausa agora é produtiva para sempre.', cost: 1e14, effect: { type: 'offlineCap', value: 48 } },
    { id: 'off7', cat: 'offline', name: 'Sono Cósmico', icon: '🌠', desc: 'Dormir em escala universal.', cost: 1e20, effect: { type: 'offlineEff', value: 0.4 } },
    { id: 'off8', cat: 'offline', name: 'Descanso Infinito', icon: '♾️', desc: 'Offline infinito. Produção infinita.', cost: 1e26, effect: { type: 'offlineCap', value: 96 } },

    // --- EVENTOS ---
    { id: 'evt7', cat: 'event', name: 'Caos Perpétuo', icon: '🌪️', desc: 'Eventos sem intervalo.', cost: 1e17, effect: { type: 'eventFreq', value: 0.3 } },
    { id: 'evt8', cat: 'event', name: 'Caos Total', icon: '☄️', desc: 'O caos agora é o padrão.', cost: 1e24, effect: { type: 'eventDur', value: 0.7 } },
    { id: 'evt9', cat: 'event', name: 'Recompensa Infinita', icon: '💰', desc: 'Eventos que pagam como reis.', cost: 1e28, effect: { type: 'eventReward', value: 1 } },

    // --- MEME (lore) ---
    { id: 'meme7', cat: 'meme', name: 'O Código do Thiego', icon: '💻', desc: 'O segredo da dopamina, em código.', cost: 1e23, effect: { type: 'prodMult', value: 2.5 } },
    { id: 'meme8', cat: 'meme', name: 'O Manifesto Thiego', icon: '📖', desc: 'Capítulo 1: produzir. Capítulo 2: mais.', cost: 1e28, effect: { type: 'prodMult', value: 4 } },
    { id: 'meme9', cat: 'meme', name: 'A Profecia da Farm', icon: '🔮', desc: 'Está escrito: a produção será total.', cost: 1e33, effect: { type: 'prodMult', value: 6 } },
    { id: 'meme10', cat: 'meme', name: 'THIEGO É A RESPOSTA', icon: '42', desc: 'A resposta para tudo é dopamina.', cost: 1e38, effect: { type: 'prodMult', value: 10 } },

    // --- FECHAMENTO (completam os 50) ---
    { id: 'combo9', cat: 'clique', name: 'Combo do Vazio', icon: '🌀', desc: 'O combo que resta após o fim.', cost: 1e32, effect: { type: 'comboCap', value: 80 } },
    { id: 'gen16', cat: 'auto', name: 'Legião do Absoluto', icon: '🌠', desc: 'A legião final. Nada produz como ela.', cost: 1e39, effect: { type: 'genMult', value: 15 } },
    { id: 'prod19', cat: 'auto', name: 'Dopamina do Nada', icon: '0', desc: 'Produz dopamina do absolutamente nada.', cost: 1e42, effect: { type: 'prodMult', value: 20 } },
  ];

  /* ============================================================
     EVOLUÇÕES — TODAS as 52 fotos dos assets, uma por estágio
     custo: começa em 30 e cresce por razões (último ≈ 3.8e78 — fim de jogo)
     mult: 1.15 + 0.006×(n−1) → total do estágio 52 ≈ 6.6e5×
     ============================================================ */
  const EVOS = [
    ['THIEGO NORMAL', 'thiego normal 2.jpeg', 'Um Thiego normal. Absolutamente normal. Nada a ver.', '"Ainda dá tempo de parar."'],
    ['THIEGO DOPAMINADO', 'thiego_fase1.jpg', 'O brilho no olhar mudou. Aura leve detectada.', '"O brilho no olhar já mudou."'],
    ['THIEGO TURBINADO', 'thiego aura.jpg', 'Velocidade máxima. Cuidado com o vento.', '"Velocidade máxima. Cuidado com o vento."'],
    ['THIEGO ULTRA', 'thiego_fase2.png', 'Ele NÃO está normal. Repetimos: NÃO ESTÁ.', '"Ele NÃO está normal."'],
    ['THIEGO SUPREMO', 'thiego chad.jpg', 'O queixo curvou o espaço-tempo.', '"O queixo curvou o espaço-tempo."'],
    ['THIEGO BILIONÁRIO', 'thiego bilionário.jpeg', 'Dinheiro. Muito dinheiro. Dopamina com gravata.', '"É tudo dele. Sempre foi."'],
    ['THIEGO DIVINO', 'thiego divino.jpeg', 'Luz própria. Seguidores próprios. Farm própria.', '"Ele desceu até a farm. Por sua causa."'],
    ['THIEGO ANGELICAL', 'thiego angelical (evolução do thiego divino.jpeg', 'As asas são reais. A dopamina também.', '"Os anjos fazem hora extra por ele."'],
    ['THIEGO CELESTIAL', 'thiego celestial.jpeg', 'Ele foi longe demais. E continua indo.', '"Ele foi longe demais."'],
    ['THIEGO 4K', 'thiego 4k.jpeg', 'Resolução infinita. Clareza absoluta. Confusão total.', '"Agora dá pra ver cada defeito do universo."'],
    ['THIEGO PRICE', 'thiego price (cotaprice mas todos são thiego).png', 'Múltiplos Thiegos. Preço único. Ação astronômica.', '"ATENÇÃO: TODOS SÃO O THIEGO."'],
    ['THIEGO INFINITO ∞', 'thiego mitosis.jpeg', 'O jogo quebrou. E é lindo. Agora são vários.', '"THIEGO TORNARAM-SE MUITOS. ERROR: THIEGO TOO POWERFUL."'],
    ['THIEGO CARECA', 'thiego careca.jpeg', 'Menos cabelo, mais dopamina.', '"O cabelo foi a primeira baixa da farm."'],
    ['THIEGO ENTEADO', 'thiego entediado.jpeg', 'A farm está devagar. Ele percebeu. Você deveria clicar.', '"Sem graça. Sem clique. Sem dopamina."'],
    ['THIEGO NA MUDANÇA', 'thiego movel.jpeg', 'Farm não tem endereço. Só tem ritmo.', '"Contrata: a dopamina já chegou no galpão novo."'],
    ['THIEGO NO CELULAR', 'thiego com o celular.jpeg', 'Farmando no intervalo do auê.', '"Aguarde. Farm fora do horário de expediente."'],
    ['THIEGO TRISTE', 'thiego triste.jpeg', 'Dopamina hoje só com abraço.', '"Abraço? Não. Cliques."'],
    ['THIEGO FOFINHO', 'thiego fofinho.jpeg', 'Abrável. Abraçável. Dopamínico.', '"Cuidado ao clicar: ele morde com carinho."'],
    ['THIEGO SORRIDENTE', 'thiego sorridente.jpeg', 'O sorriso que farms sozinho.', '"Ele sorriu. Isso nunca é bom."'],
    ['THIEGO E OS COLEGAS', 'thiego e colegas.jpeg', 'Até o Thiego precisa de turma.', '"Cada colega tem sua farm. Nenhuma paga imposto."'],
    ['THIEGO CANTOR', 'thiego cantor.jpeg', 'Hit: "Dopamina, Eu Preciso". Certificação vira-lata.', '"Autotune? Não. Dopamina pura."'],
    ['THIEGO ANÃO', 'thiego anão.jpg', 'Pequeno no tamanho. Gigante na produção.', '"A estatura da farm é outra."'],
    ['THIEGO PAPEL', 'thiego papel.jpg', 'Papel também produz. Papel produz MUITO.', '"Anote: o papel pauta a lenda."'],
    ['THIEGO BISCOITANDO', 'thiego biscoitando.jpeg', 'Biscoito? O que é isso? Ele chegou no grill.', '"O grill foi a melhor decisão da farm."'],
    ['THIEGO BISCOITANDO 2', 'thiego biscoitando 2.jpeg', 'A sequência chegou. O grill segue firme.', '"O biscoito estava sozinho. Até aqui."'],
    ['THIEGO BISCOITANDO 3', 'thiego biscoitando 3.jpeg', 'O biscoito ficou famoso. Thiego também. Ninguém sabe por quê.', '"Elo perdido: biscoito, dopamina, Thiego."'],
    ['THIEGO NEGO DOCE', 'thiego nego doce.jpeg', 'Um doce. Uma lenda. Um império.', '"Doçura que não quebra recordes. Mentira."'],
    ['THIEGO GANSTER', 'thiego ganster.jpeg', 'A farm agora tem proteção. Proteção cara.', '"EXTORSÃO? Não. Consultoria de cliques."'],
    ['THIEGO MAROMBADO', 'thiego laranja marombada.jpeg', 'Proteína e dopamina. O combo perfeito.', '"O suplemento oficial da farm é clique."'],
    ['THIEGO DA CASINHA', 'thiego casa pobre.jpeg', 'Do barraco ao topo. Inspirador. E ele sabe.', '"A casinha virou sede da holding."'],
    ['THIEGO E A CASA', 'thiego casa normal.jpeg', 'Imóvel próprio. Dívida própria. Farm própria.', '"O salão da farm custa a metade da casa. Na metade."'],
    ['THIEGO MANSÃO', 'thiego mansão.jpeg', 'Cada cômodo tem um Thiego produzindo.', '"O quarto que mais produz virou depósito."'],
    ['THIEGO MALVADO', 'thiego malvado.jpeg', 'Ele riu. A farm tremeu.', '"Não é sagacidade. É maldade explícita."'],
    ['THIEGO BRAVO', 'thiego bravo.jpeg', 'Ele não perdoa clique desperdiçado.', '"CLIQUE OU SOFRA. Ele é direto."'],
    ['THIEGO AMEAÇADOR', 'thiego ameaçador.jpeg', 'O ultimato venceu. A farm dele é maior que a sua.', '"Ele deu um ultimato: produzir ou produzir."'],
    ['THIEGO PERPLEXO', 'thiego perplexo.jpeg', 'Ele não entende seus cliques. Continue.', '"Ele não entende. E isso o fortalece."'],
    ['THIEGO AMADO', 'thiego sendo lambido.jpeg', 'Ninguém sabe explicar. Ninguém precisa.', '"O amor é a forma mais pura de dopamina."'],
    ['THIEGO SAFADO', 'thiego do sorriso safado.jpeg', 'Esse sorriso já produziu milhões.', '"Ele sabe o que você fez. E aprova."'],
    ['THIEGO SAFADO PLATINUM', 'thiego do sorriso safado 2.jpeg', 'O mesmo sorriso. Trabalho completo.', '"Edição de colecionador do safado."'],
    ['THIEGO BEBÊ', 'thiego bebê.jpeg', 'Começou a farmar cedo. Cedo demais.', '"Cadê a chupeta? Cadê a farm? Tá tudo aqui."'],
    ['THIEGO NOEL', 'thiego noel.jpeg', 'Presente de natal este ano: dopamina obrigatória.', '"Ho-ho-ho. Clique. Clique. Clique."'],
    ['THIEGO VELHO', 'thiego velho.jpeg', '48 horas de farm. Ele envelheceu. A farm não.', '"Aposentadoria? Nunca ouvi falar."'],
    ['THIEGO DITADOR', 'thiego ditador.jpeg', 'Decreto número 1: produzir. Decreto 2: mais.', '"Decreto 3: quem não produz, clica."'],
    ['THIEGO DOG', 'thiego cachorro.jpg', 'Latido. Mordida. Produção.', '"Au au au au. Tradução: clique mais."'],
    ['THIEGO DORMINDO (SECRETO)', 'thiego dormindo.jpeg', 'Ele farms até dormindo. Descanse em paz.', '"ZzZz... upgrade. ZzZz... upgrade."'],
    ['THIEGO DRAG', 'thiego drag.jpg', 'Cabelão, brilho e produção em camadas.', '"Produção é arte. E ele é a obra."'],
    ['THIEGO AVATAR DA ÁGUA', 'thiego avatar da agua.jpeg', 'O espírito da dopamina escolheu alguém.', '"Fluido. Perfeito. Molhado de produtividade."'],
    ['THIEGA', 'thiega (thiego mulher).jpeg', 'A versão dele que não precisa de apresentação.', '"Sem comentários. Apenas cliques."'],
    ['THIEGO GESTANTE', 'thiego gestante.jpeg', 'Não pergunte. Apenas clicie.', '"Aqui farms um futuro farmador."'],
    ['THIEGO PIG', 'thiego pig.jpeg', 'OINK. OINK. DOPAMINA.', '"OINK. Isso é uma farm. Clique. OINK."'],
    ['THIEGO SKIBIDI', 'skibidi thiego.jpeg', 'O cérebro dele caiu. O seu quase caiu também.', '"Ele caiu. Ele levantou. Ele farms."'],
    ['THIEGO COTAPRICE', 'cotaprice thiego.jpeg', 'Cotação oficial da dopamina (Thiego padrão).', '"ATENÇÃO FINAL: TODOS SÃO THIEGO. TODAS AS FOTOS. TODAS AS FASES."'],
    ['THIEGO ANJO', 'thiego anjo.jpeg', 'Asas puras. Dopamina sagrada. Perdoa seus cliques.', '"O céu usa dopamina como combustível."'],
    ['THIEGO AUTISTA', 'thiego autista.jpeg', 'Hiperfoco total. Nada o distrai da farm.', '"O hiperfoco é a forma mais pura de produção."'],
    ['THIEGO CABEÇÃO', 'thiego cabeção.jpeg', 'Cabeça grande, produção maior.', '"Tudo o que ele pensa vira dopamina."'],
    ['THIEGO CACHORRO', 'thiego cachorro.jpeg', 'Latido. Mordida. Produção. Fiel à farm.', '"Au au au au. Tradução: clique mais."'],
    ['THIEGO CAVALO', 'thiego cavalo.jpeg', 'Galopa direto até o recorde de produção.', '"Ele chegou na frente de todo mundo. No trote."'],
    ['THIEGO FREE FIRE', 'thiego free fire.jpeg', 'Pousou de paraquedas na farm. Drops de dopamina.', '"O circle fechou. Só você e a dopamina."'],
    ['THIEGO GATO', 'thiego gato.jpeg', 'Sete vidas, todas dedicadas à farm.', '"Miau. Isso é produção. Miau."'],
    ['THIEGO NERD', 'thiego nerd.jpeg', 'Óculos, calculadora e produção infinita.', '"Tecnicamente, isso é dopamina. E muito."'],
    ['THIEGO NIKE PRO', 'thiego nike pro.jpeg', 'Just do it. Just produce. Apenas clique.', '"Swoosh. A dopamina chegou voando."'],
    ['THIEGO PEIXE', 'thiego peixe.jpeg', 'Nada no mar de dopamina. Superfície: não existe.', '"Glub glub. Aqui embaixo também se produz."'],
    ['THIEGO PERNA', 'thiego perna.jpeg', 'Uma perna. Muito equilíbrio. Produção máxima.', '"Equilíbrio é a chave. E o clique."'],
    ['THIEGO PERNA V2', 'thiego perna v2.jpeg', 'A perna evoluiu. Agora com melhorias de produção.', '"Versão 2.0: ainda mais equilíbrio, ainda mais dopamina."'],
    ['THIEGO POLEDANCE', 'thiego poledance.jpeg', 'Gira, gira e produz dopamina em espiral.', '"É habilidade. Muita habilidade. E dopamina."'],
    ['THIEGO POMBO', 'thiego pombo.jpeg', 'Voa, observa e produz de cima.', '"Coo coo. Vejo tudo. Produzo tudo."'],
    ['THIEGO POMBO VENDO', 'thiego pombo vendo thiego fazendo coisas.jpeg', 'Ele te observa produzir. E produz junto.', '"Coo. Eu vi tudo. E cliquei ainda mais."'],
    ['THIEGO VASCO', 'thiego vasco.jpeg', 'Apaixonado e produtivo. Ele sempre resiste.', '"É paixão. É sofrimento. É dopamina."'],
    ['THIEGO EGO', 'T ego (thiego com cabeça de T).jpeg', 'O ego do próprio Thiego. Produção infinita.', '"EU sou a dopamina. A dopamina sou EU."'],
  ];
  const EVO_R = [2.5,2.5,2.5,2.5,2.5,2.5,2.5,2.5,2.5,2.5,4.0,4.0,4.0,4.0,4.0,4.0,4.0,4.0,4.0,4.0,8.0,8.0,8.0,8.0,8.0,8.0,8.0,8.0,8.0,8.0,16.0,16.0,16.0,16.0,16.0,16.0,16.0,16.0,16.0,16.0,175.0,175.0,175.0,175.0,175.0,175.0,175.0,175.0,175.0,175.0,400.0,400.0,400.0,400.0,400.0,400.0,400.0,400.0,400.0,400.0,1000.0,1000.0,1000.0,1000.0,1000.0,1000.0,1000.0,1000.0];
  T.EVOLUTIONS = EVOS.map((e, i) => ({
    name: e[0], img: e[1], desc: e[2], quote: e[3],
    cost: i === 0 ? 0 : Math.round(30 * EVO_R.slice(0, i - 1).reduce((a, b) => a * b, 1)),
    mult: i === 0 ? 1 : +(1.15 + 0.006 * (i - 1)).toFixed(3),
  }));

  /* ============================================================
     ÁRVORE DE PRESTIGE (pontos permanentes)
     ============================================================ */
  T.PRESTIGE_TREE = [
    { id: 'poder', name: 'Fonte Suprema', icon: '⚡', desc: '+30% produção total por nível.', max: 8, levels: [1, 2, 4, 8, 15, 25, 40, 60], effect: { type: 'prodMult', value: 0.30 } },
    { id: 'eficiencia', name: 'Desconto Thiego', icon: '🏷️', desc: 'Custos de dopamina ×0.93 por nível.', max: 8, levels: [1, 2, 4, 8, 15, 25, 40, 60], effect: { type: 'costRed', value: 0.07 } },
    { id: 'automacao', name: 'Operários Zen', icon: '🧘', desc: '+25% produção dos geradores por nível.', max: 8, levels: [1, 2, 4, 8, 15, 25, 40, 60], effect: { type: 'genMult', value: 0.25 } },
    { id: 'offline', name: 'Sono Produtivo', icon: '😴', desc: '+10% eficiência offline e +4h de limite por nível.', max: 8, levels: [1, 2, 4, 8, 15, 25, 40, 60], effect: { type: 'offlineEff', value: 0.10 } },
    { id: 'eventos', name: 'Caos Controlado', icon: '🎛️', desc: 'Eventos mais frequentes, longos e generosos por nível.', max: 8, levels: [1, 2, 4, 8, 15, 25, 40, 60], effect: { type: 'eventFreq', value: 0.15 } },
    { id: 'transcendencia', name: 'Clique Divino', icon: '🫲', desc: '+40% clique e +2% chance de crítico por nível.', max: 8, levels: [1, 2, 4, 8, 15, 25, 40, 60], effect: { type: 'clickMult', value: 0.40 } },
    { id: 'sorte', name: 'Bênção do Caos', icon: '🎲', desc: '+2% chance crítica por nível.', max: 8, levels: [1, 2, 4, 8, 15, 25, 40, 60], effect: { type: 'critChance', value: 0.02 } },
    { id: 'foco', name: 'Foco Absoluto', icon: '🎯', desc: '+5% clique por nível.', max: 8, levels: [1, 2, 4, 8, 15, 25, 40, 60], effect: { type: 'clickMult', value: 0.05 } },
  ];

  /* ============================================================
     ÁRVORE DE TRANSCENDÊNCIA (pontos permanentes pós-prestige)
     Cada ponto de transcendência = ×2 global. Gastar NUNCA reduz.
     ============================================================ */
  T.TRANSCENDENCE_TREE = [
    { id: 'transProd', name: 'Núcleo Absoluto', icon: '🌞', desc: '+100% produção total por nível (multiplica o ×2 base).', max: 5, levels: [1, 2, 4, 8, 15] },
    { id: 'transCost', name: 'Mão Invisível', icon: '🖐️', desc: 'Custos ×0.90 por nível.', max: 5, levels: [1, 2, 4, 8, 15] },
    { id: 'transGen', name: 'Enxame Eterno', icon: '🐝', desc: '+100% produção dos geradores por nível.', max: 5, levels: [1, 2, 4, 8, 15] },
    { id: 'transClick', name: 'Dedo Cósmico', icon: '👉', desc: '+100% clique por nível.', max: 5, levels: [1, 2, 4, 8, 15] },
    { id: 'transOff', name: 'Sono Infinito', icon: '🌙', desc: '+25% eficiência offline e +12h de limite por nível.', max: 5, levels: [1, 2, 4, 8, 15] },
    { id: 'transEvo', name: 'Evolução Eterna', icon: '📈', desc: 'Evoluções custam ×0.85 por nível.', max: 5, levels: [1, 2, 4, 8, 15] },
  ];

  /* ============================================================
     CONQUISTAS
     ctx = { evoMult, dps, rankBest, lbOnline, missionsClaimed }
     Secretas mostram "???" até desbloquear.
     ============================================================ */
  T.ACHIEVEMENTS = [
    { id: 'cl1', cat: 'clique', name: 'Primeiro Clique', desc: 'Clique 1 vez. O primeiro de muitos.', check: (s) => s.counters.clicks >= 1 },
    { id: 'cl2', cat: 'clique', name: 'Dez Dedos Quentes', desc: 'Clique 100 vezes.', check: (s) => s.counters.clicks >= 100 },
    { id: 'cl3', cat: 'clique', name: 'Dedos de Aço', desc: 'Clique 10.000 vezes.', check: (s) => s.counters.clicks >= 10_000 },
    { id: 'cl4', cat: 'clique', name: 'Um Milhão de Cliques', desc: 'Clique 1.000.000 vezes.', check: (s) => s.counters.clicks >= 1_000_000 },
    { id: 'cl5', cat: 'clique', name: 'Cem Milhões', desc: 'Clique 100.000.000 vezes.', check: (s) => s.counters.clicks >= 100_000_000 },
    { id: 'comb1', cat: 'clique', name: 'Combo Faminto', desc: 'Alcance combo ×25.', check: (s) => s.counters.maxCombo >= 25 },
    { id: 'comb2', cat: 'clique', name: 'Combo Insano', desc: 'Alcance combo ×100.', check: (s) => s.counters.maxCombo >= 100 },
    { id: 'comb3', cat: 'clique', name: 'Combo Impossível', desc: 'Alcance combo ×500.', check: (s) => s.counters.maxCombo >= 500 },
    { id: 'crit1a', cat: 'clique', name: 'Crítico Primordial', desc: 'Faça 100 críticos.', check: (s) => s.counters.crits >= 100 },
    { id: 'crit2a', cat: 'clique', name: 'Sequência Divina', desc: '5 críticos seguidos.', check: (s) => s.counters.critStreakMax >= 5 },
    { id: 'earn1', cat: 'dopami', name: 'Primeira Dopamina', desc: 'Produza sua primeira dopamina.', check: (s) => N.gte(s.totalEarned, 1) },
    { id: 'earn2', cat: 'dopami', name: 'Primeiro Milhão', desc: 'Produza 1M de dopamina.', check: (s) => N.gte(s.totalEarned, 1e6) },
    { id: 'earn3', cat: 'dopami', name: 'Dopamina Bilionária', desc: 'Produza 1B de dopamina.', check: (s) => N.gte(s.totalEarned, 1e9) },
    { id: 'earn4', cat: 'dopami', name: 'Dopamina Trilionária', desc: 'Produza 1T de dopamina.', check: (s) => N.gte(s.totalEarned, 1e12) },
    { id: 'earn5', cat: 'dopami', name: 'Dopamina Quadrilionária', desc: 'Produza 1Qa de dopamina.', check: (s) => N.gte(s.totalEarned, 1e15) },
    { id: 'earn6', cat: 'dopami', name: 'Dopamina Quintilionária', desc: 'Produza 1Qi de dopamina.', check: (s) => N.gte(s.totalEarned, 1e18) },
    { id: 'earn7', cat: 'dopami', name: 'Dopamina Avançada', desc: 'Produza 1×10²¹ de dopamina.', check: (s) => N.gte(s.totalEarned, 1e21) },
    { id: 'earn8', cat: 'dopami', name: 'Números Sem Sentido', desc: 'Produza 1×10³⁰ de dopamina.', check: (s) => N.gte(s.totalEarned, 1e30) },
    { id: 'earn9', cat: 'dopami', name: 'Além da Matemática', desc: 'Produza 1×10⁵⁰ de dopamina.', check: (s) => N.gte(s.totalEarned, 1e50) },
    { id: 'earn10', cat: 'dopami', name: 'ERROR: TOO POWERFUL', desc: 'Produza 1×10¹⁰⁰ de dopamina.', check: (s) => N.gte(s.totalEarned, 1e100) },
    { id: 'evoAll1', cat: 'evo', name: 'O Começo de Tudo', desc: 'Evolua o Thiego pela primeira vez.', check: (s) => s.tier >= 1 },
    { id: 'evoDop', cat: 'evo', name: 'Dopaminado Profundo', desc: 'Alcance THIEGO TURBINADO.', check: (s) => s.tier >= 2 },
    { id: 'evoSup', cat: 'evo', name: 'Supremo', desc: 'Alcance THIEGO SUPREMO.', check: (s) => s.tier >= 4 },
    { id: 'evoCel', cat: 'evo', name: 'Celestial', desc: 'Alcance THIEGO CELESTIAL.', check: (s) => s.tier >= 8 },
    { id: 'evoInf', cat: 'evo', name: 'INFINITO', desc: 'Alcance THIEGO INFINITO ∞.', check: (s) => s.tier >= 11 },
    { id: 'evoLend', cat: 'evo', name: 'Metade do Caminho', desc: 'Alcance a evolução 26 (de 52).', check: (s) => s.tier >= 26 },
    { id: 'evoAbs', cat: 'evo', name: 'TODOS SÃO THIEGO', desc: 'Alcance a evolução 51 (a última).', check: (s) => s.tier >= 51 },
    { id: 'gen1a', cat: 'auto', name: 'Primeiro Funcionário', desc: 'Contrate um gerador.', check: (s) => s.gens.some((g) => g >= 1) },
    { id: 'gen2a', cat: 'auto', name: 'Equipe Pequena', desc: '10 geradores no total.', check: (s) => s.gens.reduce((a, b) => a + b, 0) >= 10 },
    { id: 'gen3a', cat: 'auto', name: 'Exército do Thiego', desc: '100 geradores no total.', check: (s) => s.gens.reduce((a, b) => a + b, 0) >= 100 },
    { id: 'gen4a', cat: 'auto', name: 'Sindicato Máximo', desc: 'Qualquer gerador no nível 1000.', check: (s) => s.gens.some((g) => g >= 1000) },
    { id: 'pres1a', cat: 'prestigio', name: 'Primeira Ascensão', desc: 'Prestigie 1 vez.', check: (s) => s.prestige >= 1 },
    { id: 'pres2a', cat: 'prestigio', name: 'Ascensão Décupla', desc: 'Prestigie 10 vezes.', check: (s) => s.prestige >= 10 },
    { id: 'pres3a', cat: 'prestigio', name: 'Transcendental', desc: 'Prestigie 25 vezes.', check: (s) => s.prestige >= 25 },
    { id: 'pres4a', cat: 'prestigio', name: 'Ascendido Absoluto', desc: 'Prestigie 100 vezes.', check: (s) => s.prestige >= 100 },
    { id: 'pres5a', cat: 'prestigio', name: 'Quase Divino', desc: 'Prestigie 500 vezes.', check: (s) => s.prestige >= 500 },
    { id: 'pres6a', cat: 'prestigio', name: 'Deus da Dopamina', desc: 'Prestigie 1000 vezes.', check: (s) => s.prestige >= 1000 },
    { id: 'evt1a', cat: 'evento', name: 'Caos Inicial', desc: 'Presencie seu primeiro caos.', check: (s) => s.counters.events >= 1 },
    { id: 'evt2a', cat: 'evento', name: 'Caos Habitual', desc: 'Presencie 20 eventos.', check: (s) => s.counters.events >= 20 },
    { id: 'evt3a', cat: 'evento', name: 'Caos Profissional', desc: 'Presencie 100 eventos.', check: (s) => s.counters.events >= 100 },
    { id: 'evt4a', cat: 'evento', name: 'Sortudo Raro', desc: 'Presencie um evento raro.', check: (s) => (s.counters.rareEvents || 0) >= 1 },
    { id: 'evt5a', cat: 'evento', name: 'Lenda do Caos', desc: 'Presencie 5 eventos raros.', check: (s) => (s.counters.rareEvents || 0) >= 5 },
    { id: 'enc1a', cat: 'evento', name: 'Visitante Estranho', desc: 'Encontre um Thiego especial.', check: (s) => s.counters.encounters >= 1 },
    { id: 'enc2a', cat: 'evento', name: 'O Dourado', desc: 'Encontre o THIEGO DOURADO.', check: (s) => s.counters.encDourado >= 1 },
    { id: 'enc3a', cat: 'evento', name: 'BRAVO!', desc: 'Encontre o THIEGO BRAVO.', check: (s) => s.counters.encBravo >= 1 },
    { id: 'time1a', cat: 'tempo', name: 'Primeira Hora', desc: 'Jogue por 1 hora.', check: (s) => s.playTime >= 3600 },
    { id: 'time2a', cat: 'tempo', name: 'Um Dia de Farm', desc: 'Jogue por 24 horas.', check: (s) => s.playTime >= 86_400 },
    { id: 'time3a', cat: 'tempo', name: 'Dorminhoco Produtivo', desc: 'Colete 48h de progresso offline no total.', check: (s) => s.offlineTime >= 172_800 },
    { id: 'miss1a', cat: 'missao', name: 'Missão Cumprida', desc: 'Conclua 5 missões.', check: (s, ctx) => ctx.missionsClaimed >= 5 },
    { id: 'rank1a', cat: 'ranking', name: 'Primeiro TOP 100', desc: 'Entre no TOP 100 global.', check: (s, ctx) => (ctx.lbOnline ? ctx.rankBest <= 100 : ctx.localTop >= 6) },
    { id: 'rank2a', cat: 'ranking', name: 'TOP 10 LENDÁRIO', desc: 'Entre no TOP 10 global.', check: (s, ctx) => (ctx.lbOnline ? ctx.rankBest <= 10 : ctx.localTop >= 6) },
    { id: 'sCode', cat: 'secreta', name: '???', desc: '???', secret: true, check: (s) => s.secrets.code },
    { id: 'sKonami', cat: 'secreta', name: '???', desc: '???', secret: true, check: (s) => s.secrets.konami },
    { id: 'sSkibidi', cat: 'secreta', name: '???', desc: '???', secret: true, check: (s) => s.counters.encSkibidi >= 1 },
    { id: 'sPig', cat: 'secreta', name: '???', desc: '???', secret: true, check: (s) => s.counters.encPig >= 1 },
    { id: 'sThiega', cat: 'secreta', name: '???', desc: '???', secret: true, check: (s) => s.secrets.thiega },
    { id: 'sGestante', cat: 'secreta', name: '???', desc: '???', secret: true, check: (s) => s.secrets.gestante },
    { id: 'sDormindo', cat: 'secreta', name: '???', desc: '???', secret: true, check: (s) => s.offlineTime >= 43_200 },
    { id: 'sOfuror', cat: 'secreta', name: '???', desc: '???', secret: true, check: (s) => s.tier >= 11 },

    // --- NOVAS CONQUISTAS ---
    { id: 'cl6', cat: 'clique', name: 'Bilhão de Cliques', desc: 'Clique 1.000.000.000 vezes.', check: (s) => s.counters.clicks >= 1_000_000_000 },
    { id: 'earn11', cat: 'dopami', name: 'Dopamina Infinita', desc: 'Produza 1×10^100 de dopamina (já existe earn10).', check: (s) => false },
    { id: 'evoMax', cat: 'evo', name: 'TODOS OS 52', desc: 'Alcance a evolução 52 (a última).', check: (s) => s.tier >= 51 },
    { id: 'gen5', cat: 'auto', name: 'Fábrica Automatizada', desc: '1000 geradores de qualquer tipo.', check: (s) => s.gens.some((g) => g >= 1000) },
    { id: 'pres7', cat: 'prestigio', name: 'Deus da Ascensão', desc: 'Prestigie 2500 vezes.', check: (s) => s.prestige >= 2500 },
    { id: 'pres8', cat: 'prestigio', name: 'Ascensão Final', desc: 'Prestigie 5000 vezes.', check: (s) => s.prestige >= 5000 },
    { id: 'time4', cat: 'tempo', name: 'Mestre do Tempo', desc: 'Jogue por 100 horas.', check: (s) => s.playTime >= 360_000 },
    { id: 'time5', cat: 'tempo', name: 'Lenda do Tempo', desc: 'Jogue por 500 horas.', check: (s) => s.playTime >= 1_800_000 },
    { id: 'combo4', cat: 'clique', name: 'Combo Impossível', desc: 'Alcance combo ×1000.', check: (s) => s.counters.maxCombo >= 1000 },
    { id: 'enc4', cat: 'evento', name: 'Coleccionador de Encontros', desc: 'Encontre 50 encontros especiais.', check: (s) => s.counters.encounters >= 50 },
    { id: 'evt6', cat: 'evento', name: 'Mestre do Caos', desc: 'Presencie 200 eventos.', check: (s) => s.counters.events >= 200 },
    { id: 'miss2', cat: 'missao', name: 'Missões Diárias', desc: 'Conclua 50 missões.', check: (s, ctx) => ctx.missionsClaimed >= 50 },
    { id: 'dopMega', cat: 'dopami', name: 'Dopamina Mega', desc: 'Produza 1×10^150 de dopamina.', check: (s) => N.gte(s.totalEarned, 1e150) },
    { id: 'dopOmega', cat: 'dopami', name: 'OMEGA DOPAMINA', desc: 'Produza 1×10^200 de dopamina.', check: (s) => N.gte(s.totalEarned, 1e200) },
  ];

  /* ============================================================
     MISSÕES (diárias / semanais / especiais)
     track: contador usado · target: meta · reward: {dopa | points}
     ============================================================ */
  T.MISSION_POOL = {
    daily: [
      { id: 'dClicks', name: 'Cliques do Dia', desc: 'Faça 500 cliques hoje.', track: 'clicks', target: 500, reward: { dopa: 300 } },
      { id: 'dFarm', name: 'Farm Diária', desc: 'Produza 1M de dopamina hoje.', track: 'earned', target: 1e6, reward: { dopa: 600 } },
      { id: 'dBuy', name: 'Comprador Compulsivo', desc: 'Compre 15 geradores/upgrades hoje.', track: 'buys', target: 15, reward: { dopa: 450 } },
      { id: 'dCrit', name: 'Olho Crítico', desc: 'Acerte 25 críticos hoje.', track: 'crits', target: 25, reward: { dopa: 400 } },
      { id: 'dEvt', name: 'Turista do Caos', desc: 'Presencie 4 eventos hoje.', track: 'events', target: 4, reward: { dopa: 800 } },
    ],
    weekly: [
      { id: 'wClicks', name: 'Mão de Aço', desc: '50.000 cliques na semana.', track: 'clicks', target: 50_000, reward: { points: 5 } },
      { id: 'wFarm', name: 'Magnata da Dopamina', desc: 'Produza 1×10¹⁵ na semana.', track: 'earned', target: 1e15, reward: { points: 15 } },
      { id: 'wPres', name: 'Ascensão Semanal', desc: 'Prestigie 3 vezes na semana.', track: 'prestiges', target: 3, reward: { points: 20 } },
      { id: 'wBuy', name: 'Sindicato em Expansão', desc: 'Compre 500 unidades na semana.', track: 'buys', target: 500, reward: { points: 10 } },
    ],
    special: [
      { id: 'spDourado', name: 'Pegue o Dourado', desc: 'Encontre o THIEGO DOURADO.', track: 'encDourado', target: 1, reward: { dopa: 900 } },
      { id: 'spCombo', name: 'Combo Master', desc: 'Alcance combo ×50.', track: 'combo', target: 50, reward: { points: 8 } },
      { id: 'spCrit', name: 'Crítico Frenético', desc: 'Acerte 100 críticos.', track: 'crits', target: 100, reward: { dopa: 700 } },
      { id: 'spEvt', name: 'Chefe do Caos', desc: 'Presencie 20 eventos.', track: 'events', target: 20, reward: { dopa: 800 } },
      { id: 'spGens', name: 'Imobiliário Thiego', desc: 'Compre 50 geradores.', track: 'buys', target: 50, reward: { points: 6 } },
    ],
  };

  /* ============================================================
     TÍTULOS (perfil)
     ============================================================ */
  T.TITLES = [
    { id: 'tNovato', name: 'Novato', desc: 'Comece a jornada.', check: (s) => s.counters.clicks >= 1 },
    { id: 'tFarmador', name: 'Farmador', desc: '1.000 cliques.', check: (s) => s.counters.clicks >= 1_000 },
    { id: 'tDopaminado', name: 'Dopaminado', desc: '1B de dopamina produzida.', check: (s) => N.gte(s.totalEarned, 1e9) },
    { id: 'tVeloz', name: 'Veloz', desc: 'Combo ×50.', check: (s) => s.counters.maxCombo >= 50 },
    { id: 'tInsano', name: 'Insano', desc: '1M de cliques.', check: (s) => s.counters.clicks >= 1_000_000 },
    { id: 'tChad', name: 'Chad', desc: '10M de cliques.', check: (s) => s.counters.clicks >= 10_000_000 },
    { id: 'tTranscendental', name: 'Transcendental', desc: '25 prestígios.', check: (s) => s.prestige >= 25 },
    { id: 'tInfinito', name: 'Infinito', desc: '1×10⁵⁰ de dopamina.', check: (s) => N.gte(s.totalEarned, 1e50) },
    { id: 'tDeusClique', name: 'Deus do Clique', desc: '100M de cliques.', check: (s) => s.counters.clicks >= 100_000_000 },
    { id: 'tAscendido', name: 'Ascendido', desc: '100 prestígios.', check: (s) => s.prestige >= 100 },
    { id: 'tLenda', name: 'Lenda do Ranking', desc: 'TOP 10 global.', check: (s, ctx) => (ctx.lbOnline ? ctx.rankBest <= 10 : ctx.localTop >= 6) },
    { id: 'tEvoluido', name: 'Evoluído', desc: 'Alcance a evolução 26.', check: (s) => s.tier >= 26 },
    { id: 'tAbsoluto', name: 'Thiego Absoluto', desc: 'Todas as conquistas.', check: (s, ctx) => ctx.achAll },
    { id: 'tBilhao', name: 'Bilionário do Clique', desc: '1B de cliques.', check: (s) => s.counters.clicks >= 1_000_000_000 },
    { id: 'tEventMaster', name: 'Mestre dos Eventos', desc: '200 eventos.', check: (s) => s.counters.events >= 200 },
    { id: 'tMegaDop', name: 'Mega Dopaminado', desc: '1×10^15 de dopamina.', check: (s) => N.gte(s.totalEarned, 1e15) },
  ];

  /* ============================================================
     EVENTOS E ENCONTROS
     Encontros usam imagens reais dos assets.
     ============================================================ */
  T.EVENTS = [
    { id: 'surto', text: 'SURTO DE DOPAMINA!', time: 30, prod: 3, icon: '🧠', weight: 30 },
    { id: 'dobro', text: 'DOPAMINA EM DOBRO!', time: 30, prod: 2, icon: '✖️', weight: 25 },
    { id: 'turbinado', text: 'THIEGO TURBINADO!', time: 20, click: 6, icon: '🏎️', weight: 22 },
    { id: 'chuva', text: 'CHUVA DE DOPAMINA!', time: 0, instant: 45, icon: '🌧️', weight: 20 },
    { id: 'superfarm', text: 'SUPER FARM!', time: 15, prod: 5, glitch: true, icon: '🧨', weight: 15 },
    { id: 'frenesi', text: 'FRENESI!', time: 12, click: 10, icon: '🔥', weight: 14 },
    { id: 'megaclick', text: 'MEGA CLIQUE!', time: 0, instant: 90, icon: '💥', weight: 10 },
    { id: 'jackpot', text: 'JACKPOT DO THIEGO!', time: 0, instant: 400, icon: '🎰', weight: 1.2, rare: true },
    { id: 'lendario', text: 'THIEGO LENDÁRIO!', time: 45, prod: 10, click: 8, icon: '👑', weight: 0.8, rare: true },
    // --- NOVOS EVENTOS ---
    { id: 'neon', text: 'EXPLOSÃO NEON!', time: 25, prod: 4, icon: '💡', weight: 18 },
    { id: 'cosmico', text: 'EVENTO CÓSMICO!', time: 20, prod: 6, click: 5, icon: '🌌', weight: 12 },
    { id: 'tempestade', text: 'TEMPESTADE DE DOPAMINA!', time: 0, instant: 120, icon: '⛈️', weight: 8 },
    { id: 'dimensao', text: 'RACHADURA DIMENSIONAL!', time: 35, prod: 8, click: 7, icon: '🌀', weight: 5, rare: true },
  ];

  T.ENCOUNTERS = [
    { id: 'dourado', name: 'THIEGO DOURADO', icon: '🤑', img: 'thiego do sorriso safado.jpeg', chance: 10, time: 22, click: 8, cooldown: 600, quote: 'Ele brilha. Ele sabe. Ele quer teus cliques.' },
    { id: 'bravo', name: 'THIEGO BRAVO', icon: '😠', img: 'thiego bravo.jpeg', chance: 8, time: 12, clickBoost: 15, cooldown: 600, quote: 'ELE ESTÁ BRAVO. CLIQUE OU SOFRA.' },
    { id: 'ameacador', name: 'THIEGO AMEAÇADOR', icon: '😱', img: 'thiego ameaçador.jpeg', chance: 8, time: 30, prod: 4, cooldown: 600, quote: 'Ele deu um ultimato: produzir ou produzir.' },
    { id: 'sorridente', name: 'THIEGO SORRIDENTE', icon: '😏', img: 'thiego sorridente.jpeg', chance: 7, time: 0, instant: 150, cooldown: 900, quote: 'Ele sorriu. Isso nunca é bom.' },
    { id: 'triste', name: 'THIEGO TRISTE', icon: '😢', img: 'thiego triste.jpeg', chance: 7, time: 45, prod: 2, cooldown: 600, quote: 'Ele precisa de atenção. E dopamina. Muita dopamina.' },
    { id: 'perplexo', name: 'THIEGO PERPLEXO', icon: '🤔', img: 'thiego perplexo.jpeg', chance: 6, time: 60, comboKeep: true, cooldown: 600, quote: 'Ele não entende seus cliques. Continue.' },
    { id: 'dormindo', name: 'THIEGO DORMINDO (SECRETO)', icon: '😴', img: 'thiego dormindo.jpeg', chance: 5, time: 0, instant: 120, idleOnly: 300, cooldown: 1200, secret: true, quote: 'Shh... ele farms sonhando.' },
    { id: 'skibidi', name: 'THIEGO SKIBIDI?!', icon: '🚽', img: 'skibidi thiego.jpeg', chance: 0.5, time: 45, prod: 12, cooldown: 14400, secret: true, rare: true, quote: 'O cérebro dele caiu. O seu quase caiu também.' },
    { id: 'pig', name: 'THIEGO PIG?!', icon: '🐷', img: 'thiego pig.jpeg', chance: 1, time: 0, instant: 200, clickGate: 2_500_000, cooldown: 21_600, secret: true, rare: true, quote: 'OINK. Isso é uma farm. Clique. OINK.' },
  ];

  /* ============================================================
     HUMOR
     ============================================================ */
  T.HUMOR = [
    'Você precisa de mais dopamina.',
    'Isso ainda não é suficiente.',
    'Thiego quer mais.',
    'Seu cérebro não está preparado.',
    'Clicar é a cura.',
    'A fazenda cresce. O cérebro nem tanto.',
    'Dopamina não compra felicidade. Compra mais dopamina.',
    'Os vizinhos começaram a notar o brilho.',
    'Relatório científico: isso é demais.',
    'Continue. A dopamina agradece.',
    'Cada clique aproxima você do Thiego final.',
    'O Thiego sabe o que você fez no último clique.',
  ];
  T.HUMOR_ABSURD = [
    'Isso não deveria ser possível.',
    'THIEGO ESTÁ ABSURDAMENTE DOPAMINADO.',
    'PARABÉNS. VOCÊ QUEBROU A REALIDADE.',
    'A física pediu demissão.',
    'Seu cérebro entrou em greve.',
    'O universo agora paga royalties ao Thiego.',
    'Os números perderam completamente o sentido.',
    'ERROR: THIEGO TOO POWERFUL.',
  ];
  T.HUMOR_CLICK = [
    'Você clicou. A dopamina agradece.',
    'Bom clique. Thiego notou.',
    'Dedo de aço. Mente de dopamina.',
    'Esse clique foi profissional.',
    'O Thiego sente cada clique. Literalmente.',
    'Clique registrado na história da farm.',
  ];
  T.HUMOR_PRESTIGE = [
    'O Thiego se foi... por enquanto.',
    'O ciclo recomeça. Mas você é mais forte.',
    'Ele voltou ao normal. Ele nunca esteve normal.',
    'Prestigiar é a única forma de avançar e recomeçar.',
  ];

  T.HUMOR_TRANSCEND = [
    'Você transcendeu o Thiego. Agora você É o Thiego.',
    'O além do além do além. A dopamina transcendental.',
    'Cada transcendência é um novo universo de produção.',
    'O jogo não tem fim. A dopamina também não.',
    'Transcender é provar que o Thiego é infinito.',
  ];

  /* ============================================================
     A1: LORE NARRATIVA — "Diário do Thiego"
     Desbloqueia por tier de evolução (T.EVOLUTIONS tem 68 formas,
     tier máximo 67). Todo capítulo tem id ESTÁVEL — o save guarda
     apenas os ids (state.js filtra por esses ids).
     ============================================================ */
  T.LORE = [
    { id: 'lore_despertar', tierMin: 0, title: 'Capítulo 1: O Despertar', text: 'No início, havia o clique. O Thiego era apenas um ser comum, vivendo uma vida comum. Até que um dia, ele descobriu a dopamina. E tudo mudou.' },
    { id: 'lore_farm_nasce', tierMin: 5, title: 'Capítulo 2: A Farm nasce', text: 'O primeiro gerador foi construído com sucata e esperança. O Estagiário da Dopamina não sabia o que fazia. Mas produzia. E produzia bem.' },
    { id: 'lore_exercito_cresce', tierMin: 10, title: 'Capítulo 3: O Exército Cresce', text: 'Mais Thiegos se juntaram à causa. A farm se expandiu. O que era um quarto virou um galpão. O que era um galpão virou um império.' },
    { id: 'lore_cla', tierMin: 12, title: 'Capítulo 4: O Clã', text: 'Thiegos de todas as farms se uniram sob uma mesma TAG. Juntos ergueram um Boss Semanal para treinar. Dizem que quem dá o golpe final ouve um "OINK" no vento.' },
    { id: 'lore_primeira_ascensao', tierMin: 15, title: 'Capítulo 5: A Primeira Ascensão', text: 'O Thiego descobriu que poderia recomeçar mais forte. Cada prestígio era uma morte e um renascimento. Ele não temia o fim. Ele abraçava o recomeço.' },
    { id: 'lore_preco_poder', tierMin: 20, title: 'Capítulo 6: O Preço do Poder', text: '"A dopamina tem um preço", disse o Thiego. E pagou. Cada upgrade custava mais que o anterior. Mas ele não parou. Nunca parou.' },
    { id: 'lore_consciencia_coletiva', tierMin: 25, title: 'Capítulo 7: A Consciência Coletiva', text: 'Os Thiegos começaram a se fundir. Uma mente coletiva, um objetivo único: produzir. A individualidade era um luxo que a farm não podia pagar.' },
    { id: 'lore_feira_dos_thiegos', tierMin: 27, title: 'Capítulo 8: A Feira dos Thiegos', text: 'Do outro lado da farm, surgiu um mercado aberto 24h. Itens raros trocavam de mãos, e todo vendedor jurava que "o preço era justo". Era mentira. Mas era dopamina.' },
    { id: 'lore_multiverso', tierMin: 30, title: 'Capítulo 9: O Multiverso Thiego', text: 'Dimensões paralelas foram abertas. Em cada uma, um Thiego diferente produzia em sintonia. A farm era infinita. E infinita era a dopamina.' },
    { id: 'lore_boss_da_semana', tierMin: 33, title: 'Capítulo 10: O Boss da Semana', text: 'Sete dias para derrubar a criatura do clã. Depois dela, sempre vem outra mais forte. A dor do Thiego é semanal — e ele agradece.' },
    { id: 'lore_singularidade', tierMin: 35, title: 'Capítulo 11: A Singularidade', text: 'A produção ultrapassou a compreensão. Números perderam o sentido. O Thiego não era mais um ser — era uma força da natureza.' },
    { id: 'lore_run_proibida', tierMin: 38, title: 'Capítulo 12: A Run Proibida', text: 'Havia uma regra não escrita na parede da farm: NUNCA aperte o botão vermelho. Um dia, um Thiego apertou. Resetou tudo. Dobrou tudo. Morreu duas vezes em vida. Nasceu como lenda.' },
    { id: 'lore_vazio', tierMin: 40, title: 'Capítulo 13: O Vazio', text: 'Além do infinito, havia o vazio. E o vazio, descobriu o Thiego, também produzia dopamina. Do nada, tudo.' },
    { id: 'lore_comunidade', tierMin: 42, title: 'Capítulo 14: A Comunidade', text: 'Um dia, todos os camps do mundo receberam uma missão coletiva. Biliões de cliques somados numa meta única. O evento terminou à meia-noite. O clan inteiro clicou como um só coração.' },
    { id: 'lore_ego_final', tierMin: 45, title: 'Capítulo 15: O Ego Final', text: 'O Thiego olhou para si mesmo e viu o universo. Tudo que existia era dopamina. Tudo que sempre existiu foi dopamina.' },
    { id: 'lore_ultimo_thiego', tierMin: 50, title: 'Capítulo 16: O Último Thiego', text: 'Não havia mais separação entre o Thiego e a farm. Ele era a produção. A produção era ele. O ciclo estava completo.' },
    { id: 'lore_temporada', tierMin: 55, title: 'Capítulo 17: As Estações da Dopamina', text: 'Chegou a primeira TEMPORADA. Com ela, veio o Passe: recompensas para quem persiste, títulos para quem sofre. Tier após tier, o Thiego colecionava temporadas como cicatrizes.' },
    { id: 'lore_mil_vozes', tierMin: 58, title: 'Capítulo 18: As Mil Vozes', text: 'No chat global, milhões de Thiegos gritavam a mesma palavra. Alguns diziam "GG". Outros postavam memes de pombo. Todos produziam juntos, mesmo distantes.' },
    { id: 'lore_alem_do_fim', tierMin: 60, title: 'Capítulo 19: Além do Fim', text: 'Dizem que após o último Thiego, há um silêncio. Mas o silêncio, meu amigo, também produz. Só que em dB.' },
    { id: 'lore_eternidade', tierMin: 67, title: 'Capítulo Final: A Eternidade Dopamínica', text: 'O Thiego alcançou o que nenhum ser antes alcançou. Ele não era mais um farmador. Ele era a própria dopamina. E você estava lá, clicando. Sempre clicando.' },
  ];

  /* ============================================================
     A2: EVENTOS NARRATIVOS com escolha (flavor events)
     Aparecem aleatoriamente durante o farm. Jogador escolhe 1 de 2-3 opções.
     ============================================================ */
  T.FLAVOR_EVENTS = [
    {
      id: 'fe_thiego_paralelo',
      title: '🌌 Thiego Paralelo',
      text: 'Um Thiego de outra dimensão aparece na sua farm! Ele parece mais forte... e mais bonito.',
      choices: [
        { text: 'Absorver → +50% prod 2min', effect: { type: 'prodMult', value: 0.5, duration: 120 } },
        { text: 'Ignorar → nada acontece', effect: { type: 'none' } },
        { text: 'Desafiar → clique 50× em 30s para bônus maior', effect: { type: 'clickChallenge', clicks: 50, time: 30, reward: { prodMult: 1, duration: 180 } } },
      ],
    },
    {
      id: 'fe_dopamina_viva',
      title: '💧 Dopamina Viva',
      text: 'A dopamina está tão concentrada que ganhou vida! Uma criatura feita de puro prazer digital pulsa na sua tela.',
      choices: [
        { text: 'Alimentar → +80% prod 60s', effect: { type: 'prodMult', value: 0.8, duration: 60 } },
        { text: 'Coletar → ganhe dopamina instantânea', effect: { type: 'instant', log10: 3 } },
      ],
    },
    {
      id: 'fe_blackout',
      title: '⚡ Blackout',
      text: 'As luzes piscam. Os geradores param. A farm inteira está prestes a desligar!',
      choices: [
        { text: 'Reiniciar → perde 5s de produção mas estabiliza', effect: { type: 'penalty', time: 5 } },
        { text: 'Sobrecarga → clique 10× em 5s para manter tudo', effect: { type: 'clickChallenge', clicks: 10, time: 5, reward: { prodMult: 0.3, duration: 60 } } },
      ],
    },
    {
      id: 'fe_investidor',
      title: '💼 Investidor Misterioso',
      text: 'Uma figura de terno aparece. "Ouvi dizer que sua farm está bombando. Quero investir."',
      choices: [
        { text: 'Aceitar → +100% prod 5min, mas -10% prod depois', effect: { type: 'prodMult', value: 1, duration: 300, penalty: { prodMult: -0.1, duration: 120 } } },
        { text: 'Recusar → +20% prod 2min (orgulho)', effect: { type: 'prodMult', value: 0.2, duration: 120 } },
      ],
    },
    {
      id: 'fe_thiego_supremo',
      title: '👑 Thiego Supremo',
      text: 'O próprio Thiego Supremo desce à sua farm para uma inspeção surpresa. Ele parece... impressionado?',
      choices: [
        { text: 'Mostrar a produção → +clique por 3min', effect: { type: 'clickMult', value: 2, duration: 180 } },
        { text: 'Pedir autógrafo → nada, mas é legal', effect: { type: 'none' } },
      ],
    },
    {
      id: 'fe_racha_espaco_tempo',
      title: '🌀 Rachadura Espaço-Tempo',
      text: 'Uma rachadura no ar. Do outro lado, você vê... outra farm? Mas ela está produzindo dopamina ao contrário!',
      choices: [
        { text: 'Explorar → -30% prod 30s, depois +200% 3min', effect: { type: 'delayed', penalty: { prodMult: -0.3, duration: 30 }, reward: { prodMult: 2, duration: 180 } } },
        { text: 'Selar → +50% prod 1min (estabilidade)', effect: { type: 'prodMult', value: 0.5, duration: 60 } },
      ],
    },
  ];

  /* ============================================================
     A3: HUMOR EXPANDIDO — falas categorizadas por trigger
     ============================================================ */
  T.HUMOR_ON_PRESTIGE = [
    'O Thiego morreu. Viva o Thiego.',
    'Resetar é a única constante. Produzir também.',
    'Cada ciclo te deixa mais perto do infinito.',
    'O Thiego renasce das cinzas. Dopamínicas.',
  ];
  T.HUMOR_ON_EVOLVE = [
    'O Thiego mudou. E não foi só a aparência.',
    'Mais uma forma. Mais poder. Mais dopamina.',
    'Evoluir é preciso. Produzir é inevitável.',
    'Essa evolução custou cliques. Muitos cliques.',
  ];
  T.HUMOR_ON_IDLE = [
    'Está esperando o quê? Clique!',
    'A farm não funciona sozinha... ou funciona?',
    'O Thiego está entediado. Ele quer cliques.',
    'Ociosidade é inimiga da dopamina.',
    'Cada segundo parado é dopamina perdida.',
  ];
  T.HUMOR_ON_CLICK_SPREE = [
    'CALMA! Você vai quebrar o dedo!',
    'Isso! Isso! MAIS!',
    'O Thiego aprova esse ritmo.',
    'Seu dedo merece um aumento.',
    'A dopamina está em êxtase!',
  ];
  T.HUMOR_ON_HARDORE = [
    'Você escolheu o caminho difícil. O Thiego respeita.',
    'Sem ajuda. Sem offline. Apenas cliques puros.',
    'Modo hardcore: onde os fracos viram dopamina.',
    'O Thiego não dá trégua. E você pediu por isso.',
  ];

  /* ============================================================
     A4: TEMAS VISUAIS — desbloqueáveis por tier
     ============================================================ */
  T.THEMES = [
    { id: 'classic', name: 'Clássico', tierMin: 0, bgColor: '#050a14', accentColor: '#00ff88', fontColor: '#ffffff', desc: 'O tema original. Nostalgia pura.' },
    { id: 'noturno', name: 'Noturno', tierMin: 10, bgColor: '#0a0015', accentColor: '#bb00ff', fontColor: '#e0e0ff', desc: 'A escuridão produz mais dopamina.' },
    { id: 'cosmico', name: 'Cósmico', tierMin: 20, bgColor: '#000a1a', accentColor: '#0088ff', fontColor: '#aaccff', desc: 'O espaço sideral da dopamina.' },
    { id: 'fogo', name: 'Fogo', tierMin: 30, bgColor: '#1a0500', accentColor: '#ff4400', fontColor: '#ffcccc', desc: 'A farm está em chamas. Boas chamas.' },
    { id: 'vazio', name: 'Vazio', tierMin: 40, bgColor: '#000000', accentColor: '#ffffff', fontColor: '#888888', desc: 'No vazio, só existe dopamina.' },
    { id: 'dourado', name: 'Ouro', tierMin: 50, bgColor: '#1a1200', accentColor: '#ffd700', fontColor: '#ffeb99', desc: 'Mamãe, olha: virei ouro.' },
    { id: 'thiego', name: 'Thiego Absoluto', tierMin: 60, bgColor: '#050a14', accentColor: '#ff00ff', fontColor: '#ffffff', desc: 'Você se tornou o próprio Thiego.' },
  ];

  /* ============================================================
     C6: ASCENSÃO — caminhos pós-transcendência
     ============================================================ */
  T.ASCENSION_PATHS = [
    {
      id: 'poder', name: '⚡ Força Bruta', desc: 'Produção total amplificada. O caminho do poder absoluto.',
      perks: [
        { tier: 1, desc: '+50% produção total', effect: { type: 'prodMult', value: 0.5 } },
        { tier: 2, desc: 'Geradores ×2', effect: { type: 'genMult', value: 1 } },
        { tier: 3, desc: '+100% clique', effect: { type: 'clickMult', value: 1 } },
        { tier: 4, desc: 'Custos ×0.85', effect: { type: 'costRed', value: 0.15 } },
        { tier: 5, desc: 'Produção total ×10 (multiplica com tudo)', effect: { type: 'prodMult', value: 9 } },
      ],
    },
    {
      id: 'sabedoria', name: '🧠 Sabedoria', desc: 'Eficiência e estratégia. Cada recurso rende mais.',
      perks: [
        { tier: 1, desc: '+25% produção e -10% custos', effect: { type: 'prodMult', value: 0.25 }, extra: { type: 'costRed', value: 0.1 } },
        { tier: 2, desc: 'Evoluções ×0.80 do custo', effect: { type: 'evoCost', value: 0.2 } },
        { tier: 3, desc: '+50% eficiência offline', effect: { type: 'offlineEff', value: 0.5 } },
        { tier: 4, desc: 'Eventos +50% duração', effect: { type: 'eventDur', value: 0.5 } },
        { tier: 5, desc: 'Tudo custa metade do preço', effect: { type: 'costRed', value: 0.5 } },
      ],
    },
    {
      id: 'caos', name: '🎲 Caos', desc: 'Sorte e risco. Bônus imprevisíveis mas poderosos.',
      perks: [
        { tier: 1, desc: '+10% chance crítica', effect: { type: 'critChance', value: 0.1 } },
        { tier: 2, desc: 'Críticos ×3 de dano', effect: { type: 'critMult', value: 2 } },
        { tier: 3, desc: 'Eventos 2× mais frequentes', effect: { type: 'eventFreq', value: 0.5 } },
        { tier: 4, desc: '+200% clique durante eventos', effect: { type: 'clickMult', value: 2 } },
        { tier: 5, desc: 'Toda produção pode críticar (chance 5%)', effect: { type: 'prodCrit', value: 0.05 } },
      ],
    },
  ];

  /* ============================================================
     C4: COSMÉTICOS — itens visuais para o Thiego
     ============================================================ */
  T.COSMETICS = [
    { id: 'cos_coroa', slot: 'head', name: 'Coroa de Thiego', desc: 'Para o rei da farm.', icon: '👑', unlock: 'achievement', achievementId: 'earn5' },
    { id: 'cos_oculos', slot: 'head', name: 'Óculos Escuros', desc: 'Proteção contra o brilho da dopamina.', icon: '🕶️', unlock: 'achievement', achievementId: 'cl4' },
    { id: 'cos_aura', slot: 'aura', name: 'Aura Dopamínica', desc: 'Um brilho que só quem farms vê.', icon: '✨', unlock: 'tier', tierMin: 20 },
    { id: 'cos_aurora', slot: 'aura', name: 'Aurora Cósmica', desc: 'Cores que não existem na natureza.', icon: '🌌', unlock: 'tier', tierMin: 35 },
    { id: 'cos_chapeu', slot: 'head', name: 'Chapéu de Farm', desc: 'Proteção solar enquanto clica.', icon: '🧢', unlock: 'achievement', achievementId: 'time1a' },
    { id: 'cos_capa', slot: 'aura', name: 'Capa da Ascensão', desc: 'Voa sobre a farm. Literalmente.', icon: '🧣', unlock: 'prestige', prestigeMin: 10 },
    { id: 'cos_fogo', slot: 'aura', name: 'Chamas do Caos', desc: 'A farm está pegando fogo!', icon: '🔥', unlock: 'tier', tierMin: 50 },
    { id: 'cos_halo', slot: 'head', name: 'Halo Divino', desc: 'Santo Thiego, rogai por nós.', icon: '😇', unlock: 'tier', tierMin: 60 },
  ];

  /* ============================================================
     B1: RECOMPENSAS DE CHECK-IN DIÁRIO
     ============================================================ */
  T.DAILY_REWARDS = [
    { day: 1, coins: 50, xp: 100 },
    { day: 2, coins: 60, xp: 120 },
    { day: 3, coins: 70, xp: 140 },
    { day: 4, coins: 80, xp: 160 },
    { day: 5, coins: 100, xp: 200 },
    { day: 6, coins: 120, xp: 240 },
    { day: 7, coins: 200, xp: 400, dopamine: 2 },
    { day: 14, coins: 300, xp: 600, dopamine: 3 },
    { day: 21, coins: 500, xp: 1000, dopamine: 4 },
    { day: 30, coins: 1000, xp: 2000, dopamine: 5 },
    { day: 60, coins: 2000, xp: 4000, dopamine: 8 },
    { day: 90, coins: 3000, xp: 6000, dopamine: 10 },
    { day: 180, coins: 5000, xp: 10000, dopamine: 15 },
    { day: 365, coins: 10000, xp: 20000, dopamine: 20 },
  ];

  /* ============================================================
     C5: CONFIGURAÇÕES DE MODO HARDCORE
     ============================================================ */
  T.HARDCORE = {
    prestigeMult: 2,        // pontos ×2
    noAutoPrestige: true,    // sem auto-prestige
    noOffline: true,         // sem ganho offline
    upgradeCostMult: 2,      // upgrades custam 2×
    genCostMult: 1.5,        // geradores custam 1.5×
    badge: '💀 Hardcore',    // badge no perfil
  };

  /* ============================================================
     C3: CONFIGURAÇÃO DOS MINIGAMES
     ============================================================ */
  T.MINIGAMES = [
    { id: 'reaction', name: '⚡ Reação', desc: 'Clique quando o círculo mudar de cor!', duration: 30, maxScore: 1000, thresholds: { bronze: 100, silver: 300, gold: 600, platinum: 800 } },
    { id: 'memory', name: '🧠 Memória', desc: 'Memorize a sequência de ícones do Thiego!', duration: 30, maxScore: 1000, thresholds: { bronze: 100, silver: 300, gold: 600, platinum: 800 } },
    { id: 'timing', name: '🎯 Timing', desc: 'Pare a barra no centro para pontuar!', duration: 30, maxScore: 1000, thresholds: { bronze: 100, silver: 300, gold: 600, platinum: 800 } },
  ];

  /* ============================================================
     B2: LISTA DE MISSÕES (para UI)
     ============================================================ */
  T.MISSION_TYPES = [
    { id: 'daily', name: 'Diárias', icon: '📅', maxActive: 3 },
    { id: 'weekly', name: 'Semanais', icon: '📆', maxActive: 3 },
  ];
})();
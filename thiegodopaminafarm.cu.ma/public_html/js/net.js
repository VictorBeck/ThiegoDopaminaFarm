/* ============================================================
   THIEGO DOPAMINA FARM — net.js
   Cliente HTTP da expansão (api/*.php): fetch com cookie de
   sessão + header X-CSRF-Token, sempre credenciais same-origin.
   ============================================================ */
(function () {
  'use strict';
  const API = 'api/';
  const Net = window.TDFNet = {
    logged: false,
    user: null,
    progress: null,
    csrf: null,
  };

  function parse(res) {
    // antes: res.json().catch(() => ({})) — um fatal PHP/500 virava {},
    // o painel mostrava "vazio" e o erro real desaparecia. Agora um corpo
    // não-JSON em resposta de erro vira exceção com o status HTTP.
    return res.json().catch(() => {
      if (!res.ok) {
        const e = new Error('HTTP ' + res.status);
        e.status = res.status;
        throw e;
      }
      return {};
    });
  }

  function endpoint(file, route) {
    return API + file + (route ? '?route=' + encodeURIComponent(route) : '');
  }

  Net.get = function (file, route) {
    return fetch(endpoint(file, route), {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then((r) => parse(r))
      .then((d) => {
        if (!d || d.ok === false) {
          const e = new Error((d && d.error) || 'api');
          if (!d) e.status = 0; // rede/JSON quebrado com 200 — raro
          throw e;
        }
        return d;
      });
  };

  Net.post = function (file, route, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (Net.csrf) headers['X-CSRF-Token'] = Net.csrf;
    return fetch(endpoint(file, route), {
      method: 'POST',
      credentials: 'same-origin',
      headers: headers,
      body: JSON.stringify(body || {}),
    })
      .then((r) => parse(r))
      .then((d) => {
        if (!d || d.ok === false) {
          const e = new Error((d && d.error) || 'api');
          e.status = d && d.status;
          // propaga os dados de conflito de save (409) para o chamador
          if (d && typeof d.server_save === 'string') e.server_save = d.server_save;
          if (d && typeof d.server_revision === 'number') e.server_revision = d.server_revision;
          if (d && d.server_saved_at) e.server_saved_at = d.server_saved_at;
          throw e;
        }
        if (d.csrf) Net.csrf = d.csrf;
        return d;
      });
  };

  /* ---------- sessão ---------- */
  Net.restore = function () {
    return Net.get('auth.php', 'me')
      .then((d) => {
        Net.logged = true;
        Net.user = d.user;
        Net.progress = d.progress;
        Net.csrf = d.csrf;
        return d;
      })
      .catch(() => {
        Net.logged = false;
        Net.user = null;
        Net.progress = null;
        return null;
      });
  };

  Net.login = function (identifier, password) {
    return Net.post('auth.php', 'login', { identifier: identifier, password: password });
  };

  Net.register = function (username, email, password) {
    return Net.post('auth.php', 'register', { username: username, email: email, password: password });
  };

  Net.logout = function () {
    return Net.post('auth.php', 'logout', {});
  };

  /* ---------- jogo ---------- */
  Net.state = function () {
    return Net.get('game.php', 'state');
  };
  Net.sync = function (payload) {
    return Net.post('game.php', 'sync', payload);
  };
  Net.claim = function () {
    return Net.post('game.php', 'claim', {});
  };
  Net.claimMission = function (missionId) {
    return Net.post('game.php', 'claim_mission', { mission_id: missionId });
  };
  Net.notifyRead = function (ids) {
    const list = Array.isArray(ids) ? ids.filter((i) => i > 0) : (ids > 0 ? [ids] : []);
    return Net.post('game.php', 'notifications', list.length ? { ids: list } : { mark_all: true });
  };

  /* ---------- thiegos / inventário / loot ---------- */
  Net.catalog = function () { return Net.get('thiegos.php', 'catalog'); };
  Net.refreshUnlocks = function () { return Net.post('thiegos.php', 'refresh_unlocks', {}); };
  Net.buyAll = function () { return Net.post('thiegos.php', 'buy_all', {}); };
  Net.thiegoLevelUp = function (utId) { return Net.post('thiegos.php', 'level_up', { ut_id: utId }); };

  Net.inventory = function () { return Net.get('inventory.php', 'list'); };
  Net.equip = function (utId, itemId) { return Net.post('inventory.php', 'equip', { ut_id: utId, item_id: itemId }); };
  Net.unequip = function (equipmentId) { return Net.post('inventory.php', 'unequip', { equipment_id: equipmentId }); };
  Net.upgradeEquip = function (equipmentId) { return Net.post('inventory.php', 'upgrade', { equipment_id: equipmentId }); };
  Net.sellItem = function (itemId, qty) { return Net.post('inventory.php', 'sell', { item_id: itemId, qty: qty }); };
  Net.disassemble = function (equipmentId) { return Net.post('inventory.php', 'disassemble', { equipment_id: equipmentId }); };

  Net.boxes = function () { return Net.get('loot.php', 'boxes'); };
  Net.openBox = function (slug) { return Net.post('loot.php', 'open', { slug: slug }); };
  Net.lootHistory = function () { return Net.get('loot.php', 'history'); };

  /* ---------- batalha / pvp / genealogia ---------- */
  Net.battleStart = function (mode, thiegoIds, bossSlug) {
    return Net.post('battle.php', 'start', { mode: mode, thiego_ids: thiegoIds, boss_slug: bossSlug });
  };
  Net.battleAuto = function (battleId) { return Net.post('battle.php', 'auto', { battle_id: battleId }); };
  Net.battleCancel = function (battleId) { return Net.post('battle.php', 'cancel', { battle_id: battleId }); };
  Net.battleManualStart = function (mode, thiegoIds, bossSlug) {
    return Net.post('battle.php', 'manual_start', { mode: mode, thiego_ids: thiegoIds, boss_slug: bossSlug });
  };
  Net.battleManualTurn = function (battleId, action) {
    return Net.post('battle.php', 'manual_turn', { battle_id: battleId, action: action });
  };
  /* survival mode */
  Net.survivalStart = function (thiegoIds) { return Net.post('battle.php', 'survival_start', { thiego_ids: thiegoIds }); };
  Net.survivalNext = function (battleId) { return Net.post('battle.php', 'survival_next', { battle_id: battleId }); };
  Net.survivalRetire = function (battleId) { return Net.post('battle.php', 'survival_retire', { battle_id: battleId }); };
  /* daily boss */
  Net.dailyInfo = function () { return Net.get('battle.php', 'daily_info'); };
  Net.dailyStart = function (thiegoIds) { return Net.post('battle.php', 'daily_start', { thiego_ids: thiegoIds }); };
  /* guia de tipos */
  Net.typeChart = function () { return Net.get('battle.php', 'type_chart'); };

  Net.pvpStatus = function () { return Net.get('pvp.php', 'status'); };
  Net.pvpMatch = function (thiegoIds) { return Net.post('pvp.php', 'match', { thiego_ids: thiegoIds }); };
  Net.pvpMatchManual = function (thiegoIds) { return Net.post('pvp.php', 'match_manual', { thiego_ids: thiegoIds }); };
  Net.pvpFinishManual = function (battleId) { return Net.post('pvp.php', 'finish_manual', { battle_id: battleId }); };
  Net.pvpMatchmake = function (thiegoIds) { return Net.post('pvp.php', 'matchmake', { thiego_ids: thiegoIds }); };
  Net.pvpQueueStatus = function () { return Net.get('pvp.php', 'queue_status'); };
  Net.pvpLeaveQueue = function () { return Net.post('pvp.php', 'leave_queue', {}); };
  Net.pvpActive = function () { return Net.get('pvp.php', 'active'); };
  Net.pvpTurn = function (battleId, action) { return Net.post('battle.php', 'pvp_turn', { battle_id: battleId, action: action }); };
  // GET não aceita body/route-params no helper — monta a query explicitamente
  Net.pvpState = function (battleId) {
    return fetch(API + 'battle.php?route=pvp_state&battle_id=' + encodeURIComponent(battleId), {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then((r) => parse(r))
      .then((d) => {
        if (!d || d.ok === false) throw new Error((d && d.error) || 'api');
        return d;
      });
  };

  Net.genealogyTree = function () { return Net.get('genealogy.php', 'tree'); };
  Net.genealogyUnlock = function (slug) { return Net.post('genealogy.php', 'unlock', { slug: slug }); };
  Net.genealogyRespec = function () { return Net.post('genealogy.php', 'respec', {}); };

  /* ---------- admin (só admins) ---------- */
  Net.adminSetMode = function (mode) { return Net.post('admin.php', 'admin_mode', { mode: mode }); };
  Net.adminToggleMode = function () { return Net.post('admin.php', 'admin_mode', {}); };
  Net.adminUpdate = function (fields) { return Net.post('admin.php', 'update', fields || {}); };
  // D2: auditoria
  Net.adminAudit = function (opts) {
    const q = new URLSearchParams();
    if (opts) {
      if (opts.limit) q.set('limit', opts.limit);
      if (opts.offset) q.set('offset', opts.offset);
      if (opts.admin) q.set('admin', opts.admin);
      if (opts.target) q.set('target', opts.target);
    }
    return fetch(API + 'admin.php?route=audit' + (q.toString() ? '&' + q.toString() : ''), {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then((r) => parse(r))
      .then((d) => {
        if (!d || d.ok === false) throw new Error((d && d.error) || 'api');
        return d;
      });
  };
  // D3: moderação
  Net.adminMod = function (action, fields) { return Net.post('admin.php', action, fields || {}); };
  Net.adminBan = function (userId, reason, durationSec) { return Net.adminMod('ban', { user_id: userId, reason: reason, duration_sec: durationSec }); };
  Net.adminMute = function (userId, reason, durationSec) { return Net.adminMod('mute', { user_id: userId, reason: reason, duration_sec: durationSec }); };
  Net.adminWarn = function (userId, reason) { return Net.adminMod('warn', { user_id: userId, reason: reason }); };
  Net.adminFreeze = function (userId, reason) { return Net.adminMod('freeze', { user_id: userId, reason: reason }); };
  Net.adminUnfreeze = function (userId) { return Net.adminMod('unfreeze', { user_id: userId }); };
  // D6: denúncias (fila de moderação)
  Net.adminReports = function () { return Net.get('admin.php', 'reports'); };
  Net.adminResolveReport = function (reportId, action) { return Net.post('admin.php', 'resolve_report', { report_id: reportId, action: action }); };

  /* ---------- B1: check-in diário ---------- */
  Net.checkin = function () { return Net.post('game.php', 'checkin', {}); };

  /* ---------- D6: denúncia de jogador ---------- */
  // target: id numérico OU username (o backend resolve os dois formatos)
  Net.report = function (target, reason, detail) {
    const isId = typeof target === 'number' || /^\d+$/.test(String(target));
    return Net.post('report.php', 'report', {
      target_id: isId ? parseInt(target, 10) : 0,
      target_name: isId ? '' : String(target),
      reason: reason,
      detail: detail || '',
    });
  };

  /* ---------- C3: minigames ---------- */
  Net.minigameStatus = function () { return Net.get('minigame.php', 'status'); };
  Net.minigameScore = function (game, score) { return Net.post('minigame.php', 'score', { game: game, score: score }); };

  /* ---------- C1: mercado ---------- */
  Net.marketList = function () { return Net.get('market.php', 'list'); };
  Net.marketMine = function () { return Net.get('market.php', 'mine'); };
  // contrato do backend (market.php?route=list): item_id, qty, price_currency, price_amount
  Net.marketAdd = function (itemId, priceAmount, priceCurrency, qty) {
    return Net.post('market.php', 'list', {
      item_id: itemId,
      price_amount: priceAmount,
      price_currency: priceCurrency || 'coins',
      qty: qty || 1,
    });
  };
  Net.marketBuy = function (listingId) { return Net.post('market.php', 'buy', { listing_id: listingId }); };
  Net.marketCancel = function (listingId) { return Net.post('market.php', 'cancel', { listing_id: listingId }); };

  /* ---------- B3: season pass ---------- */
  Net.seasonInfo = function () { return Net.get('season.php', 'info'); };
  Net.seasonAddXp = function (xp) { return Net.post('season.php', 'add_xp', { xp: xp }); };
  Net.seasonClaim = function (tier, mode) { return Net.post('season.php', 'claim', { tier: tier, mode: mode }); };
  Net.seasonBuyPremium = function () { return Net.post('season.php', 'buy_premium', {}); };

  /* ---------- B4: eventos globais ---------- */
  Net.eventsCurrent = function () { return Net.get('events.php', 'current'); };
  Net.eventContribute = function (eventId, log10) { return Net.post('events.php', 'contribute', { event_id: eventId, log10: log10 }); };
  Net.eventClaim = function (eventId) { return Net.post('events.php', 'claim', { event_id: eventId }); };

  /* ---------- C2: guildas ---------- */
  Net.guildStatus = function () { return Net.get('guild.php', 'status'); };
  Net.guildCreate = function (name, tag) { return Net.post('guild.php', 'create', { name: name, tag: tag }); };
  Net.guildInvite = function (userId) { return Net.post('guild.php', 'invite', { user_id: userId }); };
  Net.guildJoinByTag = function (tag) { return Net.post('guild.php', 'join_by_tag', { tag: tag }); };
  Net.guildLeave = function () { return Net.post('guild.php', 'leave', {}); };
  Net.guildKick = function (userId) { return Net.post('guild.php', 'kick', { user_id: userId }); };
  Net.guildPromote = function (userId) { return Net.post('guild.php', 'promote', { user_id: userId }); };
  Net.guildContribute = function (log10) { return Net.post('guild.php', 'contribute', { log10: log10 }); };
  Net.guildBossAttack = function () { return Net.post('guild.php', 'boss_attack', {}); };
  Net.guildLeaderboard = function () { return Net.get('guild.php', 'leaderboard'); };

  /* ---------- social: amizade + party ---------- */
  Net.socialStatus = function () { return Net.get('social.php', 'status'); };
  Net.friendAdd = function (identifier) { return Net.post('social.php', 'friends_add', { identifier: identifier }); };
  Net.friendAccept = function (friendId) { return Net.post('social.php', 'friends_accept', { friend_id: friendId }); };
  Net.friendDecline = function (friendId) { return Net.post('social.php', 'friends_decline', { friend_id: friendId }); };
  Net.friendRemove = function (friendId) { return Net.post('social.php', 'friends_remove', { friend_id: friendId }); };
  Net.partyCreate = function (name) { return Net.post('social.php', 'party_create', { name: name }); };
  Net.partyJoin = function (code) { return Net.post('social.php', 'party_join', { code: code }); };
  Net.partyLeave = function () { return Net.post('social.php', 'party_leave', {}); };
  Net.partyKick = function (memberId) { return Net.post('social.php', 'party_kick', { member_id: memberId }); };
  Net.partyDisband = function () { return Net.post('social.php', 'party_disband', {}); };

  Net.suggestList = function () { return Net.get('suggest.php', 'list'); };
  Net.suggestAdd = function (text) { return Net.post('suggest.php', 'add', { text: text }); };
  Net.suggestLike = function (suggestionId) { return Net.post('suggest.php', 'like', { suggestion_id: suggestionId }); };
  Net.suggestUnlike = function (suggestionId) { return Net.post('suggest.php', 'unlike', { suggestion_id: suggestionId }); };

  Net.leaderboard = function (mode) {
    return fetch(API + 'leaderboard.php?mode=' + encodeURIComponent(mode), {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then((r) => parse(r))
      .then((d) => {
        if (!d || d.ok === false) throw new Error((d && d.error) || 'api');
        return d;
      });
  };
})();

'use strict';

const TRADERS = (() => {

  // ── Factions ─────────────────────────────────────────────────────────────────
  const FACTIONS = {
    bunkers: { name:'Бункерщики', clr:'#60a860', short:'БУН' },
    free:    { name:'Вольные',    clr:'#c8a020', short:'ВОЛ' },
    medics:  { name:'Медики',     clr:'#40a8c0', short:'МЕД' },
  };

  // ── NPC definitions ───────────────────────────────────────────────────────────
  const NPC_DEFS = {
    merchant: {
      id:'merchant', name:'Торговец', faction:'free', clr:'#c8a820',
      icon:'$',
      greeting:'Добро пожаловать. Смотри, не трогай руками.',
      // stock: item ids → cost in {parts, tools}
      stock:{
        medkit:      { parts:3 },
        antirads:    { parts:2 },
        canned_food: { parts:1 },
        thermos:     { parts:1 },
        vodka:       { parts:1 },
        knife:       { parts:2 },
        pistol:      { parts:7 },
        vatnik:      { parts:4 },
        winter_coat: { parts:5 },
        gasmask:     { parts:6 },
      },
      // buy_rate: player sells item → receives this fraction of cost in parts
      buy_rate: 0.5,
    },
    gunsmith: {
      id:'gunsmith', name:'Оружейник', faction:'free', clr:'#c08030',
      icon:'⚒',
      greeting:'Ствол почистить? Улучшить? Есть чем заняться.',
      stock:{
        crowbar:     { parts:3 },
        pistol:      { parts:8 },
        shotgun:     { parts:12 },
        assault_rifle:{ parts:15 },
        crowbar_plus:{ parts:5, tools:1 },
        pistol_plus: { parts:10, tools:1 },
      },
      buy_rate: 0.4,
    },
    doctor: {
      id:'doctor', name:'Доктор', faction:'medics', clr:'#40a8c0',
      icon:'✚',
      greeting:'Что болит? Всё можно исправить.',
      services:{
        heal_40:   { name:'Лечение +40 HP',      cost:{ parts:2 }, fn: p => { p.hp = Math.min(p.hp+40, p.max_hp); } },
        heal_full: { name:'Полное исцеление',     cost:{ parts:5 }, fn: p => { p.hp = p.max_hp; } },
        cure_rad:  { name:'Снять 50 RAD',         cost:{ parts:3 }, fn: p => { p.radiation = Math.max(0, p.radiation-50); } },
        cure_all_rad:{ name:'Очистить радиацию',  cost:{ parts:6 }, fn: p => { p.radiation = 0; } },
        cure_cold: { name:'Снять 40 COLD',        cost:{ parts:2 }, fn: p => { p.cold = Math.max(0, p.cold-40); } },
        cure_bleed:{ name:'Остановить кровотечение', cost:{ parts:1 }, fn: p => { p.bleed = 0; } },
      },
      buy_rate: 0,   // doesn't buy items
    },
    informant: {
      id:'informant', name:'Информатор', faction:'bunkers', clr:'#8060c0',
      icon:'?',
      greeting:'Информация — товар. Дорогой, но полезный.',
      services:{
        reveal_small:{ name:'Разведать область (r=15)',  cost:{ parts:2 }, radius:15 },
        reveal_large:{ name:'Разведать большую область (r=30)', cost:{ parts:4 }, radius:30 },
      },
      buy_rate: 0,
    },
  };

  // ── Spawning ──────────────────────────────────────────────────────────────────
  function spawnNPCs(tiles, rng) {
    const W = CFG.MAP_COLS, H = CFG.MAP_ROWS;
    const npcs = [];

    // Find all bunker tiles
    const bunkerTiles = [];
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++)
        if (tiles[r*W+c].biome === 'bunker') bunkerTiles.push({ col:c, row:r });

    if (!bunkerTiles.length) return npcs;

    // Place one of each NPC type near the starting bunker (within 2–4 hexes)
    const startTile = bunkerTiles[0];
    const npcTypes  = Object.keys(NPC_DEFS);

    let placed = 0;
    for (let attempt = 0; attempt < 200 && placed < npcTypes.length; attempt++) {
      const dc  = Math.floor(rng() * 7) - 3;
      const dr  = Math.floor(rng() * 7) - 3;
      const col = startTile.col + dc;
      const row = startTile.row + dr;
      if (col < 0 || col >= W || row < 0 || row >= H) continue;

      const tile = tiles[row*W+col];
      if (!MAP.passable(tile)) continue;
      if (tile.enemy) continue;
      if (npcs.some(n => n.col === col && n.row === row)) continue;

      const def = NPC_DEFS[npcTypes[placed]];
      npcs.push({ ...def, col, row });
      placed++;
    }

    // Scatter additional merchants/doctors in ruins clusters across the map
    const extraTypes = ['merchant', 'gunsmith', 'doctor'];
    for (let k = 0; k < 8; k++) {
      const col = Math.floor(rng() * W);
      const row = Math.floor(rng() * H);
      const tile = tiles[row*W+col];
      if (!MAP.passable(tile)) continue;
      if (tile.biome !== 'ruins' && tile.biome !== 'plain') continue;
      if (tile.enemy) continue;
      if (npcs.some(n => n.col === col && n.row === row)) continue;
      if (HEX.distance(col, row, CFG.START_COL, CFG.START_ROW) < 15) continue;

      const def = NPC_DEFS[extraTypes[k % extraTypes.length]];
      npcs.push({ ...def, col, row, roaming: true });
    }

    return npcs;
  }

  // ── Trade helpers ──────────────────────────────────────────────────────────────

  // Count resources in player inventory
  function countRes(player, id) {
    return player.inventory.filter(it => it.id === id).length;
  }

  // Remove qty of resource id from player inventory, returns true on success
  function spendRes(player, costs) {
    // Check first
    for (const [id, qty] of Object.entries(costs))
      if (countRes(player, id) < qty) return false;
    // Spend
    for (const [id, qty] of Object.entries(costs)) {
      let n = qty;
      while (n-- > 0) {
        const i = player.inventory.findIndex(it => it.id === id);
        if (i >= 0) player.inventory.splice(i, 1);
      }
    }
    return true;
  }

  // Buy item from merchant stock
  function buyItem(npc, itemId, player) {
    const cost = npc.stock && npc.stock[itemId];
    if (!cost) return { ok:false, msg:'Нет в наличии.' };
    if (player.inventory.length >= CFG.MAX_INVENTORY)
      return { ok:false, msg:'Инвентарь переполнен.' };
    if (!spendRes(player, cost))
      return { ok:false, msg:`Недостаточно ресурсов (нужно: ${_fmtCost(cost)}).` };
    const def = ITEM_DEFS[itemId];
    player.addItem({ ...def });
    return { ok:true, msg:`Куплено: ${def.name}` };
  }

  // Sell item to merchant
  function sellItem(npc, idx, player) {
    if (!npc.buy_rate) return { ok:false, msg:'Не покупает.' };
    const item = player.inventory[idx];
    if (!item) return { ok:false, msg:'Нет предмета.' };
    // Find item cost from stock, give fraction as parts
    const cost = npc.stock && npc.stock[item.id];
    const partsCost = cost ? (cost.parts || 0) : 1;
    const partsGain = Math.max(1, Math.floor(partsCost * npc.buy_rate));
    player.inventory.splice(idx, 1);
    for (let i = 0; i < partsGain; i++) {
      if (!player.addItem({ ...ITEM_DEFS.parts })) break;
    }
    return { ok:true, msg:`Продано: ${item.name} → +${partsGain} Деталей` };
  }

  // Use doctor service
  function useService(npc, serviceId, player, revealFn, playerCol, playerRow) {
    const svc = npc.services && npc.services[serviceId];
    if (!svc) return { ok:false, msg:'Нет услуги.' };
    if (!spendRes(player, svc.cost))
      return { ok:false, msg:`Недостаточно (нужно: ${_fmtCost(svc.cost)}).` };
    if (svc.fn) svc.fn(player);
    if (svc.radius && revealFn) revealFn(playerCol, playerRow, svc.radius);
    return { ok:true, msg:svc.name + ' — готово.' };
  }

  function _fmtCost(cost) {
    return Object.entries(cost).map(([id, qty]) => {
      const def = ITEM_DEFS[id];
      return `${qty}× ${def ? def.name : id}`;
    }).join(', ');
  }

  return { FACTIONS, NPC_DEFS, spawnNPCs, countRes, buyItem, sellItem, useService };
})();

'use strict';

const GAME = (() => {
  let tiles          = null;
  let npcs           = [];
  let locations      = [];
  let player         = null;
  let camera         = { x: 0, y: 0 };
  let _turn          = 0;
  let mode           = 'explore';  // explore|combat|trade|craft|note|dead
  let combatCtx      = null;
  let pendingCombats = [];
  let tradeCtx       = null;
  let highlights     = new Map();
  let dirty          = true;

  // ── Weather ────────────────────────────────────────────────────────────────
  let weather = { type: 'clear', turnsLeft: 20 };

  function _pickWeather(current) {
    const types  = Object.keys(WEATHER_TYPES);
    const weights = types.map(t => WEATHER_TYPES[t].weight);
    const total  = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < types.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        // Don't repeat same type back-to-back
        if (types[i] === current && types.length > 1) continue;
        return types[i];
      }
    }
    return 'clear';
  }

  function _tickWeather() {
    weather.turnsLeft--;
    if (weather.turnsLeft <= 0) {
      const prev = weather.type;
      weather.type = _pickWeather(prev);
      weather.turnsLeft = CFG.WEATHER_MIN_DUR +
        Math.floor(Math.random() * (CFG.WEATHER_MAX_DUR - CFG.WEATHER_MIN_DUR));
      const wt = WEATHER_TYPES[weather.type];
      if (weather.type !== 'clear' && weather.type !== 'overcast') {
        UI.log(`Погода: ${wt.icon} ${wt.name}`, 'system');
      }
    }
    UI.updateWeather(weather);
  }

  function _applyWeatherEffects() {
    const wt = WEATHER_TYPES[weather.type];
    if (!wt) return;
    if (wt.cold_mod > 0) {
      const cold = Math.max(0, wt.cold_mod - Math.floor(player.cold_res / 10));
      if (cold > 0) player.cold = Math.min(100, player.cold + cold);
    }
    if (wt.rad_mod > 0) {
      const rad = Math.max(0, wt.rad_mod - Math.floor(player.rad_res / 10));
      if (rad > 0) player.radiation = Math.min(100, player.radiation + rad);
    }
  }

  // ── Session stats (for death screen) ──────────────────────────────────────
  let sessionStats = { kills: 0, itemsFound: 0, locationsVisited: 0, causeOfDeath: '' };

  const AUTOSAVE_EVERY = 15;

  // ── Init ───────────────────────────────────────────────────────────────────
  function init(loadSave = false) {
    const generated = MAP.generate();
    tiles     = generated.tiles;
    npcs      = generated.npcs;
    locations = generated.locations;
    player    = new Player(CFG.START_COL, CFG.START_ROW);
    player.recomputeStats();
    _turn  = 1;
    weather = { type: 'clear', turnsLeft: 20 };
    sessionStats = { kills: 0, itemsFound: 0, locationsVisited: 0, causeOfDeath: '' };

    if (loadSave) {
      const snap = SAVE.load(tiles, player, npcs);
      if (snap) {
        _turn    = snap.turn;
        camera.x = snap.camera.x;
        camera.y = snap.camera.y;
        UI.log('Сохранение загружено. Добро пожаловать обратно.', 'system');
        clampCamera();
      } else {
        loadSave = false;
      }
    }

    if (!loadSave) {
      centreCamera();
      QUESTS.init(_turn);
      UI.log('Добро пожаловать в СЕВЕРНЫЙ РУБЕЖ', 'system');
      UI.log('Вы очнулись в старом бункере. Исследуйте территорию.', 'system');
    } else {
      // Quests restored from save by SAVE.load; if not, init fresh
      if (!QUESTS.getActive().length) QUESTS.init(_turn);
    }

    updateVision();
    buildHighlights();
    refreshUI();
    wireCombatButtons();
    UI.updateSaveBtn(SAVE.hasSave());
    UI.updateWeather(weather);
  }

  function wireCombatButtons() {
    document.getElementById('btn-attack').onclick = combatPlayerAttack;
    document.getElementById('btn-item').onclick   = () => UI.showCombatItemMenu(player, useCombatItem);
    document.getElementById('btn-flee').onclick   = combatFlee;
  }

  // ── Camera ─────────────────────────────────────────────────────────────────
  function centreCamera() {
    const p  = HEX.toPixel(player.col, player.row, CFG.HEX_SIZE);
    const cv = document.getElementById('game-canvas');
    camera.x = p.x - cv.width  / 2;
    camera.y = p.y - cv.height / 2;
    clampCamera();
  }

  function clampCamera() {
    const cv = document.getElementById('game-canvas');
    camera.x = Math.max(0, Math.min(camera.x, CFG.MAP_COLS * RENDERER.HEX_W - cv.width));
    camera.y = Math.max(0, Math.min(camera.y, CFG.MAP_ROWS * RENDERER.V_STEP - cv.height));
  }

  // ── Vision ─────────────────────────────────────────────────────────────────
  function _effectiveVisionRange() {
    let r = CFG.VISION_RANGE;
    if (weather) r += (WEATHER_TYPES[weather.type] || {}).vis_mod || 0;
    if ((player.thirst || 0) >= 80) r -= 1;
    return Math.max(1, r);
  }

  function updateVision() {
    const W = CFG.MAP_COLS, H = CFG.MAP_ROWS, R = _effectiveVisionRange();
    const r0 = Math.max(0,player.row-R-1), r1 = Math.min(H-1,player.row+R+1);
    const c0 = Math.max(0,player.col-R-1), c1 = Math.min(W-1,player.col+R+1);
    for (let r=r0; r<=r1; r++) for (let c=c0; c<=c1; c++) tiles[r*W+c].visible = false;
    for (let r=Math.max(0,player.row-R); r<=Math.min(H-1,player.row+R); r++)
      for (let c=Math.max(0,player.col-R); c<=Math.min(W-1,player.col+R); c++)
        if (HEX.distance(c,r,player.col,player.row) <= R) {
          tiles[r*W+c].visible = true;
          tiles[r*W+c].explored = true;
        }
  }

  // ── Highlights ─────────────────────────────────────────────────────────────
  function buildHighlights() {
    highlights.clear();
    for (const { col, row } of HEX.neighbors(player.col, player.row)) {
      const t = MAP.getTile(tiles, col, row);
      if (!t || !MAP.passable(t)) continue;
      const hasNPC = npcs.some(n => n.col===col && n.row===row);
      if (t.enemy)     highlights.set(`${col},${row},attack`, true);
      else if (hasNPC) highlights.set(`${col},${row},trade`, true);
      else             highlights.set(`${col},${row},move`, true);
    }
  }

  // ── Movement ───────────────────────────────────────────────────────────────
  function moveToHex(col, row) {
    if (mode !== 'explore') return;
    if (HEX.distance(col, row, player.col, player.row) !== 1) return;
    if (player.stun > 0) {
      UI.log('Вы оглушены и пропускаете ход!', 'damage');
      enemyTurns(); processPendingCombats(); return;
    }
    const tile = MAP.getTile(tiles, col, row);
    if (!tile || !MAP.passable(tile)) return;

    const npc = npcs.find(n => n.col===col && n.row===row);
    if (npc) { startTrade(npc); return; }

    if (tile.enemy) { startCombat(tile.enemy, tile, false); return; }

    AUDIO.move();
    player.col = col; player.row = row;
    applyBiomeEffects(tile);
    UI.hidePickup();
    if (tile.items.length) UI.showPickup(tile.items[0]);

    // Named location arrival
    if (tile.landmark) {
      const loc = locations.find(l => l.id === tile.landmark);
      if (loc) {
        UI.log(`★ ${tile.landmark_name}`, 'system');
        sessionStats.locationsVisited++;
        const done = QUESTS.onReach(tile.landmark);
        _processQuestCompletions(done);
      }
    }

    centreCamera(); updateVision();
    enemyTurns();
    processPendingCombats();
  }

  const DIR_MAP = {
    w: {even:[0,-1],  odd:[0,-1]  }, s: {even:[0,1],  odd:[0,1]  },
    a: {even:[-1,0],  odd:[-1,0]  }, d: {even:[1,0],  odd:[1,0]  },
    q: {even:[-1,-1], odd:[0,-1]  }, e: {even:[0,-1], odd:[1,-1] },
    z: {even:[-1,1],  odd:[0,1]   }, c: {even:[0,1],  odd:[1,1]  },
  };

  function handleKey(code) {
    if (mode === 'dead') { location.reload(); return; }

    if (code === 'Escape') { closeAllPanels(); return; }
    if (code === 'Tab')    { toggleCraft(); return; }
    if (code === 'F5' || code === 'KeyN') { doSave(); return; }

    if (mode === 'note') {
      if (code === 'Escape' || code === 'KeyF' || code === 'Space') closeNote();
      return;
    }
    if (mode === 'trade' || mode === 'craft' || mode === 'combat') return;

    const parity = player.row & 1 ? 'odd' : 'even';
    const dirs = {
      ArrowLeft:DIR_MAP.a, KeyA:DIR_MAP.a,
      ArrowRight:DIR_MAP.d, KeyD:DIR_MAP.d,
      ArrowUp:DIR_MAP.w,   KeyW:DIR_MAP.w,
      ArrowDown:DIR_MAP.s, KeyS:DIR_MAP.s,
      KeyQ:DIR_MAP.q, KeyE:DIR_MAP.e,
      KeyZ:DIR_MAP.z, KeyC:DIR_MAP.c,
      Numpad4:DIR_MAP.a, Numpad6:DIR_MAP.d,
      Numpad8:DIR_MAP.w, Numpad2:DIR_MAP.s,
      Numpad7:DIR_MAP.q, Numpad9:DIR_MAP.e,
      Numpad1:DIR_MAP.z, Numpad3:DIR_MAP.c,
    };
    if (dirs[code]) {
      const [dc,dr] = dirs[code][parity];
      moveToHex(player.col+dc, player.row+dr);
      return;
    }
    if (code==='Space'||code==='KeyF') { tryPickup(); return; }
    if (code.startsWith('Digit')) {
      const n = parseInt(code.replace('Digit',''))-1;
      const item = player.inventory[n];
      if (item) handleInventoryAction(n, item.type==='weapon'||item.type==='armor' ? 'equip' : 'use');
    }
  }

  // ── Biome effects ──────────────────────────────────────────────────────────
  function applyBiomeEffects(tile) {
    if (tile.biome==='irradiated') {
      const rad = Math.max(0, 8 - player.rad_res);
      if (rad) { player.radiation+=rad; UI.log(`☢ Радиация! +${rad} RAD`,'damage'); AUDIO.radiation(); }
    }
    if (tile.biome==='snow') {
      const cold = Math.max(0, 4 - Math.floor(player.cold_res/8));
      if (cold) { player.cold+=cold; UI.log(`❄ Холод! +${cold} COLD`,'damage'); }
    }
    if (tile.biome==='swamp'&&Math.random()<0.2) { player.hp-=2; UI.log('Болото: -2 HP','damage'); }
  }

  // ── Pickup ─────────────────────────────────────────────────────────────────
  function tryPickup() {
    if (mode!=='explore') return;
    const tile = MAP.getTile(tiles, player.col, player.row);
    if (!tile||!tile.items.length) return;
    const item = tile.items[0];
    if (player.addItem(item)) {
      tile.items.shift();
      AUDIO.pickup();
      sessionStats.itemsFound++;
      UI.log(`Подобрано: ${item.name}`, 'pickup');
      tile.items.length ? UI.showPickup(tile.items[0]) : UI.hidePickup();
      // Collect quest progress
      const done = QUESTS.tick(_turn, player);
      _processQuestCompletions(done);
      refreshUI();
    } else UI.log('Инвентарь переполнен!','system');
  }

  // ── Inventory ──────────────────────────────────────────────────────────────
  function handleInventoryAction(idxOrSlot, action) {
    if (action==='equip') {
      const msg = player.equip(idxOrSlot);
      if (msg) { UI.log(msg,'pickup'); AUDIO.equip(); }
    } else if (action==='use') {
      const item = player.inventory[idxOrSlot];
      if (!item) return;
      if (item.use) {
        const result = item.use(player, { revealArea });
        player.removeItem(idxOrSlot);
        AUDIO.pickup();
        if (result && typeof result === 'object' && result.note) {
          mode = 'note';
          UI.showNote(result.noteText);
          if (result.msg) UI.log(result.msg, 'pickup');
        } else if (result) {
          UI.log(result, 'pickup');
        }
      } else UI.log(`${item.name} — нельзя использовать.`,'system');
    } else if (action==='unequip') {
      const msg = player.unequip(idxOrSlot);
      if (msg) { UI.log(msg,'pickup'); AUDIO.equip(); }
    }
    refreshUI();
  }

  function revealArea(col, row, radius) {
    const W=CFG.MAP_COLS, H=CFG.MAP_ROWS;
    for (let r=Math.max(0,row-radius); r<=Math.min(H-1,row+radius); r++)
      for (let c=Math.max(0,col-radius); c<=Math.min(W-1,col+radius); c++)
        if (HEX.distance(c,r,col,row)<=radius) tiles[r*W+c].explored=true;
    dirty=true;
  }

  // ── Enemy AI ───────────────────────────────────────────────────────────────
  function enemyTurns() {
    pendingCombats = [];
    const W=CFG.MAP_COLS, R=CFG.VISION_RANGE+5;
    const r0=Math.max(0,player.row-R), r1=Math.min(CFG.MAP_ROWS-1,player.row+R);
    const c0=Math.max(0,player.col-R), c1=Math.min(W-1,player.col+R);
    for (let r=r0; r<=r1; r++)
      for (let c=c0; c<=c1; c++) {
        const t=tiles[r*W+c];
        if (t.enemy) tickEnemy(t.enemy, t);
      }
  }

  function tickEnemy(e, tile) {
    if (e.stun>0) { e.stun--; return; }
    const dist = HEX.distance(e.col, e.row, player.col, player.row);
    if (dist<=e.vision) e.state='chase';
    if (e.state!=='chase') return;
    if (dist===1) { pendingCombats.push({ enemy:e, tile }); return; }

    const nbs = HEX.neighbors(e.col, e.row).filter(n => {
      const t = MAP.getTile(tiles, n.col, n.row);
      return t && MAP.passable(t) && !t.enemy && !(n.col===player.col && n.row===player.row);
    });
    if (!nbs.length) return;
    nbs.sort((a,b) =>
      HEX.distance(a.col,a.row,player.col,player.row) -
      HEX.distance(b.col,b.row,player.col,player.row));
    const best = nbs[0];
    tile.enemy = null;
    e.col = best.col; e.row = best.row;
    tiles[best.row*CFG.MAP_COLS+best.col].enemy = e;
  }

  // ── Pending combat queue ───────────────────────────────────────────────────
  function processPendingCombats() {
    if (mode!=='explore') return;
    if (!pendingCombats.length) { endTurn(); return; }
    while (pendingCombats.length) {
      const next = pendingCombats.shift();
      if (!next.enemy || next.enemy.hp<=0) continue;
      if (HEX.distance(next.enemy.col, next.enemy.row, player.col, player.row)!==1) continue;
      startCombat(next.enemy, next.tile, true);
      return;
    }
    endTurn();
  }

  // ── Turn end ───────────────────────────────────────────────────────────────
  function endTurn() {
    _turn++;
    player.tickEffects().forEach(m => UI.log(m,'damage'));
    if (!player.isAlive()) {
      mode='dead';
      AUDIO.death();
      UI.showDeath(_turn, sessionStats);
      return;
    }

    _applyWeatherEffects();
    _tickWeather();

    // Quest tick
    const doneQuests = QUESTS.tick(_turn, player);
    _processQuestCompletions(doneQuests);

    if (_turn % AUTOSAVE_EVERY === 0) doSave(true);

    buildHighlights();
    refreshUI();
    dirty=true;
  }

  // ── Quest completion rewards ───────────────────────────────────────────────
  function _processQuestCompletions(completedList) {
    if (!completedList || !completedList.length) return;
    for (const q of completedList) {
      AUDIO.levelup();
      UI.log(`✓ Задание выполнено: «${q.title}»! +${q.xp} XP`, 'system');
      UI.flashLevelUp(`✓ ${q.title}`);
      const xpMsg = player.gainXP(q.xp);
      if (xpMsg) { UI.log(`★ ${xpMsg}`, 'system'); UI.flashLevelUp(`★ ${xpMsg}`); }
      (q.reward || []).forEach(id => {
        if (ITEM_DEFS[id]) {
          if (!player.addItem({ ...ITEM_DEFS[id] })) {
            // Inventory full — drop on current tile
            const tile = MAP.getTile(tiles, player.col, player.row);
            if (tile) tile.items.push({ ...ITEM_DEFS[id] });
          }
        }
      });
      refreshUI();
    }
  }

  // ── COMBAT ─────────────────────────────────────────────────────────────────
  function startCombat(enemy, tile, enemyFirst=false) {
    mode='combat';
    combatCtx={ enemy, tile };
    UI.showCombat(player, enemy);
    if (enemyFirst) {
      UI.addCombatLog(`⚠ ${enemy.name} нападает первым!`,'system');
      _enemyStrike();
    } else {
      UI.addCombatLog(`► Вы вступаете в бой с ${enemy.name}!`,'system');
    }
  }

  function _enemyStrike() {
    if (!combatCtx) return;
    const { enemy } = combatCtx;
    if (enemy.hp<=0) return;
    const r = COMBAT.resolveAttack(enemy, player, false);
    AUDIO.hit();
    UI.addCombatLog(r.msg,'enemy-atk');
    UI.updateCombatHP(player, enemy);
    if (!player.isAlive()) {
      sessionStats.causeOfDeath = enemy.name;
      UI.addCombatLog('Вы погибли…','death');
      AUDIO.death();
      mode='dead';
      UI.showDeath(_turn, sessionStats);
    }
  }

  function combatPlayerAttack() {
    if (mode!=='combat'||!combatCtx) return;
    const { enemy } = combatCtx;
    if (player.stun>0) {
      UI.addCombatLog('Вы оглушены! Пропуск.','stun');
      player.stun--;
    } else {
      const r = COMBAT.resolveAttack(player, enemy, true);
      AUDIO.attack();
      UI.addCombatLog(r.msg, r.dmg>0 ? 'player-atk' : '');
    }
    UI.updateCombatHP(player, enemy);
    if (enemy.hp<=0) { endCombatVictory(); return; }
    _enemyStrike();
  }

  function useCombatItem(idx) {
    if (mode!=='combat') return;
    const item = player.inventory[idx];
    if (!item||!item.use) return;
    const msg = item.use(player, { revealArea });
    player.removeItem(idx);
    AUDIO.pickup();
    if (msg && typeof msg === 'string') UI.addCombatLog(msg,'item');
    UI.updateCombatHP(player, combatCtx.enemy);
    refreshUI();
    _enemyStrike();
  }

  function combatFlee() {
    if (mode!=='combat'||!combatCtx) return;
    if (COMBAT.tryFlee(combatCtx.enemy)) {
      AUDIO.flee();
      UI.addCombatLog('Вы отступили!','flee');
      closeCombat();
      processPendingCombats();
    } else {
      UI.addCombatLog('Не удалось отступить!','flee');
      _enemyStrike();
    }
  }

  function endCombatVictory() {
    const { enemy, tile } = combatCtx;
    UI.addCombatLog(`✓ ${enemy.name} уничтожен!`,'victory');
    COMBAT.rollLoot(enemy).forEach(it => {
      tile.items.push(it);
      UI.addCombatLog(`  Выпало: ${it.name}`,'loot');
    });
    const xpMsg = player.gainXP(enemy.xp);
    UI.addCombatLog(`+${enemy.xp} XP`,'xp');
    if (xpMsg) { UI.addCombatLog(`★ ${xpMsg}`,'levelup'); AUDIO.levelup(); UI.flashLevelUp(`★ ${xpMsg}`); }

    sessionStats.kills++;
    tile.enemy = null;
    UI.log(`Победа: ${enemy.name} (+${enemy.xp} XP)`,'combat');
    player.col = tile.col; player.row = tile.row;
    closeCombat();

    // Quest kill tracking
    const done = QUESTS.onKill(enemy.id);
    _processQuestCompletions(done);

    applyBiomeEffects(tile);
    centreCamera(); updateVision();
    if (tile.items.length) UI.showPickup(tile.items[0]);
    processPendingCombats();
  }

  function closeCombat() {
    mode='explore';
    combatCtx=null;
    setTimeout(UI.hideCombat, 400);
  }

  // ── NOTE ───────────────────────────────────────────────────────────────────
  function closeNote() {
    mode = 'explore';
    UI.hideNote();
  }

  // ── CRAFTING ───────────────────────────────────────────────────────────────
  function toggleCraft() {
    if (mode==='craft') { mode='explore'; UI.hideCraftPanel(); return; }
    if (mode!=='explore') return;
    mode='craft';
    UI.showCraftPanel(CRAFT.RECIPES, player, doCraft);
  }

  function doCraft(recipe) {
    const item = CRAFT.doCraft(recipe, player);
    if (item) {
      AUDIO.craft();
      UI.log(`Создано: ${item.name}`,'pickup');
      refreshUI();
      UI.showCraftPanel(CRAFT.RECIPES, player, doCraft);
    } else {
      AUDIO.error();
      UI.log('Крафт не удался — недостаточно материалов.','system');
    }
  }

  // ── TRADING ────────────────────────────────────────────────────────────────
  function startTrade(npc) {
    mode='trade';
    tradeCtx=npc;
    AUDIO.trade();
    UI.showTradePanel(npc, player, {
      onBuy:     (itemId) => handleBuy(itemId),
      onSell:    (idx)    => handleSell(idx),
      onService: (svcId)  => handleService(svcId),
      onClose:   closeTrade,
    });
  }

  function handleBuy(itemId) {
    const res = TRADERS.buyItem(tradeCtx, itemId, player);
    if (res.ok) AUDIO.trade(); else AUDIO.error();
    UI.log(res.msg, res.ok ? 'pickup' : 'system');
    refreshUI();
    UI.refreshTradePanel(tradeCtx, player);
  }

  function handleSell(idx) {
    const res = TRADERS.sellItem(tradeCtx, idx, player);
    if (res.ok) AUDIO.pickup(); else AUDIO.error();
    UI.log(res.msg, res.ok ? 'pickup' : 'system');
    refreshUI();
    UI.refreshTradePanel(tradeCtx, player);
  }

  function handleService(svcId) {
    const res = TRADERS.useService(tradeCtx, svcId, player, revealArea, player.col, player.row);
    if (res.ok) AUDIO.trade(); else AUDIO.error();
    UI.log(res.msg, res.ok ? 'pickup' : 'system');
    refreshUI();
    UI.refreshTradePanel(tradeCtx, player);
  }

  function closeTrade() {
    mode='explore';
    tradeCtx=null;
    UI.hideTradePanel();
    endTurn();
  }

  // ── SAVE / LOAD ────────────────────────────────────────────────────────────
  function doSave(silent=false) {
    const ok = SAVE.save({ tiles, player, camera, turn:_turn, npcs });
    if (!silent) {
      if (ok) { AUDIO.save(); UI.log('Игра сохранена.','system'); }
      else    { AUDIO.error(); UI.log('Ошибка сохранения!','system'); }
    }
    UI.updateSaveBtn(true);
  }

  function closeAllPanels() {
    if (mode==='note')  { closeNote(); return; }
    if (mode==='craft') { mode='explore'; UI.hideCraftPanel(); return; }
    if (mode==='trade') { closeTrade(); return; }
    if (mode==='combat') { combatFlee(); }
  }

  // ── Refresh UI ─────────────────────────────────────────────────────────────
  function refreshUI() {
    UI.updateStats(player);
    UI.updateInventory(player, handleInventoryAction);
    UI.updateQuests(QUESTS.getActive());
  }

  // ── Render loop ────────────────────────────────────────────────────────────
  function startLoop() {
    function loop() {
      dirty = true;
      if (dirty) {
        RENDERER.render(tiles, player, camera, highlights, null, npcs);
        const mm = document.getElementById('minimap');
        if (mm) RENDERER.renderMinimap(tiles, player, camera, mm, locations);
        dirty = false;
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    get turn() { return _turn; },
    init, startLoop, handleKey, doSave, closeNote,
    onCanvasClick(e) {
      if (mode!=='explore') return;
      const cv   = document.getElementById('game-canvas');
      const rect = cv.getBoundingClientRect();
      const px   = e.clientX - rect.left + camera.x;
      const py   = e.clientY - rect.top  + camera.y;
      const { col, row } = HEX.fromPixel(px, py, CFG.HEX_SIZE);
      const dist = HEX.distance(col, row, player.col, player.row);
      if (dist===1) moveToHex(col, row);
      else if (dist===0) tryPickup();
    },
  };
})();

// ── Bootstrap ──────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas');
  RENDERER.init(canvas);
  window.addEventListener('resize', () => RENDERER.resize());

  document.getElementById('btn-save')?.addEventListener('click', () => GAME.doSave());
  document.getElementById('btn-load-save')?.addEventListener('click', () => { if (SAVE.hasSave()) startGame(true); });
  document.getElementById('btn-new-game')?.addEventListener('click', () => startGame(false));
  document.getElementById('craft-close')?.addEventListener('click', () => GAME.handleKey('Escape'));
  document.getElementById('trade-close')?.addEventListener('click', () => GAME.handleKey('Escape'));
  document.getElementById('note-close')?.addEventListener('click',  () => GAME.closeNote());

  const startScreen = document.getElementById('start-screen');
  const loadingEl   = document.getElementById('start-loading');
  let started = false;

  function startGame(loadSave = false) {
    if (started) return;
    started = true;
    loadingEl.classList.remove('hidden');
    setTimeout(() => {
      startScreen.style.display = 'none';
      GAME.init(loadSave);
      GAME.startLoop();
      window.addEventListener('keydown', e => { GAME.handleKey(e.code); e.preventDefault(); });
      canvas.addEventListener('click', e => GAME.onCanvasClick(e));
    }, 80);
  }

  // Save info on start screen
  const info     = SAVE.getSaveInfo();
  const saveInfo = document.getElementById('save-info');
  const btnLoad  = document.getElementById('btn-load-save');
  if (info && saveInfo && btnLoad) {
    saveInfo.textContent = `Ход ${info.turn} · Уровень ${info.level} · ${info.ts}`;
    btnLoad.classList.remove('hidden');
  }

  startScreen.addEventListener('click', e => {
    if (e.target.tagName === 'BUTTON') return;
    startGame(false);
  });
  window.addEventListener('keydown', function once(e) {
    if (e.code === 'Tab' || e.code === 'Escape') return;
    window.removeEventListener('keydown', once);
    startGame(false);
  });
});

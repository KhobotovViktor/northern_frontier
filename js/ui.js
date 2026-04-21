'use strict';

const UI = (() => {
  const MAX_LOG = CFG.MAX_LOG;
  const logEntries = [];

  // ── Log ───────────────────────────────────────────────────────────────────
  function log(msg, type = '') {
    logEntries.push({ msg, type });
    if (logEntries.length > MAX_LOG) logEntries.shift();
    _renderLog();
  }

  function _renderLog() {
    const el = document.getElementById('log-entries');
    if (!el) return;
    el.innerHTML = logEntries.slice(-22).map(e =>
      `<div class="log-entry ${e.type}">${e.msg}</div>`
    ).join('');
    el.scrollTop = el.scrollHeight;
  }

  // ── Stats bar ─────────────────────────────────────────────────────────────
  function updateStats(player) {
    const set  = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    const setW = (id, p) => { const e = document.getElementById(id); if (e) e.style.width = p + '%'; };

    set('hp-text',     `${Math.max(0, player.hp)}/${player.max_hp}`);
    set('rad-text',    player.radiation);
    set('cold-text',   player.cold);
    set('turn-text',   window.GAME ? GAME.turn : '—');
    set('armor-text',  player.armor);
    set('weapon-text', player.weaponName());
    set('pos-text',    `${player.col},${player.row}`);
    set('level-text',  `Ур.${player.level}`);
    set('xp-text',     `${player.xp}/${player.level * 80}`);

    setW('hp-bar',   Math.max(0, (player.hp / player.max_hp) * 100));
    setW('rad-bar',  Math.min(100, player.radiation));
    setW('cold-bar', Math.min(100, player.cold));

    const hpBar = document.getElementById('hp-bar');
    if (hpBar) {
      const r = player.hp / player.max_hp;
      hpBar.style.background = r > 0.5 ? '#2e7a2e' : r > 0.25 ? '#c8a020' : '#c03020';
    }
    const radBar = document.getElementById('rad-bar');
    if (radBar) radBar.style.background = player.radiation > 60 ? '#c03020' : '#607828';

    const bleedEl = document.getElementById('status-bleed');
    const stunEl  = document.getElementById('status-stun');
    if (bleedEl) bleedEl.style.display = player.bleed > 0 ? 'inline' : 'none';
    if (stunEl)  stunEl.style.display  = player.stun  > 0 ? 'inline' : 'none';
  }

  // ── Inventory panel ───────────────────────────────────────────────────────
  function updateInventory(player, onAction) {
    const slotsEl = document.getElementById('inventory-slots');
    if (!slotsEl) return;

    const cells = [];
    for (let i = 0; i < CFG.MAX_INVENTORY; i++) {
      const item = player.inventory[i];
      if (item) {
        cells.push(`
          <div class="inv-slot" data-idx="${i}" title="${item.desc || ''}">
            <span class="slot-badge">${_typeShort(item.type)}</span>
            <span class="slot-icon" style="color:${item.clr || '#aaa'}">${item.icon || '?'}</span>
            <span class="slot-name">${item.name}</span>
          </div>`);
      } else {
        cells.push(`<div class="inv-slot empty" data-idx="${i}">
          <span class="slot-name" style="opacity:.25">—</span></div>`);
      }
    }
    slotsEl.innerHTML = cells.join('');

    slotsEl.querySelectorAll('.inv-slot:not(.empty)').forEach(el => {
      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        const idx  = parseInt(el.dataset.idx);
        const item = player.inventory[idx];
        if (!item) return;
        if (item.type === 'weapon' || item.type === 'armor') onAction(idx, 'equip');
        else if (item.use) onAction(idx, 'use');
      });
    });

    // Equipped slots
    const slots = ['weapon', 'body', 'head'];
    const ids   = ['equip-weapon', 'equip-armor', 'equip-head'];
    slots.forEach((slot, i) => {
      const el = document.getElementById(ids[i]);
      const it = player.equipped[slot];
      if (!el) return;
      el.textContent  = it ? it.name : '—';
      el.style.color  = it ? (it.clr || PAL.UI_BRIGHT) : PAL.UI_DIM;
      el.onclick      = it ? () => onAction(slot, 'unequip') : null;
      el.style.cursor = it ? 'pointer' : 'default';
    });
  }

  function _typeShort(t) {
    return { consumable:'ИСП', weapon:'ОРЖ', armor:'БРН', misc:'МСЦ', upgrade:'АПГ' }[t] || '?';
  }

  // ── Pickup prompt ─────────────────────────────────────────────────────────
  function showPickup(item) {
    const el = document.getElementById('pickup-prompt');
    const tx = document.getElementById('pickup-text');
    if (el && tx) { tx.textContent = `Подобрать: ${item.name} [F / Пробел]`; el.classList.remove('hidden'); }
  }
  function hidePickup() { document.getElementById('pickup-prompt')?.classList.add('hidden'); }

  // ── Combat overlay ────────────────────────────────────────────────────────
  let _combatLogEl = null;

  function showCombat(player, enemy) {
    const ov = document.getElementById('combat-overlay');
    if (!ov) return;
    ov.classList.remove('hidden');
    document.getElementById('combat-title').textContent = `БОЙ — ${enemy.name.toUpperCase()}`;
    const nameEl = document.getElementById('enemy-combat-name');
    if (nameEl) nameEl.textContent = enemy.name;
    _combatLogEl = document.getElementById('combat-log');
    if (_combatLogEl) _combatLogEl.innerHTML = '';
    updateCombatHP(player, enemy);
  }

  function updateCombatHP(player, enemy) {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('player-combat-hp', `${Math.max(0, player.hp)} / ${player.max_hp}`);
    set('enemy-combat-hp',  `${Math.max(0, enemy.hp)} / ${enemy.max_hp}`);
  }

  function addCombatLog(msg, cls = '') {
    if (!_combatLogEl) return;
    const d = document.createElement('div');
    d.className = 'clog-line ' + cls;
    d.textContent = msg;
    _combatLogEl.appendChild(d);
    _combatLogEl.scrollTop = _combatLogEl.scrollHeight;
  }

  function hideCombat() { document.getElementById('combat-overlay')?.classList.add('hidden'); }

  function showCombatItemMenu(player, onSelect) {
    document.getElementById('combat-item-menu')?.remove();
    const menu = document.createElement('div');
    menu.id = 'combat-item-menu';
    menu.className = 'combat-item-menu';
    const consumables = player.inventory.map((it, i) => ({ it, i })).filter(({ it }) => it.type === 'consumable');
    if (!consumables.length) {
      menu.innerHTML = '<div class="cim-empty">Нет расходников</div>';
    } else {
      consumables.forEach(({ it, i }) => {
        const btn = document.createElement('button');
        btn.className = 'cim-btn';
        btn.innerHTML = `<span style="color:${it.clr || '#aaa'}">${it.icon}</span> ${it.name}`;
        btn.onclick = () => { menu.remove(); onSelect(i); };
        menu.appendChild(btn);
      });
    }
    const cancel = document.createElement('button');
    cancel.className = 'cim-btn cim-cancel';
    cancel.textContent = '✕ Отмена';
    cancel.onclick = () => menu.remove();
    menu.appendChild(cancel);
    document.getElementById('combat-panel')?.appendChild(menu);
  }

  // ── Craft panel ───────────────────────────────────────────────────────────
  function showCraftPanel(recipes, player, onCraft) {
    const panel = document.getElementById('craft-panel');
    if (!panel) return;
    panel.classList.remove('hidden');
    _renderCraftList(recipes, player, onCraft);
  }

  function hideCraftPanel() { document.getElementById('craft-panel')?.classList.add('hidden'); }

  function refreshCraftPanel(recipes, player, onCraft) {
    const panel = document.getElementById('craft-panel');
    if (panel && !panel.classList.contains('hidden')) _renderCraftList(recipes, player, onCraft);
  }

  function _renderCraftList(recipes, player, onCraft) {
    const list = document.getElementById('craft-list');
    if (!list) return;
    list.innerHTML = '';

    const CAT_LABELS = { consumable:'Расходники', weapon:'Оружие', armor:'Броня' };
    const grouped = {};
    recipes.forEach(r => {
      const cat = r.category || 'misc';
      (grouped[cat] = grouped[cat] || []).push(r);
    });

    for (const [cat, recs] of Object.entries(grouped)) {
      const hdr = document.createElement('div');
      hdr.className = 'craft-cat';
      hdr.textContent = CAT_LABELS[cat] || cat;
      list.appendChild(hdr);

      recs.forEach(recipe => {
        const ok   = CRAFT.canCraft(recipe, player);
        const miss = ok ? [] : CRAFT.missing(recipe, player);
        const def  = ITEM_DEFS[recipe.result_id];

        const row = document.createElement('div');
        row.className = 'craft-row' + (ok ? '' : ' craft-disabled');
        row.innerHTML = `
          <div class="craft-icon" style="color:${def?.clr || '#aaa'}">${def?.icon || '?'}</div>
          <div class="craft-info">
            <div class="craft-name">${recipe.name}</div>
            <div class="craft-ing">${_fmtIngr(recipe.ingredients)}</div>
            ${miss.length ? `<div class="craft-miss">Нет: ${miss.join(', ')}</div>` : ''}
          </div>
          <button class="craft-btn${ok ? '' : ' craft-btn-off'}" ${ok ? '' : 'disabled'}>СОЗДАТЬ</button>`;
        if (ok) row.querySelector('.craft-btn').onclick = () => onCraft(recipe);
        list.appendChild(row);
      });
    }
  }

  function _fmtIngr(ings) {
    return ings.map(({ id, qty }) => {
      const def = ITEM_DEFS[id];
      return `${qty}× ${def ? def.name : id}`;
    }).join(' + ');
  }

  // ── Trade panel ───────────────────────────────────────────────────────────
  let _tradeHandlers = null;

  function showTradePanel(npc, player, handlers) {
    _tradeHandlers = handlers;
    const panel = document.getElementById('trade-panel');
    if (!panel) return;
    panel.classList.remove('hidden');
    _renderTrade(npc, player);
  }

  function hideTradePanel() { document.getElementById('trade-panel')?.classList.add('hidden'); }

  function refreshTradePanel(npc, player) {
    const panel = document.getElementById('trade-panel');
    if (panel && !panel.classList.contains('hidden')) _renderTrade(npc, player);
  }

  function _renderTrade(npc, player) {
    const faction = (typeof TRADERS !== 'undefined') ? TRADERS.FACTIONS[npc.faction] : null;
    document.getElementById('trade-npc-name').textContent    = npc.name;
    document.getElementById('trade-npc-faction').textContent = faction ? faction.name : '';
    document.getElementById('trade-npc-faction').style.color = faction ? faction.clr : '#aaa';
    document.getElementById('trade-greeting').textContent    = npc.greeting || '…';

    const parts = player.inventory.filter(it => it.id === 'parts').length;
    const tools = player.inventory.filter(it => it.id === 'tools').length;
    document.getElementById('trade-resources').textContent = `Детали: ${parts}  Инструменты: ${tools}`;

    const body = document.getElementById('trade-body');
    body.innerHTML = '';

    // BUY section
    if (npc.stock && Object.keys(npc.stock).length) {
      body.appendChild(_tradeSection('КУПИТЬ', Object.entries(npc.stock).map(([itemId, cost]) => {
        const def = ITEM_DEFS[itemId];
        if (!def) return null;
        const canAfford = _canAfford(player, cost);
        return _tradeRow(def.icon, def.clr, def.name, _fmtCost(cost), canAfford, 'КУПИТЬ',
          () => _tradeHandlers?.onBuy(itemId));
      }).filter(Boolean)));
    }

    // SERVICES section
    if (npc.services && Object.keys(npc.services).length) {
      body.appendChild(_tradeSection('УСЛУГИ', Object.entries(npc.services).map(([svcId, svc]) => {
        const canAfford = _canAfford(player, svc.cost);
        return _tradeRow('✦', '#a0c8f0', svc.name, _fmtCost(svc.cost), canAfford, 'ЗАКАЗАТЬ',
          () => _tradeHandlers?.onService(svcId));
      })));
    }

    // SELL section
    if (npc.buy_rate > 0 && player.inventory.length) {
      body.appendChild(_tradeSection('ПРОДАТЬ', player.inventory.map((item, idx) => {
        const cost  = npc.stock && npc.stock[item.id];
        const val   = cost ? Math.max(1, Math.floor((cost.parts || 1) * npc.buy_rate)) : 1;
        return _tradeRow(item.icon, item.clr, item.name, `+${val} Дет.`, true, 'ПРОДАТЬ',
          () => _tradeHandlers?.onSell(idx));
      })));
    }
  }

  function _tradeSection(title, rows) {
    const sec = document.createElement('div');
    const hdr = document.createElement('div');
    hdr.className = 'trade-section-title';
    hdr.textContent = title;
    sec.appendChild(hdr);
    rows.forEach(r => r && sec.appendChild(r));
    return sec;
  }

  function _tradeRow(icon, clr, name, costStr, enabled, btnLabel, onClick) {
    const row = document.createElement('div');
    row.className = 'trade-row' + (enabled ? '' : ' trade-disabled');
    row.innerHTML = `
      <span class="trade-icon" style="color:${clr || '#aaa'}">${icon}</span>
      <span class="trade-name">${name}</span>
      <span class="trade-cost">${costStr}</span>
      <button class="trade-btn" ${enabled ? '' : 'disabled'}>${btnLabel}</button>`;
    if (enabled) row.querySelector('.trade-btn').onclick = onClick;
    return row;
  }

  function _canAfford(player, cost) {
    return Object.entries(cost).every(([id, qty]) =>
      player.inventory.filter(it => it.id === id).length >= qty);
  }

  function _fmtCost(cost) {
    const N = { parts:'Дет.', tools:'Инстр.' };
    return Object.entries(cost).map(([id, qty]) => `${qty} ${N[id] || id}`).join(' + ');
  }

  // ── Save button state ─────────────────────────────────────────────────────
  function updateSaveBtn(hasSave) {
    const btn = document.getElementById('btn-save');
    if (btn) btn.title = hasSave ? 'Сохранено' : 'Нет сохранения';
  }

  // ── Death screen ──────────────────────────────────────────────────────────
  function showDeath(turn) {
    const el = document.getElementById('start-screen');
    if (!el) return;
    el.style.background = 'rgba(20,0,0,0.96)';
    const t = document.getElementById('game-title');
    if (t) { t.textContent = 'ВЫ ПОГИБЛИ'; t.style.color = '#c03020'; }
    const s = document.getElementById('game-sub');
    if (s) s.textContent = `Выжили ${turn} ходов`;
    const h = document.getElementById('start-hint');
    if (h) h.textContent = '[ НАЖМИТЕ ЛЮБУЮ КЛАВИШУ ДЛЯ РЕСТАРТА ]';
    el.style.display = 'flex';
  }

  // ── Level-up flash ─────────────────────────────────────────────────────────
  function flashLevelUp(msg) {
    const flash = document.createElement('div');
    flash.className = 'levelup-flash';
    flash.textContent = msg;
    document.getElementById('game-wrapper')?.appendChild(flash);
    setTimeout(() => flash.remove(), 2500);
  }

  return {
    log, updateStats, updateInventory,
    showPickup, hidePickup,
    showCombat, hideCombat, updateCombatHP, addCombatLog, showCombatItemMenu,
    showCraftPanel, hideCraftPanel, refreshCraftPanel,
    showTradePanel, hideTradePanel, refreshTradePanel,
    updateSaveBtn, showDeath, flashLevelUp,
  };
})();

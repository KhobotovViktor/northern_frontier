'use strict';

const SAVE = (() => {
  const KEY     = 'nf_save_v2';
  const VERSION = 2;

  // ── Serialise tiles compactly ─────────────────────────────────────────────
  function _packTiles(tiles) {
    const N = tiles.length;

    // Explored bitmask → base64
    const mask = new Uint8Array(Math.ceil(N / 8));
    for (let i = 0; i < N; i++)
      if (tiles[i].explored) mask[i >> 3] |= 1 << (i & 7);
    const exploredB64 = btoa(String.fromCharCode(...mask));

    // Sparse maps for items and enemies
    const items_map  = {};
    const enemy_map  = {};
    for (let i = 0; i < N; i++) {
      if (tiles[i].items.length)  items_map[i]  = tiles[i].items;
      if (tiles[i].enemy)         enemy_map[i]  = tiles[i].enemy;
    }

    return { exploredB64, items_map, enemy_map };
  }

  function _unpackTiles(data, tiles) {
    const N = tiles.length;

    // Explored bitmask
    const raw = atob(data.exploredB64);
    const mask = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) mask[i] = raw.charCodeAt(i);
    for (let i = 0; i < N; i++)
      tiles[i].explored = !!(mask[i >> 3] & (1 << (i & 7)));

    // Items
    for (let i = 0; i < N; i++) tiles[i].items = [];
    for (const [k, v] of Object.entries(data.items_map))
      tiles[+k].items = v;

    // Enemies
    for (let i = 0; i < N; i++) tiles[i].enemy = null;
    for (const [k, v] of Object.entries(data.enemy_map))
      tiles[+k].enemy = v;
  }

  // ── Player snapshot ───────────────────────────────────────────────────────
  function _snapPlayer(p) {
    return {
      col: p.col, row: p.row,
      hp: p.hp, max_hp: p.max_hp,
      radiation: p.radiation, cold: p.cold,
      hunger: p.hunger || 0, thirst: p.thirst || 0,
      bleed: p.bleed, stun: p.stun,
      xp: p.xp, level: p.level,
      inventory: JSON.parse(JSON.stringify(p.inventory)),
      equipped:  JSON.parse(JSON.stringify(p.equipped)),
      buff_dmg: p.buff_dmg, buff_turns: p.buff_turns,
      debuff_accuracy: p.debuff_accuracy,
    };
  }

  function _hydrateItem(item) {
    // Re-attach functions stripped by JSON serialization
    if (!item || !item.id) return item;
    const def = ITEM_DEFS[item.id];
    if (!def) return item;
    return { ...def, ...item }; // def provides use(), item provides saved state
  }

  function _restorePlayer(snap, p) {
    Object.assign(p, snap);
    // Re-hydrate inventory and equipped items (JSON strips functions)
    p.inventory = (snap.inventory || []).map(_hydrateItem);
    for (const slot of ['weapon', 'body', 'head']) {
      if (snap.equipped && snap.equipped[slot]) {
        p.equipped[slot] = _hydrateItem(snap.equipped[slot]);
      } else {
        p.equipped[slot] = null;
      }
    }
    p.recomputeStats();
  }

  // ── NPC snapshot (just positions + stock depletion) ───────────────────────
  function _snapNPCs(npcs) {
    return npcs.map(n => ({ id: n.id, col: n.col, row: n.row }));
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  function save(state) {
    const { tiles, player, camera, turn, npcs } = state;
    try {
      const blob = {
        v: VERSION,
        ts: Date.now(),
        turn,
        camera: { ...camera },
        player: _snapPlayer(player),
        tiles:  _packTiles(tiles),
        npcs:   _snapNPCs(npcs),
        quests: (typeof QUESTS !== 'undefined') ? QUESTS.toJSON() : null,
      };
      const json = JSON.stringify(blob);
      localStorage.setItem(KEY, json);
      console.log(`[SAVE] ${(json.length / 1024).toFixed(1)} KB`);
      return true;
    } catch (e) {
      console.error('[SAVE] failed:', e);
      return false;
    }
  }

  function load(tiles, player, npcs) {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const blob = JSON.parse(raw);
      if (blob.v !== VERSION) return null;

      _unpackTiles(blob.tiles, tiles);
      _restorePlayer(blob.player, player);

      // Restore NPC positions
      if (blob.npcs && npcs) {
        blob.npcs.forEach(snap => {
          const npc = npcs.find(n => n.id === snap.id &&
            HEX.distance(n.col, n.row, snap.col, snap.row) < 5);
          if (npc) { npc.col = snap.col; npc.row = snap.row; }
        });
      }

      // Restore quests
      if (blob.quests && typeof QUESTS !== 'undefined') {
        QUESTS.fromJSON(blob.quests, blob.turn);
      }

      return { turn: blob.turn, camera: blob.camera };
    } catch (e) {
      console.error('[LOAD] failed:', e);
      return null;
    }
  }

  function hasSave() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const blob = JSON.parse(raw);
      return blob.v === VERSION;
    } catch { return false; }
  }

  function getSaveInfo() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const blob = JSON.parse(raw);
      if (blob.v !== VERSION) return null;
      return {
        turn: blob.turn,
        level: blob.player?.level || 1,
        ts: new Date(blob.ts).toLocaleString('ru-RU'),
      };
    } catch { return null; }
  }

  function clear() { localStorage.removeItem(KEY); }

  return { save, load, hasSave, getSaveInfo, clear };
})();

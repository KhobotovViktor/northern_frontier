'use strict';

const QUESTS = (() => {

  // ── Quest definitions ─────────────────────────────────────────────────────
  const DEFS = [
    // Kill quests
    { id:'q_k_marauder', title:'Зачистка',        desc:'Уничтожить 3 мародёров',       type:'kill',    target:'marauder', count:3,  xp:60,  reward:['medkit'] },
    { id:'q_k_wolf',     title:'Волчья угроза',   desc:'Убить 5 волков',               type:'kill',    target:'wolf',     count:5,  xp:55,  reward:['canned_food','canned_food'] },
    { id:'q_k_robot',    title:'Металлолом',       desc:'Уничтожить 2 робота',          type:'kill',    target:'robot',    count:2,  xp:80,  reward:['tools','parts'] },
    { id:'q_k_mutant',   title:'Дезинфекция',      desc:'Убить 4 мутанта',              type:'kill',    target:'mutant',   count:4,  xp:75,  reward:['antirads','antirads'] },
    { id:'q_k_soldier',  title:'Противостояние',   desc:'Нейтрализовать 2 солдат',      type:'kill',    target:'soldier',  count:2,  xp:90,  reward:['bulletproof'] },
    { id:'q_k_bear',     title:'Охота',            desc:'Убить медведя',                type:'kill',    target:'bear',     count:1,  xp:70,  reward:['medkit','canned_food'] },
    // Explore quests
    { id:'q_r_factory',  title:'Разведка: Завод',  desc:'Найти Завод №3',               type:'reach',   target:'factory',  count:1,  xp:70,  reward:['tools','tools'] },
    { id:'q_r_hospital', title:'Медпункт',         desc:'Найти Полевой госпиталь',      type:'reach',   target:'hospital', count:1,  xp:65,  reward:['medkit','medkit'] },
    { id:'q_r_base',     title:'Военный объект',   desc:'Разведать Военную базу',       type:'reach',   target:'mil_base', count:1,  xp:100, reward:['assault_rifle'] },
    { id:'q_r_village',  title:'Деревня',          desc:'Найти деревню Кедрово',        type:'reach',   target:'village',  count:1,  xp:55,  reward:['canned_food','vodka'] },
    { id:'q_r_lab',      title:'Секретный объект', desc:'Найти объект «Лазурь»',        type:'reach',   target:'lab',      count:1,  xp:90,  reward:['gasmask','stimpak'] },
    // Collect quests
    { id:'q_c_parts',    title:'Снабжение',        desc:'Иметь при себе 5 деталей',     type:'collect', target:'parts',    count:5,  xp:40,  reward:['tools'] },
    { id:'q_c_tools',    title:'Инструментарий',   desc:'Найти 3 набора инструментов',  type:'collect', target:'tools',    count:3,  xp:45,  reward:['parts','parts'] },
    { id:'q_c_food',     title:'Продовольствие',   desc:'Собрать 4 единицы еды',        type:'collect', target:'canned_food', count:4, xp:35, reward:['medkit'] },
    // Survive quests
    { id:'q_s_20',       title:'Выживание',        desc:'Прожить ещё 20 ходов',         type:'survive', count:20, xp:35,  reward:['canned_food','thermos'] },
    { id:'q_s_50',       title:'Закалённый',       desc:'Прожить ещё 50 ходов',         type:'survive', count:50, xp:80,  reward:['stimpak'] },
    { id:'q_s_100',      title:'Ветеран зоны',     desc:'Прожить ещё 100 ходов',        type:'survive', count:100,xp:150, reward:['bulletproof','stimpak'] },
  ];

  let _active    = [];
  let _completed = [];
  let _startTurn = 0;

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _addRandom() {
    const available = DEFS.filter(d =>
      !_active.find(q => q.defId === d.id) &&
      !_completed.includes(d.id)
    );
    if (!available.length) return;
    const def = available[Math.floor(Math.random() * available.length)];
    _active.push({ defId: def.id, progress: 0, startTurn: _startTurn });
  }

  function _def(id) { return DEFS.find(d => d.id === id); }

  // Returns array of completed quest objects (for reward processing)
  function _checkComplete() {
    const done = [];
    _active = _active.filter(q => {
      const def = _def(q.defId);
      if (!def) return false;
      if (q.progress >= def.count) {
        done.push({ ...def, progress: q.progress });
        _completed.push(q.defId);
        return false;
      }
      return true;
    });
    // Replace completed quests
    done.forEach(() => _addRandom());
    return done;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(turn) {
    _startTurn = turn;
    _active    = [];
    _completed = [];
    _addRandom();
    _addRandom();
    _addRandom();
  }

  // Call on enemy kill; returns array of completed quests
  function onKill(enemyId) {
    _active.forEach(q => {
      const def = _def(q.defId);
      if (def && def.type === 'kill' && def.target === enemyId) q.progress++;
    });
    return _checkComplete();
  }

  // Call on reaching a named location; returns array of completed quests
  function onReach(locationId) {
    _active.forEach(q => {
      const def = _def(q.defId);
      if (def && def.type === 'reach' && def.target === locationId) q.progress = 1;
    });
    return _checkComplete();
  }

  // Call each turn to update time/collect progress; returns completed quests
  function tick(turn, player) {
    _active.forEach(q => {
      const def = _def(q.defId);
      if (!def) return;
      if (def.type === 'survive') q.progress = turn - q.startTurn;
      if (def.type === 'collect') q.progress = player.inventory.filter(it => it.id === def.target).length;
    });
    return _checkComplete();
  }

  // Expose active quests as rich objects with def merged in
  function getActive() {
    return _active.map(q => {
      const def = _def(q.defId);
      return def ? { ...def, progress: q.progress } : null;
    }).filter(Boolean);
  }

  // Save/restore
  function toJSON() {
    return { active: _active.map(q => ({ ...q })), completed: [..._completed], startTurn: _startTurn };
  }

  function fromJSON(data, turn) {
    _completed = data.completed || [];
    _startTurn = data.startTurn || turn;
    _active    = (data.active || []).filter(q => !!_def(q.defId));
    // Ensure minimum 2-3 active quests
    while (_active.length < 2) _addRandom();
  }

  return { init, onKill, onReach, tick, getActive, toJSON, fromJSON };
})();

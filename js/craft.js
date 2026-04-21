'use strict';

const CRAFT = (() => {

  // ── Recipes ─────────────────────────────────────────────────────────────────
  // ingredients: [{id, qty}]  — items consumed
  // result_id: key in ITEM_DEFS
  const RECIPES = [
    {
      id:'r_bandage', name:'Бинт',
      result_id:'bandage', qty:1,
      ingredients:[{ id:'parts', qty:1 }],
      desc:'Быстрая перевязка. +10 HP.',
      category:'consumable',
    },
    {
      id:'r_medkit', name:'Аптечка',
      result_id:'medkit', qty:1,
      ingredients:[{ id:'parts', qty:3 }],
      desc:'Восстанавливает 35 HP.',
      category:'consumable',
    },
    {
      id:'r_antirads', name:'Антирады',
      result_id:'antirads', qty:1,
      ingredients:[{ id:'parts', qty:2 }],
      desc:'Снижает радиацию на 30.',
      category:'consumable',
    },
    {
      id:'r_thermos', name:'Термос',
      result_id:'thermos', qty:1,
      ingredients:[{ id:'parts', qty:2 }],
      desc:'Снижает холод на 20.',
      category:'consumable',
    },
    {
      id:'r_molotov', name:'Коктейль Молотова',
      result_id:'molotov', qty:1,
      ingredients:[{ id:'parts', qty:1 }, { id:'vodka', qty:1 }],
      desc:'Бросаемое оружие. Урон 25–40.',
      category:'weapon',
    },
    {
      id:'r_crowbar_plus', name:'Монтировка+',
      result_id:'crowbar_plus', qty:1,
      ingredients:[{ id:'crowbar', qty:1 }, { id:'parts', qty:2 }, { id:'tools', qty:1 }],
      desc:'Улучшенная монтировка. Урон 14–22.',
      category:'weapon',
    },
    {
      id:'r_pistol_plus', name:'ТТ-55 Mod.',
      result_id:'pistol_plus', qty:1,
      ingredients:[{ id:'pistol', qty:1 }, { id:'parts', qty:3 }, { id:'tools', qty:1 }],
      desc:'Улучшенный пистолет. Урон 18–28.',
      category:'weapon',
    },
    {
      id:'r_light_armor', name:'Лёгкий бронежилет',
      result_id:'light_armor', qty:1,
      ingredients:[{ id:'parts', qty:4 }, { id:'tools', qty:1 }],
      desc:'Самодельная броня. +6 брони.',
      category:'armor',
    },
    {
      id:'r_winter_plus', name:'Полушубок+',
      result_id:'winter_coat_plus', qty:1,
      ingredients:[{ id:'winter_coat', qty:1 }, { id:'parts', qty:2 }, { id:'tools', qty:1 }],
      desc:'Утеплённый полушубок. +4 брони, −35 холода.',
      category:'armor',
    },
    {
      id:'r_stimpak', name:'Стимулятор',
      result_id:'stimpak', qty:1,
      ingredients:[{ id:'parts', qty:3 }, { id:'tools', qty:1 }],
      desc:'+50 HP, +2 урона на 5 ходов.',
      category:'consumable',
    },
  ];

  // ── Helpers ─────────────────────────────────────────────────────────────────

  // Count how many copies of item `id` are in inventory
  function _count(inventory, id) {
    return inventory.filter(it => it.id === id).length;
  }

  function canCraft(recipe, player) {
    if (player.inventory.length + recipe.qty > CFG.MAX_INVENTORY) return false;
    return recipe.ingredients.every(({ id, qty }) => _count(player.inventory, id) >= qty);
  }

  // Returns result item or null on failure
  function doCraft(recipe, player) {
    if (!canCraft(recipe, player)) return null;

    // Remove ingredients
    for (const { id, qty } of recipe.ingredients) {
      let removed = 0;
      while (removed < qty) {
        const idx = player.inventory.findIndex(it => it.id === id);
        if (idx < 0) return null; // shouldn't happen after canCraft check
        player.inventory.splice(idx, 1);
        removed++;
      }
    }

    // Add result
    const def = ITEM_DEFS[recipe.result_id];
    if (!def) return null;
    const item = { ...def };
    player.addItem(item);
    return item;
  }

  // Missing ingredients summary for tooltip
  function missing(recipe, player) {
    return recipe.ingredients
      .filter(({ id, qty }) => _count(player.inventory, id) < qty)
      .map(({ id, qty }) => {
        const have = _count(player.inventory, id);
        const def  = ITEM_DEFS[id];
        return `${def ? def.name : id} (${have}/${qty})`;
      });
  }

  return { RECIPES, canCraft, doCraft, missing };
})();

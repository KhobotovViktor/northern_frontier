'use strict';

const CFG = {
  MAP_COLS: 300,
  MAP_ROWS: 220,
  HEX_SIZE: 36,
  MAP_SEED: 1955,
  VISION_RANGE: 4,
  START_COL: 150,
  START_ROW: 110,
  MAX_INVENTORY: 10,
  MAX_LOG: 60,
  BIOME: {
    FOREST:'forest', SWAMP:'swamp', WATER:'water', RUINS:'ruins',
    IRRADIATED:'irradiated', SNOW:'snow', PLAIN:'plain',
    MOUNTAIN:'mountain', BUNKER:'bunker',
  },
  WEATHER_MIN_DUR: 12,
  WEATHER_MAX_DUR: 28,
};

// ── Weather types ─────────────────────────────────────────────────────────────
const WEATHER_TYPES = {
  clear:     { name:'Ясно',        icon:'☀', cold_mod:0, rad_mod:0, vis_mod:0,  weight:28 },
  overcast:  { name:'Пасмурно',    icon:'☁', cold_mod:1, rad_mod:0, vis_mod:0,  weight:22 },
  blizzard:  { name:'Метель',      icon:'❄', cold_mod:4, rad_mod:0, vis_mod:-1, weight:14 },
  fog:       { name:'Туман',       icon:'≋', cold_mod:1, rad_mod:0, vis_mod:-2, weight:16 },
  acid_rain: { name:'Кисл.дождь', icon:'☂', cold_mod:0, rad_mod:3, vis_mod:-1, weight:12 },
  rad_storm: { name:'Рад.шторм',  icon:'☢', cold_mod:0, rad_mod:7, vis_mod:-2, weight:8  },
};

// ── Named locations ───────────────────────────────────────────────────────────
const NAMED_LOCS = [
  { id:'factory',    name:'Завод №3',              biome:'ruins',      col_frac:0.28, row_frac:0.38, loot:['tools','parts','crowbar','pistol'],      note_id:'note_2' },
  { id:'hospital',   name:'Полевой госпиталь',     biome:'plain',      col_frac:0.72, row_frac:0.32, loot:['medkit','antirads','stimpak'],           note_id:'note_3' },
  { id:'mil_base',   name:'Военная база',           biome:'plain',      col_frac:0.55, row_frac:0.68, loot:['bulletproof','assault_rifle','medkit'],  note_id:'note_7' },
  { id:'village',    name:'Деревня Кедрово',        biome:'plain',      col_frac:0.18, row_frac:0.58, loot:['canned_food','vodka','thermos','water'], note_id:'note_4' },
  { id:'rad_pit',    name:'Радиационная воронка',   biome:'irradiated', col_frac:0.82, row_frac:0.52, loot:['hazmat','stimpak','antirads'],           note_id:'note_5' },
  { id:'lab',        name:'Объект «Лазурь»',        biome:'ruins',      col_frac:0.62, row_frac:0.22, loot:['gasmask','stimpak','parts','tools'],     note_id:'note_6' },
  { id:'outpost',    name:'Пограничный пост №11',   biome:'snow',       col_frac:0.42, row_frac:0.14, loot:['winter_coat','medkit','shotgun'],        note_id:'note_8' },
  { id:'bog_sta',    name:'Болотная станция',        biome:'swamp',      col_frac:0.24, row_frac:0.74, loot:['antirads','tools','parts'],             note_id:'note_1' },
  { id:'mountain_p', name:'Горный перевал',          biome:'mountain',   col_frac:0.76, row_frac:0.76, loot:['tools','parts','assault_rifle'],        note_id:null     },
];

// ── Item definitions ─────────────────────────────────────────────────────────
const ITEM_DEFS = {
  medkit: {
    id:'medkit', name:'Аптечка', type:'consumable', icon:'✛', clr:'#d84040',
    desc:'Восстанавливает 35 HP.',
    use(p){ const h=Math.min(35,p.max_hp-p.hp); p.hp+=h; return `Аптечка: +${h} HP`; }
  },
  antirads: {
    id:'antirads', name:'Антирады', type:'consumable', icon:'☢', clr:'#40d0a0',
    desc:'Снижает радиацию на 30.',
    use(p){ const r=Math.min(30,p.radiation); p.radiation-=r; return `Антирады: -${r} RAD`; }
  },
  canned_food: {
    id:'canned_food', name:'Тушёнка', type:'consumable', icon:'⊞', clr:'#c07838',
    desc:'Восстанавливает 20 HP, −30 голода.',
    use(p){ const h=Math.min(20,p.max_hp-p.hp); p.hp+=h; p.hunger=Math.max(0,(p.hunger||0)-30); return `Тушёнка: +${h} HP, -30 Голод`; }
  },
  thermos: {
    id:'thermos', name:'Термос', type:'consumable', icon:'◈', clr:'#7878c8',
    desc:'Снижает холод на 20, −40 жажды.',
    use(p){ const c=Math.min(20,p.cold); p.cold-=c; p.thirst=Math.max(0,(p.thirst||0)-40); return `Горячий чай: -${c} COLD, -40 Жажда`; }
  },
  vodka: {
    id:'vodka', name:'Водка', type:'consumable', icon:'◇', clr:'#a8d0f0',
    desc:'+10 HP, −10 COLD, −20 жажды.',
    use(p){ const h=Math.min(10,p.max_hp-p.hp); p.hp+=h; p.cold=Math.max(0,p.cold-10); p.thirst=Math.max(0,(p.thirst||0)-20); return `Водка: +${h} HP, -10 COLD, -20 Жажда`; }
  },
  water: {
    id:'water', name:'Вода', type:'consumable', icon:'≈', clr:'#60b8e0',
    desc:'Утоляет жажду на 50.',
    use(p){ p.thirst=Math.max(0,(p.thirst||0)-50); return 'Вода: -50 Жажда'; }
  },
  stimpak: {
    id:'stimpak', name:'Стимулятор', type:'consumable', icon:'⚕', clr:'#f0e040',
    desc:'+50 HP, +2 урон на 5 ходов.',
    use(p){ const h=Math.min(50,p.max_hp-p.hp); p.hp+=h; p.buff_dmg=(p.buff_dmg||0)+2; p.buff_turns=(p.buff_turns||0)+5; return `Стимулятор: +${h} HP, +2 ATK × 5 ходов`; }
  },
  crowbar: {
    id:'crowbar', name:'Монтировка', type:'weapon', icon:'/', clr:'#b0b0b0',
    desc:'Ближний бой. Урон 8–14.', damage:[8,14], range:1, slot:'weapon'
  },
  knife: {
    id:'knife', name:'Нож НР-40', type:'weapon', icon:'†', clr:'#d0d0d0',
    desc:'Нож. Урон 5–10.', damage:[5,10], range:1, slot:'weapon'
  },
  pistol: {
    id:'pistol', name:'ТТ-55', type:'weapon', icon:'⌐', clr:'#c0a050',
    desc:'Пистолет. Урон 12–20.', damage:[12,20], range:2, slot:'weapon'
  },
  shotgun: {
    id:'shotgun', name:'Дробовик', type:'weapon', icon:'⊣', clr:'#a05828',
    desc:'Дробовик. Урон 22–38.', damage:[22,38], range:1, slot:'weapon'
  },
  assault_rifle: {
    id:'assault_rifle', name:'АК-Р', type:'weapon', icon:'≡', clr:'#787858',
    desc:'Штурмовая винтовка. Урон 18–28.', damage:[18,28], range:3, slot:'weapon'
  },
  // ── Craftable ────────────────────────────────────────────────────────────
  bandage: {
    id:'bandage', name:'Бинт', type:'consumable', icon:'†', clr:'#e8c890',
    desc:'+10 HP.',
    use(p){ const h=Math.min(10,p.max_hp-p.hp); p.hp+=h; return `Бинт: +${h} HP`; }
  },
  molotov: {
    id:'molotov', name:'Коктейль Молотова', type:'weapon', icon:'!', clr:'#e86820',
    desc:'Урон 25–40.', damage:[25,40], range:2, slot:'weapon'
  },
  crowbar_plus: {
    id:'crowbar_plus', name:'Монтировка+', type:'weapon', icon:'/', clr:'#d4c040',
    desc:'Улучшенная. Урон 14–22.', damage:[14,22], range:1, slot:'weapon'
  },
  pistol_plus: {
    id:'pistol_plus', name:'ТТ-55 Mod.', type:'weapon', icon:'⌐', clr:'#d4b840',
    desc:'Улучшенный. Урон 18–28.', damage:[18,28], range:2, slot:'weapon'
  },
  light_armor: {
    id:'light_armor', name:'Лёгкий бронежилет', type:'armor', icon:'▣', clr:'#608878',
    desc:'+6 брони.', armor:6, slot:'body'
  },
  winter_coat_plus: {
    id:'winter_coat_plus', name:'Полушубок+', type:'armor', icon:'◩', clr:'#906868',
    desc:'+4 броня, −35 COLD.', armor:4, cold_res:35, slot:'body'
  },
  vatnik: {
    id:'vatnik', name:'Ватник', type:'armor', icon:'◧', clr:'#806040',
    desc:'+3 броня, −15 COLD.', armor:3, cold_res:15, slot:'body'
  },
  winter_coat: {
    id:'winter_coat', name:'Полушубок', type:'armor', icon:'◩', clr:'#806858',
    desc:'+2 броня, −25 COLD.', armor:2, cold_res:25, slot:'body'
  },
  gasmask: {
    id:'gasmask', name:'Противогаз', type:'armor', icon:'◉', clr:'#406060',
    desc:'+1 броня, +20 рад.защита.', armor:1, rad_res:20, slot:'head'
  },
  bulletproof: {
    id:'bulletproof', name:'Бронежилет', type:'armor', icon:'▣', clr:'#405060',
    desc:'+12 брони.', armor:12, slot:'body'
  },
  hazmat: {
    id:'hazmat', name:'ОЗК', type:'armor', icon:'⊙', clr:'#508048',
    desc:'+4 броня, +35 рад., −5 COLD.', armor:4, rad_res:35, cold_res:5, slot:'body'
  },
  tools: {
    id:'tools', name:'Инструменты', type:'misc', icon:'⚙', clr:'#c0c080',
    desc:'Нужны для крафта.'
  },
  parts: {
    id:'parts', name:'Детали', type:'misc', icon:'⊕', clr:'#80c0c0',
    desc:'Запасные части.'
  },
  map_fragment: {
    id:'map_fragment', name:'Карта района', type:'misc', icon:'▦', clr:'#d4b870',
    desc:'Открывает туман войны (r=10).',
    use(p, game){ game.revealArea(p.col, p.row, 10); return 'Карта изучена — область разведана!'; }
  },
  // ── Lore notes ────────────────────────────────────────────────────────────
  note_1: {
    id:'note_1', name:'Записка', type:'misc', icon:'▤', clr:'#d0c880', desc:'Пожелтевшая бумага.',
    noteText:'БОЛОТНАЯ СТАНЦИЯ. Запись техника Лазаренко.\n\nВода здесь — яд. Фильтры вышли из строя неделю назад. Радиация просочилась в грунтовые воды.\n\nОстались только запасы в красном ящике у восточной стены. Экономлю.\n\nЕсли найдёшь это — не пей воду из болота. Никогда.',
    use(){ return { note:true, noteText:this.noteText, msg:'Записка прочитана.' }; }
  },
  note_2: {
    id:'note_2', name:'Записка', type:'misc', icon:'▤', clr:'#d0c880', desc:'Замасленная бумага.',
    noteText:'ЗАВОД №3. Распоряжение администрации.\n\nВсем рабочим: сектор Г и цех литья закрыты до особого распоряжения.\n\nАктивирована охрана серии «Жестяной Иван-7» в связи с угрозой мародёров. Не приближаться к роботам без пропуска.\n\nЭвакуационный выход — через котельную, путь на юг.\n\n— Директор Завода, октябрь 1958',
    use(){ return { note:true, noteText:this.noteText, msg:'Записка прочитана.' }; }
  },
  note_3: {
    id:'note_3', name:'Записка', type:'misc', icon:'▤', clr:'#d0c880', desc:'Листок из блокнота.',
    noteText:'ПОЛЕВОЙ ГОСПИТАЛЬ. Дневник главврача, запись 41.\n\nПриняли ещё восьмерых с радиационными ожогами. Антирады закончились три дня назад. Морфий — на исходе.\n\nЕсли кто-то читает это — умоляем, принесите медикаменты. Мы платим деталями и информацией.\n\nЛюди умирают. У нас нет времени.\n\n— Доктор Светлова',
    use(){ return { note:true, noteText:this.noteText, msg:'Записка прочитана.' }; }
  },
  note_4: {
    id:'note_4', name:'Записка', type:'misc', icon:'▤', clr:'#d0c880', desc:'Истрёпанная бумага.',
    noteText:'ДЕРЕВНЯ КЕДРОВО. Объявление старейшины.\n\nВольные торговцы принимают медикаменты, инструменты и оружие.\n\nВзамен: еда, одежда, карты, информация о безопасных маршрутах.\n\nСледующий обмен — у старой мельницы на востоке. Приходите с добром, уходите живыми.\n\nПередайте своим.',
    use(){ return { note:true, noteText:this.noteText, msg:'Записка прочитана.' }; }
  },
  note_5: {
    id:'note_5', name:'Записка', type:'misc', icon:'▤', clr:'#d0c880', desc:'Обожжённая бумага.',
    noteText:'ВОРОНКА Ч-4. Служебная записка.\n\nУровень радиации: 12 бэр/час. Критический.\n\nЭкспедиция 5 человек: 1 вернулся. Двое пропали. Двое не смогли.\n\nОбнаружены артефакты синтеза. Ценность — высокая.\n\nОЗК обязателен. Максимальное время нахождения: 20 минут. Нарушивший приказ несёт ответственность.',
    use(){ return { note:true, noteText:this.noteText, msg:'Записка прочитана.' }; }
  },
  note_6: {
    id:'note_6', name:'Записка', type:'misc', icon:'▤', clr:'#d0c880', desc:'Листок с печатью.',
    noteText:'ОБЪЕКТ «ЛАЗУРЬ». СЕКРЕТНО.\n\nПроект нейро-адаптивных препаратов, фаза 3.\n\nСтимулятор серии С-7 увеличивает боевую эффективность личного состава на 40%. Побочные эффекты — в приложении 12-Б (гриф: совсекретно).\n\nВсе образцы — в сейфе лаборатории Б. Код: 1958.\n\nПри угрозе захвата объекта — уничтожить.',
    use(){ return { note:true, noteText:this.noteText, msg:'Записка прочитана.' }; }
  },
  note_7: {
    id:'note_7', name:'Записка', type:'misc', icon:'▤', clr:'#d0c880', desc:'Военный блокнот.',
    noteText:'ВОЕННАЯ БАЗА «КРЕЧЕТ». Запись 88.\n\nСвязь с командованием потеряна 19 дней назад. Ждём.\n\nЛичный состав: 12 человек. Боеспособны: 7.\n\nМародёры атакуют периметр каждую ночь. Патроны на исходе. Держимся.\n\n— Капитан Родин\n\nP.S. Если мы не выживем — возьмите броники из склада. Нам уже не понадобятся.',
    use(){ return { note:true, noteText:this.noteText, msg:'Записка прочитана.' }; }
  },
  note_8: {
    id:'note_8', name:'Записка', type:'misc', icon:'▤', clr:'#d0c880', desc:'Бумага в пластиковом пакете.',
    noteText:'ПОГРАНИЧНЫЙ ПОСТ №11. Последняя запись рядового Петрова.\n\nОни пришли с севера в 03:40. Мы думали — люди. Это не люди. Или уже не совсем.\n\nМы стреляли. Они не останавливались.\n\nЕсли найдёшь это — иди на юг. Не иди на север. Я не знаю, что там произошло.\n\nНо это ещё не кончилось.',
    use(){ return { note:true, noteText:this.noteText, msg:'Записка прочитана.' }; }
  },
};

// ── Enemy definitions ─────────────────────────────────────────────────────────
const ENEMY_DEFS = {
  marauder: {
    id:'marauder', name:'Мародёр', clr:PAL.MARAUDER,
    hp:30, armor:2, damage:[5,12], attack:8,
    vision:4, biomes:['ruins','plain'],
    loot:['medkit','knife','canned_food','pistol'], loot_chance:0.55, xp:15,
  },
  wolf: {
    id:'wolf', name:'Волк', clr:PAL.WOLF,
    hp:22, armor:0, damage:[6,14], attack:10,
    vision:5, biomes:['forest','snow','plain'],
    loot:['canned_food'], loot_chance:0.25, xp:10, special:'bleed',
  },
  robot: {
    id:'robot', name:'Жестяной Иван', clr:PAL.ROBOT,
    hp:55, armor:9, damage:[10,18], attack:12,
    vision:3, biomes:['ruins','irradiated'],
    loot:['parts','tools'], loot_chance:0.7, xp:30, special:'stun',
  },
  mutant: {
    id:'mutant', name:'Мутант', clr:PAL.MUTANT,
    hp:42, armor:3, damage:[12,22], attack:14,
    vision:4, biomes:['swamp','irradiated'],
    loot:['antirads','parts'], loot_chance:0.5, xp:25, special:'irradiate',
  },
  soldier: {
    id:'soldier', name:'Солдат', clr:PAL.SOLDIER,
    hp:50, armor:7, damage:[14,24], attack:16,
    vision:5, biomes:['plain','ruins','snow'],
    loot:['bulletproof','pistol','medkit','canned_food'], loot_chance:0.65, xp:35,
  },
  bear: {
    id:'bear', name:'Медведь', clr:PAL.BEAR,
    hp:75, armor:4, damage:[18,30], attack:18,
    vision:3, biomes:['forest','mountain'],
    loot:['canned_food'], loot_chance:0.2, xp:40, special:'bleed',
  },
};

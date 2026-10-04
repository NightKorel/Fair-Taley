// 存活模擬：物品（第一步：物品清單、預設物品、跟吃喝穿睡接起來）
// 物品只記客觀數字（數量、每單位重量、長寬高、標籤、類型數值），搬不搬得動、夠不夠吃由網頁算。

const ITEM_TAGS = ['可燃', '耐熱', '怕潮', '潮濕', '易腐', '易碎', '導電'];
const ITEM_TYPES = ['食物', '飲水', '衣物', '寢具', '火源', '燃料', '光源', '工具', '醫療', '容器'];
const KCAL_PER_HUNGER = 67; // 飢餓 1 點約 67 大卡
const ML_PER_THIRST = 40;   // 口渴 1 點約 40 毫升

// 預設物品（同時當作給 AI 的參考點）。數值來源見 設計文件/研究_AI角色與記憶.txt
// t：類型。食物 kcal＝每單位大卡；飲水 clean＝乾不乾淨；衣物 min/max＝保暖度；寢具 comfort＝舒適度、warm＝蓋著的保暖度
const PRESET_ITEMS = [
  // 食物（熱量參考 USDA 等營養資料）
  { name: '白飯', unit: '碗', w: 0.2, size: [12, 12, 6], tags: ['易腐'], t: { 食物: { kcal: 205 } } },
  { name: '饅頭', unit: '個', w: 0.1, size: [9, 9, 6], tags: ['易腐'], t: { 食物: { kcal: 220 } } },
  { name: '麵包', unit: '個', w: 0.1, size: [15, 8, 6], tags: ['易腐', '怕潮'], t: { 食物: { kcal: 265 } } },
  { name: '硬餅乾', unit: '塊', w: 0.025, size: [8, 8, 1], tags: ['怕潮'], t: { 食物: { kcal: 100 } } },
  { name: '肉乾', unit: '包', w: 0.1, size: [15, 10, 2], tags: [], t: { 食物: { kcal: 410 } } },
  { name: '肉罐頭', unit: '罐', w: 0.4, size: [8, 8, 11], tags: [], t: { 食物: { kcal: 400 } } },
  { name: '蘋果', unit: '顆', w: 0.18, size: [8, 8, 8], tags: ['易腐'], t: { 食物: { kcal: 95 } } },
  { name: '雞蛋', unit: '顆', w: 0.05, size: [4, 4, 6], tags: ['易腐', '易碎'], t: { 食物: { kcal: 72 } } },
  { name: '生米', unit: '公斤', w: 1, size: [20, 12, 8], tags: ['怕潮'], t: { 食物: { kcal: 3600 } }, note: '要煮熟才能吃' },
  // 飲水（數量用毫升）
  { name: '清水', unit: '毫升', w: 0.001, size: [0, 0, 0], tags: [], t: { 飲水: { clean: true } } },
  { name: '河水', unit: '毫升', w: 0.001, size: [0, 0, 0], tags: [], t: { 飲水: { clean: false } }, note: '沒煮過直接喝可能拉肚子' },
  // 衣物（保暖度＝能抵幾度；1 clo 約 7 度，下限約上限的六成）
  { name: '內衣褲', unit: '套', w: 0.15, size: [20, 15, 3], tags: ['可燃'], t: { 衣物: { min: 0.4, max: 0.7 } } },
  { name: '短袖上衣', unit: '件', w: 0.15, size: [25, 20, 2], tags: ['可燃'], t: { 衣物: { min: 0.8, max: 1.4 } } },
  { name: '長袖上衣', unit: '件', w: 0.25, size: [30, 25, 3], tags: ['可燃'], t: { 衣物: { min: 1.1, max: 1.8 } } },
  { name: '短褲', unit: '件', w: 0.2, size: [25, 20, 2], tags: ['可燃'], t: { 衣物: { min: 0.3, max: 0.5 } } },
  { name: '長褲', unit: '件', w: 0.5, size: [35, 25, 3], tags: ['可燃'], t: { 衣物: { min: 1.1, max: 1.8 } } },
  { name: '毛衣', unit: '件', w: 0.5, size: [30, 25, 5], tags: ['可燃'], t: { 衣物: { min: 1.3, max: 2.1 } } },
  { name: '薄外套', unit: '件', w: 0.6, size: [35, 30, 4], tags: ['可燃'], t: { 衣物: { min: 1.5, max: 2.5 } } },
  { name: '厚大衣', unit: '件', w: 2, size: [45, 35, 10], tags: ['可燃'], t: { 衣物: { min: 2.5, max: 4.5 } } },
  { name: '羽絨外套', unit: '件', w: 0.8, size: [40, 30, 12], tags: ['可燃', '怕潮'], t: { 衣物: { min: 3, max: 6 } } },
  { name: '毛帽', unit: '頂', w: 0.08, size: [20, 15, 3], tags: ['可燃'], t: { 衣物: { min: 0.2, max: 0.4 } } },
  { name: '手套', unit: '雙', w: 0.1, size: [20, 10, 3], tags: ['可燃'], t: { 衣物: { min: 0.2, max: 0.4 } } },
  { name: '斗篷', unit: '件', w: 1.5, size: [40, 30, 8], tags: ['可燃'], t: { 衣物: { min: 1, max: 3.5 }, 寢具: { comfort: 0, warm: 6 } } },
  // 寢具（舒適度：地面 1、草堆 3、睡袋 5、普通床 7、好床 9；保暖度＝蓋著能抵幾度）
  { name: '草蓆', unit: '張', w: 1, size: [60, 15, 15], tags: ['可燃'], t: { 寢具: { comfort: 2, warm: 0 } } },
  { name: '睡墊', unit: '張', w: 0.6, size: [60, 15, 15], tags: [], t: { 寢具: { comfort: 4, warm: 0 } } },
  { name: '睡袋', unit: '個', w: 1.5, size: [40, 25, 25], tags: ['可燃', '怕潮'], t: { 寢具: { comfort: 5, warm: 20 } } },
  { name: '薄毯', unit: '條', w: 1, size: [40, 30, 8], tags: ['可燃'], t: { 寢具: { comfort: 0.5, warm: 5 } } },
  { name: '羊毛毯', unit: '條', w: 2, size: [50, 35, 12], tags: ['可燃'], t: { 寢具: { comfort: 0.5, warm: 8 } } },
  { name: '棉被', unit: '條', w: 2, size: [60, 45, 20], tags: ['可燃', '怕潮'], t: { 寢具: { comfort: 0.5, warm: 10 } } },
  { name: '厚棉被', unit: '條', w: 3.5, size: [70, 50, 30], tags: ['可燃', '怕潮'], t: { 寢具: { comfort: 0.5, warm: 17 } } },
  // 工具與其他（第二步再補容器和工具的數值）
  { name: '小刀', unit: '把', w: 0.15, size: [20, 3, 2], tags: [], t: { 工具: {} } },
  { name: '斧頭', unit: '把', w: 1.5, size: [60, 18, 4], tags: [], t: { 工具: {} } },
  { name: '火柴', unit: '盒', w: 0.02, size: [5, 3, 1.5], tags: ['可燃', '怕潮'], t: { 火源: {} } },
  { name: '打火石', unit: '組', w: 0.05, size: [8, 3, 1], tags: [], t: { 火源: {} } },
  { name: '蠟燭', unit: '根', w: 0.1, size: [15, 2, 2], tags: ['可燃'], t: { 光源: {} } },
  { name: '油燈', unit: '盞', w: 0.5, size: [12, 12, 25], tags: ['易碎'], t: { 光源: {} } },
  { name: '木柴', unit: '公斤', w: 1, size: [40, 10, 10], tags: ['可燃'], t: { 燃料: {} } },
  { name: '繩子', unit: '捆（10 公尺）', w: 0.5, size: [20, 20, 5], tags: ['可燃'], t: { 工具: {} } },
  { name: '繃帶', unit: '捲', w: 0.05, size: [8, 5, 5], tags: ['可燃'], t: { 醫療: {} } },
  // 容器（inner＝內部長寬高公分；soft＝軟容器；leak＝防漏能裝液體；water＝防水；carry＝攜帶方式）
  { name: '水壺', unit: '個', w: 0.3, size: [8, 8, 25], tags: [], t: { 容器: { inner: [7, 7, 21], soft: false, leak: true, water: true, carry: '掛身' } } },
  { name: '皮水袋', unit: '個', w: 0.25, size: [25, 15, 6], tags: [], t: { 容器: { inner: [24, 14, 6], soft: true, leak: true, water: true, carry: '掛身' } } },
  { name: '水桶', unit: '個', w: 1.2, size: [28, 28, 28], tags: [], t: { 容器: { inner: [26, 26, 26], soft: false, leak: true, water: true, carry: '手提' } } },
  { name: '背包', unit: '個', w: 1, size: [50, 30, 20], tags: [], t: { 容器: { inner: [45, 28, 18], soft: true, leak: false, water: false, carry: '背負' } } },
  { name: '腰包', unit: '個', w: 0.2, size: [20, 12, 8], tags: [], t: { 容器: { inner: [18, 10, 7], soft: true, leak: false, water: false, carry: '掛身' } } },
  { name: '布袋', unit: '個', w: 0.2, size: [40, 30, 2], tags: ['可燃'], t: { 容器: { inner: [38, 28, 25], soft: true, leak: false, water: false, carry: '手提' } } },
  { name: '竹籃', unit: '個', w: 0.6, size: [35, 25, 20], tags: ['可燃'], t: { 容器: { inner: [32, 22, 18], soft: false, leak: false, water: false, carry: '手提' } } },
  { name: '背簍', unit: '個', w: 1.5, size: [40, 35, 55], tags: ['可燃'], t: { 容器: { inner: [36, 31, 50], soft: false, leak: false, water: false, carry: '背負' } } },
  { name: '木箱', unit: '個', w: 4, size: [50, 35, 35], tags: ['可燃'], t: { 容器: { inner: [46, 31, 31], soft: false, leak: false, water: false, carry: '抱持' } } },
  { name: '蠟布包', unit: '個', w: 0.3, size: [35, 25, 10], tags: [], t: { 容器: { inner: [33, 23, 10], soft: true, leak: false, water: true, carry: '手提' } } },
];

const DEFAULT_WEAR = '內衣褲\n長袖上衣\n長褲';
const DEFAULT_CARRY = '清水 750\n麵包 2\n小刀 1\n水壺 1';

let turnUse = [];  // 這回合用掉：{ id, qty }
let turnGain = []; // 這回合獲得：物品
let turnWear = []; // 這回合穿脫：{ id, on }
let turnPut = [];  // 這回合放進容器：{ item: 名稱, box: 容器名稱或「隨身」}
let editingId = null;

function newId() { return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function findPreset(name) {
  name = String(name || '').trim();
  return PRESET_ITEMS.find(p => p.name === name) || PRESET_ITEMS.find(p => name && (name.includes(p.name) || p.name.includes(name)));
}
function makeItem(src, qty, extra = {}) {
  return {
    id: newId(), name: src.name, qty: qty, unit: src.unit || '個', w: src.w || 0,
    size: (src.size || [0, 0, 0]).slice(), tags: (src.tags || []).slice(),
    t: JSON.parse(JSON.stringify(src.t || {})), note: src.note || '', worn: false, ...extra,
  };
}
function itemFromText(line) {
  // 「名稱 數量」，數量可省略
  const m = String(line).trim().match(/^(.+?)(?:\s*[×xX*]?\s*(\d+(?:\.\d+)?)\s*([^\d\s]*))?$/);
  if (!m || !m[1].trim()) return null;
  const name = m[1].trim(), qty = m[2] ? parseFloat(m[2]) : 1;
  const p = findPreset(name);
  return p ? makeItem({ ...p, name: p.name }, qty) : makeItem({ name, unit: m[3] || '個' }, qty);
}
function invOf(c) { if (!c.items) c.items = []; return c.items; }
function findItem(c, name) {
  name = String(name || '').trim();
  const list = invOf(c);
  return list.find(i => i.name === name) || list.find(i => name && (i.name.includes(name) || name.includes(i.name)));
}
function addToInv(c, item) {
  const same = invOf(c).find(i => i.name === item.name && i.unit === item.unit && !i.worn && JSON.stringify(i.t) === JSON.stringify(item.t));
  if (same) same.qty = r1(same.qty + item.qty * 1);
  else c.items.push(item);
}
function totalWeight(c) { return invOf(c).reduce((s, i) => s + i.w * i.qty, 0); }
// 負重：身上所有東西（含穿著的）跟力量比
const LOAD_NAMES = ['沒影響', '負重', '重度負重', '超過上限'];
function loadInfo(c) {
  const kg = totalWeight(c), str = c.attr.力量 || 10;
  const free = str * RATES.loadFree, heavy = str * RATES.loadHeavy, max = str * RATES.loadMax;
  const stage = kg > max ? 3 : kg > heavy ? 2 : kg > free ? 1 : 0;
  return { kg, free, heavy, max, stage, name: LOAD_NAMES[stage], speedText: ['', '三分之二', '三分之一', ''][stage] };
}
const LOAD_TIP = '身上所有東西（含穿著的）加起來的重量，跟力量比：力量×2 公斤內沒影響；超過是負重，走路約平常三分之二的速度，用力時體力掉 1.25 倍；超過力量×4 是重度負重，約三分之一的速度，體力掉 1.5 倍，跟力量、敏捷、體質有關的動作都會吃虧；力量×6 是能帶的上限。';
function fmtW(kg) { return kg < 1 ? `${Math.round(kg * 1000)} 克` : `${Math.round(kg * 10) / 10} 公斤`; }
function fmtQty(i) { return `${r1(i.qty)} ${i.unit}`; }

// 身上穿的衣物決定保暖度（多件相加）
function syncWarmth(c) {
  const worn = invOf(c).filter(i => i.worn && i.t.衣物);
  c.warmMin = r1(worn.reduce((s, i) => s + i.t.衣物.min, 0));
  c.warmMax = r1(worn.reduce((s, i) => s + i.t.衣物.max, 0));
}
// 舊存檔：沒有物品的話，把原本的衣物保暖度變成一件「身上的衣服」
function migrateItems(c) {
  if (c.items) return;
  c.items = [makeItem({ name: '身上的衣服（整套）', unit: '套', w: 1, tags: ['可燃'], t: { 衣物: { min: c.warmMin || 0, max: c.warmMax || 0 } } }, 1, { worn: true })];
}

function typeSummary(i) {
  const out = [];
  const t = i.t || {};
  if (t.食物) out.push(`食物 每${i.unit} ${t.食物.kcal} 大卡`);
  if (t.飲水) out.push(t.飲水.clean ? '乾淨的水' : '不乾淨的水');
  if (t.衣物) out.push(`衣物 保暖 ${t.衣物.min}～${t.衣物.max}`);
  if (t.寢具) out.push(`寢具 舒適 ${t.寢具.comfort}${t.寢具.warm ? '・保暖 ' + t.寢具.warm : ''}`);
  if (t.容器) out.push(containerText(i));
  ITEM_TYPES.filter(k => !['食物', '飲水', '衣物', '寢具', '容器'].includes(k) && t[k]).forEach(k => out.push(k));
  return out.join('、');
}

// ---------- 物品視窗 ----------
function openInv() { renderInv(); openModal('invModal'); }
function renderInv() {
  const c = cur.char;
  const list = invOf(c);
  const str = c.attr.力量;
  const ld = loadInfo(c);
  $('invHead').innerHTML = `<span data-tip="${esc(LOAD_TIP)}">總重 ${fmtW(ld.kg)}・<span class="${ld.stage ? 'cond' : ''}">${ld.name}</span></span>　<span class="muted small">沒影響 ${r1(ld.free)}／重度 ${r1(ld.heavy)}／上限 ${r1(ld.max)} 公斤；能舉 ${r1(str * RATES.liftMult)}、拖 ${r1(str * RATES.dragMult)} 公斤</span>`;
  const row = (i, depth) => {
    const btns = [];
    if (i.t.食物) btns.push(`<button class="ghost small" onclick="queueUse('${i.id}')">吃</button>`);
    if (i.t.飲水) btns.push(`<button class="ghost small" onclick="queueUse('${i.id}')">喝</button>`);
    if (i.t.衣物) btns.push(`<button class="ghost small" onclick="toggleWear('${i.id}')">${i.worn ? '脫下' : '穿上'}</button>`);
    btns.push(`<button class="ghost small" onclick="editItem('${i.id}')">編輯</button>`);
    btns.push(`<button class="ghost small" onclick="dropItem('${i.id}')">丟掉</button>`);
    const box = i.t.容器 ? containerInfo(c, i) : null;
    const put = i.worn ? '' : `<select class="putSel" onchange="putItem('${i.id}', this.value)" data-tip="放進哪個容器。網頁會檢查形狀放不放得下、空間夠不夠；液體只能放進防漏的容器。"><option value="">${i.in ? '拿出來（隨身）' : '隨身'}</option>${list.filter(x => x.t.容器 && x.id !== i.id && !insideOf(c, x, i)).map(x => `<option value="${x.id}" ${i.in === x.id ? 'selected' : ''}>放進${esc(x.name)}</option>`).join('')}</select>`;
    return `<div class="invRow" style="padding-left:${depth * 18}px">
      <div>${depth ? '└ ' : ''}<span class="${i.worn ? 'worn' : ''}">${esc(i.name)}</span>${i.worn ? '<span class="tagPill">穿著</span>' : ''}　<span class="muted small">${fmtQty(i)}・${fmtW(i.w * i.qty)}</span>
        <div class="muted small">${esc(typeSummary(i))}${i.tags.length ? '・' + i.tags.join('、') : ''}${i.note ? '・' + esc(i.note) : ''}</div>${box ? `<div class="small ${box.used > box.cap ? 'cond' : 'muted'}">裝了 ${r1(box.used / 1000)}／${r1(box.cap / 1000)} 公升</div>` : ''}</div>
      <div class="invBtns">${put}${btns.join('')}</div></div>` + (i.t.容器 ? list.filter(x => x.in === i.id).map(x => row(x, depth + 1)).join('') : '');
  };
  $('invList').innerHTML = list.length ? list.filter(i => !i.in || !list.some(x => x.id === i.in)).map(i => row(i, 0)).join('') : '<p class="muted small">身上什麼都沒有。</p>';
  renderSideInv();
}
function renderSideInv() {
  if (!cur) return;
  const c = cur.char, list = invOf(c);
  const worn = list.filter(i => i.worn).map(i => i.name);
  const food = list.filter(i => i.t.食物).reduce((s, i) => s + i.t.食物.kcal * i.qty, 0);
  const water = list.filter(i => i.t.飲水).reduce((s, i) => s + i.qty, 0);
  $('invCard').innerHTML = `<div class="row" style="justify-content:space-between"><span>物品</span><button class="ghost small" onclick="openInv()">打開</button></div>
    <div class="small ${loadInfo(c).stage ? 'cond' : 'muted'}" data-tip="${esc(LOAD_TIP)}">共 ${list.length} 樣・${fmtW(totalWeight(c))}／${r1(loadInfo(c).free)} 公斤・${loadInfo(c).name}</div>
    <div class="small muted" data-tip="身上所有食物的熱量加起來，和所有飲水的量。一般人一天約需 2400 大卡、3 公升水。">食物約 ${Math.round(food)} 大卡・水 ${Math.round(water)} 毫升</div>
    <div class="small muted">穿著：${worn.length ? esc(worn.join('、')) : '沒穿衣服'}</div>`;
}

function addPreset() {
  const p = PRESET_ITEMS[num($('invPreset').value, -1)];
  if (!p) return;
  const qty = num($('invPresetQty').value, 1) || 1;
  pushUndo();
  addToInv(cur.char, makeItem(p, qty));
  save(); renderInv(); toast(`加入 ${p.name} ${qty} ${p.unit}`);
}
function dropItem(id) {
  const c = cur.char, i = invOf(c).find(x => x.id === id);
  if (!i) return;
  if (!confirm(`丟掉「${i.name}」？`)) return;
  pushUndo();
  c.items = c.items.filter(x => x.id !== id);
  c.items.forEach(x => { if (x.in === id) x.in = i.in || undefined; }); // 丟掉容器時，裡面的東西拿出來
  syncWarmth(c); save(); renderInv(); renderStatus();
}
function toggleWear(id) {
  // 穿脫算在這回合裡，按「套用」才生效
  const i = invOf(cur.char).find(x => x.id === id);
  if (!i) return;
  turnWear = turnWear.filter(w => w.id !== id);
  turnWear.push({ id, on: !i.worn });
  renderTurnItems();
  toast(`${i.worn ? '脫下' : '穿上'}${i.name}：已加進回合表，按「套用」時生效`);
}
function queueUse(id) {
  const i = invOf(cur.char).find(x => x.id === id);
  if (!i) return;
  const def = i.t.飲水 ? Math.min(250, i.qty) : 1;
  const q = num(prompt(`${i.t.飲水 ? '喝' : '吃'}多少？（${i.unit}，身上有 ${r1(i.qty)}）`, def), 0);
  if (q <= 0) return;
  turnUse = turnUse.filter(u => u.id !== id);
  turnUse.push({ id, qty: Math.min(q, i.qty) });
  renderTurnItems();
  toast('已加進回合表，按「套用」時才算');
}

// 自訂／編輯物品
function itemFormHTML() {
  return `<div class="grid4">
    <label>名稱<input id="f_name"></label>
    <label>數量<input id="f_qty" type="number" step="0.1" value="1"></label>
    <label>單位<input id="f_unit" value="個"></label>
    <label data-tip="一個單位多重。水用毫升當單位的話，每毫升 0.001 公斤。">每單位重量（公斤）<input id="f_w" type="number" step="0.001" value="0"></label>
    <label>長（公分）<input id="f_l" type="number" value="0"></label>
    <label>寬（公分）<input id="f_wd" type="number" value="0"></label>
    <label>高（公分）<input id="f_h" type="number" value="0"></label>
    <label>備註<input id="f_note"></label>
  </div>
  <div class="small muted">類型（可以複選）</div>
  <div class="chips">${ITEM_TYPES.map(k => `<label class="chip"><input type="checkbox" id="ft_${k}" onchange="refreshItemForm()">${k}</label>`).join('')}</div>
  <div class="grid4">
    <label class="ff_食物">每單位大卡<input id="f_kcal" type="number" value="0"></label>
    <label class="ff_飲水">乾淨<select id="f_clean"><option value="1">乾淨</option><option value="0">不乾淨</option></select></label>
    <label class="ff_衣物">保暖下限<input id="f_wmin" type="number" step="0.1" value="0"></label>
    <label class="ff_衣物">保暖上限<input id="f_wmax" type="number" step="0.1" value="0"></label>
    <label class="ff_寢具">舒適度（0～10）<input id="f_comfort" type="number" step="0.5" value="0"></label>
    <label class="ff_寢具">蓋著的保暖度<input id="f_warm" type="number" step="0.5" value="0"></label>
    <label class="ff_容器">內部長（公分）<input id="f_il" type="number" value="0"></label>
    <label class="ff_容器">內部寬（公分）<input id="f_iw" type="number" value="0"></label>
    <label class="ff_容器">內部高（公分）<input id="f_ih" type="number" value="0"></label>
    <label class="ff_容器" data-tip="背負：有背帶，雙手空著。掛身：掛在腰上或肩上。手提：有提把，占一隻手。抱持：沒有提帶，要雙手抱著。">攜帶方式<select id="f_carry"><option>背負</option><option>掛身</option><option>手提</option><option>抱持</option></select></label>
    <label class="ff_容器" data-tip="軟容器（布袋、背包）：保護力低，但能用滿全部空間。硬容器（箱子、籃子）：保護力高，但固體東西之間有空隙，約只能用到四分之三的空間（液體不受影響）。">軟硬<select id="f_soft"><option value="1">軟容器</option><option value="0">硬容器</option></select></label>
    <label class="ff_容器 chip"><input type="checkbox" id="f_leak"> 防漏（能裝液體）</label>
    <label class="ff_容器 chip"><input type="checkbox" id="f_water"> 防水（雨淋不濕）</label>
  </div>
  <div class="small muted">標籤</div>
  <div class="chips">${ITEM_TAGS.map(k => `<label class="chip"><input type="checkbox" id="fg_${k}">${k}</label>`).join('')}</div>
  <div class="row gap"><button onclick="saveItemForm()">儲存</button><button class="ghost" onclick="closeItemForm()">取消</button></div>`;
}
function refreshItemForm() {
  ['食物', '飲水', '衣物', '寢具', '容器'].forEach(k => document.querySelectorAll('.ff_' + k).forEach(e => e.classList.toggle('hidden', !$('ft_' + k).checked)));
}
function openItemForm(item) {
  $('itemForm').innerHTML = itemFormHTML();
  $('itemForm').classList.remove('hidden');
  editingId = item ? item.id : null;
  const i = item || { name: '', qty: 1, unit: '個', w: 0, size: [0, 0, 0], tags: [], t: {}, note: '' };
  $('f_name').value = i.name; $('f_qty').value = i.qty; $('f_unit').value = i.unit; $('f_w').value = i.w;
  [$('f_l').value, $('f_wd').value, $('f_h').value] = i.size;
  $('f_note').value = i.note || '';
  ITEM_TYPES.forEach(k => $('ft_' + k).checked = !!i.t[k]);
  ITEM_TAGS.forEach(k => $('fg_' + k).checked = i.tags.includes(k));
  if (i.t.食物) $('f_kcal').value = i.t.食物.kcal;
  if (i.t.飲水) $('f_clean').value = i.t.飲水.clean ? '1' : '0';
  if (i.t.衣物) { $('f_wmin').value = i.t.衣物.min; $('f_wmax').value = i.t.衣物.max; }
  if (i.t.寢具) { $('f_comfort').value = i.t.寢具.comfort; $('f_warm').value = i.t.寢具.warm; }
  if (i.t.容器) { const b = boxOf(i); [$('f_il').value, $('f_iw').value, $('f_ih').value] = b.inner; $('f_carry').value = b.carry; $('f_soft').value = b.soft ? '1' : '0'; $('f_leak').checked = b.leak; $('f_water').checked = b.water; }
  refreshItemForm();
  $('f_name').focus();
}
function editItem(id) { openItemForm(invOf(cur.char).find(x => x.id === id)); }
function closeItemForm() { $('itemForm').classList.add('hidden'); editingId = null; }
function saveItemForm() {
  const name = $('f_name').value.trim();
  if (!name) { toast('要有名稱'); return; }
  const t = {};
  ITEM_TYPES.forEach(k => { if ($('ft_' + k).checked) t[k] = {}; });
  if (t.食物) t.食物 = { kcal: num($('f_kcal').value) };
  if (t.飲水) t.飲水 = { clean: $('f_clean').value === '1' };
  if (t.衣物) t.衣物 = { min: num($('f_wmin').value), max: num($('f_wmax').value) };
  if (t.寢具) t.寢具 = { comfort: num($('f_comfort').value), warm: num($('f_warm').value) };
  if (t.容器) t.容器 = { inner: [num($('f_il').value), num($('f_iw').value), num($('f_ih').value)], carry: $('f_carry').value, soft: $('f_soft').value === '1', leak: $('f_leak').checked, water: $('f_water').checked };
  const data = {
    name, qty: num($('f_qty').value, 1), unit: $('f_unit').value.trim() || '個', w: num($('f_w').value),
    size: [num($('f_l').value), num($('f_wd').value), num($('f_h').value)],
    tags: ITEM_TAGS.filter(k => $('fg_' + k).checked), t, note: $('f_note').value.trim(),
  };
  pushUndo();
  const c = cur.char;
  if (editingId) { Object.assign(invOf(c).find(x => x.id === editingId), data); }
  else c.items.push({ id: newId(), worn: false, ...data });
  syncWarmth(c); save(); closeItemForm(); renderInv(); renderStatus();
}

// ---------- 回合表裡的物品 ----------
function resetTurnItems() { turnUse = []; turnGain = []; turnWear = []; turnPut = []; renderTurnItems(); }
function renderTurnItems() {
  if (!cur || !$('turnItems')) return;
  const c = cur.char, inv = invOf(c);
  const name = id => (inv.find(i => i.id === id) || { name: '（已不在身上）' }).name;
  const unit = id => (inv.find(i => i.id === id) || { unit: '' }).unit;
  const use = turnUse.map((u, k) => `<span class="pill">${esc(name(u.id))} ${r1(u.qty)} ${esc(unit(u.id))}<a href="#" onclick="turnUse.splice(${k},1);renderTurnItems();return false">×</a></span>`).join('');
  const gain = turnGain.map((g, k) => `<span class="pill">${esc(g.name)} ${r1(g.qty)} ${esc(g.unit)}<a href="#" onclick="turnGain.splice(${k},1);renderTurnItems();return false">×</a></span>`).join('');
  const wear = turnWear.map((w, k) => `<span class="pill">${w.on ? '穿上' : '脫下'} ${esc(name(w.id))}<a href="#" onclick="turnWear.splice(${k},1);renderTurnItems();return false">×</a></span>`).join('');
  const opts = inv.map(i => `<option value="${i.id}">${esc(i.name)}（${fmtQty(i)}）</option>`).join('');
  $('turnItems').innerHTML = `
    <div class="small"><span class="muted" data-tip="吃掉、喝掉、用掉、丟掉的東西。食物和飲水會自動算飢餓口渴。">用掉：</span>${use || '<span class="muted">無</span>'}</div>
    <div class="row gap wrap small">${inv.length ? `<select id="tu_item" style="width:auto">${opts}</select><input id="tu_qty" type="number" step="0.1" value="1" style="width:80px"><button class="ghost small" onclick="addTurnUse()">加入用掉</button>` : ''}</div>
    <div class="small"><span class="muted">獲得：</span>${gain || '<span class="muted">無</span>'}</div>
    <div class="small"><span class="muted">穿脫：</span>${wear || '<span class="muted">無</span>'}</div>`;
}
function addTurnUse() {
  const id = $('tu_item').value, q = num($('tu_qty').value, 0);
  const i = invOf(cur.char).find(x => x.id === id);
  if (!i || q <= 0) return;
  turnUse = turnUse.filter(u => u.id !== id);
  turnUse.push({ id, qty: Math.min(q, i.qty) });
  renderTurnItems();
}
// 睡覺時從身上的寢具挑
function bedOptions() {
  const inv = invOf(cur.char).filter(i => i.t.寢具);
  const place = [['地面', 1], ['草堆', 3], ['普通床', 7], ['好床', 9]];
  $('t_bedPick').innerHTML = '<option value="">從清單挑睡的地方……</option>' +
    place.map(([n, v]) => `<option value="${v}">${n}（${v}）</option>`).join('') +
    inv.filter(i => i.t.寢具.comfort > 0).map(i => `<option value="${i.t.寢具.comfort}">${esc(i.name)}（${i.t.寢具.comfort}）</option>`).join('');
  $('t_coverPick').innerHTML = '<option value="">從身上挑蓋的東西……</option><option value="0">什麼都不蓋（0）</option>' +
    inv.filter(i => i.t.寢具.warm > 0).map(i => `<option value="${i.t.寢具.warm}">${esc(i.name)}（${i.t.寢具.warm}）</option>`).join('');
}

// 套用：用掉、獲得、穿脫。回傳要寫進紀錄的句子
function applyTurnItems(who) {
  const c = cur.char, lines = [], mx = maxes(c);
  for (const u of turnUse) {
    const i = invOf(c).find(x => x.id === u.id);
    if (!i) continue;
    const q = Math.min(u.qty, i.qty);
    if (q <= 0) continue;
    i.qty = r1(i.qty - q);
    if (i.t.食物) {
      const pts = i.t.食物.kcal * q / KCAL_PER_HUNGER * illMods(c).food; // 拉肚子時吃下去補得少
      c.hunger = clamp(c.hunger + pts, 0, mx.hunger);
      lines.push(`${who}吃了${i.name} ${r1(q)} ${i.unit}，飢餓恢復了 ${r1(pts)}。`);
    } else if (i.t.飲水) {
      const pts = q / ML_PER_THIRST;
      c.thirst = clamp(c.thirst + pts, 0, mx.thirst);
      lines.push(`${who}喝了${i.name} ${Math.round(q)} 毫升，口渴恢復了 ${r1(pts)}。${i.t.飲水.clean ? '' : '這水不太乾淨。'}`);
    } else lines.push(`${who}用掉了${i.name} ${r1(q)} ${i.unit}。`);
    if (i.qty <= 0) c.items = c.items.filter(x => x !== i);
  }
  for (const g of turnGain) {
    addToInv(c, g); lines.push(`${who}拿到了${g.name} ${r1(g.qty)} ${g.unit}。`);
    if (g.t.飲水 && !turnPut.some(p => g.name.includes(p.item) || p.item.includes(g.name))) { const msg = autoPlaceLiquid(c, findItem(c, g.name)); if (msg) lines.push(msg); }
  }
  for (const p of turnPut) lines.push(applyPut(c, p));
  for (const w of turnWear) {
    const i = invOf(c).find(x => x.id === w.id);
    if (!i || i.worn === w.on) continue;
    i.worn = w.on;
    lines.push(`${who}${w.on ? '穿上' : '脫下'}了${i.name}。`);
  }
  syncWarmth(c);
  return lines;
}

// AI 狀態區塊：用掉／獲得／穿脫
function parseItemLines(f) {
  const c = cur.char;
  const split = s => String(s || '').split(/[；;]/).map(x => x.trim()).filter(x => x && !/^(無|沒有|0)$/.test(x));
  for (const e of split(f['用掉'])) {
    const m = e.match(/^(.+?)\s*[×xX*]?\s*(\d+(?:\.\d+)?)/);
    const i = findItem(c, m ? m[1] : e);
    if (!i) continue;
    turnUse = turnUse.filter(u => u.id !== i.id);
    turnUse.push({ id: i.id, qty: Math.min(m ? parseFloat(m[2]) : 1, i.qty) });
  }
  for (const e of split(f['獲得'])) {
    const p = e.split(/[｜|]/).map(x => x.trim());
    const qty = num(p[1], 1) || 1;
    const pre = findPreset(p[0]);
    if (p.length < 4 && pre) { turnGain.push(makeItem(pre, qty)); continue; }
    const t = {}, type = p[4] || '', val = p[5] || '';
    if (type.includes('食物')) t.食物 = { kcal: num(val) };
    else if (type.includes('飲水')) t.飲水 = { clean: !/不/.test(val) };
    else if (type.includes('衣物')) { const r = parseRange(val) || [0, num(val)]; t.衣物 = { min: r[0], max: r[1] }; }
    else if (type.includes('寢具')) { const n = val.split(/[／/]/); t.寢具 = { comfort: num(n[0]), warm: num(n[1]) }; }
    else if (type.includes('容器')) t.容器 = parseBox(val);
    else { const k = ITEM_TYPES.find(k => type.includes(k)); if (k) t[k] = {}; }
    turnGain.push(makeItem({ name: p[0], unit: p[2] || '個', w: num(p[3]), t }, qty));
  }
  for (const e of split(f['穿脫'])) {
    const on = /穿/.test(e);
    const i = findItem(c, e.replace(/穿上|脫下|穿|脫/g, '').trim());
    if (i && i.t.衣物) { turnWear = turnWear.filter(w => w.id !== i.id); turnWear.push({ id: i.id, on }); }
  }
  for (const e of split(f['放進'])) {
    const p = e.split(/[｜|]/).map(x => x.trim());
    if (p[0]) turnPut.push({ item: p[0], box: p[1] || '隨身' });
  }
}

// 給 AI 的物品清單
function invForPrompt(c) {
  const list = invOf(c);
  if (!list.length) return '身上什麼都沒有。';
  const worn = list.filter(i => i.worn).map(i => i.name);
  const desc = i => `${i.name} ${fmtQty(i)}${typeSummary(i) ? '（' + typeSummary(i) + '）' : ''}`;
  const top = list.filter(i => !i.worn && (!i.in || !list.some(x => x.id === i.in)));
  const lines = [];
  const walk = (i, depth) => {
    lines.push(`${'  '.repeat(depth)}- ${desc(i)}`);
    if (i.t.容器) list.filter(x => x.in === i.id).forEach(x => walk(x, depth + 1));
  };
  top.forEach(i => walk(i, 0));
  const hands = handsUsed(c);
  return `穿著：${worn.length ? worn.join('、') : '沒穿衣服'}（保暖 ${c.warmMin}～${c.warmMax}）
帶著（縮排的是裝在上面那個容器裡）：
${lines.length ? lines.join('\n') : '無'}
${hands.length ? '手上：' + hands.join('、') + '\n' : ''}總重 ${fmtW(totalWeight(c))}，${(ld => ld.stage === 0 ? `負重沒影響（力量×2＝${r1(ld.free)} 公斤以內）` : ld.stage === 3 ? `超過能帶的上限 ${r1(ld.max)} 公斤，背不動，要放下東西才能走` : `${ld.name}，走路約平常${ld.speedText}的速度，耗時照這個算${ld.stage === 2 ? '，跟力量、敏捷、體質有關的動作都會吃虧' : ''}`)(loadInfo(c))}`;
}

// 開新故事：起始穿著、隨身物品
function setupItems(char) {
  char.items = [];
  $('c_wear').value.split(/\r?\n|[；;、]/).map(s => s.trim()).filter(Boolean).forEach(l => {
    const it = itemFromText(l); if (it) { it.worn = !!it.t.衣物; char.items.push(it); }
  });
  $('c_carry').value.split(/\r?\n|[；;、]/).map(s => s.trim()).filter(Boolean).forEach(l => {
    const it = itemFromText(l); if (it) addToInv(char, it);
  });
  invOf(char).filter(i => i.t.飲水).forEach(i => autoPlaceLiquid(char, i));
  syncWarmth(char);
}

function initItems() {
  const groups = {};
  PRESET_ITEMS.forEach((p, k) => { const g = Object.keys(p.t)[0] || '其他'; (groups[g] = groups[g] || []).push(`<option value="${k}">${p.name}（${p.unit}）</option>`); });
  $('invPreset').innerHTML = Object.entries(groups).map(([g, o]) => `<optgroup label="${g}">${o.join('')}</optgroup>`).join('');
  if (!$('c_wear').value) $('c_wear').value = DEFAULT_WEAR;
  if (!$('c_carry').value) $('c_carry').value = DEFAULT_CARRY;
}
initItems();

// ---------- 容器（設計 2026-10-02，做 2026-10-04） ----------
// 容器記內部長寬高，物品記外部長寬高。塞不塞得進由網頁算：
// 1. 形狀：物品三邊排序後，每一邊都要放得進容器排序後的三邊（1 公尺的劍塞不進背包）。軟容器可以撐大一點（暫定 1.1 倍）。
// 2. 空間：裡面東西的體積加起來，不能超過容量。軟容器能用滿；硬容器裡的固體東西之間有空隙，約多占三分之一的空間（只能用到約四分之三，暫定），液體不受影響。
// 3. 液體（飲水，用毫升記）只能放進防漏的容器，1 毫升＝1 立方公分。
const SOFT_STRETCH = 1.1, HARD_FILL = 0.75;
function boxOf(i) { const b = i.t.容器 || {}; return { inner: b.inner || [0, 0, 0], soft: b.soft !== false, leak: !!b.leak, water: !!b.water, carry: b.carry || '手提' }; }
function itemVol(i, qty = i.qty) {
  if (i.unit === '毫升') return qty;
  const [l, w, h] = i.size || [0, 0, 0];
  return l * w * h * qty;
}
// 在這個容器裡實際占多少空間
function spaceIn(box, i, qty) { return itemVol(i, qty) * (i.unit === '毫升' || boxOf(box).soft ? 1 : 1 / HARD_FILL); }
function containerInfo(c, box) {
  const [l, w, h] = boxOf(box).inner;
  return { cap: l * w * h, used: invOf(c).filter(x => x.in === box.id).reduce((s, x) => s + spaceIn(box, x), 0) };
}
function containerText(i) {
  const b = boxOf(i), [l, w, h] = b.inner;
  return `容器 內部 ${l}×${w}×${h} 公分約 ${r1(l * w * h / 1000)} 公升・${b.soft ? '軟' : '硬'}・${b.leak ? '防漏' : '不防漏'}・${b.water ? '防水' : '不防水'}・${b.carry}`;
}
// x 是不是（直接或間接）裝在 box 裡
function insideOf(c, x, box) {
  for (let p = x, n = 0; p && p.in && n < 20; n++) { if (p.in === box.id) return true; p = invOf(c).find(y => y.id === p.in); }
  return false;
}
// 放不放得下：回傳問題（字串），放得下回傳空字串
function fitProblem(c, i, box) {
  const b = boxOf(box);
  if (i.t.飲水 && !b.leak) return `${box.name}不防漏，裝不了${i.name}`;
  if (i.unit !== '毫升') {
    const s = (i.size || [0, 0, 0]).slice().sort((a, z) => z - a), n = b.inner.slice().sort((a, z) => z - a);
    const k = b.soft ? SOFT_STRETCH : 1;
    if (s.some((v, j) => v > n[j] * k)) return `${i.name}（${(i.size || []).join('×')} 公分）的形狀放不進${box.name}（內部 ${b.inner.join('×')} 公分）`;
  }
  const info = containerInfo(c, box), need = i.in === box.id ? 0 : spaceIn(box, i);
  if (info.used + need > info.cap + 0.5) return `${box.name}的空間不夠（還剩約 ${r1(Math.max(0, info.cap - info.used) / 1000)} 公升，${i.name}要 ${r1(need / 1000)} 公升）`;
  return '';
}
function putItem(id, boxId) {
  const c = cur.char, i = invOf(c).find(x => x.id === id);
  if (!i) return;
  if (!boxId) { pushUndo(); delete i.in; save(); renderInv(); return; }
  const box = invOf(c).find(x => x.id === boxId);
  const why = fitProblem(c, i, box);
  if (why) { toast(why); renderInv(); return; }
  pushUndo(); i.in = boxId; save(); renderInv();
}
// AI 寫的「放進」：用名稱找，放不下就記一筆警告，東西留在外面
function applyPut(c, p) {
  const i = findItem(c, p.item);
  if (!i) return `找不到要放的「${p.item}」。`;
  if (/隨身|拿出|身上|手上/.test(p.box)) { delete i.in; return `${i.name}拿出來了。`; }
  const box = invOf(c).filter(x => x.t.容器 && x !== i).find(x => x.name === p.box) || invOf(c).filter(x => x.t.容器 && x !== i).find(x => x.name.includes(p.box) || p.box.includes(x.name));
  if (!box) return `身上沒有「${p.box}」可以放${i.name}。`;
  const why = fitProblem(c, i, box);
  if (why) return `放不進去：${why}，${i.name}還在外面（請 AI 下一段照這個寫）。`;
  i.in = box.id;
  return `${i.name}放進了${box.name}。`;
}
// 液體自動找防漏、還裝得下的容器
function autoPlaceLiquid(c, i) {
  if (!i || i.in) return '';
  const box = invOf(c).find(x => x.t.容器 && !fitProblem(c, i, x));
  if (box) { i.in = box.id; return ''; }
  return `身上沒有裝得下${i.name}的防漏容器。`;
}
// AI 寫的容器數值：「內部 長×寬×高／軟或硬／防漏／防水／攜帶方式」，寫不全的用預設
function parseBox(val) {
  const d = (String(val).match(/(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)/) || []).slice(1, 4).map(Number);
  return { inner: d.length === 3 ? d : [0, 0, 0], soft: !/硬/.test(val), leak: /防漏/.test(val) && !/不防漏/.test(val), water: /防水/.test(val) && !/不防水/.test(val), carry: ['背負', '掛身', '手提', '抱持'].find(k => val.includes(k)) || '手提' };
}
// 手上拿著什麼：手提的容器占一隻手、抱持的占兩隻手（只算沒裝在別的容器裡的）
function handsUsed(c) {
  return invOf(c).filter(x => x.t.容器 && !x.in && ['手提', '抱持'].includes(boxOf(x).carry)).map(x => `${x.name}（${boxOf(x).carry === '抱持' ? '要雙手抱著' : '占一隻手'}）`);
}
// 舊存檔的容器沒有內部尺寸：照預設物品補上
function migrateBoxes(c) {
  invOf(c).forEach(i => { if (i.t.容器 && !i.t.容器.inner) { const p = findPreset(i.name); i.t.容器 = p && p.t.容器 && p.t.容器.inner ? JSON.parse(JSON.stringify(p.t.容器)) : { inner: (i.size || [0, 0, 0]).map(v => Math.max(0, v - 2)), soft: true, leak: false, water: false, carry: '手提' }; } });
}

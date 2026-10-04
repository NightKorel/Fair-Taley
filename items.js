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
  { name: '水壺', unit: '個', w: 0.3, size: [8, 8, 25], tags: [], t: { 容器: {} } },
  { name: '背包', unit: '個', w: 1, size: [50, 30, 20], tags: [], t: { 容器: {} } },
  { name: '布袋', unit: '個', w: 0.2, size: [40, 30, 2], tags: ['可燃'], t: { 容器: {} } },
];

const DEFAULT_WEAR = '內衣褲\n長袖上衣\n長褲';
const DEFAULT_CARRY = '清水 750\n麵包 2\n小刀 1\n水壺 1';

let turnUse = [];  // 這回合用掉：{ id, qty }
let turnGain = []; // 這回合獲得：物品
let turnWear = []; // 這回合穿脫：{ id, on }
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
  ITEM_TYPES.filter(k => !['食物', '飲水', '衣物', '寢具'].includes(k) && t[k]).forEach(k => out.push(k));
  return out.join('、');
}

// ---------- 物品視窗 ----------
function openInv() { renderInv(); openModal('invModal'); }
function renderInv() {
  const c = cur.char;
  const list = invOf(c);
  const str = c.attr.力量;
  $('invHead').innerHTML = `總重 ${fmtW(totalWeight(c))}　<span class="muted small" data-tip="負重（第二步會正式計算）：力量×2 公斤內沒影響，超過開始變慢，力量×4 起重度負重，力量×6 是上限。">負重參考：${r1(str * 2)}／${r1(str * 4)}／${r1(str * 6)} 公斤</span>`;
  $('invList').innerHTML = list.length ? list.map(i => {
    const btns = [];
    if (i.t.食物) btns.push(`<button class="ghost small" onclick="queueUse('${i.id}')">吃</button>`);
    if (i.t.飲水) btns.push(`<button class="ghost small" onclick="queueUse('${i.id}')">喝</button>`);
    if (i.t.衣物) btns.push(`<button class="ghost small" onclick="toggleWear('${i.id}')">${i.worn ? '脫下' : '穿上'}</button>`);
    btns.push(`<button class="ghost small" onclick="editItem('${i.id}')">編輯</button>`);
    btns.push(`<button class="ghost small" onclick="dropItem('${i.id}')">丟掉</button>`);
    return `<div class="invRow">
      <div><span class="${i.worn ? 'worn' : ''}">${esc(i.name)}</span>${i.worn ? '<span class="tagPill">穿著</span>' : ''}　<span class="muted small">${fmtQty(i)}・${fmtW(i.w * i.qty)}</span>
        <div class="muted small">${esc(typeSummary(i))}${i.tags.length ? '・' + i.tags.join('、') : ''}${i.note ? '・' + esc(i.note) : ''}</div></div>
      <div class="invBtns">${btns.join('')}</div></div>`;
  }).join('') : '<p class="muted small">身上什麼都沒有。</p>';
  renderSideInv();
}
function renderSideInv() {
  if (!cur) return;
  const c = cur.char, list = invOf(c);
  const worn = list.filter(i => i.worn).map(i => i.name);
  const food = list.filter(i => i.t.食物).reduce((s, i) => s + i.t.食物.kcal * i.qty, 0);
  const water = list.filter(i => i.t.飲水).reduce((s, i) => s + i.qty, 0);
  $('invCard').innerHTML = `<div class="row" style="justify-content:space-between"><span>物品</span><button class="ghost small" onclick="openInv()">打開</button></div>
    <div class="small muted">共 ${list.length} 樣・${fmtW(totalWeight(c))}</div>
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
  </div>
  <div class="small muted">標籤</div>
  <div class="chips">${ITEM_TAGS.map(k => `<label class="chip"><input type="checkbox" id="fg_${k}">${k}</label>`).join('')}</div>
  <div class="row gap"><button onclick="saveItemForm()">儲存</button><button class="ghost" onclick="closeItemForm()">取消</button></div>`;
}
function refreshItemForm() {
  ['食物', '飲水', '衣物', '寢具'].forEach(k => document.querySelectorAll('.ff_' + k).forEach(e => e.classList.toggle('hidden', !$('ft_' + k).checked)));
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
function resetTurnItems() { turnUse = []; turnGain = []; turnWear = []; renderTurnItems(); }
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
      const pts = i.t.食物.kcal * q / KCAL_PER_HUNGER;
      c.hunger = clamp(c.hunger + pts, 0, mx.hunger);
      lines.push(`${who}吃了${i.name} ${r1(q)} ${i.unit}，飢餓恢復了 ${r1(pts)}。`);
    } else if (i.t.飲水) {
      const pts = q / ML_PER_THIRST;
      c.thirst = clamp(c.thirst + pts, 0, mx.thirst);
      lines.push(`${who}喝了${i.name} ${Math.round(q)} 毫升，口渴恢復了 ${r1(pts)}。${i.t.飲水.clean ? '' : '這水不太乾淨。'}`);
    } else lines.push(`${who}用掉了${i.name} ${r1(q)} ${i.unit}。`);
    if (i.qty <= 0) c.items = c.items.filter(x => x !== i);
  }
  for (const g of turnGain) { addToInv(c, g); lines.push(`${who}拿到了${g.name} ${r1(g.qty)} ${g.unit}。`); }
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
    else { const k = ITEM_TYPES.find(k => type.includes(k)); if (k) t[k] = {}; }
    turnGain.push(makeItem({ name: p[0], unit: p[2] || '個', w: num(p[3]), t }, qty));
  }
  for (const e of split(f['穿脫'])) {
    const on = /穿/.test(e);
    const i = findItem(c, e.replace(/穿上|脫下|穿|脫/g, '').trim());
    if (i && i.t.衣物) { turnWear = turnWear.filter(w => w.id !== i.id); turnWear.push({ id: i.id, on }); }
  }
}

// 給 AI 的物品清單
function invForPrompt(c) {
  const list = invOf(c);
  if (!list.length) return '身上什麼都沒有。';
  const worn = list.filter(i => i.worn).map(i => i.name);
  const carry = list.filter(i => !i.worn).map(i => `${i.name} ${fmtQty(i)}${typeSummary(i) ? '（' + typeSummary(i) + '）' : ''}`);
  return `穿著：${worn.length ? worn.join('、') : '沒穿衣服'}（保暖 ${c.warmMin}～${c.warmMax}）
帶著：${carry.length ? carry.join('、') : '無'}
總重 ${fmtW(totalWeight(c))}`;
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

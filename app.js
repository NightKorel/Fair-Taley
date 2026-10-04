// 存活模擬 第一版
// 分工：AI（或玩家）判斷和描述，這裡負責記住、計算、檢查。
// 下面的數字全部是暫定，實際玩過再調。

// 2026-10-03 依上網查的資料調整（來源見 設計文件/研究_AI角色與記憶.txt）
const RATES = {
  hungerPerHour: 1.5,     // 飢餓每小時掉多少（上限＝體質×10）。一天約 36＝一天的飯量（約 2400 大卡），1 點約 67 大卡
  thirstPerHour: 3,       // 口渴每小時掉多少。一天約 72＝一天的水量（約 3 公升），1 點約 40 毫升
  hotThirstMult: 1.5,     // 熱到流汗（體感高過舒適範圍）時口渴掉得快幾倍
  starveHpPerHour: 0.12,  // 飢餓見底時每小時扣血（一般人總共約撐 5 週；查到：有水喝約 3～8 週）
  dehydrateHpPerHour: 2,  // 口渴見底時每小時扣血（一般人總共約撐 3.5 天；查到：約 3～5 天）
  fatigueAwakePerHour: 1, // 疲勞＝相當於醒了幾小時，醒著每小時 +1
  fatigueMax: 48,
  fatigueStages: [8, 16, 24, 40], // 醒幾小時進入 微倦／疲倦／疲憊／恍惚（查到：醒 17 小時≈酒測 0.05、24 小時≈0.10、48 小時開始不自主打瞌睡）
  fatigueSleepPerHour: 2, // 品質正常時每小時消除多少（睡 8 小時消掉醒 16 小時）
  sleepCapHours: 12,      // 睡眠時數上限
  badSleepQuality: 0.3,   // 品質低於這個就睡不著、睡一下就醒
  oversleepFatigue: 24,   // 入睡時疲勞到這裡（熬過一整天）會睡過頭
  oversleepHours: 1.8,    // 睡過頭多睡多久（查到：整夜沒睡後補眠約多睡 110 分鐘）
  groggyMinutes: 60,       // 睡過頭醒來昏沉多久（查到：嚴重缺眠後可到 1 小時）
  wakeGroggyMinutes: 15,   // 一般睡醒昏沉多久（查到：通常 15～20 分鐘）
  tempTolerance: 5,       // 身體靠發抖、流汗能自己撐住的度數，超出舒適範圍這麼多以內不會越來越冷或熱
  tempDriftFactor: 0.01,  // 體溫每小時偏移＝超出舒適範圍度數的平方×這個（扣掉身體能撐的度數後計算）
  tempRecoverPerHour: 2,  // 回到舒適範圍時每小時回正多少
  tempDanger: 7,          // 體溫偏到這裡開始扣血（範圍 -10～10）
  tempHpPerHour: 5,       // 到危險時每小時扣血，越偏越多（偏到底約每小時 20）
  restFullMinutes: 30,    // 休息多久體力回滿（每小時回 200，以體質 10 的人為準）
  // 活動強度：每小時掉多少體力（2026-10-04 依研究暫定，體質 10 的人滿是 100）
  // 輕：坐著、手工、慢慢走，每小時 200 大卡以下，可以做一整天
  // 中：走路趕路、搬東西、推拉，200～350 大卡，約 2.5 小時用完；走 50 分休 10 分剛好打平（軍隊行軍）
  // 重：鏟土、爬坡、扛重物，350～500 大卡，約 30 分鐘用完；做 30 分休 30 分打平（ACGIH 重度工作建議）
  // 極重：衝刺、打架、拚全力，約 10 分鐘用完
  intensity: { 輕: 0, 中: 40, 重: 200, 極重: 600 },
  // 用力過後睡得沉（研究：勞動後深層睡眠變多、較快睡著，但需要的時數沒變多）
  // 醒著時累積「勞累點」：中度每分鐘 0.25、重度 1、極重 2；睡覺時品質最多加兩成（120 點，約重活 2 小時），睡完歸零
  exertPerMin: { 輕: 0, 中: 0.25, 重: 1, 極重: 2 },
  exertFull: 120,
  exertSleepBonus: 0.2,
  hotStaminaMult: 1.5,    // 熱到流汗時體力掉得快幾倍
  sleepComfortShift: 6,   // 舒適溫度以活動時為準，睡覺（靜止）時往上加幾度
};
const FATIGUE_NAMES = ['清醒', '微倦', '疲倦', '疲憊', '恍惚'];
const FATIGUE_STAMINA = [1, 1, 0.85, 0.6, 0.4];
const BED_REF = '地面 1、草堆 3、睡袋 5、普通床 7、好床 9';
const COVER_REF = '薄毯約 5、普通棉被約 10、厚棉被約 15～20、羽絨睡袋約 15～30'; // 1 clo 約抵 7 度

const WORLD_EXAMPLES = [
  '現代台灣，和現實一樣。',
  '清朝末年的華南鄉村，和現實歷史一樣。沒有電，交通靠步行和牛車。',
  '類似歐洲中世紀的王國。跟現實不同的地方：少數人天生能用魔法點火、治傷，但施法會讓人非常疲倦；一般人害怕魔法使用者。',
];

let stories = {};
let cur = null;      // 目前的故事
let mode = '角色';
let undoStack = [];

// ---------- 存取 ----------
function load() {
  try { stories = JSON.parse(localStorage.getItem('survsim_stories') || '{}'); } catch (e) { stories = {}; }
}
function save() {
  if (cur) { cur.updated = Date.now(); stories[cur.id] = cur; }
  try { localStorage.setItem('survsim_stories', JSON.stringify(stories)); }
  catch (e) { toast('存檔失敗，請先匯出備份'); }
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), 2200);
}
const $ = id => document.getElementById(id);
const num = (v, d = 0) => { const n = parseFloat(String(v).replace(/[+＋]/g, '')); return isNaN(n) ? d : n; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = v => Math.round(v * 10) / 10;
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------- 主題 ----------
function toggleTheme() {
  const now = document.documentElement.dataset.theme === 'beige' ? 'dark' : 'beige';
  document.documentElement.dataset.theme = now;
  try { localStorage.setItem('survsim_theme', now); } catch (e) {}
}

// ---------- 頁面切換 ----------
function showPage(id) {
  ['home', 'setup', 'play'].forEach(p => $(p).classList.toggle('hidden', p !== id));
  $('storyName').textContent = id === 'play' && cur ? cur.title : '';
}
function showHome() {
  cur = null; renderStoryList(); showPage('home');
}
function showSetup() {
  $('s_world').value = ''; $('s_idea').value = ''; $('s_reply').value = ''; $('s_msg').textContent = '';
  showPage('setup');
}
function renderStoryList() {
  const list = Object.values(stories).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  $('storyList').innerHTML = list.length ? list.map(s => `
    <div class="storyItem">
      <span class="name" onclick="openStory('${s.id}')">${esc(s.title)}　<span class="small muted">${esc(s.char.name)}・${clockText(s.clock)}</span></span>
      <button class="ghost small" onclick="deleteStory('${s.id}')">刪除</button>
    </div>`).join('') : '<p class="muted small">還沒有故事。</p>';
}
function deleteStory(id) {
  if (!confirm(`確定刪除「${stories[id].title}」？刪了就救不回來，建議先匯出備份。`)) return;
  delete stories[id]; save(); renderStoryList();
}

// ---------- 開新故事 ----------
function fillWorld(i) { $('s_world').value = WORLD_EXAMPLES[i]; return false; }

function copySetupPrompt() {
  const idea = $('s_idea').value.trim();
  if (!idea) { toast('先寫幾句大概的想法'); return; }
  const p = `我要用「存活模擬」寫一篇小說，請幫我把下面的想法變成具體設定。要合理、有真實感。跟現實一樣的部分，世界觀寫大概的年代地點就好；跟現實不同的地方要寫清楚。

我的想法：
${idea}

請用繁體中文，完全照下面的格式回覆，每行一項，不要加其他東西：
故事名稱：
世界觀：（幾句話）
開始日期：
開始時間：（24 小時制，例 06:30）
起點氣溫：（數字，攝氏）
名字：
身高：（數字，公分）
體重：（數字，公斤）
力量：（一般人約 10，常人頂尖約 18，可以有一位小數）
敏捷：
體質：
智力：
感知：
魅力：
舒適溫度：（沒穿衣服、走動做事時覺得舒服的溫度，一般人約 22～26，怕冷的人往上移，怕熱的往下移）
衣物保暖：（身上整套衣物能抵多少度，寫下限～上限。參考：短袖短褲約 2～3、長袖長褲約 3～4.5、再加外套約 5～7、冬天整套厚衣約 10～14、極地裝約 25～30）
個性：（短的具體行為句，例「被逼急就開玩笑帶過」，用；分隔）
背景：
說話方式：`;
  copyText(p, '提示詞已複製，貼給 AI 吧');
}

function parseLines(text) {
  const out = {};
  text.split(/\r?\n/).forEach(line => {
    const m = line.replace(/\*\*/g, '').match(/^\s*[-・]?\s*([^：:]{1,8})\s*[：:]\s*(.*)$/);
    if (m && m[2].trim()) out[m[1].trim()] = m[2].trim();
  });
  return out;
}
function parseRange(v) {
  const m = String(v || '').match(/(-?\d+(?:\.\d+)?)\s*[～~\-－到至]\s*(-?\d+(?:\.\d+)?)/);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
}

function applySetupReply() {
  const f = parseLines($('s_reply').value);
  const map = {
    '故事名稱': 's_title', '世界觀': 's_world', '開始日期': 's_date', '名字': 'c_name',
    '背景': 'c_background', '說話方式': 'c_speech',
  };
  const nums = {
    '起點氣溫': 's_temp', '身高': 'c_height', '體重': 'c_weight', '力量': 'c_str', '敏捷': 'c_dex',
    '體質': 'c_con', '智力': 'c_int', '感知': 'c_wis', '魅力': 'c_cha',
  };
  let n = 0;
  for (const k in map) if (f[k]) { $(map[k]).value = f[k]; n++; }
  for (const k in nums) if (f[k] && !isNaN(parseFloat(f[k]))) { $(nums[k]).value = parseFloat(f[k]); n++; }
  if (f['開始時間']) { const m = f['開始時間'].match(/(\d{1,2})[:：](\d{2})/); if (m) { $('s_time').value = m[1].padStart(2, '0') + ':' + m[2]; n++; } }
  if (f['個性']) { $('c_personality').value = f['個性'].split(/[；;]/).map(s => s.trim()).filter(Boolean).join('\n'); n++; }
  const c = parseRange(f['舒適溫度']); if (c) { $('c_clow').value = c[0]; $('c_chigh').value = c[1]; n++; }
  const w = parseRange(f['衣物保暖']); if (w) { $('c_wmin').value = w[0]; $('c_wmax').value = w[1]; n++; }
  $('s_msg').textContent = n ? `填好 ${n} 個欄位，請檢查一下。` : '讀不到格式，請確認 AI 有照格式回覆。';
}

function createStory() {
  const name = $('c_name').value.trim();
  if (!name) { toast('角色至少要有名字'); return; }
  const v = id => num($(id).value);
  const con = v('c_con') || 10;
  const [hh, mm] = ($('s_time').value || '06:00').split(':').map(Number);
  const max = r1(con * 10);
  const char = {
    name, height: v('c_height'), weight: v('c_weight'),
    attr: { 力量: v('c_str'), 敏捷: v('c_dex'), 體質: con, 智力: v('c_int'), 感知: v('c_wis'), 魅力: v('c_cha') },
    comfortLow: v('c_clow'), comfortHigh: v('c_chigh'),
    warmMin: v('c_wmin'), warmMax: v('c_wmax'),
    personality: $('c_personality').value.trim(),
    background: $('c_background').value.trim(),
    speech: $('c_speech').value.trim(),
    hp: max, hunger: max, thirst: max, stamina: max, fatigue: 0, bodyTemp: 0, groggyUntil: -1, dead: false,
  };
  cur = {
    id: 's' + Date.now(), title: $('s_title').value.trim() || name + '的故事',
    person: $('s_person').value, world: $('s_world').value.trim(), startDate: $('s_date').value.trim(),
    clock: hh * 60 + mm, temp: v('s_temp'), char, log: [], created: Date.now(),
  };
  addLog('系統', `故事開始。${clockText(cur.clock)}，氣溫 ${cur.temp} 度。`);
  save(); undoStack = []; enterPlay();
}

function openStory(id) { cur = stories[id]; if (cur.char.fatigue > RATES.fatigueMax) cur.char.fatigue = RATES.fatigueMax; undoStack = []; enterPlay(); }
function enterPlay() { showPage('play'); setMode('角色'); resetTurnForm(); renderAll(); }

// ---------- 時間與計算 ----------
function clockText(m) {
  const d = Math.floor(m / 1440) + 1, t = ((m % 1440) + 1440) % 1440;
  return `第 ${d} 天 ${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
}
function durText(min) {
  if (min < 60) return `${Math.round(min)} 分鐘`;
  const h = min / 60;
  return h < 48 ? `${r1(h)} 小時` : `${r1(h / 24)} 天`;
}
function maxes(c) {
  const base = r1(c.attr.體質 * 10);
  const stage = fatigueStage(c);
  return { hp: base, hunger: base, thirst: base, stamina: r1(base * FATIGUE_STAMINA[stage]) };
}
function fatigueStage(c) { return RATES.fatigueStages.filter(t => c.fatigue >= t).length; }
// 舒適範圍：平常以活動時為準，睡覺時是靜止，往上移
function comfort(c, sleeping) {
  const d = sleeping ? RATES.sleepComfortShift : 0;
  return [c.comfortLow + d, c.comfortHigh + d];
}
let sleepCover = 0; // 睡覺時蓋的被子、毯子保暖度，只在睡覺時加上去
function warmthUsed(c, ambient, sleeping) {
  const [lo, hi] = comfort(c, sleeping);
  const mid = (lo + hi) / 2;
  const add = sleeping ? sleepCover : 0; // 被子熱了可以踢開，所以只加在上限
  return clamp(mid - ambient, c.warmMin, c.warmMax + add);
}
function feltTemp(c, ambient, sleeping) { return r1(ambient + warmthUsed(c, ambient, sleeping)); }

// 把時間往前推 minutes 分鐘，opts.sleep：睡覺品質；opts.rest：休息
function advance(minutes, opts = {}) {
  const c = cur.char;
  let left = minutes;
  while (left > 0 && !c.dead) {
    const dt = Math.min(10, left); left -= dt;
    const h = dt / 60;
    const mx = maxes(c);
    c.hunger = Math.max(0, c.hunger - RATES.hungerPerHour * h);
    const sweating = feltTemp(c, cur.temp, !!opts.sleep) > comfort(c, !!opts.sleep)[1];
    c.thirst = Math.max(0, c.thirst - RATES.thirstPerHour * (sweating ? RATES.hotThirstMult : 1) * h);
    if (c.hunger <= 0) c.hp -= RATES.starveHpPerHour * h;
    if (c.thirst <= 0) c.hp -= RATES.dehydrateHpPerHour * h;
    if (opts.sleep) c.fatigue = Math.max(0, c.fatigue - RATES.fatigueSleepPerHour * opts.sleep * h);
    else c.fatigue = Math.min(RATES.fatigueMax, c.fatigue + RATES.fatigueAwakePerHour * h);
    const felt = feltTemp(c, cur.temp, !!opts.sleep);
    const [lo, hi] = comfort(c, !!opts.sleep);
    const over = felt < lo ? lo - felt : felt > hi ? felt - hi : 0;
    const push = Math.max(0, over - RATES.tempTolerance);
    if (push > 0) c.bodyTemp += (felt < lo ? -1 : 1) * push ** 2 * RATES.tempDriftFactor * h;
    else if (over > 0) { /* 身體撐得住，不惡化也不回暖 */ }
    else c.bodyTemp = c.bodyTemp > 0 ? Math.max(0, c.bodyTemp - RATES.tempRecoverPerHour * h) : Math.min(0, c.bodyTemp + RATES.tempRecoverPerHour * h);
    c.bodyTemp = clamp(c.bodyTemp, -10, 10);
    if (Math.abs(c.bodyTemp) >= RATES.tempDanger) c.hp -= RATES.tempHpPerHour * (1 + Math.abs(c.bodyTemp) - RATES.tempDanger) * h;
    if (opts.intensity) c.exert = (c.exert || 0) + (RATES.exertPerMin[opts.intensity] || 0) * dt;
    if (opts.sleep || opts.rest) c.stamina += mx.stamina * (dt / RATES.restFullMinutes);
    else if (opts.intensity) c.stamina -= (RATES.intensity[opts.intensity] || 0) * (sweating ? RATES.hotStaminaMult : 1) * h;
    c.stamina = clamp(c.stamina, 0, maxes(c).stamina);
    if (c.hp <= 0) { c.hp = 0; c.dead = true; }
    cur.clock += dt;
  }
}

function sleepQuality(c, bed) {
  let q = clamp(bed / 7, 0.1, 1.25);
  const felt = feltTemp(c, cur.temp, true);
  const [lo, hi] = comfort(c, true);
  if (felt < lo || felt > hi) q *= 0.6;
  const mx = maxes(c);
  if (c.hunger / mx.hunger < 0.2 || c.thirst / mx.thirst < 0.2) q *= 0.6;
  q *= 1 + RATES.exertSleepBonus * Math.min(1, (c.exert || 0) / RATES.exertFull);
  return q;
}

// ---------- 主畫面 ----------
function renderAll() { renderStatus(); renderLog(); }

function bar(label, val, max, color) {
  const pct = max > 0 ? clamp(val / max * 100, 0, 100) : 0;
  return `<div class="stat"><div class="label"><span>${label}</span><span>${r1(val)} / ${r1(max)}</span></div>
    <div class="bar"><div class="fill" style="left:0;width:${pct}%;background:var(${color})"></div></div></div>`;
}

function renderStatus() {
  const c = cur.char, mx = maxes(c);
  $('clock').textContent = clockText(cur.clock);
  $('clockSub').textContent = `${cur.startDate ? cur.startDate + '・' : ''}氣溫 ${cur.temp} 度，體感 ${feltTemp(c, cur.temp)} 度`;
  const hp = clamp(c.hunger / mx.hunger * 50, 0, 50), tp = clamp(c.thirst / mx.thirst * 50, 0, 50);
  const stage = fatigueStage(c);
  const needle = (c.bodyTemp + 10) / 20 * 100;
  const conds = [];
  if (c.dead) conds.push('已死亡');
  if (c.hunger <= 0) conds.push('餓到見底，正在扣血');
  if (c.thirst <= 0) conds.push('渴到見底，正在扣血');
  if (c.bodyTemp <= -RATES.tempDanger) conds.push('失溫，正在扣血');
  if (c.bodyTemp >= RATES.tempDanger) conds.push('中暑，正在扣血');
  if (c.groggyUntil > cur.clock) conds.push('剛睡醒昏沉（敏捷、感知小扣）');
  if (stage >= 3) conds.push('疲憊：感知、敏捷小扣');
  $('statusCard').innerHTML = `
    ${bar('血量', c.hp, mx.hp, '--hp')}
    ${bar('體力', c.stamina, mx.stamina, '--stamina')}
    <div class="stat"><div class="label"><span>飢餓 ${r1(c.hunger)}</span><span>口渴 ${r1(c.thirst)}</span></div>
      <div class="bar dual"><div class="fill h" style="width:${hp}%"></div><div class="fill t" style="width:${tp}%"></div></div></div>
    <div class="stat"><div class="label"><span>疲勞</span><span>${FATIGUE_NAMES[stage]}</span></div>
      <div class="boxes">${[0, 1, 2, 3, 4].map(i => `<span class="${i <= stage ? 'on' : ''}"></span>`).join('')}</div></div>
    <div class="stat"><div class="label"><span>冷熱</span><span>${tempWord(c.bodyTemp)}</span></div>
      <div class="bar temp"><div class="needle" style="left:calc(${needle}% - 1px)"></div></div></div>
    ${conds.map(s => `<div class="cond">${s}</div>`).join('')}`;
  const a = c.attr;
  $('charCard').innerHTML = `<span style="color:var(--accent)">${esc(c.name)}</span>　${c.height} 公分・${c.weight} 公斤<br>
    力量 ${a.力量}　敏捷 ${a.敏捷}　體質 ${a.體質}<br>智力 ${a.智力}　感知 ${a.感知}　魅力 ${a.魅力}<br>
    <span class="muted">舒適 ${c.comfortLow}～${c.comfortHigh} 度（睡覺 ${c.comfortLow + RATES.sleepComfortShift}～${c.comfortHigh + RATES.sleepComfortShift}）・衣物保暖 ${c.warmMin}～${c.warmMax}</span>`;
}
function tempWord(t) {
  if (t <= -RATES.tempDanger) return '失溫';
  if (t <= -3) return '很冷';
  if (t < -0.5) return '有點冷';
  if (t >= RATES.tempDanger) return '中暑';
  if (t >= 3) return '很熱';
  if (t > 0.5) return '有點熱';
  return '正常';
}

function addLog(type, text) { cur.log.push({ type, text, clock: cur.clock }); }
function renderLog() {
  const tags = { 角色: '角色行動', 作者: '作者', 故事: '', 系統: '' };
  $('log').innerHTML = cur.log.map(e => `<div class="entry ${e.type}">${tags[e.type] ? `<span class="tag">${tags[e.type]}・${clockText(e.clock)}</span>` : ''}${esc(e.text)}</div>`).join('') || '<p class="muted small">故事還沒開始寫。</p>';
  $('log').scrollTop = $('log').scrollHeight;
}

function setMode(m) {
  mode = m;
  $('m_char').classList.toggle('on', m === '角色');
  $('m_author').classList.toggle('on', m === '作者');
  $('modeHint').textContent = m === '角色' ? `以 ${cur ? cur.char.name : '角色'} 的身分行動` : '以作者身分寫一段或下指示';
  $('input').placeholder = m === '角色' ? '角色這回合做什麼？例：沿著溪往下游走，邊走邊找能吃的東西。' : '作者寫一段文字，或指示接下來要發生什麼。';
}

function pushUndo() {
  undoStack.push(JSON.stringify(cur));
  if (undoStack.length > 30) undoStack.shift();
}
function undoTurn() {
  if (!undoStack.length) { toast('沒有可以復原的'); return; }
  cur = JSON.parse(undoStack.pop()); save(); renderAll(); toast('已復原');
}

function recordOnly() {
  const text = $('input').value.trim();
  if (!text) { toast('先寫點什麼'); return; }
  pushUndo(); addLog(mode, text); $('input').value = ''; save(); renderLog();
  toast('記下了，記得在回合表填這回合發生什麼');
}

// ---------- AI 提示詞 ----------
function needWord(kind, v, max) {
  const p = v / max;
  if (p > 0.7) return kind === '飢餓' ? '不餓' : '不渴';
  const w = p > 0.4 ? '有點' : p > 0.15 ? '很' : p > 0 ? '極度' : '';
  return w ? w + (kind === '飢餓' ? '餓' : '渴') : (kind === '飢餓' ? '餓到見底' : '渴到見底');
}
function buildTurnPrompt(action, actMode) {
  const c = cur.char, mx = maxes(c), a = c.attr;
  const recent = cur.log.slice(-10).map(e => `${e.type === '故事' ? '' : '（' + e.type + '）'}${e.text}`).join('\n');
  const need = (n, v, m) => `${n} ${r1(v)}／${r1(m)}（${needWord(n, v, m)}）`;
  return `你是一篇小說的敘事者，和作者一起用「存活模擬」寫故事。網頁負責記數字和計算，你負責判斷和描述。

【規則】
- 用繁體中文、${cur.person}寫，寫小說的文字，不要寫成遊戲說明。
- 只寫這一段發生的事。不替角色做作者沒交代的重大決定。
- 要合理、有真實感。角色的狀態以下面的數字為準，不要自己改。
- 故事寫完後，在最後附上狀態區塊，格式照抄，填這一段的變化：
【狀態】
類型：一般（或 休息、睡覺）
耗時：數字 加 分鐘、小時 或 天（睡覺不用填，網頁會算。走路參考：平路每小時約 5 公里，沒有路約 4 公里，每爬升 600 公尺多加 1 小時）
飢餓：這段吃東西恢復多少，沒吃填 0（滿是 ${r1(mx.hunger)}；參考：1 點約 67 大卡，一碗飯約 3、一頓正餐約 10、一整天的飯量約 36）
口渴：這段喝水恢復多少，沒喝填 0（滿是 ${r1(mx.thirst)}；參考：1 點約 40 毫升，一杯水約 6、一公升約 25、一整天的水量約 72）
強度：這段主要的活動強度，輕、中、重、極重 選一個（輕＝坐著、手工、慢走；中＝趕路、搬東西；重＝鏟土、爬坡、扛重物；極重＝衝刺、打架）。網頁會照強度和耗時算體力
體力：強度以外的額外體力變化，沒有填 0（滿是 ${r1(mx.stamina)}）
血量：受傷填負數，沒有填 0（滿是 ${r1(mx.hp)}）
氣溫：現在環境幾度（數字）
寢具：睡覺才填，0～10（${BED_REF}）
被子：睡覺才填，蓋的東西能抵多少度，沒蓋填 0（${COVER_REF}）
【狀態結束】

【世界觀】
${cur.world || '和現實一樣。'}${cur.startDate ? '\n故事開始的日期：' + cur.startDate : ''}

【角色】
${c.name}，${c.height} 公分，${c.weight} 公斤。
力量 ${a.力量}、敏捷 ${a.敏捷}、體質 ${a.體質}、智力 ${a.智力}、感知 ${a.感知}、魅力 ${a.魅力}（一般人約 10）。
${c.personality ? '個性：\n' + c.personality + '\n' : ''}${c.background ? '背景：' + c.background + '\n' : ''}${c.speech ? '說話方式：' + c.speech : ''}

【現在】
${clockText(cur.clock)}，氣溫 ${cur.temp} 度。
${need('飢餓', c.hunger, mx.hunger)}、${need('口渴', c.thirst, mx.thirst)}
血量 ${r1(c.hp)}／${r1(mx.hp)}，體力 ${r1(c.stamina)}／${r1(mx.stamina)}，疲勞：${FATIGUE_NAMES[fatigueStage(c)]}，冷熱：${tempWord(c.bodyTemp)}
${c.groggyUntil > cur.clock ? '剛睡醒，還有點昏沉。\n' : ''}${c.dead ? '角色已經死亡。\n' : ''}
【最近發生的事】
${recent || '（故事剛開始）'}

【這一段】
${actMode === '角色' ? c.name + '的行動：' : '作者的指示：'}${action}`;
}

function copyTurnPrompt() {
  const text = $('input').value.trim();
  if (!text) { toast('先寫這回合要做什麼'); return; }
  const p = buildTurnPrompt(text, mode);
  pushUndo(); addLog(mode, text); $('input').value = ''; save(); renderLog();
  copyText(p, '提示詞已複製，貼給 AI，再把回覆貼回下面');
  $('pasteBox').open = true;
}

function copyText(text, msg) {
  const done = () => toast(msg);
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, msg));
  } else fallbackCopy(text, msg);
}
function fallbackCopy(text, msg) {
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast(msg); } catch (e) { prompt('請手動複製：', text); }
  ta.remove();
}

function readAIReply() {
  const raw = $('aiReply').value.trim();
  if (!raw) { toast('先貼上 AI 的回覆'); return; }
  const start = raw.search(/[【\[]\s*狀態\s*[】\]]/);
  let story = raw, block = '';
  if (start >= 0) {
    story = raw.slice(0, start).trim();
    block = raw.slice(start).replace(/[【\[]\s*狀態結束\s*[】\]][\s\S]*$/, '');
  }
  story = story.replace(/\*\*/g, '').trim();
  pushUndo();
  if (story) addLog('故事', story);
  save(); renderLog();
  $('aiReply').value = '';
  if (!block) { $('aiMsg').textContent = '讀到故事，但找不到狀態區塊，請在回合表手動填。'; return; }
  const f = parseLines(block);
  resetTurnForm();
  if (f['類型']) { const t = ['睡覺', '休息', '一般'].find(k => f['類型'].includes(k)); if (t) $('t_type').value = t; }
  if (f['耗時']) {
    const m = f['耗時'].match(/(\d+(?:\.\d+)?)\s*(分鐘|分|小時|時|天|日)?/);
    if (m) { $('t_dur').value = m[1]; $('t_unit').value = /天|日/.test(m[2] || '') ? '天' : /時/.test(m[2] || '') ? '小時' : '分鐘'; }
  }
  const set = (k, id) => { if (f[k] != null && !isNaN(num(f[k], NaN))) $(id).value = num(f[k]); };
  set('飢餓', 't_hunger'); set('口渴', 't_thirst'); set('體力', 't_stamina');
  if (f['強度']) { const k = ['極重', '輕', '中', '重'].find(k => f['強度'].includes(k)); if (k) $('t_int').value = k; } set('血量', 't_hp');
  set('氣溫', 't_temp'); set('寢具', 't_bed'); set('被子', 't_cover');
  refreshTurnForm();
  $('aiMsg').textContent = '已填入回合表，檢查後按「套用」。';
}

// ---------- 回合表 ----------
function resetTurnForm() {
  if (!cur) return;
  $('t_type').value = '一般'; $('t_dur').value = 0; $('t_unit').value = '分鐘';
  ['t_hunger', 't_thirst', 't_stamina', 't_hp'].forEach(id => $(id).value = 0);
  $('t_int').value = '輕';
  $('t_temp').value = cur.temp; $('t_bed').value = 2; $('t_cover').value = 0; $('t_wake').value = '';
  $('t_wmin').value = cur.char.warmMin; $('t_wmax').value = cur.char.warmMax;
  refreshTurnForm();
}
function refreshTurnForm() {
  const sleep = $('t_type').value === '睡覺';
  document.querySelectorAll('.t_sleep').forEach(e => e.classList.toggle('hidden', !sleep));
  document.querySelectorAll('.t_notsleep').forEach(e => e.classList.toggle('hidden', sleep));
}

function subject() {
  return cur.person === '第一人稱' ? '我' : cur.person === '第二人稱' ? '你' : cur.char.name;
}

function applyTurn() {
  const c = cur.char;
  if (c.dead) { toast('角色已經死亡'); return; }
  pushUndo();
  const before = { stage: fatigueStage(c), temp: tempWord(c.bodyTemp), hunger: c.hunger > 0, thirst: c.thirst > 0 };
  const type = $('t_type').value;
  const who = subject();
  const lines = [];
  // 環境與衣物先更新，再推進時間
  cur.temp = num($('t_temp').value, cur.temp);
  c.warmMin = num($('t_wmin').value, c.warmMin);
  c.warmMax = num($('t_wmax').value, c.warmMax);
  // 吃喝、受傷、用力（發生在這段裡，先加上去）
  const mx = maxes(c);
  const dh = num($('t_hunger').value), dt = num($('t_thirst').value), ds = num($('t_stamina').value), dhp = num($('t_hp').value);
  if (dh) { c.hunger = clamp(c.hunger + dh, 0, mx.hunger); lines.push(dh > 0 ? `${who}吃了東西，飢餓恢復了 ${r1(dh)}。` : `飢餓減少 ${r1(-dh)}。`); }
  if (dt) { c.thirst = clamp(c.thirst + dt, 0, mx.thirst); lines.push(dt > 0 ? `${who}喝了水，口渴恢復了 ${r1(dt)}。` : `口渴減少 ${r1(-dt)}。`); }
  if (dhp) { c.hp = clamp(c.hp + dhp, 0, mx.hp); lines.push(dhp < 0 ? `${who}受了傷，血量減少 ${r1(-dhp)}。` : `${who}的傷好了一些，血量恢復 ${r1(dhp)}。`); if (c.hp <= 0) c.dead = true; }

  if (type === '睡覺') {
    const bed = num($('t_bed').value, 2);
    sleepCover = num($('t_cover').value, 0);
    const q = sleepQuality(c, bed);
    let hours, result;
    if (q < RATES.badSleepQuality) {
      hours = 1.5;
      const why = [];
      if (bed < 3) why.push('睡的地方太硬');
      const felt = feltTemp(c, cur.temp, true);
      const [lo, hi] = comfort(c, true);
      if (felt < lo) why.push('太冷'); else if (felt > hi) why.push('太熱');
      const m2 = maxes(c);
      if (c.hunger / m2.hunger < 0.2) why.push('太餓');
      if (c.thirst / m2.thirst < 0.2) why.push('太渴');
      result = `${why.length ? why.join('、') + '，' : ''}睡不著，睡一下就醒了`;
    } else {
      const need = c.fatigue / (RATES.fatigueSleepPerHour * q);
      const over = c.fatigue >= RATES.oversleepFatigue;
      hours = Math.min(RATES.sleepCapHours, Math.max(0.5, need) + (over ? RATES.oversleepHours : 0));
      result = over ? '睡過頭了，醒來有點昏沉' : q < 0.7 ? '睡得不好' : '睡得還不錯';
      c.groggyUntil = over ? -2 : -3; // 醒來時再設定：-2 睡過頭、-3 一般
    }
    const wake = num($('t_wake').value, NaN);
    let woken = false;
    if (!isNaN(wake) && wake > 0 && wake < hours) { hours = wake; woken = true; }
    advance(Math.round(hours * 60), { sleep: q });
    if (c.groggyUntil === -2) c.groggyUntil = cur.clock + RATES.groggyMinutes;
    else if (c.groggyUntil === -3) c.groggyUntil = cur.clock + RATES.wakeGroggyMinutes;
    sleepCover = 0;
    const tired = (c.exert || 0) >= RATES.exertFull / 2;
    c.exert = 0;
    lines.push(`${who}睡了 ${r1(hours)} 小時（寢具 ${bed}${num($('t_cover').value) ? '、被子 ' + num($('t_cover').value) : ''}），${woken ? '中途被弄醒' : result}${tired && !woken && q >= RATES.badSleepQuality ? '，累了一天睡得很沉' : ''}。`);
    if (fatigueStage(c) >= 1) lines.push(`醒來時還沒完全恢復，疲勞：${FATIGUE_NAMES[fatigueStage(c)]}。`);
  } else {
    let min = num($('t_dur').value);
    const unit = $('t_unit').value;
    if (unit === '小時') min *= 60; else if (unit === '天') min *= 1440;
    if (ds) { c.stamina = clamp(c.stamina + ds, 0, mx.stamina); if (ds < 0) lines.push(`體力消耗 ${r1(-ds)}。`); }
    if (min > 0) {
      const inten = $('t_int').value;
      const wasUp = c.stamina > 0;
      advance(Math.round(min), { rest: type === '休息', intensity: type === '一般' ? inten : null });
      lines.unshift(type === '休息' ? `${who}休息了 ${durText(min)}。` : `過了 ${durText(min)}（${inten}度活動）。`);
      if (type === '一般' && wasUp && c.stamina <= 0) lines.push(`${who}的體力耗盡了，得停下來休息。`);
    }
  }

  // 變化提醒
  const st = fatigueStage(c);
  if (st !== before.stage && type !== '睡覺') lines.push(`疲勞變成「${FATIGUE_NAMES[st]}」。`);
  const tw = tempWord(c.bodyTemp);
  if (tw !== before.temp) lines.push(`${who}現在覺得${tw === '正常' ? '冷熱剛好' : tw}。`);
  if (before.hunger && c.hunger <= 0) lines.push(`${who}餓到極限了，身體開始受損。`);
  if (before.thirst && c.thirst <= 0) lines.push(`${who}渴到極限了，身體開始受損。`);
  if (c.dead) lines.push(`${who}死了。`);

  addLog('系統', lines.join('') || '沒有變化。');
  save(); resetTurnForm(); renderAll();
  $('aiMsg').textContent = '';
}

// ---------- 匯出匯入 ----------
function exportSave() {
  const blob = new Blob([JSON.stringify(cur, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `存活模擬_${cur.title}.json`;
  a.click(); URL.revokeObjectURL(a.href);
}
function importSave(ev) {
  const file = ev.target.files[0]; if (!file) return;
  file.text().then(t => {
    try {
      const s = JSON.parse(t);
      if (!s.id || !s.char) throw 0;
      if (stories[s.id] && !confirm('已經有同一個故事，要用匯入的覆蓋嗎？')) return;
      stories[s.id] = s; cur = null; save(); renderStoryList(); toast('匯入完成');
    } catch (e) { toast('這個檔案讀不懂'); }
  });
  ev.target.value = '';
}

// ---------- 開始 ----------
try { if (localStorage.getItem('survsim_theme') === 'beige') document.documentElement.dataset.theme = 'beige'; } catch (e) {}
load();
showHome();

// 存活模擬：換角色系統（多角色，設計 2026-10-03，做 2026-10-04）
// - 一個故事可以有好幾個能操作的角色，各有完整資料（屬性、身形、需求、物品）。
// - 時鐘只有一個、只往前走。每個角色記 at＝他的數字算到哪個時間。
// - 同一隊（group 一樣）的角色一起行動：操作其中一個時，其他人照同樣的時間、強度一起算，吃喝受傷寫在狀態區塊「同行」。
// - 分開行動的角色會落後（at 比時鐘早）。切回他時要先「補算」這段時間：
//   請 AI 總結這段發生的重要事（吃了什麼、睡在哪、有沒有受傷、物品多了少了什麼），網頁照總結和經過的時間大概算；
//   作者可以寫建議給 AI；沒有 AI 就自己填，網頁照樣算。
// - 切到角色模式時預設上一個用的角色（就是 active，不會自己變）。

function party() { return cur.chars.filter((m, k) => k !== cur.active && m.group === cur.char.group && !m.dead); }
function behind(c) { return (c.at ?? cur.clock) < cur.clock; }
function newGroupId() { return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

// ---------- 給 AI 的提示詞 ----------
function othersForPrompt() {
  if (cur.chars.length < 2) return '';
  const mates = party();
  const apart = cur.chars.filter(m => m !== cur.char && !mates.includes(m));
  const brief = m => {
    const mx = maxes(m), a = m.attr;
    return `${m.name}：${m.height} 公分，${m.weight} 公斤；力量 ${a.力量}、敏捷 ${a.敏捷}、體質 ${a.體質}、智力 ${a.智力}、感知 ${a.感知}、魅力 ${a.魅力}。${m.personality ? '個性：' + m.personality.split(/\r?\n/).filter(Boolean).join('；') + '。' : ''}${m.speech ? '說話方式：' + m.speech + '。' : ''}
  現在：${needWord('飢餓', m.hunger, mx.hunger)}、${needWord('口渴', m.thirst, mx.thirst)}，血量 ${r1(m.hp)}／${r1(mx.hp)}，疲勞：${FATIGUE_NAMES[fatigueStage(m)]}，冷熱：${tempWord(m.bodyTemp)}${m.dead ? '，已經死亡' : ''}。`;
  };
  return `${mates.length ? '\n【同行的角色】（跟著一起行動）\n' + mates.map(brief).join('\n') + '\n' : ''}${apart.length ? '\n【分開行動的角色】（這段不在場）\n' + apart.map(m => m.name + (m.dead ? '（已經死亡）' : '')).join('、') + '\n' : ''}`;
}

// ---------- AI 狀態區塊：同行 ----------
let companionFix = []; // { name, hunger, thirst, hp }，套用回合時加上去
function parseCompanions(f) {
  companionFix = [];
  const v = f['同行'];
  if (!v || /^(無|沒有)$/.test(v.trim())) return;
  v.split(/[；;]/).map(x => x.trim()).filter(Boolean).forEach(s => {
    const p = s.split(/[｜|]/).map(x => x.trim());
    const fix = { name: p[0], hunger: 0, thirst: 0, hp: 0 };
    p.slice(1).forEach(x => {
      const n = num((x.match(/[-－+＋]?\d+(?:\.\d+)?/) || [''])[0].replace('－', '-'), 0);
      if (/飢餓|吃/.test(x)) fix.hunger = n; else if (/口渴|喝/.test(x)) fix.thirst = n; else if (/血/.test(x)) fix.hp = n;
    });
    companionFix.push(fix);
  });
}
function applyCompanions(mates) {
  const lines = [];
  for (const f of companionFix) {
    const m = mates.find(x => x.name === f.name) || mates.find(x => f.name.includes(x.name) || x.name.includes(f.name));
    if (!m) continue;
    const mx = maxes(m), part = [];
    if (f.hunger) { m.hunger = clamp(m.hunger + f.hunger, 0, mx.hunger); part.push(`飢餓 ${f.hunger > 0 ? '+' : ''}${r1(f.hunger)}`); }
    if (f.thirst) { m.thirst = clamp(m.thirst + f.thirst, 0, mx.thirst); part.push(`口渴 ${f.thirst > 0 ? '+' : ''}${r1(f.thirst)}`); }
    if (f.hp) { m.hp = clamp(m.hp + f.hp, 0, mx.hp); part.push(`血量 ${f.hp > 0 ? '+' : ''}${r1(f.hp)}`); if (m.hp <= 0) m.dead = true; }
    if (part.length) lines.push(`${m.name}：${part.join('，')}。${m.dead ? m.name + '死了。' : ''}`);
  }
  mates.forEach(m => { if (m.dead && !companionFix.some(f => f.name === m.name)) lines.push(`${m.name}撐不下去，死了。`); });
  companionFix = [];
  return lines;
}

// ---------- 輸入框旁邊的角色選單 ----------
function renderCharPick() {
  if (!cur) return;
  const sel = $('charPick');
  sel.classList.toggle('hidden', cur.chars.length < 2 || mode !== '角色');
  sel.innerHTML = cur.chars.map((m, k) => `<option value="${k}">${esc(m.name)}${m.dead ? '（死亡）' : behind(m) ? '（分開中）' : m.group === cur.char.group && k !== cur.active ? '（同行）' : ''}</option>`).join('');
  sel.value = cur.active;
}
function setActive(k) {
  k = Number(k);
  if (!cur.chars[k] || k === cur.active) return;
  cur.active = k;
  save(); resetTurnForm(); renderAll(); setMode(mode);
  $('storyName').textContent = cur.title;
  toast(`現在操作：${cur.char.name}`);
  if (behind(cur.char) && !cur.char.dead) openCatchup();
}

// ---------- 角色視窗 ----------
function openChars() { renderChars(); openModal('charsModal'); }
function renderChars() {
  const btn = (label, call, ghost = true) => `<button class="${ghost ? 'ghost ' : ''}small" onclick="${call}">${label}</button>`;
  $('charsList').innerHTML = cur.chars.map((m, k) => {
    const me = k === cur.active, mate = !me && m.group === cur.char.group;
    const mx = maxes(m);
    const tag = me ? '<span class="tagPill">現在操作</span>' : mate ? '<span class="tagPill">同行</span>' : '<span class="muted small">　分開行動</span>';
    const late = behind(m) ? `<div class="small cond">數字停在 ${clockText(m.at)}，落後 ${durText(cur.clock - m.at)}，切過去時要補算</div>` : '';
    return `<div class="invRow"><div><span>${esc(m.name)}</span>${tag}${m.dead ? '<span class="muted small">　已死亡</span>' : ''}
      <div class="muted small">血量 ${r1(m.hp)}／${r1(mx.hp)}・${needWord('飢餓', m.hunger, mx.hunger)}・${needWord('口渴', m.thirst, mx.thirst)}・${FATIGUE_NAMES[fatigueStage(m)]}・${tempWord(m.bodyTemp)}</div>${late}</div>
      <div class="invBtns">${me ? '' : btn('切換過去', `closeModal('charsModal');setActive(${k})`, false)}${me ? '' : mate ? btn('分開行動', `splitChar(${k})`) : btn('一起行動', `joinChar(${k})`)}${cur.chars.length > 1 ? btn('刪除', `deleteChar(${k})`) : ''}</div></div>`;
  }).join('');
}
function splitChar(k) {
  const m = cur.chars[k];
  pushUndo(); m.group = newGroupId();
  addLog('系統', `${m.name}和${cur.char.name}分開行動。`);
  save(); renderLog(); renderChars(); renderCharPick();
}
function joinChar(k) {
  const m = cur.chars[k];
  if (behind(m) && !m.dead) {
    // 落後的人要先補完那段時間才能會合：先切過去補算，補完再回來按一起行動
    toast(`${m.name}要先補算分開的那段時間，補完再按「一起行動」`);
    closeModal('charsModal'); setActive(k); return;
  }
  if (behind(cur.char)) { toast(`${cur.char.name}自己還沒補算`); return; }
  pushUndo(); m.group = cur.char.group;
  addLog('系統', `${m.name}和${cur.char.name}會合，一起行動。`);
  save(); renderLog(); renderChars(); renderCharPick();
}
function deleteChar(k) {
  const m = cur.chars[k];
  if (!confirm(`刪除角色「${m.name}」？他的狀態和物品都會刪掉。只是死了或離開的話，建議留著。`)) return;
  pushUndo();
  cur.chars.splice(k, 1);
  if (cur.active >= k && cur.active > 0) cur.active--;
  addLog('系統', `作者刪除了角色：${m.name}。`);
  save(); renderAll(); setMode(mode); renderChars();
}

// ---------- 新增角色：借用開新故事頁的角色欄位（也能交給 AI 設定） ----------
let setupMode = 'story';
function setSetupMode(m) {
  setupMode = m;
  const forChar = m === 'char';
  ['setupStoryCard', 'setupWorldCard'].forEach(id => $(id).classList.toggle('hidden', forChar));
  $('setupHead').classList.toggle('hidden', !forChar);
  $('s_togetherRow').classList.toggle('hidden', !forChar);
  $('setupGo').textContent = forChar ? '加入這個角色' : '開始故事';
}
function showAddChar() {
  closeModal('charsModal');
  setSetupMode('char');
  $('s_idea').value = ''; $('s_reply').value = ''; $('s_msg').textContent = '';
  ['c_name', 'c_personality', 'c_background', 'c_speech'].forEach(id => $(id).value = '');
  $('c_height').value = 170; $('c_weight').value = 65; $('c_clow').value = 22; $('c_chigh').value = 26;
  ['c_str', 'c_dex', 'c_con', 'c_int', 'c_wis', 'c_cha'].forEach(id => $(id).value = 10);
  $('c_wear').value = DEFAULT_WEAR; $('c_carry').value = DEFAULT_CARRY;
  $('s_together').checked = true;
  showPage('setup');
}
function cancelSetup() { if (setupMode === 'char' && cur) { setSetupMode('story'); showPage('play'); renderAll(); } else showHome(); }
function addCharacter() {
  if (cur.chars.some(m => m.name === $('c_name').value.trim())) { toast('已經有同名的角色'); return; }
  const c = charFromForm();
  if (!c) return;
  pushUndo();
  c.at = cur.clock;
  c.group = $('s_together').checked ? cur.char.group : newGroupId();
  cur.chars.push(c);
  addLog('系統', `新角色加入：${c.name}${$('s_together').checked ? '，和' + cur.char.name + '一起行動' : '，分開行動'}。`);
  setSetupMode('story');
  save(); showPage('play'); renderAll(); setMode(mode);
  toast(`${c.name}加入了，可以在輸入框旁邊切換`);
}

// ---------- 補算分開的那段時間 ----------
function catchGap() { return Math.max(0, cur.clock - (cur.char.at ?? cur.clock)); }
function openCatchup() {
  const c = cur.char, gap = catchGap();
  if (!gap) { toast(`${c.name}不用補算`); return; }
  $('cuHead').textContent = `${c.name}從 ${clockText(c.at)} 到 ${clockText(cur.clock)}，分開了 ${durText(gap)}。`;
  // 預設照一天睡 8 小時估，玩家或 AI 再改
  $('cu_sleep').value = r1(Math.min(gap / 60, gap / 1440 * 8));
  $('cu_bed').value = 2; $('cu_int').value = '輕';
  ['cu_hunger', 'cu_thirst', 'cu_hp'].forEach(id => $(id).value = 0);
  ['cu_use', 'cu_gain', 'cu_summary', 'cu_hint'].forEach(id => $(id).value = '');
  catchFields = null;
  openModal('catchModal');
}
function buildCatchupPrompt() {
  const c = cur.char, gap = catchGap();
  const hint = $('cu_hint').value.trim();
  return `這篇小說裡，${c.name}跟其他角色分開行動了 ${durText(gap)}（${clockText(c.at)} 到 ${clockText(cur.clock)}）。請總結${c.name}這段時間發生了什麼，只挑重要的事：吃了什麼、睡在哪、睡多久、有沒有受傷、身上的東西多了少了什麼、遇到誰。要合理，符合他的個性和當時的處境。

【規則】
- 用繁體中文、${cur.person}，寫成 3～6 句的小說摘要，不要寫成遊戲說明。
- 不要替他做太重大的決定（例：殺人、離開這個地區），除非作者的建議這樣寫。
- 下面的狀態是分開那時候的數字。
- 摘要寫完後附上補算區塊，格式照抄：
【補算】
睡覺：這段一共睡了幾小時（數字）
寢具：睡的地方舒適度 0～10（${BED_REF}）
強度：醒著時主要的活動強度，輕、中、重、極重 選一個
用掉：身上的東西被吃掉、喝掉、用掉多少，寫「名稱 數量」，多樣用；分隔，沒有填 無（水用毫升）
獲得：拿到的新東西，寫「名稱 數量」，多樣用；分隔，沒有填 無
飢餓：身上物品以外吃到的，沒有填 0（1 點約 67 大卡，一頓正餐約 10）
口渴：身上物品以外喝到的，沒有填 0（1 點約 40 毫升，一杯水約 6）
血量：受傷填負數，沒有填 0
【補算結束】

${storyContext()}
${hint ? '\n【作者的建議】\n' + hint : ''}`;
}
function copyCatchupPrompt() {
  copyText(buildCatchupPrompt(), '貼給 AI，複製 AI 的整段回覆後回來按「貼上 AI 回覆」。');
  waitingFor = 'catchup';
}
let catchFields = null;
function pasteCatchup(t) {
  const si = t.search(/[【\[]\s*補算\s*[】\]]/);
  const summary = (si >= 0 ? t.slice(0, si) : t).replace(/\*\*/g, '').trim();
  const f = si >= 0 ? parseLines(t.slice(si).replace(/[【\[]\s*補算結束\s*[】\]][\s\S]*$/, '')) : {};
  if ($('catchModal').classList.contains('hidden')) openCatchup();
  const set = (k, id) => { if (f[k] != null && !isNaN(num(f[k], NaN))) $(id).value = num(f[k]); };
  set('睡覺', 'cu_sleep'); set('寢具', 'cu_bed'); set('飢餓', 'cu_hunger'); set('口渴', 'cu_thirst'); set('血量', 'cu_hp');
  if (f['強度']) { const k = ['極重', '輕', '中', '重'].find(k => f['強度'].includes(k)); if (k) $('cu_int').value = k; }
  const clean = v => (!v || /^(無|沒有|0)$/.test(v.trim())) ? '' : v.split(/[；;]/).map(x => x.trim()).filter(Boolean).join('\n');
  $('cu_use').value = clean(f['用掉']); $('cu_gain').value = clean(f['獲得']);
  $('cu_summary').value = summary;
  toast('已經照 AI 的回覆填好，檢查後按「套用補算」');
}
function applyCatchup() {
  const c = cur.char, gap = catchGap();
  if (!gap) { closeModal('catchModal'); return; }
  pushUndo();
  const who = c.name, lines = [];
  const summary = $('cu_summary').value.trim();
  if (summary) addLog('故事', `（${who}分開的這段時間）${summary}`);
  // 物品：用掉照回合的算法（食物、飲水自動算飢渴），獲得寫「名稱 數量」
  resetTurnItems();
  parseItemLines({ 用掉: $('cu_use').value.split(/\r?\n/).join('；') });
  $('cu_gain').value.split(/\r?\n|[；;]/).map(x => x.trim()).filter(Boolean).forEach(l => { const it = itemFromText(l); if (it) turnGain.push(it); });
  lines.push(...applyTurnItems(who));
  resetTurnItems();
  const mx = maxes(c);
  const dh = num($('cu_hunger').value), dt = num($('cu_thirst').value), dhp = num($('cu_hp').value);
  if (dh) c.hunger = clamp(c.hunger + dh, 0, mx.hunger);
  if (dt) c.thirst = clamp(c.thirst + dt, 0, mx.thirst);
  if (dhp) { c.hp = clamp(c.hp + dhp, 0, mx.hp); if (c.hp <= 0) c.dead = true; }
  // 時間：先醒著、再睡覺，把時鐘暫時倒回他落後的地方算，算完回到現在
  const now = cur.clock;
  const sleepMin = clamp(Math.round(num($('cu_sleep').value) * 60), 0, gap);
  const inten = $('cu_int').value, bed = num($('cu_bed').value, 2);
  cur.clock = c.at;
  advance(gap - sleepMin, { intensity: inten }, c, true);
  if (sleepMin > 0 && !c.dead) { const q = sleepQuality(c, bed); advance(sleepMin, { sleep: q }, c, true); c.exert = 0; }
  cur.clock = now;
  c.at = now;
  lines.unshift(`補算${who}分開的 ${durText(gap)}：醒著 ${durText(gap - sleepMin)}（${inten}度活動）${sleepMin ? '、睡了 ' + durText(sleepMin) : '、沒睡'}。`);
  if (dh) lines.push(`另外吃到東西，飢餓 ${dh > 0 ? '+' : ''}${r1(dh)}。`);
  if (dt) lines.push(`另外喝到水，口渴 ${dt > 0 ? '+' : ''}${r1(dt)}。`);
  if (dhp) lines.push(dhp < 0 ? `受了傷，血量 ${r1(dhp)}。` : `血量恢復 ${r1(dhp)}。`);
  if (c.dead) lines.push(`${who}沒撐過這段時間。`);
  addLog('系統', lines.join(''));
  save(); renderAll(); closeModal('catchModal');
  toast(`${who}補算好了`);
}

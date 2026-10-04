// 存活模擬：世界設定集（設計 2026-10-03，做 2026-10-04）
// 記 AI 不知道、或會猜錯的東西：跟現實不同的地方，以及故事裡有名字、之後可能再出現的人事物。
// 分兩層：
//   常駐：世界總則，每回合都附 → 就是故事的「世界觀」（年代、跟現實的差異、確認過的顛覆世界觀）
//   條目：靠關鍵字觸發，最近的段落、這回合的行動、進行中的目標提到關鍵字才附；被觸發的條目會帶出「相關」的條目
// 誰來寫：AI 在狀態區塊「設定」提出新條目，玩家確認或改過再登記；沒有 AI 時玩家自己寫。
// 可以操作的角色不放進來（他們有完整的角色資料），這裡的人物是有名字的 NPC。

const LORE_CATS = ['地點', '人物', '組織', '物品', '規則', '事件'];

function lore() { if (!cur.lore) cur.lore = []; return cur.lore; }
function lorePending() { if (!cur.lorePending) cur.lorePending = []; return cur.lorePending; }
// 關鍵字太短（一個字）容易亂觸發，不算；名稱一定算
function loreKeys(e) { return [e.name, ...(e.keys || []).map(k => k.trim()).filter(k => k.length >= 2)]; }
const splitList = v => String(v || '').split(/[、，,／\/]/).map(x => x.trim()).filter(x => x && !/^(無|沒有)$/.test(x));

// 這回合要附哪些條目：掃最近的段落、這回合的行動、進行中的目標
function loreTriggered(extra) {
  const list = lore();
  if (!list.length) return [];
  const { recent } = storySoFar();
  const text = [recent, extra || '', activeGoals().map(g => g.text).join('\n')].join('\n');
  const hit = new Set(list.filter(e => loreKeys(e).some(k => text.includes(k))));
  // 帶出相關的條目（只帶一層，避免整本都附上）
  [...hit].forEach(e => (e.related || []).forEach(n => { const r = list.find(x => x.name === n); if (r) hit.add(r); }));
  return list.filter(e => hit.has(e)); // 照設定集裡的順序，重要的排前面
}
function loreForPrompt(extra) {
  const list = lore();
  if (!list.length) return '';
  const on = loreTriggered(extra);
  const names = list.map(e => e.name).join('、');
  return `\n【相關設定】（這個世界的設定，照這裡寫）\n${on.length ? on.map(e => `${e.name}（${e.cat}）：${e.text}`).join('\n') : '（這段沒有提到）'}\n已經登記的設定：${names}（登記過的不用再提）\n`;
}

// ---------- AI 狀態區塊：設定 ----------
let loreNew = false; // 這次讀回覆有沒有新的待確認條目，套用回合後打開設定集
function parseLore(f) {
  const v = f['設定'];
  if (!v || /^(無|沒有)$/.test(v.trim())) return;
  v.split(/[；;]/).map(x => x.trim()).filter(Boolean).forEach(s => {
    const p = s.split(/[｜|]/).map(x => x.trim());
    if (!p[0] || /^(無|沒有)$/.test(p[0])) return;
    if (lore().some(e => e.name === p[0]) || lorePending().some(e => e.name === p[0])) return;
    lorePending().push({
      name: p[0], cat: LORE_CATS.find(c => (p[1] || '').includes(c)) || '物品',
      keys: splitList(p[2]).filter(k => k !== p[0]), text: p[3] || '', related: splitList(p[4]),
    });
    loreNew = true;
  });
}
function afterTurnLore() {
  if (!loreNew) return;
  loreNew = false;
  openLore();
}

// ---------- 左邊的設定集卡 ----------
function renderLoreCard() {
  if (!cur) return;
  const n = lore().length, w = lorePending().length;
  $('loreCard').innerHTML = `<div class="row" style="justify-content:space-between"><span data-tip="記這個世界跟現實不一樣的地方，和故事裡有名字、之後可能再出現的人事物。世界觀每回合都附；條目要故事提到關鍵字才附，提示詞才不會越來越長。">世界設定集</span><button class="ghost small" onclick="openLore()">打開</button></div>
    <div class="small muted">${n} 條設定${n ? `・這段會附 ${loreTriggered($('input').value).length} 條` : ''}</div>
    ${w ? `<div class="small cond">AI 提了 ${w} 條新設定，等你確認</div>` : ''}`;
}

// ---------- 設定集視窗 ----------
let loreEditing = null; // { from: 'lore' | 'pending', k }，null＝新增
function openLore() {
  $('lr_world').value = cur.world || '';
  loreForm();
  renderLore();
  openModal('loreModal');
}
function saveLoreWorld() {
  const v = $('lr_world').value.trim();
  if (v === (cur.world || '')) { toast('世界觀沒有變動'); return; }
  pushUndo(); cur.world = v; addLog('系統', '作者修改了世界觀。'); save(); renderLog(); toast('世界觀已儲存');
}
function renderLore() {
  const on = new Set(loreTriggered($('input').value));
  const btn = (label, call, ghost = true) => `<button class="${ghost ? 'ghost ' : ''}small" onclick="${call}">${label}</button>`;
  const body = e => `<div class="muted small">${esc(e.cat)}${e.keys && e.keys.length ? '・關鍵字：' + esc(e.keys.join('、')) : ''}${e.related && e.related.length ? '・相關：' + esc(e.related.join('、')) : ''}</div><div class="small">${esc(e.text)}</div>`;
  const pend = lorePending();
  $('lorePend').innerHTML = pend.length ? `<h3>AI 提的新設定（確認後才會登記）</h3>` + pend.map((e, k) => `<div class="invRow"><div><span>${esc(e.name)}</span>${body(e)}</div>
    <div class="invBtns">${btn('登記', `loreAccept(${k})`, false)}${btn('改了再登記', `loreForm('pending',${k})`)}${btn('不要', `loreReject(${k})`)}</div></div>`).join('') : '';
  const list = lore();
  $('loreList').innerHTML = list.length ? list.map((e, k) => `<div class="invRow"><div><span>${esc(e.name)}</span>${on.has(e) ? '<span class="tagPill">這段會附</span>' : ''}${body(e)}</div>
    <div class="invBtns">${k ? btn('↑', `loreMove(${k})`) : ''}${btn('編輯', `loreForm('lore',${k})`)}${btn('刪除', `loreDelete(${k})`)}</div></div>`).join('') : '<p class="muted small">還沒有條目。</p>';
}
function loreForm(from, k) {
  loreEditing = from ? { from, k } : null;
  const e = from === 'lore' ? lore()[k] : from === 'pending' ? lorePending()[k] : null;
  $('loreFormTitle').textContent = from === 'lore' ? '編輯條目' : from === 'pending' ? '改好再登記' : '新增條目';
  $('lr_name').value = e ? e.name : '';
  $('lr_cat').value = e ? e.cat : '地點';
  $('lr_keys').value = e ? (e.keys || []).join('、') : '';
  $('lr_text').value = e ? e.text : '';
  $('lr_rel').value = e ? (e.related || []).join('、') : '';
  $('lr_save').textContent = from === 'lore' ? '儲存修改' : '登記';
  $('lr_cancel').classList.toggle('hidden', !from);
  if (from) $('lr_name').scrollIntoView({ block: 'center' });
}
function saveLoreForm() {
  const name = $('lr_name').value.trim(), text = $('lr_text').value.trim();
  if (!name || !text) { toast('名稱和內容都要寫'); return; }
  const entry = { name, cat: $('lr_cat').value, keys: splitList($('lr_keys').value).filter(x => x !== name), text, related: splitList($('lr_rel').value) };
  const ed = loreEditing;
  const dup = lore().findIndex(e => e.name === name);
  if (dup >= 0 && !(ed && ed.from === 'lore' && ed.k === dup)) { toast('已經有同名的條目'); return; }
  pushUndo();
  if (ed && ed.from === 'lore') {
    const old = lore()[ed.k];
    if (old.name !== name) lore().forEach(e => e.related = (e.related || []).map(n => n === old.name ? name : n)); // 改名時，別的條目的「相關」跟著改
    lore()[ed.k] = entry;
    addLog('系統', `作者修改了設定：${name}。`);
  } else {
    if (ed && ed.from === 'pending') lorePending().splice(ed.k, 1);
    lore().push(entry);
    addLog('系統', `登記設定：${name}（${entry.cat}）。`);
  }
  save(); renderLog(); renderLoreCard(); loreForm(); renderLore();
  toast(ed && ed.from === 'lore' ? '條目已修改' : '已登記');
}
function loreAccept(k) {
  const e = lorePending()[k];
  if (lore().some(x => x.name === e.name)) { toast('已經有同名的條目，請按「改了再登記」換個名字'); return; }
  pushUndo();
  lorePending().splice(k, 1); lore().push(e);
  addLog('系統', `登記設定：${e.name}（${e.cat}）。`);
  save(); renderLog(); renderLoreCard(); loreForm(); renderLore();
}
function loreReject(k) {
  pushUndo(); lorePending().splice(k, 1);
  save(); renderLoreCard(); loreForm(); renderLore();
}
function loreMove(k) {
  const l = lore(); [l[k - 1], l[k]] = [l[k], l[k - 1]];
  save(); renderLore();
}
function loreDelete(k) {
  const e = lore()[k];
  if (!confirm(`刪除設定「${e.name}」？`)) return;
  pushUndo(); lore().splice(k, 1);
  addLog('系統', `刪除設定：${e.name}。`);
  save(); renderLog(); renderLoreCard(); loreForm(); renderLore();
}

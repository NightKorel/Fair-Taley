// 存活模擬：目標系統（設計 2026-10-03，做 2026-10-04）
// 配合寫小說的定位：給 AI 方向、接上時鐘算期限。沒有經驗值、獎勵，失敗也是正常結果。
// 每條只記：內容、期限（可以不填）、狀態（進行中／完成／失敗／放棄）、掛在哪個大目標底下。
// 目標從哪來：作者自己設，或 AI 在狀態區塊「目標」提出（故事裡有人交付、角色決定要做）。
// 完成與否：作者在目標視窗勾，或 AI 在狀態區塊「目標結果」寫。

const GOAL_STATES = ['進行中', '完成', '失敗', '放棄'];
const GOAL_SOON = 24 * 60; // 剩不到這麼多分鐘就標紅提醒

function goals() { if (!cur.goals) cur.goals = []; return cur.goals; }
function goalById(id) { return goals().find(g => g.id === id); }
function activeGoals() { return goals().filter(g => g.status === '進行中'); }
function goalKids(id, list) { return list.filter(g => (g.parent || null) === id); }
function newGoalId() { return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

// 期限文字：「第 3 天 18:00，還剩 1.5 天」或「已經過了 2 小時」
function dueText(g) {
  if (g.due == null) return '';
  const left = g.due - cur.clock;
  return `${clockText(g.due)}，${left >= 0 ? '還剩 ' + durText(left) : '已經過了 ' + durText(-left)}`;
}
function dueSoon(g) { return g.status === '進行中' && g.due != null && g.due - cur.clock < GOAL_SOON; }

function addGoal(text, due, parent, from) {
  const g = { id: newGoalId(), text, due: due ?? null, status: '進行中', parent: parent || null, from, created: cur.clock };
  goals().push(g);
  return g;
}
function setGoalStatus(g, status, by) {
  g.status = status;
  g.ended = status === '進行中' ? null : cur.clock;
  addLog('系統', status === '進行中' ? `目標「${g.text}」改回進行中。` : `目標「${g.text}」${status}了${by ? '（' + by + ' 判斷）' : ''}。`);
}

// 「3 天」「5 小時」「90 分鐘」→ 分鐘；讀不懂回傳 null
function parseSpan(v) {
  const m = String(v || '').match(/(\d+(?:\.\d+)?)\s*(分鐘|分|小時|時|天|日|週|周|星期|個月|月)/);
  if (!m) return null;
  const n = parseFloat(m[1]), u = m[2];
  const per = /週|周|星期/.test(u) ? 10080 : /月/.test(u) ? 43200 : /天|日/.test(u) ? 1440 : /時/.test(u) ? 60 : 1;
  return Math.round(n * per);
}
// 用內容找進行中的目標：一樣的優先，再來是互相包含
function findGoal(text, list = activeGoals()) {
  const t = String(text || '').trim();
  if (!t) return null;
  return list.find(g => g.text === t) || list.find(g => g.text.includes(t) || t.includes(g.text)) || null;
}

// ---------- AI 狀態區塊：目標、目標結果 ----------
function parseGoals(f) {
  const none = v => !v || /^(無|沒有)$/.test(v.trim());
  if (!none(f['目標'])) {
    f['目標'].split(/[；;]/).map(x => x.trim()).filter(Boolean).forEach(e => {
      const p = e.split(/[｜|]/).map(x => x.trim());
      if (none(p[0]) || findGoal(p[0], activeGoals().filter(g => g.text === p[0]))) return;
      const span = none(p[1]) ? null : parseSpan(p[1]);
      const parent = none(p[2]) ? null : findGoal(p[2]);
      const g = addGoal(p[0], span == null ? null : cur.clock + span, parent && parent.id, 'AI');
      addLog('系統', `新目標：${g.text}${parent ? '（屬於「' + parent.text + '」）' : ''}${g.due != null ? '，期限 ' + clockText(g.due) : ''}。`);
    });
  }
  if (!none(f['目標結果'])) {
    f['目標結果'].split(/[；;]/).map(x => x.trim()).filter(Boolean).forEach(e => {
      const p = e.split(/[｜|]/).map(x => x.trim());
      const st = GOAL_STATES.slice(1).find(s => (p[1] || '').includes(s));
      if (!st) return;
      const g = findGoal(p[0]);
      if (g) setGoalStatus(g, st, 'AI');
      else addLog('系統', `AI 說「${p[0]}」${st}了，但找不到這條進行中的目標，可以到目標視窗自己改。`);
    });
  }
}

// ---------- 給 AI 的提示詞 ----------
function goalsForPrompt() {
  const act = activeGoals();
  if (!act.length) return '';
  const lines = [];
  const walk = (id, depth) => goalKids(id, act).forEach(g => {
    lines.push(`${'  '.repeat(depth)}- ${g.text}${g.due != null ? '（期限 ' + dueText(g) + '）' : ''}`);
    walk(g.id, depth + 1);
  });
  walk(null, 0);
  // 大目標已經結束、小目標還在的，也要列出來
  act.filter(g => g.parent && !act.some(p => p.id === g.parent)).forEach(g => {
    lines.push(`- ${g.text}${g.due != null ? '（期限 ' + dueText(g) + '）' : ''}`);
    walk(g.id, 1);
  });
  return `\n【目標】（角色現在想做到的事，縮排的是底下的小目標）\n${lines.join('\n')}\n`;
}

// ---------- 左邊的目標卡 ----------
function renderGoalCard() {
  if (!cur) return;
  const act = activeGoals();
  const top = act.filter(g => !g.parent || !act.some(p => p.id === g.parent));
  const row = g => `<div class="${dueSoon(g) ? 'cond' : ''}">・${esc(g.text)}${g.due != null ? `<div class="small ${dueSoon(g) ? '' : 'muted'}" style="margin-left:1em">${esc(dueText(g))}</div>` : ''}</div>`;
  $('goalCard').innerHTML = `<div class="row" style="justify-content:space-between"><span data-tip="角色現在想做到的事。會附進提示詞，讓 AI 知道情節往哪裡推、什麼算阻礙。期限照遊戲時鐘算。">目標</span><button class="ghost small" onclick="openGoals()">打開</button></div>
    ${top.length ? top.slice(0, 4).map(row).join('') + (act.length > top.slice(0, 4).length ? `<div class="small muted">共 ${act.length} 條進行中</div>` : '') : '<div class="small muted">還沒有目標</div>'}`;
}

// ---------- 目標視窗 ----------
let goalEditing = null; // 正在編輯的目標 id；null＝新增
function openGoals() { goalEditing = null; renderGoals(); goalForm(); openModal('goalModal'); }
function renderGoals() {
  const list = goals();
  const act = list.filter(g => g.status === '進行中');
  const btn = (label, call) => `<button class="ghost small" onclick="${call}">${label}</button>`;
  const row = (g, depth) => `<div class="invRow" style="padding-left:${depth * 18}px"><div><span>${depth ? '└ ' : ''}${esc(g.text)}</span>${g.status !== '進行中' ? `<span class="tagPill">${g.status}</span>` : ''}${g.from === 'AI' ? '<span class="muted small">　AI 加的</span>' : ''}
    ${g.due != null ? `<div class="small ${dueSoon(g) ? 'cond' : 'muted'}">期限 ${esc(dueText(g))}</div>` : ''}</div>
    <div class="invBtns">${g.status === '進行中' ? btn('完成', `goalSet('${g.id}','完成')`) + btn('失敗', `goalSet('${g.id}','失敗')`) + btn('放棄', `goalSet('${g.id}','放棄')`) : btn('改回進行中', `goalSet('${g.id}','進行中')`)}${btn('編輯', `goalForm('${g.id}')`)}${btn('刪除', `goalDelete('${g.id}')`)}</div></div>`;
  const out = [];
  const walk = (id, depth, pool) => goalKids(id, pool).forEach(g => { out.push(row(g, depth)); walk(g.id, depth + 1, pool); });
  walk(null, 0, act);
  act.filter(g => g.parent && !act.some(p => p.id === g.parent)).forEach(g => { out.push(row(g, 0)); walk(g.id, 1, act); });
  const done = list.filter(g => g.status !== '進行中');
  $('goalList').innerHTML = (out.join('') || '<p class="muted small">沒有進行中的目標。</p>') +
    (done.length ? `<details><summary>已經結束的目標（${done.length}）</summary>${done.slice().reverse().map(g => row(g, 0)).join('')}</details>` : '');
}
function goalForm(id) {
  goalEditing = id || null;
  const g = id ? goalById(id) : null;
  $('goalFormTitle').textContent = g ? '編輯目標' : '新增目標';
  $('gl_text').value = g ? g.text : '';
  $('gl_dueType').value = g && g.due != null ? '指定時間' : '不設';
  const d = g && g.due != null ? g.due : cur.clock + 1440;
  $('gl_day').value = Math.floor(d / 1440) + 1;
  $('gl_time').value = `${String(Math.floor((d % 1440) / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`;
  $('gl_num').value = 3;
  // 大目標只能選進行中、而且不是自己或自己底下的
  const below = new Set();
  const mark = x => goals().filter(k => k.parent === x).forEach(k => { below.add(k.id); mark(k.id); });
  if (g) { below.add(g.id); mark(g.id); }
  $('gl_parent').innerHTML = '<option value="">（沒有，這是大目標）</option>' +
    activeGoals().filter(k => !below.has(k.id)).map(k => `<option value="${k.id}">${esc(k.text)}</option>`).join('');
  $('gl_parent').value = g && g.parent && !below.has(g.parent) ? g.parent : '';
  goalDueUI();
  $('gl_save').textContent = g ? '儲存修改' : '新增';
  $('gl_cancel').classList.toggle('hidden', !g);
}
function goalDueUI() {
  const t = $('gl_dueType').value;
  $('gl_rel').classList.toggle('hidden', t !== '幾小時後' && t !== '幾天後');
  $('gl_abs').classList.toggle('hidden', t !== '指定時間');
}
function goalDueValue() {
  const t = $('gl_dueType').value;
  if (t === '幾小時後') return cur.clock + Math.round(num($('gl_num').value) * 60);
  if (t === '幾天後') return cur.clock + Math.round(num($('gl_num').value) * 1440);
  if (t === '指定時間') {
    const [hh, mm] = ($('gl_time').value || '00:00').split(':').map(Number);
    return (Math.max(1, Math.round(num($('gl_day').value, 1))) - 1) * 1440 + hh * 60 + mm;
  }
  return null;
}
function saveGoal() {
  const text = $('gl_text').value.trim();
  if (!text) { toast('先寫目標的內容'); return; }
  pushUndo();
  const due = goalDueValue(), parent = $('gl_parent').value || null;
  const g = goalEditing ? goalById(goalEditing) : null;
  if (g) {
    g.text = text; g.due = due; g.parent = parent;
    addLog('系統', `作者修改了目標：${text}${due != null ? '，期限 ' + clockText(due) : ''}。`);
  } else {
    addGoal(text, due, parent, '作者');
    addLog('系統', `新目標：${text}${parent ? '（屬於「' + goalById(parent).text + '」）' : ''}${due != null ? '，期限 ' + clockText(due) : ''}。`);
  }
  save(); renderLog(); renderGoalCard(); renderGoals(); goalForm();
  toast(g ? '目標已修改' : '目標已新增');
}
function goalSet(id, status) {
  const g = goalById(id); if (!g) return;
  pushUndo(); setGoalStatus(g, status, ''); save(); renderLog(); renderGoalCard(); renderGoals(); goalForm(goalEditing && goalById(goalEditing) ? goalEditing : undefined);
}
function goalDelete(id) {
  const g = goalById(id); if (!g) return;
  const kids = goals().filter(k => k.parent === id);
  if (!confirm(`刪除目標「${g.text}」？${kids.length ? '底下的小目標會變成大目標。' : ''}刪除不會留紀錄，結束的目標建議用完成、失敗或放棄。`)) return;
  pushUndo();
  kids.forEach(k => k.parent = g.parent || null);
  cur.goals = goals().filter(k => k.id !== id);
  save(); renderGoalCard(); renderGoals(); goalForm();
}

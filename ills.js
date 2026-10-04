// 存活模擬：疾病（設計 2026-10-02，做 2026-10-04）
// 疾病是一種「狀態」，大部分不直接扣血，而是透過已經有的條影響角色；重病拖太久才扣血。
// 生不生病由 AI 判斷（喝了不乾淨的水、傷口沒處理、淋雨受凍……），寫在狀態區塊「生病」；治療、痊癒也由 AI 或作者記。
// 網頁負責：照種類改數字、算生病第幾天、時間到自然好（傷口感染不會自己好）。
// 下面的天數和倍數全部暫定，玩過再調。

const ILL_KINDS = {
  感冒: { days: 7, fatigue: 1.5, stamina: 0.85, text: '疲勞累積得快、體力上限下降' },
  拉肚子: { days: 3, thirst: 2, food: 0.5, text: '口渴掉得快、吃下去的東西補得少' },
  發燒: { days: 3, comfort: 4, fatigue: 1.3, text: '覺得冷（舒適溫度往上移 4 度）、比較容易累' },
  傷口感染: { days: 5, fatigue: 1.3, stamina: 0.9, worsenHours: 72, hpPerHour: 0.3, text: '比較容易累；拖 3 天沒治療會開始慢慢扣血' },
};
const TREAT_SPEED = 1.5; // 有治療的話好得快幾倍

function ills(c) { if (!c.ills) c.ills = []; return c.ills; }
function illKind(i) { return ILL_KINDS[i.kind] || ILL_KINDS.感冒; }
function illHours(i) { return (cur.clock - i.since) / 60; }
function illWorse(i) { const k = illKind(i); return !!k.worsenHours && !i.treated && illHours(i) >= k.worsenHours; }

// 所有疾病加起來對數字的影響（倍數相乘、溫度相加）
function illMods(c) {
  const m = { fatigue: 1, thirst: 1, food: 1, stamina: 1, comfort: 0, hp: 0 };
  for (const i of c.ills || []) {
    const k = illKind(i);
    if (k.fatigue) m.fatigue *= k.fatigue;
    if (k.thirst) m.thirst *= k.thirst;
    if (k.food) m.food *= k.food;
    if (k.stamina) m.stamina *= k.stamina;
    if (k.comfort) m.comfort += k.comfort;
    if (illWorse(i)) m.hp += k.hpPerHour;
  }
  return m;
}

function addIll(c, name, kind, why) {
  if (ills(c).some(i => i.name === name)) return '';
  ills(c).push({ name, kind: ILL_KINDS[kind] ? kind : guessKind2(name), since: cur.clock, treated: false });
  return `${c.name}生病了：${name}${why ? '（' + why + '）' : ''}。`;
}
function guessKind2(name) { return Object.keys(ILL_KINDS).find(k => name.includes(k)) || (/瀉|腹|肚/.test(name) ? '拉肚子' : /燒|熱/.test(name) ? '發燒' : /傷|感染|發炎|化膿/.test(name) ? '傷口感染' : '感冒'); }
function findIll(c, name) { return ills(c).find(i => i.name === name) || ills(c).find(i => name.includes(i.name) || i.name.includes(name) || name.includes(i.kind)); }

// 時間過去後呼叫：時間到自然好，回傳要寫進紀錄的句子
function updateIlls(c) {
  const lines = [];
  c.ills = ills(c).filter(i => {
    const k = illKind(i);
    if (k.worsenHours && !i.treated) return true; // 傷口感染沒治療不會自己好
    const need = k.days * 24 / (i.treated ? TREAT_SPEED : 1);
    if (illHours(i) >= need) { lines.push(`${c.name}的${i.name}好了。`); return false; }
    return true;
  });
  return lines;
}

// ---------- AI 狀態區塊：生病、治療、痊癒 ----------
function parseIlls(f) {
  const c = cur.char, out = [];
  const list = v => (!v || /^(無|沒有)$/.test(v.trim())) ? [] : v.split(/[；;]/).map(x => x.trim()).filter(Boolean);
  for (const e of list(f['生病'])) {
    const p = e.split(/[｜|]/).map(x => x.trim());
    const kind = Object.keys(ILL_KINDS).find(k => (p[1] || '').includes(k)) || '';
    const line = addIll(c, p[0], kind, p[2] || '');
    if (line) out.push(line);
  }
  for (const e of list(f['治療'])) {
    const i = findIll(c, e.split(/[｜|]/)[0].trim());
    if (i && !i.treated) { i.treated = true; out.push(`${c.name}的${i.name}有治療了，會好得比較快。`); }
  }
  for (const e of list(f['痊癒'])) {
    const i = findIll(c, e.split(/[｜|]/)[0].trim());
    if (i) { c.ills = ills(c).filter(x => x !== i); out.push(`${c.name}的${i.name}好了。`); }
  }
  if (out.length) addLog('系統', out.join(''));
}

// ---------- 給 AI 的提示詞、畫面 ----------
function illText(i) {
  const k = illKind(i), d = Math.floor(illHours(i) / 24) + 1;
  return `${i.name}（第 ${d} 天，${i.treated ? '有治療' : '沒治療'}${illWorse(i) ? '，拖太久開始扣血' : ''}）：${k.text}`;
}
function illsForPrompt(c) {
  const list = ills(c);
  return list.length ? '生病：' + list.map(illText).join('；') + '\n' : '';
}

// 疾病視窗：作者手動記生病、治療、痊癒
function openIlls() { renderIlls(); openModal('illModal'); }
function renderIlls() {
  const c = cur.char, list = ills(c);
  $('illHead').textContent = `${c.name}現在${list.length ? '有 ' + list.length + ' 種病' : '沒有生病'}。`;
  $('illList').innerHTML = list.map((i, k) => `<div class="invRow"><div><span>${esc(i.name)}</span><span class="muted small">　像${esc(i.kind)}</span><div class="small ${illWorse(i) ? 'cond' : 'muted'}">${esc(illText(i))}</div></div>
    <div class="invBtns">${i.treated ? '' : `<button class="ghost small" onclick="treatIll(${k})">有治療了</button>`}<button class="ghost small" onclick="cureIll(${k})">好了</button></div></div>`).join('');
  $('illKind').innerHTML = Object.entries(ILL_KINDS).map(([k, v]) => `<option value="${k}">${k}：${v.text}</option>`).join('');
}
function addIllManual() {
  const kind = $('illKind').value, name = $('illName').value.trim() || kind;
  pushUndo();
  const line = addIll(cur.char, name, kind, '');
  if (!line) { toast('已經有這個病了'); return; }
  addLog('系統', line); $('illName').value = '';
  save(); renderAll(); renderIlls();
}
function treatIll(k) { const i = ills(cur.char)[k]; pushUndo(); i.treated = true; addLog('系統', `${cur.char.name}的${i.name}有治療了。`); save(); renderAll(); renderIlls(); }
function cureIll(k) { const i = ills(cur.char)[k]; pushUndo(); cur.char.ills.splice(k, 1); addLog('系統', `${cur.char.name}的${i.name}好了。`); save(); renderAll(); renderIlls(); }

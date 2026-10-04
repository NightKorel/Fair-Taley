// 存活模擬：劇情摘要（遞迴摘要）、隨時編輯角色與故事設定

// 玩家自己設（每個玩家用的 AI 能力不同）：最近幾段不歸納、超過幾段沒歸納就提醒
const KEEP_MIN = 2;
function keepRecent() { return Math.max(KEEP_MIN, cur.keepRecent ?? 6); }
function remindAt() { return Math.max(keepRecent() + 2, cur.remindAt ?? 24); }

// ---------- 劇情摘要 ----------
// 研究（Wang 等 2023）：用「舊摘要＋新內容」寫出新摘要，長篇故事比較能前後一致。
function sumFrom() { return cur.summaryUpTo || 0; }
function unsummarized() { return Math.max(0, cur.log.length - sumFrom()); }
function entryText(e) { return `${e.type === '故事' ? '' : '（' + (e.type === '角色' && e.who ? e.who : e.type) + '）'}${e.text}`; }

function buildSummaryPrompt() {
  const end = Math.max(sumFrom(), cur.log.length - keepRecent());
  const fresh = cur.log.slice(sumFrom(), end).map(entryText).join('\n');
  return { end, text: `請幫我更新一篇小說的劇情摘要。這個摘要之後會附在每一段的提示詞裡，讓 AI 記得前面發生過什麼。

規則：
- 用繁體中文，${cur.person}。
- 把「目前的摘要」和「新發生的事」合在一起，寫成一份新的摘要。
- 只留之後可能還會用到的事：出現過的人物和他們的關係、去過的地方、做過的約定、受的傷、得到或失去的重要東西、角色想法和心境的轉變、還沒解決的事。
- 刪掉瑣碎的過程和重複的描述。
- 用條列，一點一句，照時間順序。總長盡量在 400 字以內，故事很長時可以放寬到 800 字。
- 只回覆摘要本身，第一行寫【摘要】。

【目前的摘要】
${cur.summary || '（還沒有）'}

【新發生的事】
${fresh || '（沒有）'}` };
}

function openSummary() {
  $('sumText').value = cur.summary || '';
  $('arcGoal').value = arcNow().goal || ''; $('arcInfo').textContent = `現在是第 ${arcs().length + 1} 個大章節。`;
  $('sumKeep').value = keepRecent(); $('sumRemind').value = remindAt();
  $('sumInfo').textContent = `第 ${chapters().length + 1} 章。已歸納到第 ${sumFrom()} 段，還有 ${unsummarized()} 段沒歸納（最近 ${keepRecent()} 段會保留原文）。`;
  renderChapters();
  openModal('sumModal');
}
function saveSumSettings() {
  const k = Math.max(KEEP_MIN, Math.round(num($('sumKeep').value, 6)));
  cur.keepRecent = k;
  cur.remindAt = Math.max(k + 2, Math.round(num($('sumRemind').value, 24)));
  $('sumKeep').value = cur.keepRecent; $('sumRemind').value = cur.remindAt;
  save(); renderSumCard();
  $('sumInfo').textContent = `第 ${chapters().length + 1} 章。已歸納到第 ${sumFrom()} 段，還有 ${unsummarized()} 段沒歸納（最近 ${keepRecent()} 段會保留原文）。`;
  toast('設定已儲存');
}
function copySummaryPrompt() {
  const { end, text } = buildSummaryPrompt();
  if (end <= sumFrom()) { toast('沒有需要歸納的段落'); return; }
  cur.pendingSummaryEnd = end;
  copyText(text, '貼給 AI，複製 AI 回覆的摘要後回來按「貼上 AI 回覆」。');
  waitingFor = 'summary';
}
function cleanSummary(t) {
  return String(t).replace(/\*\*/g, '').replace(/^[\s\S]*?[【\[]\s*摘要\s*[】\]]\s*/, '').trim();
}
// 下面三個 paste 由 pasteAI() 分辨好種類後呼叫，t 是已經讀到的回覆
function pasteSummary(t) {
  // 重新整理過、忘了歸納到哪：照現在的段落算
  if (!cur.pendingSummaryEnd) cur.pendingSummaryEnd = Math.max(sumFrom(), cur.log.length - keepRecent());
  $('sumText').value = cleanSummary(t);
  saveSummary(true);
}
function saveSummary(fromAI) {
  pushUndo();
  cur.summary = cleanSummary($('sumText').value);
  if (fromAI === true && cur.pendingSummaryEnd) cur.summaryUpTo = cur.pendingSummaryEnd;
  delete cur.pendingSummaryEnd;
  save(); renderSumCard(); closeModal('sumModal');
  toast(fromAI === true ? '摘要更新了，舊段落之後不會再整段附給 AI' : '摘要已儲存');
}
function markSummarized() {
  // 自己寫完摘要（沒有 AI）時，手動把目前為止的段落標成已歸納
  const end = Math.max(sumFrom(), cur.log.length - keepRecent());
  cur.pendingSummaryEnd = end;
  saveSummary(true);
}
function renderSumCard() {
  if (!cur) return;
  const n = unsummarized();
  const warn = n > remindAt();
  $('sumCard').innerHTML = `<div class="row" style="justify-content:space-between"><span>劇情摘要</span><button class="ghost small" onclick="openSummary()">打開</button></div>
    <div class="small muted">出場生物 ${activeCreatures().length} 隻<a href="#" onclick="openCreatures();return false" style="margin-left:8px">查看</a></div>
    <div class="small ${warn ? 'cond' : 'muted'}" data-tip="提示詞只附摘要和最近幾段原文。故事變長時把舊段落歸納進摘要，AI 才記得前面的事，提示詞也不會越來越長。">第 ${arcs().length + 1} 個大章節・第 ${chapters().length + 1} 章・${cur.summary ? '' : '還沒有摘要・'}${n} 段還沒歸納${warn ? '，建議歸納了' : ''}</div>`;
}
// 給回合提示詞用：前面章節摘要＋本章摘要＋摘要之後的段落（最多 10 段，或玩家設的保留段數）
function storySoFar() {
  const recent = cur.log.slice(sumFrom()).slice(-Math.max(10, keepRecent())).map(entryText).join('\n');
  return { summary: cur.summary || '', recent };
}

// ---------- 編輯角色與故事設定（不影響生存數字的部分） ----------
function openEdit() {
  const c = cur.char;
  $('e_title').value = cur.title; $('e_person').value = cur.person;
  $('e_world').value = cur.world || ''; $('e_date').value = cur.startDate || '';
  $('e_name').value = c.name; $('e_height').value = c.height; $('e_weight').value = c.weight;
  $('e_int').value = c.attr.智力; $('e_wis').value = c.attr.感知; $('e_cha').value = c.attr.魅力;
  $('e_personality').value = c.personality || ''; $('e_background').value = c.background || ''; $('e_speech').value = c.speech || '';
  openModal('editModal');
}
function saveEdit() {
  const c = cur.char;
  const name = $('e_name').value.trim();
  if (!name) { toast('角色至少要有名字'); return; }
  pushUndo();
  const changed = [];
  const set = (obj, key, val, label) => { if (String(obj[key] ?? '') !== String(val)) { obj[key] = val; changed.push(label); } };
  set(cur, 'title', $('e_title').value.trim() || cur.title, '故事名稱');
  set(cur, 'person', $('e_person').value, '人稱');
  set(cur, 'world', $('e_world').value.trim(), '世界觀');
  set(cur, 'startDate', $('e_date').value.trim(), '開始日期');
  set(c, 'name', name, '名字');
  set(c, 'height', num($('e_height').value, c.height), '身高');
  set(c, 'weight', num($('e_weight').value, c.weight), '體重');
  set(c.attr, '智力', num($('e_int').value, c.attr.智力), '智力');
  set(c.attr, '感知', num($('e_wis').value, c.attr.感知), '感知');
  set(c.attr, '魅力', num($('e_cha').value, c.attr.魅力), '魅力');
  set(c, 'personality', $('e_personality').value.trim(), '個性');
  set(c, 'background', $('e_background').value.trim(), '背景');
  set(c, 'speech', $('e_speech').value.trim(), '說話方式');
  if (changed.length) addLog('系統', `作者修改了設定：${changed.join('、')}。`);
  save(); renderAll(); setMode(mode); closeModal('editModal');
  $('storyName').textContent = cur.title;
  toast(changed.length ? '已更新' : '沒有變動');
}

// ---------- 出場的生物：AI 要明確設定體型（納可 2026-10-04） ----------
// 什麼時候收起來（不再附進提示詞）：
// 1. AI 在狀態區塊「離場」寫了牠（死了、走遠了、被吃掉……）
// 2. 連續 CREATURE_IDLE 段故事（AI 寫的故事段落）都沒提到牠
// 收起來的還留著體型紀錄，之後故事又提到牠就自動拿回來，體型照舊。玩家也可以手動刪除。
const CREATURE_IDLE = 15;
function storyCount() { return cur.log.filter(e => e.type === '故事').length; }
function creatureList() { if (!cur.creatures) cur.creatures = []; return cur.creatures; }
function activeCreatures() { return creatureList().filter(c => !c.gone); }
function parseCreatures(f) {
  const v = f['生物'];
  if (v && !/^(無|沒有)$/.test(v.trim())) {
    v.split(/[；;]/).map(x => x.trim()).filter(Boolean).forEach(e => {
      const p = e.split(/[｜|]/).map(x => x.trim());
      if (!p[0] || /^(無|沒有)$/.test(p[0])) return;
      const old = creatureList().find(c => c.name === p[0]);
      if (old) { old.gone = false; old.seen = storyCount(); return; }
      const size = p[1] || '', kg = num(p[2], NaN), note = p[3] || '';
      cur.creatures.push({ name: p[0], size, kg: isNaN(kg) ? null : kg, note, seen: storyCount(), gone: false });
      addLog('系統', `登記生物：${p[0]}（${size ? size + (/公分|cm/.test(size) ? '' : ' 公分') : '體型未寫'}${isNaN(kg) ? '' : '，' + kg + ' 公斤'}）${note ? '，' + note : ''}。`);
    });
  }
  const out = f['離場'];
  if (out && !/^(無|沒有)$/.test(out.trim())) {
    out.split(/[；;]/).map(x => x.trim()).filter(Boolean).forEach(e => {
      const c = creatureList().find(c => !c.gone && e.includes(c.name));
      if (c) { c.gone = true; addLog('系統', `${c.name}離場了，之後不再附進提示詞（再出現會自動拿回來）。`); }
    });
  }
}
// 每段故事進來時呼叫：提到的生物更新「最後出現」，太久沒提到的收起來，收起來的又被提到就拿回來
function trackCreatures(text) {
  if (!cur || !cur.creatures) return;
  for (const c of cur.creatures) {
    if (text.includes(c.name)) {
      if (c.gone) { c.gone = false; addLog('系統', `${c.name}又出現了，體型照之前登記的。`); }
      c.seen = storyCount();
    } else if (!c.gone && storyCount() - (c.seen || 0) > CREATURE_IDLE) {
      c.gone = true;
    }
  }
}
function creaturesForPrompt() {
  const list = activeCreatures();
  if (!list.length) return '';
  return `\n【出場過的生物】（體型照這裡寫）\n${list.map(c => `${c.name}：${c.size}${/公分|cm/.test(c.size) ? '' : ' 公分'}，${c.kg ?? '?'} 公斤${c.note ? '，' + c.note : ''}`).join('\n')}\n`;
}
function openCreatures() {
  const list = creatureList();
  const row = (c, k) => `<div class="invRow"><div><span>${esc(c.name)}</span>${c.gone ? '<span class="muted small">　已收起</span>' : ''}<div class="muted small">${esc(c.size)}${/公分|cm/.test(c.size) ? '' : ' 公分'}，${c.kg ?? '?'} 公斤${c.note ? '，' + esc(c.note) : ''}</div></div>
    <div class="invBtns"><button class="ghost small" onclick="toggleCreature(${k})">${c.gone ? '拿回來' : '收起來'}</button><button class="ghost small" onclick="deleteCreature(${k})">刪除</button></div></div>`;
  $('crList').innerHTML = list.length ? list.map(row).join('') : '<p class="muted small">還沒有登記任何生物。</p>';
  openModal('crModal');
}
function toggleCreature(k) { const c = creatureList()[k]; c.gone = !c.gone; if (!c.gone) c.seen = storyCount(); save(); openCreatures(); renderSumCard(); }
function deleteCreature(k) {
  const c = creatureList()[k];
  if (!confirm(`刪除「${c.name}」的紀錄？刪了之後再出現，AI 會重新設定體型。`)) return;
  cur.creatures.splice(k, 1); save(); openCreatures(); renderSumCard();
}

// ---------- 按版本號看更新日誌 ----------
async function openChangelog() {
  openModal('logModal');
  $('logText').textContent = '讀取中……';
  try {
    const r = await fetch('更新日誌.txt', { cache: 'no-store' });
    if (!r.ok) throw 0;
    const t = await r.text();
    // 日期一行當標題；每筆「- 【標題】內容」變成一塊，內容照句號分行
    const html = [];
    for (const line of t.split(/\r?\n/)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(line.trim())) { html.push(`<div class="logDate">${line.trim()}</div>`); continue; }
      const m = line.match(/^-\s*【(.+?)】(.*)$/);
      if (!m) continue;
      const title = esc(m[1]).replace(/^(v[\d.]+)/, '<span class="logVer">$1</span>');
      const body = esc(m[2]).split(/(?<=。)/).map(x => x.trim()).filter(Boolean).map(x => `<div>${x}</div>`).join('');
      html.push(`<div class="logEntry"><div class="logTitle">${title}</div>${body}</div>`);
    }
    $('logText').innerHTML = html.join('') || `<div style="white-space:pre-wrap">${esc(t)}</div>`;
  } catch (e) {
    $('logText').textContent = '讀不到更新日誌（直接打開檔案時讀不到，放到網站上就可以）。';
  }
}

// ---------- 請 AI 檢查有沒有不合理，讓它修正（納可 2026-10-04） ----------
function buildCheckPrompt() {
  return `請你當這篇小說的校對，檢查目前的故事和狀態有沒有不合理的地方，然後提出修正。網頁負責記數字和計算，下面的數字是網頁算的。

要檢查的事：
- 前後矛盾：人物、地點、時間、天氣、說過的話、發生過的事對不上。
- 跟數字對不上：故事寫的和角色狀態、身上的東西不一致（例：寫他吃了東西，但身上沒有食物；寫他很累，但疲勞是清醒）。
- 不合常理：搬不動的東西被輕鬆搬走、花的時間不合理、生物的體型或行為不合理、違反世界觀。
- 身上的東西：漏記、多記、數量不對。
- 寫法：AI 替角色做了作者沒交代的重大決定。
- 還沒有故事的話，就檢查角色設定、世界觀、身上的東西彼此合不合理（例：年代沒有的東西、穿著跟氣溫差太多）。

請用繁體中文，完全照下面的格式回覆：
【問題】
（一行一個問題，寫清楚哪裡不合理、為什麼。沒有問題就寫 無）
【改寫最後一段】
（最後一段故事需要修正的話，寫出改好的完整一段；不用改就寫 無）
【狀態】
（數字需要修正才寫，格式跟平常一樣，只寫要改的行，耗時填 0。例：用掉：麵包 1。不用改就整塊省略）
【狀態結束】

${storyContext()}`;
}
function copyCheckPrompt() {
  // 隨時都能檢查：還沒有故事時，就只檢查角色、世界觀、身上東西合不合理
  try {
    copyText(buildCheckPrompt(), '貼給 AI，複製 AI 的整段回覆後回來按「貼上 AI 回覆」。');
    waitingFor = 'check';
  } catch (e) {
    toast('做檢查提示詞時出錯：' + e.message);
  }
}
let checkResult = null;
function sectionOf(t, name) {
  const m = t.match(new RegExp('[【\\[]\\s*' + name + '\\s*[】\\]]([\\s\\S]*?)(?=[【\\[]\\s*(?:問題|改寫最後一段|狀態|狀態結束)\\s*[】\\]]|$)'));
  const v = m ? m[1].replace(/\*\*/g, '').trim() : '';
  return /^(無|沒有)$/.test(v) ? '' : v;
}
function pasteCheck(t) {
  const problems = sectionOf(t, '問題');
  const rewrite = sectionOf(t, '改寫最後一段');
  const si = t.search(/[【\[]\s*狀態\s*[】\]]/);
  const block = si >= 0 ? t.slice(si).replace(/[【\[]\s*狀態結束\s*[】\]][\s\S]*$/, '') : '';
  const fields = block ? parseLines(block) : {};
  delete fields['類型'];
  checkResult = { problems, rewrite, fields };
  const hasFix = Object.keys(fields).some(k => !/^(耗時)$/.test(k) && !/^(無|沒有|0)$/.test(String(fields[k]).trim()));
  $('chkProblems').textContent = problems || 'AI 說沒有發現問題。';
  $('chkRewrite').textContent = rewrite || '';
  $('chkRewriteBox').classList.toggle('hidden', !rewrite);
  $('chkFixBox').classList.toggle('hidden', !hasFix);
  $('chkFix').textContent = hasFix ? Object.entries(fields).filter(([k]) => k !== '耗時').map(([k, v]) => `${k}：${v}`).join('\n') : '';
  pushUndo();
  addLog('系統', `AI 檢查：${problems ? problems.split(/\r?\n/).filter(Boolean).length + ' 個問題。' + problems.replace(/\r?\n/g, ' ') : '沒有發現問題。'}`);
  save(); renderLog();
  openModal('chkModal');
}
function applyRewrite() {
  const k = cur.log.map(e => e.type).lastIndexOf('故事');
  if (k < 0 || !checkResult || !checkResult.rewrite) return;
  pushUndo();
  cur.log[k].text = checkResult.rewrite;
  trackCreatures(checkResult.rewrite);
  addLog('系統', '最後一段故事照 AI 檢查的建議改寫了。');
  save(); renderLog();
  $('chkRewriteBox').classList.add('hidden');
  toast('已改寫最後一段');
}
function applyCheckFix() {
  if (!checkResult) return;
  // 數字修正交給回合表，耗時 0，讓玩家看過再套用
  resetTurnForm();
  const f = checkResult.fields;
  const set = (k, id) => { if (f[k] != null && !isNaN(num(f[k], NaN))) $(id).value = num(f[k]); };
  set('飢餓', 't_hunger'); set('口渴', 't_thirst'); set('體力', 't_stamina'); set('血量', 't_hp'); set('氣溫', 't_temp');
  $('t_dur').value = 0;
  parseItemLines(f); parseCreatures(f);
  closeModal('chkModal');
  openTurn('這是 AI 檢查後建議的修正（不花時間），看過再按「套用」。');
}

// ---------- 章節：換章時把這一章全部歸納成一章，之後除非玩家手動改，不再動 ----------
function chapters() { if (!cur.chapters) cur.chapters = []; return cur.chapters; }
function chaptersForPrompt() {
  const list = chapters();
  return list.length ? list.map((c, k) => `第 ${k + 1} 章${c.title ? '「' + c.title + '」' : ''}：\n${c.summary}`).join('\n\n') : '';
}
function buildChapterPrompt() {
  const fresh = cur.log.slice(sumFrom()).map(entryText).join('\n');
  return `這篇小說的第 ${chapters().length + 1} 章要結束了。請把這一章整理成一份章節摘要，之後會一直附在提示詞裡，讓 AI 記得這一章發生過什麼。

規則：
- 用繁體中文，${cur.person}。
- 把「這一章目前的摘要」和「還沒歸納的段落」合在一起，寫成這一章完整的摘要。
- 只留之後可能還會用到的事：出現過的人物和關係、去過的地方、做過的約定、受的傷、得到或失去的重要東西、角色想法和心境的轉變、還沒解決的事。
- 用條列，一點一句，照時間順序，總長盡量在 500 字以內。
- 第一行寫【章名】，下一行寫一個簡短的章名；接著寫【章節摘要】，下面是摘要本身。

【這一章目前的摘要】
${cur.summary || '（還沒有）'}

【還沒歸納的段落】
${fresh || '（沒有）'}`;
}
function copyChapterPrompt() {
  if (!confirm(`結束第 ${chapters().length + 1} 章？這一章所有段落都會歸納成一份章節摘要，之後除非你手動改，不會再動。`)) return;
  copyText(buildChapterPrompt(), '貼給 AI，複製 AI 的回覆後回來按「貼上 AI 回覆」。');
  waitingFor = 'chapter';
}
function pasteChapter(t) {
  const title = (t.match(/[【\[]\s*章名\s*[】\]]\s*\n?\s*([^\n【\[]+)/) || [])[1] || '';
  const sum = t.replace(/\*\*/g, '').replace(/^[\s\S]*?[【\[]\s*章節摘要\s*[】\]]\s*/, '').trim();
  finishChapter(title.trim(), sum);
}
function finishChapterManual() {
  // 沒有 AI：把框裡目前的摘要直接當成這一章的章節摘要
  const sum = cleanSummary($('sumText').value);
  if (!sum) { toast('先在框裡寫好這一章的摘要'); return; }
  if (!confirm(`用框裡的摘要結束第 ${chapters().length + 1} 章？`)) return;
  finishChapter(prompt('章名（可以空白）', '') || '', sum);
}
function finishChapter(title, sum) {
  pushUndo();
  chapters().push({ title, summary: sum, upTo: cur.log.length });
  addLog('系統', `第 ${chapters().length} 章${title ? '「' + title + '」' : ''}結束。`);
  cur.summary = '';
  cur.summaryUpTo = cur.log.length;
  save(); renderSumCard();
  if (!$('sumModal').classList.contains('hidden')) openSummary();
  toast(`第 ${chapters().length} 章已存好，開始第 ${chapters().length + 1} 章`);
}
function renderChapters() {
  const list = chapters();
  $('chList').innerHTML = list.length ? list.map((c, k) => `<details class="chapter"><summary>第 ${k + 1} 章${c.title ? '「' + esc(c.title) + '」' : ''}</summary>
    <input id="chT${k}" value="${esc(c.title || '')}" placeholder="章名">
    <textarea id="chS${k}" rows="6">${esc(c.summary)}</textarea>
    <button class="ghost small" onclick="saveChapter(${k})">儲存這一章的修改</button></details>`).join('') : '<p class="muted small">還沒有結束的章節。</p>';
}
function saveChapter(k) {
  pushUndo();
  chapters()[k].title = $('chT' + k).value.trim();
  chapters()[k].summary = $('chS' + k).value.trim();
  save(); renderChapters(); toast(`第 ${k + 1} 章已儲存`);
}

// ---------- 顛覆世界觀的確認（設計 2026-10-03，做 2026-10-04） ----------
// AI 在狀態區塊「顛覆」寫了東西＝它判定這段出現了世界觀不允許的事，跳窗問玩家：
// 確定 → 那一句（玩家可以改）寫進世界觀，之後 AI 當成這個世界的一部分，同樣的事不再跳窗
// 不要 → 撤回這段：AI 這段故事拿掉，玩家這回合的行動放回輸入框，可以改了再問一次
let subvertPending = null;
function checkSubvert(f) {
  const v = (f['顛覆'] || '').trim();
  if (!v || /^(無|沒有|否|不是|0)$/.test(v)) return false;
  subvertPending = { auto: false };
  $('svText').value = v;
  openModal('svModal');
  return true;
}
function confirmSubvert() {
  const line = $('svText').value.trim();
  if (!line) { toast('先寫要加進世界觀的那一句'); return; }
  const auto = subvertPending && subvertPending.auto;
  subvertPending = null;
  cur.world = (cur.world ? cur.world.trim() + '\n' : '') + line;
  addLog('系統', `世界觀新增：${line}`);
  save(); renderLog(); closeModal('svModal');
  if (auto) { applyTurn(); toast('已寫進世界觀，並完成這回合'); }
  else toast('已寫進世界觀，檢查回合表後按「套用」');
}
function rejectSubvert() {
  subvertPending = null; loreNew = false; arcPending = false;
  closeModal('svModal'); closeModal('turnModal');
  undoTurn(); // 回到 AI 這段故事進來之前
  const last = cur.log[cur.log.length - 1];
  if (last && (last.type === '角色' || last.type === '作者')) {
    cur.log.pop();
    $('input').value = last.text;
    setMode(last.type);
  }
  resetTurnForm(); save(); renderAll();
  toast('撤回這段了，行動放回輸入框，可以改了再問一次');
}

// ---------- 大章節與封存（設計 2026-10-03，做 2026-10-04） ----------
// 故事不用強制結束。AI 設定「怎樣算完成這個大章節」，完成與否也交給 AI 判斷（作者也能自己按）。
// 完成時玩家選：封存這個故事（之後可以拿出來繼續）、當成結局、直接往下寫（開始下一個大章節）。
function arcs() { if (!cur.arcs) cur.arcs = []; return cur.arcs; }
function arcNow() { if (!cur.arc) cur.arc = { goal: '', since: cur.clock }; return cur.arc; }
function arcForPrompt() {
  const a = arcNow(), n = arcs().length + 1;
  return a.goal ? `\n【大章節】第 ${n} 個大章節，完成條件：${a.goal}\n` : `\n【大章節】第 ${n} 個大章節還沒有完成條件。請照目前故事的方向，在狀態區塊的「大章節」寫一個。\n`;
}
let arcPending = false; // AI 說完成了，套用回合後跳窗問玩家
function parseArc(f) {
  const v = (f['大章節'] || '').trim();
  if (v && !/^(無|沒有)$/.test(v) && !arcNow().goal) { arcNow().goal = v; addLog('系統', `大章節的完成條件：${v}`); }
  const d = (f['大章節完成'] || '').trim();
  if (d && /^是/.test(d) && arcNow().goal) { arcPending = true; arcNow().why = d.replace(/^是[，,、：:\s]*/, ''); }
}
function afterTurnArc() { if (!arcPending) return; arcPending = false; openArcDone(); }
function openArcDone() {
  const a = arcNow();
  $('arcDoneText').textContent = `第 ${arcs().length + 1} 個大章節${a.goal ? '的完成條件：' + a.goal : ''}${a.why ? '\nAI 的判斷：' + a.why : ''}`;
  openModal('arcModal');
}
function finishArc(choice) {
  if (choice === 'no') { delete arcNow().why; closeModal('arcModal'); toast('繼續這個大章節'); return; }
  pushUndo();
  const a = arcNow(), n = arcs().length + 1;
  arcs().push({ goal: a.goal, since: a.since, ended: cur.clock, result: choice === 'end' ? '結局' : '完成' });
  cur.arc = { goal: '', since: cur.clock };
  addLog('系統', `第 ${n} 個大章節完成${a.goal ? '：' + a.goal : ''}。${choice === 'end' ? '故事在這裡結束。' : choice === 'archive' ? '故事封存起來了。' : '接著寫下一個大章節。'}`);
  if (choice === 'end') cur.ended = true;
  if (choice === 'archive') cur.archived = true;
  save(); closeModal('arcModal'); closeModal('sumModal');
  if (choice === 'next') { renderAll(); toast(`開始第 ${n + 1} 個大章節，AI 會提新的完成條件`); return; }
  showHome(); toast(choice === 'end' ? '故事完結了，還是可以打開來看或繼續寫' : '故事封存了，在首頁「封存的故事」可以拿出來繼續');
}
function saveArcGoal() {
  const v = $('arcGoal').value.trim();
  if (v === (arcNow().goal || '')) { toast('沒有變動'); return; }
  pushUndo(); arcNow().goal = v; addLog('系統', v ? `作者把大章節的完成條件改成：${v}` : '作者清掉了大章節的完成條件，AI 會再提一個。'); save(); renderLog(); toast('已儲存');
}
function unarchive(id) {
  const s = stories[id]; delete s.archived; s.updated = Date.now();
  try { localStorage.setItem('survsim_stories', JSON.stringify(stories)); } catch (e) {}
  openStory(id); toast('拿出來了，接著寫吧');
}

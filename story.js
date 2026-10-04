// 存活模擬：劇情摘要（遞迴摘要）、隨時編輯角色與故事設定

const SUMMARY_KEEP_RECENT = 6;   // 最近幾段不歸納，留原文給 AI
const SUMMARY_SUGGEST_AT = 24;   // 沒歸納的段落超過這個數，就提醒該歸納了

// ---------- 劇情摘要 ----------
// 研究（Wang 等 2023）：用「舊摘要＋新內容」寫出新摘要，長篇故事比較能前後一致。
function sumFrom() { return cur.summaryUpTo || 0; }
function unsummarized() { return Math.max(0, cur.log.length - sumFrom()); }
function entryText(e) { return `${e.type === '故事' ? '' : '（' + e.type + '）'}${e.text}`; }

function buildSummaryPrompt() {
  const end = Math.max(sumFrom(), cur.log.length - SUMMARY_KEEP_RECENT);
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
  $('sumInfo').textContent = `已歸納到第 ${sumFrom()} 段，還有 ${unsummarized()} 段沒歸納（最近 ${SUMMARY_KEEP_RECENT} 段會保留原文）。`;
  openModal('sumModal');
}
function copySummaryPrompt() {
  const { end, text } = buildSummaryPrompt();
  if (end <= sumFrom()) { toast('沒有需要歸納的段落'); return; }
  cur.pendingSummaryEnd = end;
  copyText(text, '貼給 AI，複製 AI 回覆的摘要後回來按「一鍵貼上摘要」。');
  waitingFor = 'summary';
}
function cleanSummary(t) {
  return String(t).replace(/\*\*/g, '').replace(/^[\s\S]*?[【\[]\s*摘要\s*[】\]]\s*/, '').trim();
}
async function pasteSummary() {
  hideClipBanner();
  const t = await readClip();
  if (t === null) { toast('瀏覽器不讓網頁讀剪貼簿，請手動貼到框裡再按「儲存摘要」'); return; }
  if (!t.trim() || t === lastPrompt) { toast('剪貼簿裡還沒有 AI 的回覆'); return; }
  waitingFor = null;
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
  const end = Math.max(sumFrom(), cur.log.length - SUMMARY_KEEP_RECENT);
  cur.pendingSummaryEnd = end;
  saveSummary(true);
}
function renderSumCard() {
  if (!cur) return;
  const n = unsummarized();
  const warn = n >= SUMMARY_SUGGEST_AT;
  $('sumCard').innerHTML = `<div class="row" style="justify-content:space-between"><span>劇情摘要</span><button class="ghost small" onclick="openSummary()">打開</button></div>
    <div class="small ${warn ? 'cond' : 'muted'}" data-tip="提示詞只附摘要和最近幾段原文。故事變長時把舊段落歸納進摘要，AI 才記得前面的事，提示詞也不會越來越長。">${cur.summary ? '' : '還沒有摘要。'}${n} 段還沒歸納${warn ? '，建議歸納了' : ''}</div>`;
}
// 給回合提示詞用：摘要＋摘要之後的段落（最多 10 段）
function storySoFar() {
  const recent = cur.log.slice(sumFrom()).slice(-10).map(entryText).join('\n');
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

/* ============ ui.js：所有页面渲染与交互 ============ */
'use strict';

/* ---------- 小工具 ---------- */
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2400);
}
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function tagFor(subject){
  const map = { math:'tag-math', english:'tag-english', politics:'tag-politics', custom:'tag-custom' };
  return map[subject] || 'tag-custom';
}

/* ---------- 导航 ---------- */
function switchPage(name){
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  const page = document.getElementById('page-'+name);
  if(page) page.style.display = 'block';
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.page === name));
  document.querySelectorAll('[data-goto]').forEach(a => a.classList.toggle('active', false));
  window.scrollTo(0, 0);
  const render = { home:renderHome, tasks:renderTasks, pomodoro:renderPomodoro, vocab:renderVocab, stats:renderStats, notes:renderNotes, settings:renderSettings };
  if(render[name]) render[name]();
}

/* ---------- 首页 ---------- */
function renderHome(){
  const st = getSettings();
  const diff = $D.diff($D.today(), st.examDate);
  const cd = document.getElementById('homeCountdown');
  cd.innerHTML = diff >= 0 ? '<b>'+diff+'</b><span>天后考试 · '+$D.ymd(st.examDate)+'</span>'
                           : '<b>考试已过</b><span>辛苦啦，好好放松</span>';
  const side = document.getElementById('sideCountdown');
  side.innerHTML = diff >= 0 ? '<b>'+diff+'</b><span>距离考试还有 '+diff+' 天</span>' : '<b>🎉</b><span>考试已完成</span>';

  const tips = ['💪 今天也要加油','📚 按计划完成任务','🍅 用番茄钟保持专注','📖 单词一天都不能断','🏃 记得运动放松'];
  document.getElementById('sideTip').textContent = tips[new Date().getDate() % tips.length];

  // 每日一句（按日期轮换）
  const q = window.QUOTES[Math.abs(daysNum($D.today())) % window.QUOTES.length];
  document.getElementById('homeQuote').innerHTML = '<span class="q-emoji">✨</span><div><div class="q-text">'+esc(q.t)+'</div><div class="q-src">'+esc(q.s)+'</div></div>';

  const tasks = genTasks();
  const done = Store.get('dailyStats', {})[$D.today()] || {};
  const doneN = done.done || 0;
  document.getElementById('homeTitle').textContent = doneN === tasks.length && tasks.length > 0 ? '全部完成！太棒了 🎉' : '今天也要加油鸭 🦆';
  document.getElementById('homeSub').textContent = $D.todayCn() + ' · 完成 ' + doneN + '/' + tasks.length + ' 项';

  // 今日任务（前 6 项）
  const box = document.getElementById('homeTasks');
  if(!tasks.length){ box.innerHTML = '<div class="empty">今天没有任务，好好休息～</div>'; }
  else{
    box.innerHTML = tasks.slice(0, 6).map(t => taskItemHTML(t)).join('')
      + (tasks.length > 6 ? '<div class="empty" style="padding:10px 0">还有 '+(tasks.length-6)+' 项，去「每日任务」查看 ›</div>' : '');
  }
  bindTaskChecks(box);

  // 考试安排
  const plan = examPlanHTML();
  document.getElementById('examPlan').innerHTML = plan;

  // 未来复习提醒
  const ur = upcomingReviews(7);
  const rv = document.getElementById('homeReviews');
  if(!ur.length){ rv.innerHTML = '<div class="empty" style="padding:12px 0">近 7 天没有复习任务<br><span style="font-size:12px">完成学习任务后会自动安排复习</span></div>'; }
  else{
    rv.innerHTML = ur.map(u => '<div class="rd-row" style="margin-bottom:4px"><span class="rd-date">'+$D.ymd(u.date)+' '+u.week+'</span><span class="rd-info" style="width:auto">'+u.list.length+' 项待复习</span></div>').join('');
  }
}

function daysNum(dateStr){ return Math.floor(new Date(dateStr+'T00:00:00').getTime()/86400000); }

function examPlanHTML(){
  const st = getSettings();
  const d1 = st.examDate, d2 = $D.add(d1, 1);
  const w1 = $D.cnWeek(d1), w2 = $D.cnWeek(d2);
  return '<div class="exam-row"><div><b>第一天 · '+$D.ymd(d1)+'（'+w1+'）</b></div></div>'
    + '<div class="exam-row"><span>上午 8:30-11:30</span><b>思想政治理论</b></div>'
    + '<div class="exam-row"><span>下午 14:00-17:00</span><b>英语一</b></div>'
    + '<div class="exam-row"><div><b>第二天 · '+$D.ymd(d2)+'（'+w2+'）</b></div></div>'
    + '<div class="exam-row"><span>上午 8:30-11:30</span><b>数学二</b></div>'
    + '<div class="exam-row"><span>下午 14:00-17:00</span><b>专业课</b></div>';
}

/* ---------- 任务卡片 HTML ---------- */
function taskItemHTML(t){
  const isBacklog = t.flag === 'backlog';
  const tags = [];
  if(t.subject && t.subject !== 'custom') tags.push('<span class="tag '+tagFor(t.subject)+'">'+SUBJECT_NAMES[t.subject]+'</span>');
  if(t.subject === 'custom') tags.push('<span class="tag tag-custom">专业课</span>');
  if(t.type === 'review') tags.push('<span class="tag tag-review">遗忘曲线复习</span>');
  if(t.type === 'vocab') tags.push('<span class="tag tag-vocab">单词</span>');
  if(t.type === 'sport') tags.push('<span class="tag tag-sport">运动</span>');
  if(isBacklog) tags.push('<span class="tag tag-backlog">昨日未完成</span>');
  if(t.src) tags.push('<span class="tag tag-custom">'+esc(t.src)+'</span>');
  if(t.est) tags.push('<span class="task-extra">约 '+t.est+' 分钟</span>');
  const extra = t.stage ? '<span class="task-extra">'+STAGE_NAMES[t.stage]+'</span>' : '';
  return '<div class="task-item" data-id="'+esc(t.id)+'" data-type="'+t.type+'">'
    + '<span class="task-check" data-check="1">✓</span>'
    + '<div class="task-body"><div class="task-title">'+esc(t.title)+'</div>'
    + '<div class="task-meta">'+tags.join('')+extra+'</div></div></div>';
}

function bindTaskChecks(container){
  if(!container) return;
  container.querySelectorAll('.task-check').forEach(el => {
    el.onclick = () => {
      const item = el.closest('.task-item');
      const id = item.dataset.id;
      // 用缓存的任务列表查找（不能重新 genTasks，会推进游标）
      const cached = Store.get('tasksToday', null);
      const tasks = cached ? cached.tasks : [];
      const t = tasks.find(x => x.id === id);
      if(!t){ toast('任务状态已更新，请刷新页面'); return; }
      // 判断当前是否已完成：已完成 → 取消；未完成 → 完成（误点可撤销）
      const snap = Store.get('tasksSnap', []);
      const snapItem = snap.find(x => x.id === id);
      const isDone = snapItem ? snapItem.done : false;
      if(isDone){
        uncompleteTask(t);
        toast('↩️ 已取消：' + t.title.slice(0, 16) + (t.title.length>16?'…':''));
      } else {
        completeTask(t);
        toast('✅ 完成：' + t.title.slice(0, 16) + (t.title.length>16?'…':''));
      }
      refreshAll();
    };
  });
}

/* ---------- 任务页 ---------- */
function renderTasks(){
  const st = getSettings();
  const today = $D.today();
  const tasks = genTasks();
  const ds = Store.get('dailyStats', {})[today] || {};
  const doneN = ds.done || 0;
  const totalN = tasks.length;
  const pct = totalN ? Math.round(doneN/totalN*100) : 0;

  // 进度环
  const C = 2 * Math.PI * 38;
  document.getElementById('tasksProgress').innerHTML =
    '<svg width="88" height="88" viewBox="0 0 88 88"><defs><linearGradient id="pgrad" x1="0" y1="0" x2="1" y2="1">'
    + '<stop offset="0%" stop-color="#5BB8A3"/><stop offset="100%" stop-color="#8ED3C3"/></linearGradient></defs>'
    + '<circle class="pbg" cx="44" cy="44" r="38"/><circle class="pfg" cx="44" cy="44" r="38" stroke-dasharray="'+C+'" stroke-dashoffset="'+(C*(1-pct/100))+'"/></svg>'
    + '<div class="progress-info"><b>今日完成 '+doneN+' / '+totalN+'</b><p>'+ ($D.cnWeek(today)) + ' · '
    + (pct===100 && totalN>0 ? '全部搞定，奖励自己休息一下 🎉' : pct>=60 ? '进度过半，继续保持！' : '按顺序完成，未完成的会自动顺延到明天') + '</p></div>';

  document.getElementById('tasksDateTitle').textContent = '今日任务（'+$D.todayCn()+'）';
  document.getElementById('tasksCount').textContent = doneN + '/' + totalN;

  const list = document.getElementById('tasksList');
  const doneIds = new Set((Store.get('tasksSnap', []).filter(t => t.done)).map(t => t.id));
  if(!tasks.length){
    list.innerHTML = '<div class="empty">今天没有任务 🎉 好好休息或自由复习吧</div>';
  } else {
    list.innerHTML = tasks.map(t => {
      const isDone = doneIds.has(t.id);
      return '<div class="task-item '+(isDone?'done':'')+'" data-id="'+esc(t.id)+'" data-type="'+t.type+'">'
        + '<span class="task-check" data-check="1">✓</span>'
        + '<div class="task-body"><div class="task-title">'+esc(t.title)+'</div>'
        + '<div class="task-meta">'+taskMetaHTML(t)+'</div></div></div>';
    }).join('');
  }
  bindTaskChecks(list);

  // 撤销/清空
  document.getElementById('btnUndoLast').onclick = () => {
    const rec = popDoneRecord();
    if(rec) toast('↩️ 已撤销：'+rec.title.slice(0,20));
    else toast('没有可撤销的记录');
    refreshAll();
  };
  document.getElementById('btnResetToday').onclick = () => {
    if(!confirm('确定清空今天的完成记录吗？（各科进度不会回退，仅任务勾选状态）')) return;
    const ds2 = Store.get('dailyStats', {});
    if(ds2[today]){ ds2[today].done = 0; Store.set('dailyStats', ds2); }
    const snap = Store.get('tasksSnap', []);
    snap.forEach(t => t.done = false);
    Store.set('tasksSnap', snap);
    toast('已清空今日完成记录');
    refreshAll();
  };

  // 各科进度
  const sp = document.getElementById('subjectProgress');
  let spHTML = '';
  SUBJECTS.forEach(sub => {
    const p = subjectProgress(sub);
    const icon = SUBJECT_ICONS[sub];
    spHTML += '<div class="sub-row"><span class="sname">'+icon+' '+SUBJECT_NAMES[sub]+'</span>'
      + '<div class="sub-bar"><i style="width:'+p.pct+'%"></i></div>'
      + '<span class="spct">'+p.done+'/'+p.total+' ('+p.pct+'%)</span></div>';
    if(p.stages && p.stages.base){
      spHTML += '<div style="font-size:11px;color:#9AAEAA;margin:2px 0 8px 74px">基础 '+p.stages.base.pct+'% · 刷题 '+p.stages.practice.pct+'% · 冲刺 '+p.stages.sprint.pct+'%</div>';
    }
  });
  sp.innerHTML = spHTML;

  // 阶段时间轴提示（用 innerHTML 覆盖，避免多次渲染累积重复）
  const sd = stageDates();
  const curStage = dateStage(today);
  const stageLine = '<div style="font-size:12.5px;color:#7A8F8C;line-height:1.9;margin-bottom:12px">'
    + '📅 阶段规划：<b style="color:#3E9B87">基础期</b>（~'+$D.ymd(sd.baseEnd)+'）→ <b style="color:#6FA8DC">刷题期</b>（'+$D.ymd($D.add(sd.baseEnd,1))+'~'+$D.ymd($D.add(sd.sprintStart,-1))+'）→ <b style="color:#FFA94D">冲刺期</b>（'+$D.ymd(sd.sprintStart)+'~考前）'
    + '<br>📍 当前处于：<b style="color:#3E9B87">'+STAGE_NAMES[curStage]+'</b></div>';
  const tl = document.getElementById('stageTimeline');
  if(tl) tl.innerHTML = stageLine;

  // 明日预告
  const tm = document.getElementById('tomorrowPreview');
  const items = previewTomorrow();
  if(!items.length){ tm.innerHTML = '<div class="empty" style="padding:14px 0">明天没有新任务（可能明天是运动日）</div>'; }
  else{
    tm.innerHTML = items.map(it => '<div>'+SUBJECT_ICONS[it.subject]+' '+esc(it.title)+' <span style="color:#9AAEAA">('+esc(it.src||STAGE_NAMES[it.stage]||'')+')</span></div>').join('');
  }
}

function taskMetaHTML(t){
  const tags = [];
  if(t.subject){ tags.push('<span class="tag '+tagFor(t.subject)+'">'+SUBJECT_NAMES[t.subject]+'</span>'); }
  if(t.type === 'review') tags.push('<span class="tag tag-review">遗忘曲线复习</span>');
  if(t.type === 'vocab') tags.push('<span class="tag tag-vocab">单词</span>');
  if(t.type === 'sport') tags.push('<span class="tag tag-sport">运动</span>');
  if(t.flag === 'backlog') tags.push('<span class="tag tag-backlog">昨日未完成</span>');
  if(t.src) tags.push('<span class="tag tag-custom">'+esc(t.src)+'</span>');
  if(t.chap) tags.push('<span class="task-extra">'+esc(t.chap)+'</span>');
  if(t.est) tags.push('<span class="task-extra">约 '+t.est+' 分钟</span>');
  if(t.stage) tags.push('<span class="task-extra">'+STAGE_NAMES[t.stage]+'</span>');
  return tags.join('');
}

/* ---------- 番茄钟页 ---------- */
function renderPomodoro(){
  const sel = document.getElementById('pomoTask');
  const tasks = genTasks();
  const undone = tasks.filter(t => t.type === 'unit' || t.type === 'review' || t.type === 'backlog');
  const cur = sel.value;
  sel.innerHTML = '<option value="">不绑定任务，自由专注</option>'
    + undone.map(t => '<option value="'+esc(t.id)+'" '+(cur===t.id?'selected':'')+'>'+esc(t.title.slice(0,28))+'</option>').join('');
  Pomo.renderStats();
  Pomo.renderRing();
}

/* ---------- 单词页 ---------- */
let vocabSession = null; // {list:[word], idx, mode:'wrong'|'review'|'new', hideMean}

function renderVocab(){
  const st = getSettings();
  const s = Vocab.stats();
  const vstate = Vocab.state();
  document.getElementById('vocabOverview').innerHTML =
    '<div class="vstat clickable" onclick="showWordList(\'all\')"><b>'+s.total+'</b><span>词库总量</span></div>'
    + '<div class="vstat clickable" onclick="showWordList(\'learned\')"><b>'+s.learned+'</b><span>已学单词</span></div>'
    + '<div class="vstat clickable" onclick="showWordList(\'mastered\')"><b>'+s.mastered+'</b><span>已掌握(过完5轮)</span></div>'
    + '<div class="vstat clickable" onclick="showWordList(\'wrong\')"><b>'+s.wrong+'</b><span>待巩固错词</span></div>';

  if(!vocabSession || vocabSession.finished){
    const list = Vocab.todayList();
    // 组装学习队列：错词 → 到期复习 → 新词
    const queue = [];
    if(list.wrongWords.length) queue.push({ mode:'wrong', words:list.wrongWords });
    if(list.reviewWords.length) queue.push({ mode:'review', words:list.reviewWords });
    if(list.newWords.length) queue.push({ mode:'new', words:list.newWords });
    if(!queue.length){
      vocabSession = { finished:true, total:0, done:0 };
      document.getElementById('vocabStage').innerHTML = '';
      document.getElementById('vocabWordArea').innerHTML =
        '<div class="vocab-done"><div class="big">🎉</div><p>今天的单词都学完啦！<br><span style="font-size:13px">明天再来，记得复习哦～</span></p></div>';
      return;
    }
    vocabSession = { queue, qi:0, wi:0, done:0, total: queue.reduce((a,q)=>a+q.words.length,0), finished:false };
  }
  renderVocabWord();
}

function renderVocabWord(){
  const s = vocabSession;
  const q = s.queue[s.qi];
  if(s.qi >= s.queue.length){
    s.finished = true;
    document.getElementById('vocabStage').innerHTML = '<span class="stage-tag">🎉 全部完成</span>';
    document.getElementById('vocabWordArea').innerHTML =
      '<div class="vocab-done"><div class="big">🎉</div><p>今天学了 '+s.done+' 个单词，超棒！</p>'
      + '<div class="vocab-btns"><button class="v-btn next" onclick="renderVocab()">再来一轮 ›</button></div></div>';
    return;
  }
  const word = q.words[s.wi];
  const total = q.words.length;
  const modeNames = { wrong:'💪 巩固错词（昨天没记住的）', review:'🔁 复习（遗忘曲线到期）', new:'🆕 学习新词' };
  const band = wordFreqBand(window.VOCAB.indexOf(word));
  document.getElementById('vocabStage').innerHTML =
    '<span class="stage-tag">'+modeNames[q.mode]+' · '+(s.wi+1)+'/'+total+'</span>'
    + '<span class="stage-tag">'+band.name+'</span>'
    + '<span class="stage-tag">今日进度 '+s.done+'/'+s.total+'</span>';
  document.getElementById('vocabWordArea').innerHTML =
    '<div class="word-card">'
    + '<div class="w-word">'+esc(word.v)+'</div>'
    + '<div class="w-phonetic">'+esc(word.ph||'')+'</div>'
    + '<div class="w-pos">'+esc(word.p||'')+'</div>'
    + '<div class="w-mean">'+esc(word.m)+'</div>'
    + '<div class="w-example"><div class="en">“'+esc(word.e)+'”</div><div class="cn">'+esc(word.t)+'</div></div>'
    + '</div>'
    + '<label class="hide-mean-toggle"><input type="checkbox" id="hideMean" '+(vocabSession.hideMean?'checked':'')+'> 隐藏释义，先自测</label>'
    + '<div class="vocab-btns">'
    + '<button class="v-btn known" id="vbKnown">😊 认识</button>'
    + '<button class="v-btn unknown" id="vbUnknown">🤔 不认识</button>'
    + '</div>';

  const hm = document.getElementById('hideMean');
  if(hm){
    hm.onchange = () => {
      vocabSession.hideMean = hm.checked;
      const meanEl = document.querySelector('.w-mean');
      const exEl = document.querySelector('.w-example');
      if(meanEl){ meanEl.style.display = hm.checked ? 'none' : ''; }
      if(exEl){ exEl.style.display = hm.checked ? 'none' : ''; }
    };
    if(vocabSession.hideMean){
      const meanEl = document.querySelector('.w-mean'); if(meanEl) meanEl.style.display = 'none';
      const exEl = document.querySelector('.w-example'); if(exEl) exEl.style.display = 'none';
    }
  }
  document.getElementById('vbKnown').onclick = () => { vocabAnswer(word, q.mode, true); };
  document.getElementById('vbUnknown').onclick = () => { vocabAnswer(word, q.mode, false); };
}

function vocabAnswer(word, mode, known){
  if(mode === 'new') Vocab.markNew(word, known);
  else Vocab.markReview(word, known);
  vocabSession.done++;
  const q = vocabSession.queue[vocabSession.qi];
  if(vocabSession.wi < q.words.length - 1){
    vocabSession.wi++;
  } else {
    vocabSession.wi = 0;
    vocabSession.qi++;
  }
  renderVocabWord();
  if(vocabSession.finished) renderVocab(); // 更新概览统计
  else {
    const s = Vocab.stats();
    document.getElementById('vocabOverview').innerHTML =
      '<div class="vstat clickable" onclick="showWordList(\'all\')"><b>'+s.total+'</b><span>词库总量</span></div>'
      + '<div class="vstat clickable" onclick="showWordList(\'learned\')"><b>'+s.learned+'</b><span>已学单词</span></div>'
      + '<div class="vstat clickable" onclick="showWordList(\'mastered\')"><b>'+s.mastered+'</b><span>已掌握(过完5轮)</span></div>'
      + '<div class="vstat clickable" onclick="showWordList(\'wrong\')"><b>'+s.wrong+'</b><span>待巩固错词</span></div>';
  }
}

/* ---------- 单词列表弹窗 ---------- */
function showWordList(kind){
  const vs = Vocab.state();
  const learnedMap = vs.learned || {};
  let words = [], title = '';
  if(kind === 'all'){
    words = window.VOCAB;
    title = '📚 词库总量（' + words.length + ' 个，按真题考频排序）';
  } else if(kind === 'learned'){
    words = Object.keys(learnedMap).map(v => window.VOCAB.find(w => w.v === v)).filter(Boolean);
    title = '✅ 已学单词（' + words.length + ' 个）';
  } else if(kind === 'mastered'){
    words = Object.keys(learnedMap).filter(v => learnedMap[v].mastered).map(v => window.VOCAB.find(w => w.v === v)).filter(Boolean);
    title = '🏆 已掌握单词（' + words.length + ' 个，遗忘曲线 5 轮全过）';
  } else if(kind === 'wrong'){
    words = (vs.wrong || []).map(v => window.VOCAB.find(w => w.v === v)).filter(Boolean);
    title = '💪 待巩固错词（' + words.length + ' 个，每天优先复习）';
  }
  document.getElementById('wordModalTitle').textContent = title;
  const list = document.getElementById('wordModalList');
  if(!words.length){
    list.innerHTML = '<div class="wempty">这里还没有单词～</div>';
  } else {
    // 分批渲染（一次性 1000+ 行 DOM 也没问题，但分页更流畅）
    list.innerHTML = words.map(w =>
      '<div class="wrow"><span class="wv">' + esc(w.v) + '</span>'
      + '<span class="wp">' + esc(w.ph || '') + '</span>'
      + '<span class="wm">' + esc(w.m || '') + '</span>'
      + '</div>'
    ).join('');
  }
  document.getElementById('wordModal').style.display = 'flex';
  list.scrollTop = 0;
}
function closeWordModal(){
  document.getElementById('wordModal').style.display = 'none';
}

/* ---------- 统计页 ---------- */
function renderStats(){
  const s = statSummary();
  document.getElementById('statStreak').textContent = s.streak;
  document.getElementById('statTotalDays').textContent = s.studyDays;
  document.getElementById('statTotalTasks').textContent = s.totalTasks;
  document.getElementById('statTotalFocus').textContent = s.totalFocus;
  document.getElementById('statTotalVocab').textContent = s.totalVocab;

  // 热力图（16周）
  const data = heatmapData(16);
  const rows = [];
  for(let w=0; w<16; w++){
    let cells = '';
    for(let d=0; d<7; d++){
      const item = data[w*7 + d];
      if(!item) continue;
      cells += '<div class="hcell lv'+item.lv+'" title="'+item.date+'"></div>';
    }
    rows.push('<div class="hrow">'+cells+'</div>');
  }
  document.getElementById('heatmap').innerHTML = rows.join('');

  // 最近 30 天
  const ds = Store.get('dailyStats', {});
  const rows2 = [];
  for(let i=29; i>=0; i--){
    const d = $D.add($D.today(), -i);
    const s2 = ds[d];
    if(!s2) continue;
    const score = (s2.done||0) + (s2.focus||0)/25 + (s2.vocab||0)/20;
    const maxScore = 6;
    const w = Math.min(100, Math.round(score/maxScore*100));
    rows2.push('<div class="rd-row"><span class="rd-date">'+$D.ymd(d)+' '+$D.cnWeek(d)+'</span>'
      + '<div class="rd-bar"><i style="width:'+w+'%"></i></div>'
      + '<span class="rd-info">任务'+(s2.done||0)+' · 专注'+(s2.focus||0)+'分 · 单词'+(s2.vocab||0)+'</span></div>');
  }
  document.getElementById('recentDays').innerHTML = rows2.length ? rows2.join('') : '<div class="empty">还没有打卡记录，开始今天的学习吧！</div>';
}

/* ---------- 错题本 ---------- */
let notePendingImg = null;

function compressImage(file, maxSize, quality){
  maxSize = maxSize || 1000;
  quality = quality || 0.72;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('读取失败'));
    reader.readAsDataURL(file);
  });
}

function showNoteImage(src){
  const m = document.getElementById('imageModal');
  document.getElementById('imageModalImg').src = src;
  m.style.display = 'flex';
}

function renderNotes(){
  const notes = Store.get('notes', []);
  const f = Store.get('noteFilter', 'all');
  document.querySelectorAll('#noteFilter .chip').forEach(c => c.classList.toggle('active', c.dataset.f === f));
  const list = notes.filter(n => f === 'all' || n.subject === f);
  const el = document.getElementById('noteList');
  if(!list.length){
    el.innerHTML = '<div class="empty">还没有错题记录，遇到错题就记下来吧 📝</div>';
    return;
  }
  el.innerHTML = list.map(n =>
    '<div class="note-item"><span class="tag '+tagFor(subjKey(n.subject))+'">'+esc(n.subject)+'</span>'
    + '<div style="flex:1;min-width:0"><span class="n-text">'+(n.content ? esc(n.content) : '')+'</span>'
    + (n.img ? '<img class="n-img" data-nid="'+n.id+'" src="'+n.img+'" alt="错题图片">' : '')
    + '</div>'
    + '<span class="n-date">'+n.date+'</span>'
    + '<span class="n-del" data-id="'+n.id+'">✕</span></div>'
  ).join('');
  el.querySelectorAll('.n-img').forEach(img => {
    img.onclick = () => {
      const note = notes.find(x => String(x.id) === img.dataset.nid);
      if(note && note.img) showNoteImage(note.img);
    };
  });
  el.querySelectorAll('.n-del').forEach(x => {
    x.onclick = () => {
      if(!confirm('删除这条错题记录？')) return;
      Store.set('notes', Store.get('notes', []).filter(n => String(n.id) !== x.dataset.id));
      renderNotes();
      toast('已删除');
    };
  });
}
function subjKey(name){ return { '数学二':'math', '英语一':'english', '政治':'politics', '专业课':'custom' }[name] || 'custom'; }

/* ---------- 设置页 ---------- */
function renderSettings(){
  const st = getSettings();
  document.getElementById('setExamDate').value = st.examDate;
  document.getElementById('setExamYear').value = st.examYear;
  document.getElementById('setBaseOffset').value = st.baseOffset;
  document.getElementById('setSprintOffset').value = st.sprintOffset;
  document.getElementById('setQMath').value = st.quotas.math;
  document.getElementById('setQEnglish').value = st.quotas.english;
  document.getElementById('setQPolitics').value = st.quotas.politics;
  document.getElementById('setQCustom').value = st.quotas.custom;
  document.getElementById('setMaxTasks').value = st.maxTasks;
  document.getElementById('setSportDay').value = st.sportDay;
  document.getElementById('setSportReduce').checked = st.sportReduce;
  document.getElementById('setPomoWork').value = st.pomoWork;
  document.getElementById('setPomoBreak').value = st.pomoBreak;
  document.getElementById('setVocabPerDay').value = st.vocabPerDay;
  renderCloudBox();
  renderCustomEditor();
}

/* ---------- 云同步界面 ---------- */
function renderCloudBox(){
  const status = document.getElementById('cloudStatus');
  if(!status) return;
  if(Cloud.enabled){
    status.textContent = '✅ 已登录：' + Cloud.cfg.email + (Cloud.cfg.lastSync ? ' · 上次同步 ' + Cloud.cfg.lastSync : '');
    status.style.color = 'var(--primary-deep)';
    document.getElementById('cloudLoginBox').style.display = 'none';
    const box = document.getElementById('cloudLogoutBox');
    box.style.display = 'block';
    document.getElementById('cloudAccountInfo').innerHTML =
      '👤 账号：<b>' + esc(Cloud.cfg.email) + '</b>（云端已开启）<br>'
      + '数据自动保存到云端，换设备/重装软件都不会丢。'
      + (Cloud.cfg.lastSync ? '<br>🕐 上次同步：' + esc(Cloud.cfg.lastSync) : '');
  } else {
    status.textContent = '未登录';
    status.style.color = 'var(--text-sub)';
    document.getElementById('cloudLoginBox').style.display = 'block';
    document.getElementById('cloudLogoutBox').style.display = 'none';
    if(Cloud.cfg.url) document.getElementById('cloudUrl').value = Cloud.cfg.url;
    if(Cloud.cfg.anonKey) document.getElementById('cloudAnonKey').value = Cloud.cfg.anonKey;
    if(Cloud.cfg.email) document.getElementById('cloudUser').value = Cloud.cfg.email;
  }
}

function renderCustomEditor(){
  const plan = getCustomPlan();
  const el = document.getElementById('customPlanEditor');
  if(!plan.length){
    el.innerHTML = '<div class="empty" style="padding:14px 0">还没有专业课任务，点上方「＋添加一行」录入，例如：<br><span style="font-size:12.5px">第一章 绪论 · 第二章 数据结构基础 · …</span></div>';
    return;
  }
  el.innerHTML = plan.map((t, i) =>
    '<div class="custom-row"><span class="c-num">'+(i+1)+'</span>'
    + '<input type="text" value="'+esc(t.title)+'" data-cid="'+t.id+'">'
    + '<span class="c-del" data-del="'+t.id+'">✕</span></div>'
  ).join('');
  el.querySelectorAll('.c-del').forEach(x => {
    x.onclick = () => {
      Store.set('customPlan', getCustomPlan().filter(t => String(t.id) !== x.dataset.del));
      renderCustomEditor();
    };
  });
}

/* ---------- 全局刷新 ---------- */
function refreshAll(){
  const active = document.querySelector('#nav a.active');
  if(active) switchPage(active.dataset.page);
  else renderHome();
}

/* ---------- 初始化 ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // 导航
  document.querySelectorAll('#nav a').forEach(a => {
    a.onclick = (e) => { e.preventDefault(); switchPage(a.dataset.page); };
  });
  document.querySelectorAll('[data-goto]').forEach(a => {
    a.onclick = (e) => { e.preventDefault(); switchPage(a.dataset.goto); };
  });

  // 设置保存（change 时自动保存）
  const bindSetting = (id, fn) => {
    const el = document.getElementById(id);
    if(el) el.onchange = () => { const st = getSettings(); fn(st, el); saveSettings(st); toast('设置已保存 ✓'); };
  };
  bindSetting('setExamDate', (st, el) => { st.examDate = el.value; });
  bindSetting('setExamYear', (st, el) => { st.examYear = parseInt(el.value)||2027; });
  bindSetting('setBaseOffset', (st, el) => { st.baseOffset = clampInt(el.value, 45, 150); });
  bindSetting('setSprintOffset', (st, el) => { st.sprintOffset = clampInt(el.value, 14, 80); });
  bindSetting('setQMath', (st, el) => { st.quotas.math = clampInt(el.value, 0, 3); });
  bindSetting('setQEnglish', (st, el) => { st.quotas.english = clampInt(el.value, 0, 3); });
  bindSetting('setQPolitics', (st, el) => { st.quotas.politics = clampInt(el.value, 0, 3); });
  bindSetting('setQCustom', (st, el) => { st.quotas.custom = clampInt(el.value, 0, 3); });
  bindSetting('setMaxTasks', (st, el) => { st.maxTasks = clampInt(el.value, 4, 15); });
  bindSetting('setSportDay', (st, el) => { st.sportDay = parseInt(el.value)||7; });
  bindSetting('setSportReduce', (st, el) => { st.sportReduce = el.checked; });
  bindSetting('setPomoWork', (st, el) => { st.pomoWork = parseInt(el.value)||25; Pomo.init(); });
  bindSetting('setPomoBreak', (st, el) => { st.pomoBreak = parseInt(el.value)||5; Pomo.init(); });
  bindSetting('setVocabPerDay', (st, el) => { st.vocabPerDay = parseInt(el.value)||20; });

  // 专业课任务
  document.getElementById('btnCustomAdd').onclick = () => {
    const plan = getCustomPlan();
    plan.push({ id:'c'+Date.now(), title:'' });
    setCustomPlan(plan);
    renderCustomEditor();
    const last = document.querySelector('#customPlanEditor input:last-child');
    if(last) last.focus();
  };
  document.getElementById('btnCustomSave').onclick = () => {
    const rows = document.querySelectorAll('#customPlanEditor input');
    const plan = [];
    rows.forEach(r => {
      const v = r.value.trim();
      if(v) plan.push({ id: r.dataset.cid || 'c'+Date.now()+Math.random(), title:v });
    });
    setCustomPlan(plan);
    toast('专业课任务已保存（共 '+plan.length+' 项）');
    renderCustomEditor();
  };

  // 备份
  document.getElementById('btnExport').onclick = () => {
    const blob = new Blob([exportData()], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '考研工作台备份_'+$D.today()+'.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('备份已导出');
  };
  document.getElementById('btnImport').onclick = () => document.getElementById('importFile').click();
  document.getElementById('importFile').onchange = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const r = importData(reader.result);
      toast(r.ok ? '导入成功 ✓' : '导入失败：'+r.msg);
      if(r.ok){ location.reload(); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };
  document.getElementById('btnClear').onclick = () => {
    if(!confirm('确定清空全部数据吗？此操作不可恢复，建议先导出备份！')) return;
    if(!confirm('再次确认：真的要清空所有数据吗？')) return;
    clearAllData();
    toast('已清空全部数据');
    location.reload();
  };

  // 错题本
  document.getElementById('noteAdd').onclick = addNote;
  document.getElementById('noteInput').addEventListener('keydown', e => { if(e.key === 'Enter') addNote(); });
  document.getElementById('noteImgBtn').onclick = () => document.getElementById('noteImgInput').click();
  document.getElementById('noteImgInput').onchange = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    try{
      notePendingImg = await compressImage(file);
      document.getElementById('noteImgPreviewImg').src = notePendingImg;
      document.getElementById('noteImgPreview').style.display = 'flex';
      toast('📷 图片已就绪，点「＋ 添加」保存（已自动压缩）');
    }catch(err){
      toast('图片处理失败：' + (err.message || '请重试'));
    }
    e.target.value = '';
  };
  document.getElementById('noteImgDel').onclick = () => {
    notePendingImg = null;
    document.getElementById('noteImgPreview').style.display = 'none';
    toast('已移除图片');
  };
  document.querySelectorAll('#noteFilter .chip').forEach(c => {
    c.onclick = () => { Store.set('noteFilter', c.dataset.f); renderNotes(); };
  });

  // 云同步：登录 / 注册 / 立即同步 / 退出登录
  const cloudBtn = (id, fn) => { const el = document.getElementById(id); if(el) el.onclick = fn; };
  cloudBtn('btnCloudLogin', async () => {
    const url = document.getElementById('cloudUrl').value.trim();
    const anonKey = document.getElementById('cloudAnonKey').value.trim();
    const user = document.getElementById('cloudUser').value.trim();
    const pass = document.getElementById('cloudPass').value;
    if(!url || !anonKey){ toast('请先填写项目 URL 和 anon 公钥'); return; }
    if(!user || !pass){ toast('请输入邮箱和密码'); return; }
    Cloud.cfg.url = url; Cloud.cfg.anonKey = anonKey; Cloud.saveCfg();
    try{
      await Cloud.login(user, pass);
      toast('登录成功！正在同步云端数据…');
      await Cloud.pull();
      toast('✅ 数据已同步');
      renderCloudBox();
      refreshAll();
    }catch(e){
      toast('登录失败：' + (e.message||'网络或凭证错误'));
    }
  });
  cloudBtn('btnCloudRegister', async () => {
    const url = document.getElementById('cloudUrl').value.trim();
    const anonKey = document.getElementById('cloudAnonKey').value.trim();
    const user = document.getElementById('cloudUser').value.trim();
    const pass = document.getElementById('cloudPass').value;
    if(!url || !anonKey){ toast('请先填写项目 URL 和 anon 公钥'); return; }
    if(!user || !/.+@.+/.test(user)){ toast('请输入有效的邮箱地址'); return; }
    if(!pass || pass.length < 6){ toast('密码至少 6 位'); return; }
    if(!confirm('注册新账号「' + user + '」？注册后会自动登录并同步数据。')) return;
    Cloud.cfg.url = url; Cloud.cfg.anonKey = anonKey; Cloud.saveCfg();
    try{
      await Cloud.register(user, pass);
      toast('🎉 注册成功！正在上传数据到云端…');
      await Cloud.push();
      toast('✅ 数据已保存到云端');
      renderCloudBox();
      refreshAll();
    }catch(e){
      toast('注册失败：' + (e.message||'网络或凭证错误'));
    }
  });
  const doCloudSync = async () => {
    try{
      await Cloud.pull();
      toast('✅ 已从云端同步最新数据');
      refreshAll();
    }catch(e){
      toast('同步失败：' + (e.message||'请检查网络或重新登录'));
      if(e.status === 401 || e.status === 403){ Cloud.logout(); renderCloudBox(); }
    }
  };
  cloudBtn('btnCloudSyncNow', doCloudSync);
  cloudBtn('btnCloudSyncNow2', doCloudSync);
  cloudBtn('btnCloudLogout', () => {
    if(!confirm('退出登录？退出后本机将不再自动云同步（云端数据保留）。')) return;
    Cloud.logout();
    renderCloudBox();
    toast('已退出登录');
  });

  // 番茄钟
  document.querySelectorAll('.pomo-tab').forEach(t => {
    t.onclick = () => {
      Pomo.reset();
      document.querySelectorAll('.pomo-tab').forEach(x => x.classList.toggle('active', x === t));
    };
  });
  document.getElementById('pomoStart').onclick = () => {
    // 主按钮：开始 / 暂停 / 继续 切换
    if(Pomo.state === 'working' || Pomo.state === 'breaking') Pomo.pause();
    else Pomo.start();
  };
  document.getElementById('pomoPause').onclick = () => {
    // 次按钮：暂停中点击 = 继续；计时中点击 = 暂停
    if(Pomo.state === 'paused') Pomo.start();
    else Pomo.pause();
  };
  document.getElementById('pomoReset').onclick = () => Pomo.reset();

  // 首次初始化数据
  Pomo.init();

  // 启动时同步：优先云端（登录了账号），否则局域网
  const bootSync = Cloud.enabled
    ? Cloud.pull().catch(() => {})
    : Sync.load();
  bootSync.then(() => {
    const qp = new URLSearchParams(location.search);
    const target = qp.get('page');
    switchPage(['home','tasks','pomodoro','vocab','stats','notes','settings'].includes(target) ? target : 'home');
    if(!Store.get('lastDate', null)){
      setTimeout(() => {
        toast('欢迎使用考研工作台！先到「设置」开启云同步，数据就永远丢不了啦 ☁️');
      }, 600);
    }
    // 调试：?debug=1 时依次检测各页面是否横向溢出，结果写入标题（手机布局排查用）
    if(qp.get('debug') === '1'){
      setTimeout(async () => {
        const pages = ['home','tasks','pomodoro','vocab','stats','notes','settings'];
        const out = [];
        for(const p of pages){
          switchPage(p);
          await new Promise(r => setTimeout(r, 250));
          const sw = document.documentElement.scrollWidth;
          const cw = document.documentElement.clientWidth;
          out.push(p + (sw > cw + 1 ? '!X' : 'ok'));
        }
        document.title = 'DEBUG ' + window.innerWidth + 'px: ' + out.join(' ');
      }, 900);
    }
  });
});

function clampInt(v, min, max){
  const n = parseInt(v);
  if(isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
function addNote(){
  const sub = document.getElementById('noteSubject').value;
  const input = document.getElementById('noteInput');
  const content = input.value.trim();
  if(!content && !notePendingImg){ toast('写点内容或拍张图吧'); return; }
  const notes = Store.get('notes', []);
  const note = { id: Date.now(), subject:sub, date: $D.today() };
  if(content) note.content = content;
  if(notePendingImg) note.img = notePendingImg;
  notes.unshift(note);
  Store.set('notes', notes);
  input.value = '';
  notePendingImg = null;
  document.getElementById('noteImgPreview').style.display = 'none';
  renderNotes();
  toast(note.img ? '已记录（含图片）📝' : '已记录 📝');
}

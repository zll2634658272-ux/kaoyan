/* ============ core.js：存储 / 日期 / 三阶段智能排课 / 遗忘曲线 / 统计 ============ */
'use strict';

/* ---------- 日期工具 ---------- */
const $D = {
  fmt(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); },
  today(){ return this.fmt(new Date()); },
  add(dateStr, n){ const d = new Date(dateStr+'T00:00:00'); d.setDate(d.getDate()+n); return this.fmt(d); },
  diff(a, b){ return Math.round((new Date(b+'T00:00:00') - new Date(a+'T00:00:00'))/86400000); },
  cnWeek(dateStr){ return ['周日','周一','周二','周三','周四','周五','周六'][new Date(dateStr+'T00:00:00').getDay()]; },
  weekday1(dateStr){ const w = new Date(dateStr+'T00:00:00').getDay(); return w===0 ? 7 : w; },
  ymd(dateStr){ const d = new Date(dateStr+'T00:00:00'); return d.getMonth()+1+'月'+d.getDate()+'日'; },
  todayCn(){ const d = new Date(); return d.getFullYear()+'年'+(d.getMonth()+1)+'月'+d.getDate()+'日 '+this.cnWeek(this.today()); }
};

/* ---------- 存储 ---------- */
const Store = {
  get(k, d){
    try{
      const v = localStorage.getItem('ky_'+k);
      if(v === null) return d;
      const p = JSON.parse(v);
      return p === null ? d : p;   // 防御：JSON "null" 视为未设置
    }catch(e){ return d; }
  },
  set(k, v){
    try{ localStorage.setItem('ky_'+k, JSON.stringify(v)); }catch(e){ console.warn('存储失败', e); }
    // 局域网模式：http 访问时同步到本机服务器；file:// 双击打开时自动跳过
    if(typeof Sync !== 'undefined' && Sync.enabled) Sync.push();
    // 云模式：登录了云账号时同步到云端（防抖在 Cloud.pushDebounced 内）
    if(typeof Cloud !== 'undefined' && Cloud.enabled && !Cloud._skipPush) Cloud.pushDebounced();
  }
};

/* ---------- 设置 ---------- */
const DEF_SETTINGS = {
  examDate: '2026-12-26',
  examYear: 2027,
  quotas: { math:1, english:1, politics:1, custom:1 },
  baseOffset: 90,      // 基础期截止：考前 90 天
  sprintOffset: 35,    // 冲刺期开始：考前 35 天
  sportDay: 7,         // 1=周一 … 7=周日
  sportReduce: true,
  sportPlan: ['🏃 晨跑 30 分钟','🤸 跳绳 15 分钟 + 全身拉伸','🏸 羽毛球 / 球类 1 小时','🚴 骑行 40 分钟','🏋️ 居家力量训练 30 分钟','🚶 快走 45 分钟','🧘 瑜伽 / 拉伸放松 30 分钟'],
  vocabPerDay: 40,
  vocabOn: true,
  pomoWork: 25,
  pomoBreak: 5,
  maxTasks: 10
};
function getSettings(){ return Object.assign({}, DEF_SETTINGS, Store.get('settings', {})); }
function saveSettings(s){ Store.set('settings', s); }

/* ---------- 课程数据 ---------- */
window.SYLLABUS = window.SYLLABUS || {
  math: window.SYLLABUS_MATH || [],
  english: window.SYLLABUS_ENGLISH || [],
  politics: window.SYLLABUS_POLITICS || []
};
const SYLLABUS = window.SYLLABUS;
const SUBJECTS = ['math','english','politics','custom'];
const SUBJECT_NAMES = { math:'数学二', english:'英语一', politics:'政治', custom:'专业课' };
const SUBJECT_ICONS = { math:'📐', english:'📖', politics:'🏛️', custom:'📚' };
const STAGES = ['base','practice','sprint'];
const STAGE_NAMES = { base:'基础期', practice:'刷题期', sprint:'冲刺期' };

function getCustomPlan(){ return Store.get('customPlan', []); }   // [{id, title}]
function setCustomPlan(arr){ Store.set('customPlan', arr); }

/* ---------- 排课游标（每科每阶段的已学进度） ---------- */
function defaultPos(){
  return { math:{base:0,practice:0,sprint:0}, english:{base:0,practice:0,sprint:0}, politics:{base:0,practice:0,sprint:0}, custom:0 };
}
function getPos(){
  const p = Store.get('pos', null);
  if(!p){ const d = defaultPos(); Store.set('pos', d); return d; }
  // 兼容旧版数字游标
  if(typeof p.math === 'number'){
    const d = defaultPos(); d.custom = p.custom||0;
    ['math','english','politics'].forEach(k => {
      const lens = (SYLLABUS[k]||[]).filter(u=>u.stage==='base').length;
      d[k].base = Math.min(p[k]||0, lens);
    });
    Store.set('pos', d);
    return d;
  }
  // 兼容 b/p/s 缩写游标
  if(p.math && typeof p.math.b === 'number'){
    const d = defaultPos(); d.custom = p.custom||0;
    ['math','english','politics'].forEach(k => {
      d[k] = { base:p[k].b||0, practice:p[k].p||0, sprint:p[k].s||0 };
    });
    Store.set('pos', d);
    return d;
  }
  return p;
}
function setPos(p){ Store.set('pos', p); }

/* 当前处于哪个阶段（按日期 + 设置） */
function dateStage(dateStr){
  const st = getSettings();
  const baseEnd = $D.add(st.examDate, -st.baseOffset);
  const sprintStart = $D.add(st.examDate, -st.sprintOffset);
  if(dateStr >= sprintStart) return 'sprint';
  if(dateStr <= baseEnd) return 'base';
  return 'practice';
}
function stageDates(){
  const st = getSettings();
  const baseEnd = $D.add(st.examDate, -st.baseOffset);
  const sprintStart = $D.add(st.examDate, -st.sprintOffset);
  return { baseEnd, sprintStart };
}

/* 某科某阶段单元列表 */
function stageUnits(subject, stage){
  if(subject === 'custom') return [];
  return (SYLLABUS[subject]||[]).filter(u => u.stage === stage);
}
function stageDone(subject, stage){
  const pos = getPos();
  if(subject === 'custom') return pos.custom >= getCustomPlan().length;
  return pos[subject][stage] >= stageUnits(subject, stage).length;
}
/* 冲刺期任务是否已开放（未到冲刺期不排肖四/时政等任务） */
function sprintOpen(dateStr){ return dateStage(dateStr) === 'sprint'; }
function allStagesDone(subject, dateStr){
  const d = dateStr || $D.today();
  return STAGES.every(s => {
    if(s === 'sprint' && !sprintOpen(d)) return true; // 冲刺期未开放，视为已完成（跳过）
    return stageDone(subject, s);
  });
}

/* 取某科下一个新任务（round: 0=第一轮，1=二轮…）
   规则：按 base→practice→sprint 顺序取第一个有剩余的阶段（知识点优先学完）；
        sprint 队列仅冲刺期开放；全部学完返回 null */
function peekStageTask(subject, round){
  const pos = getPos();
  if(subject === 'custom'){
    const plan = getCustomPlan();
    if(pos.custom < plan.length){
      const t = plan[pos.custom];
      return { id:'custom_'+t.id, type:'unit', subject, title:'📚 '+t.title, stage:'base' };
    }
    return null;
  }
  for(let i=0; i<3; i++){
    const stage = STAGES[i];
    if(stage === 'sprint' && !sprintOpen($D.today())) continue;
    const arr = stageUnits(subject, stage);
    const idx = pos[subject][stage];
    if(idx < arr.length){
      const u = arr[idx];
      const prefix = round > 0 ? '二轮·' : '';
      return { id:'unit_'+subject+'_'+u.id+'_r'+round, type:'unit', subject, title:prefix+u.title, est:u.est, src:u.src, chap:u.chap, stage };
    }
  }
  return null;
}

/* 生成一个新任务（取队列头并推进游标；当前轮次学完自动进入二轮） */
function takeNewTask(subject){
  let round = 0;
  while(true){
    const t = peekStageTask(subject, round);
    if(t){
      const pos = getPos();
      if(subject === 'custom') pos.custom++;
      else pos[subject][t.stage]++;
      setPos(pos);
      return t;
    }
    if(subject === 'custom') return null;
    if(!allStagesDone(subject)) return null;
    // 当前轮次全部学完 → 重置游标进入二轮
    const pos = getPos();
    pos[subject] = { base:0, practice:0, sprint:0 };
    setPos(pos);
    round++;
    if(round > 5) return null;
  }
}

/* 预览明天的新任务（不推进游标） */
function previewNewTask(subject){
  const tomorrow = $D.add($D.today(), 1);
  let round = 0;
  while(true){
    const t = peekStageTask(subject, round);
    if(t) return t;
    if(subject === 'custom') return null;
    if(!allStagesDone(subject, tomorrow)) return null;
    const pos = getPos();
    pos[subject] = { base:0, practice:0, sprint:0 };
    setPos(pos);
    round++;
    if(round > 5) return null;
  }
}

/* ---------- 遗忘曲线（学完后第 1/2/4/7/15 天复习） ---------- */
const REVIEW_GAP = [1, 2, 4, 7, 15];
function planReviews(date){ return REVIEW_GAP.map(g => ({ due: $D.add(date, g), done:false })); }

/* ---------- 每日任务生成 ---------- */
function rollOver(){
  const last = Store.get('lastDate', null);
  const today = $D.today();
  if(last && last < today){
    const snap = Store.get('tasksSnap', []);
    const backlog = Store.get('backlog', []);
    snap.forEach(t => {
      if(!t.done && !backlog.find(b => b.id===t.id)){
        backlog.push({ id:t.id, type:t.type, subject:t.subject, title:t.title, src:t.src, origDate:last, done:false, flag:'backlog' });
      }
    });
    Store.set('backlog', backlog);
  }
  Store.set('lastDate', today);
}

function getSportPlan(dateStr){
  const st = getSettings();
  const plan = st.sportPlan || DEF_SETTINGS.sportPlan;
  let start = Store.get('sportStart', null);
  if(!start){ start = dateStr; Store.set('sportStart', start); }
  const weeks = Math.max(0, Math.floor($D.diff(start, dateStr)/7));
  return plan[weeks % plan.length];
}

function genTasks(){
  rollOver();
  const today = $D.today();
  // 同一天内只生成一次（幂等），避免重复渲染推进游标
  const cached = Store.get('tasksToday', null);
  if(cached && cached._date === today) return cached.tasks;

  const st = getSettings();
  const isSport = (st.sportDay === $D.weekday1(today));
  const tasks = [];

  // 1) 昨日未完成任务（不能跳过，永远排最前）
  const backlog = Store.get('backlog', []).filter(b => !b.done);
  backlog.forEach(b => tasks.push(Object.assign({}, b)));

  // 2) 今日到期复习任务（遗忘曲线）
  const completed = Store.get('completed', []);
  completed.forEach(c => {
    (c.reviews||[]).forEach(r => {
      if(r.due === today && !r.done){
        tasks.push({ id:'rev_'+c.id+'_'+r.due, type:'review', subject:c.subject, title:'🔁 复习：'+c.title, srcId:c.id, due:r.due, flag:'review' });
      }
    });
  });

  // 3) 各科新任务（按配额；运动日减负）
  for(const sub of SUBJECTS){
    let q = st.quotas[sub] || 0;
    if(isSport && st.sportReduce) q = 0;
    let added = 0;
    while(added < q){
      if(tasks.length >= st.maxTasks) break;
      const next = takeNewTask(sub);
      if(!next) break;
      tasks.push(next);
      added++;
    }
  }

  // 4) 每日背单词任务
  if(st.vocabOn) tasks.push({ id:'vocab_today', type:'vocab', title:'📖 背单词（新词 '+st.vocabPerDay+' 个 + 遗忘曲线复习）' });

  // 5) 运动日任务
  if(isSport) tasks.push({ id:'sport_today', type:'sport', title:'🏃 运动日：'+getSportPlan(today) });

  // 快照：次日 rollOver 用（未完成自动顺延）；合并当天已完成状态
  const oldSnap = Store.get('tasksSnap', []);
  const oldDone = {};
  oldSnap.forEach(t => { oldDone[t.id] = t.done; });
  Store.set('tasksSnap', tasks.map(t => ({ id:t.id, type:t.type, subject:t.subject, title:t.title, src:t.src, done: !!oldDone[t.id] })));
  Store.set('tasksToday', { _date: today, tasks: tasks });

  // 当日统计骨架
  const ds = Store.get('dailyStats', {});
  if(!ds[today]) ds[today] = { total:tasks.length, done:0, focus:0, vocab:0 };
  Store.set('dailyStats', ds);

  return tasks;
}

/* ---------- 完成任务 ---------- */
function completeTask(task){
  const today = $D.today();
  const ds = Store.get('dailyStats', {});
  if(!ds[today]) ds[today] = { total:0, done:0, focus:0, vocab:0 };

  // 防重：同一任务已标记完成时，忽略重复点击（避免计数无限累加）
  const snap0 = Store.get('tasksSnap', []);
  const snapItem0 = snap0.find(x => x.id === task.id);
  if(snapItem0 && snapItem0.done) return;

  if(task.type === 'unit'){
    const completed = Store.get('completed', []);
    if(!completed.find(c => c.id === task.id)){
      const cleanTitle = task.title.replace(/^(二轮·)?[^\u4e00-\u9fa5A-Za-z0-9]+/,'');
      completed.push({ id:task.id, subject:task.subject, title:cleanTitle, src:task.src, date:today, reviews:planReviews(today) });
      Store.set('completed', completed);
    }
  } else if(task.type === 'review'){
    const completed = Store.get('completed', []);
    const c = completed.find(x => x.id === task.srcId);
    if(c){
      const r = (c.reviews||[]).find(x => x.due === task.due);
      if(r) r.done = true;
      Store.set('completed', completed);
    }
  }

  if(task.flag === 'backlog'){
    Store.set('backlog', Store.get('backlog', []).filter(b => b.id !== task.id));
  }

  ds[today].done = (ds[today].done||0) + 1;
  Store.set('dailyStats', ds);

  const snap = Store.get('tasksSnap', []);
  const s = snap.find(x => x.id === task.id);
  if(s) s.done = true;
  Store.set('tasksSnap', snap);

  // 撤销栈
  const arr = Store.get('doneStack', []);
  arr.push({ id:task.id, type:task.type, srcId:task.srcId, due:task.due, stage:task.stage, subject:task.subject, title:task.title, at:Date.now() });
  Store.set('doneStack', arr);
}

/* 取消完成（误点可撤销）：还原计数、完成记录、复习状态；学习任务回到待办（明天顺延） */
function uncompleteTask(task){
  // 幂等：任务未处于完成状态时忽略（避免重复取消减成负数）
  const snap0 = Store.get('tasksSnap', []);
  const snapItem0 = snap0.find(x => x.id === task.id);
  if(!snapItem0 || !snapItem0.done) return;

  const today = $D.today();
  const ds = Store.get('dailyStats', {});
  if(ds[today] && ds[today].done > 0) ds[today].done--;
  Store.set('dailyStats', ds);

  if(task.type === 'unit'){
    // 删除学习完成记录（其遗忘曲线复习计划一并取消），任务重新进入待办
    Store.set('completed', Store.get('completed', []).filter(c => c.id !== task.id));
    const backlog = Store.get('backlog', []);
    if(!backlog.find(b => b.id === task.id)){
      backlog.push({ id:task.id, type:task.type, subject:task.subject, title:task.title, src:task.src, origDate:today, done:false, flag:'backlog' });
      Store.set('backlog', backlog);
    }
  } else if(task.type === 'review'){
    // 复习任务：恢复未完成状态（明天继续提醒复习）
    const completed = Store.get('completed', []);
    const c = completed.find(x => x.id === task.srcId);
    if(c){
      const r = (c.reviews||[]).find(x => x.due === task.due);
      if(r) r.done = false;
      Store.set('completed', completed);
    }
  } else if(task.type === 'backlog'){
    // 顺延任务：放回待办队列
    const backlog = Store.get('backlog', []);
    if(!backlog.find(b => b.id === task.id)){
      backlog.push({ id:task.id, type:task.type, subject:task.subject, title:task.title, src:task.src, origDate:today, done:false, flag:'backlog' });
      Store.set('backlog', backlog);
    }
  }
  // 撤销栈里移除该任务记录（避免「撤销上一次」重复减计数）
  Store.set('doneStack', Store.get('doneStack', []).filter(r => r.id !== task.id));

  const snap = Store.get('tasksSnap', []);
  const s = snap.find(x => x.id === task.id);
  if(s) s.done = false;
  Store.set('tasksSnap', snap);
}

/* 撤销最近一次完成（记录栈） */
function popDoneRecord(){
  const arr = Store.get('doneStack', []);
  if(!arr.length) return null;
  const rec = arr.pop(); Store.set('doneStack', arr);
  const today = $D.today();
  const ds = Store.get('dailyStats', {});
  if(ds[today] && ds[today].done > 0) ds[today].done--;
  Store.set('dailyStats', ds);
  if(rec.type === 'unit'){
    Store.set('completed', Store.get('completed', []).filter(c => c.id !== rec.id));
    const pos = getPos();
    if(rec.subject === 'custom'){ if(pos.custom > 0) pos.custom--; }
    else if(rec.stage && pos[rec.subject] && pos[rec.subject][rec.stage] > 0) pos[rec.subject][rec.stage]--;
    setPos(pos);
  } else if(rec.type === 'review'){
    const completed = Store.get('completed', []);
    const c = completed.find(x => x.id === rec.srcId);
    if(c){ const r = (c.reviews||[]).find(x => x.due === rec.due); if(r) r.done = false; Store.set('completed', completed); }
  } else if(rec.type === 'backlog'){
    const backlog = Store.get('backlog', []);
    if(!backlog.find(b => b.id === rec.id)) backlog.push({ id:rec.id, type:rec.type, subject:rec.subject, title:rec.title, src:rec.src, origDate:today, done:false, flag:'backlog' });
    Store.set('backlog', backlog);
  }
  const snap = Store.get('tasksSnap', []);
  const s = snap.find(x => x.id === rec.id);
  if(s) s.done = false;
  Store.set('tasksSnap', snap);
  return rec;
}

/* ---------- 进度 ---------- */
function subjectProgress(subject){
  const pos = getPos();
  if(subject === 'custom'){
    const total = getCustomPlan().length;
    const done = Math.min(pos.custom, total);
    return { done, total, pct: total ? Math.round(done/total*100) : 0, stages:{} };
  }
  const out = { done:0, total:0, pct:0, stages:{} };
  STAGES.forEach(s => {
    const arr = stageUnits(subject, s);
    const d = Math.min(pos[subject][s], arr.length);
    out.stages[s] = { done:d, total:arr.length, pct: arr.length ? Math.round(d/arr.length*100) : 100 };
    out.done += d; out.total += arr.length;
  });
  out.pct = out.total ? Math.round(out.done/out.total*100) : 0;
  return out;
}

/* 未来 N 天待复习任务预览 */
function upcomingReviews(nDays){
  const today = $D.today();
  const completed = Store.get('completed', []);
  const out = [];
  for(let i=0;i<nDays;i++){
    const d = $D.add(today, i);
    const list = [];
    completed.forEach(c => (c.reviews||[]).forEach(r => { if(r.due===d && !r.done && !list.includes(c.title)) list.push(c.title); }));
    if(list.length) out.push({ date:d, week:$D.cnWeek(d), list });
  }
  return out;
}

/* 明日任务预告 */
function previewTomorrow(){
  const st = getSettings();
  const items = [];
  for(const sub of SUBJECTS){
    let q = st.quotas[sub] || 0;
    const tomorrow = $D.add($D.today(), 1);
    if($D.weekday1(tomorrow) === st.sportDay && st.sportReduce) q = 0;
    for(let i=0;i<q;i++){
      const next = previewNewTask(sub);
      if(!next) break;
      items.push({ subject:sub, title:next.title, src:next.src, stage:next.stage });
    }
  }
  return items;
}

/* ---------- 统计汇总 ---------- */
function statSummary(){
  const ds = Store.get('dailyStats', {});
  const vocab = Store.get('vocab', { learned:{} });
  const pomo = Store.get('pomo', { totalSessions:0 });
  let totalTasks = 0, totalFocus = 0, totalVocab = 0, studyDays = 0;
  Object.keys(ds).sort().forEach(d => {
    totalTasks += (ds[d].done||0); totalFocus += (ds[d].focus||0); totalVocab += (ds[d].vocab||0);
    if((ds[d].done||0)>0 || (ds[d].focus||0)>0 || (ds[d].vocab||0)>0) studyDays++;
  });
  let streak = 0;
  for(let i=0; i<600; i++){
    const d = $D.add($D.today(), -i);
    const s = ds[d];
    if(s && ((s.done||0)>0 || (s.focus||0)>0 || (s.vocab||0)>0)) streak++;
    else if(i===0) streak = 0;
    else break;
  }
  return {
    streak, studyDays, totalTasks, totalFocus,
    totalVocab: Object.keys(vocab.learned||{}).length,
    totalSessions: pomo.totalSessions||0,
    learnedWords: Object.keys(vocab.learned||{}).length
  };
}

/* 热力图数据：最近 weeks 周 */
function heatmapData(weeks){
  const ds = Store.get('dailyStats', {});
  const out = [];
  const today = new Date();
  const start = new Date(today); start.setDate(start.getDate() - weeks*7 + 1);
  for(let i=0; i<weeks*7; i++){
    const d = new Date(start); d.setDate(start.getDate()+i);
    const key = $D.fmt(d);
    const s = ds[key];
    let lv = 0;
    if(s){
      const score = (s.done||0) + (s.focus||0)/25 + (s.vocab||0)/20;
      if(score >= 4) lv = 4; else if(score >= 2.5) lv = 3; else if(score >= 1.2) lv = 2; else if(score > 0) lv = 1;
    }
    out.push({ date:key, lv, isToday: key === $D.today() });
  }
  return out;
}

/* ---------- 数据备份 ---------- */
function exportData(){
  const keys = ['settings','pos','backlog','completed','tasksSnap','tasksToday','lastDate','dailyStats','vocab','pomo','notes','customPlan','sportStart','doneStack','cloud','avatar'];
  const data = { app:'kaoyan-workbench', version:1, exportedAt:new Date().toISOString() };
  keys.forEach(k => data[k] = Store.get(k, null));
  return JSON.stringify(data, null, 2);
}
function importData(jsonStr){
  try{
    const data = JSON.parse(jsonStr);
    if(!data || data.app !== 'kaoyan-workbench') return { ok:false, msg:'不是有效的备份文件' };
    Object.keys(data).forEach(k => {
      if(k !== 'app' && k !== 'version' && k !== 'exportedAt' && data[k] !== null) Store.set(k, data[k]);
    });
    return { ok:true };
  }catch(e){ return { ok:false, msg:'文件解析失败' }; }
}
function clearAllData(){
  const keys = ['settings','pos','backlog','completed','tasksSnap','tasksToday','lastDate','dailyStats','vocab','pomo','notes','customPlan','sportStart','doneStack','cloud','avatar'];
  keys.forEach(k => localStorage.removeItem('ky_'+k));
}

/* ---------- 服务器同步（http 访问时启用：所有设备共享数据；file:// 双击打开时自动禁用） ---------- */
const Sync = {
  enabled: location.protocol.indexOf('http') === 0,
  timer: null,
  /* 打开页面时拉取服务器数据（覆盖本地，以服务器为准） */
  async load(){
    if(!this.enabled) return;
    try{
      const r = await fetch('api/load', { cache:'no-store' });
      if(!r.ok) return;
      const txt = await r.text();
      if(!txt || txt.trim() === '' || txt.trim() === '{}') return;
      const res = importData(txt);
      if(res.ok) console.log('[Sync] 已从服务器同步数据');
    }catch(e){ console.warn('[Sync] 加载失败:', e); }
  },
  /* 数据变化后防抖推送（1.2 秒内合并多次写入） */
  push(){
    if(!this.enabled) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      fetch('api/save', { method:'POST', body: exportData() }).catch(e => console.warn('[Sync] 保存失败:', e));
    }, 1200);
  }
};

/* ============================================================
   云同步 + 账号系统（Supabase：Postgres 数据库 + 官方账号系统）
   - 注册/登录账号，数据存云端：换设备、重装都不丢
   - iPhone / iPad / 安卓 / 电脑：登录同一账号自动同步
   - 设置页填入：项目 URL + anon 公钥（Supabase 控制台 Settings → API）
   ============================================================ */
const Cloud = {
  cfg: Store.get('cloud', { url:'', anonKey:'', email:'', token:'', userId:'', lastSync:'' }),
  timer: null,
  _skipPush: false,
  get enabled(){ return !!(this.cfg.url && this.cfg.anonKey && this.cfg.email && this.cfg.token); },

  base(){ return String(this.cfg.url||'').replace(/\/+$/,'') + '/'; },
  headers(auth){
    const h = { 'apikey': this.cfg.anonKey, 'Content-Type': 'application/json' };
    if(auth !== false) h['Authorization'] = 'Bearer ' + (this.cfg.token || this.cfg.anonKey);
    return h;
  },
  saveCfg(){ try{ localStorage.setItem('ky_cloud', JSON.stringify(this.cfg)); }catch(e){} },

  async api(method, path, body, opts){
    const res = await fetch(this.base() + path, {
      method,
      headers: this.headers(opts && opts.auth),
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let json = null;
    try{ json = JSON.parse(text); }catch(e){}
    if(json && json.error_description){
      const err = new Error(json.error_description); err.status = res.status; throw err;
    }
    if(!res.ok){
      const msg = json ? (json.message || json.error || json.msg) : ('HTTP ' + res.status);
      const err = new Error(msg || ('HTTP ' + res.status));
      err.status = res.status;
      throw err;
    }
    return json === null ? text : json;
  },

  /* 注册新账号（Supabase Auth） */
  async register(email, password){
    const json = await this.api('POST', 'auth/v1/signup', { email: email.trim(), password: password });
    if(json && json.access_token){
      this.cfg.email = email.trim();
      this.cfg.token = json.access_token;
      this.cfg.userId = json.user && json.user.id;
      this.saveCfg();
      return json;
    }
    // 未返回 token（邮箱验证开启或账号已存在）
    const err = new Error('注册未完成：可能邮箱已存在，或项目开启了邮箱验证。请直接登录试试');
    err.status = 400;
    throw err;
  },

  /* 登录 */
  async login(email, password){
    const json = await this.api('POST', 'auth/v1/token?grant_type=password', { email: email.trim(), password: password });
    this.cfg.email = email.trim();
    this.cfg.token = json.access_token;
    this.cfg.userId = json.user && json.user.id;
    this.saveCfg();
    return json;
  },

  logout(){
    this.cfg.email = ''; this.cfg.token = ''; this.cfg.userId = ''; this.cfg.lastSync = '';
    this.saveCfg();
  },

  /* 从云端拉取数据（打开页面 / 手动同步时调用） */
  async pull(){
    if(!this.enabled) return false;
    try{
      const email = encodeURIComponent(this.cfg.email);
      const json = await this.api('GET', 'rest/v1/user_data?select=data&owner=eq.' + email + '&limit=1&order=updated_at.desc', null, { auth: true });
      if(json && json.length && json[0].data){
        this._skipPush = true;
        try{
          const res = importData(json[0].data);
          if(res.ok){
            this.cfg.lastSync = new Date().toLocaleString();
            this.saveCfg();
            return true;
          }
        }finally{ this._skipPush = false; }
      }
      return false;
    }catch(e){
      console.warn('[Cloud] 拉取失败:', e);
      throw e;
    }
  },

  /* 把本地数据推送到云端（upsert：存在则更新，不存在则插入） */
  async push(){
    if(!this.enabled) return;
    try{
      const body = { owner: this.cfg.email, data: exportData(), updated_at: new Date().toISOString() };
      await this.api('POST', 'rest/v1/user_data?on_conflict=owner', body, { auth: true });
      this.cfg.lastSync = new Date().toLocaleString();
      this.saveCfg();
    }catch(e){
      console.warn('[Cloud] 推送失败:', e);
      if(e.status === 401 || e.status === 403) throw e; // 登录失效，UI 提示重新登录
    }
  },

  pushDebounced(){
    if(!this.enabled) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.push().catch(()=>{}); }, 1500);
  }
};

/* ============ pomodoro.js：番茄钟 ============ */
'use strict';

const Pomo = {
  timer: null,
  state: 'idle',       // idle | working | breaking | paused
  remain: 0,           // 剩余秒
  total: 0,            // 当前阶段总秒
  workMin: 25,
  breakMin: 5,

  init(){
    const st = getSettings();
    this.workMin = st.pomoWork; this.breakMin = st.pomoBreak;
    this.remain = this.workMin * 60;
    this.total = this.remain;
    this.renderRing();
  },

  setMode(mode){
    clearInterval(this.timer); this.timer = null;
    this.state = 'idle';
    if(mode === 'break'){ this.remain = this.breakMin * 60; }
    else { this.remain = this.workMin * 60; }
    this.total = this.remain;
    this.renderRing();
    const tabs = document.querySelectorAll('.pomo-tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    this.setRingColor(mode === 'break');
  },

  start(){
    if(this.timer) return;
    if(this.state === 'idle'){
      const active = document.querySelector('.pomo-tab.active');
      this.setMode(active ? active.dataset.mode : 'focus');
      this.state = this.remain === this.total ? 'working' : (this.isBreakMode() ? 'breaking' : 'working');
    } else if(this.state === 'paused'){
      this.state = this.isBreakMode() ? 'breaking' : 'working';
    } else {
      this.state = this.isBreakMode() ? 'breaking' : 'working';
    }
    this.tick();
    this.timer = setInterval(() => this.tick(), 1000);
    this.updateBtn();
  },

  pause(){
    // 只有计时中才能暂停；已暂停时忽略（继续请用 start）
    if(this.timer){ clearInterval(this.timer); this.timer = null; this.state = 'paused'; this.updateBtn(); }
  },

  reset(){
    clearInterval(this.timer); this.timer = null;
    this.state = 'idle';
    const active = document.querySelector('.pomo-tab.active');
    const mode = active ? active.dataset.mode : 'focus';
    this.setMode(mode);
    this.updateBtn();
  },

  isBreakMode(){ return document.querySelector('.pomo-tab.active') && document.querySelector('.pomo-tab.active').dataset.mode === 'break'; },

  tick(){
    if(this.state !== 'working' && this.state !== 'breaking') return;
    this.remain--;
    if(this.remain <= 0){
      this.finish();
      return;
    }
    this.renderRing();
    document.title = this.fmtTime(this.remain) + (this.state==='working' ? ' 专注中 🍅' : ' 休息中 ☕') + ' | 考研工作台';
  },

  finish(){
    clearInterval(this.timer); this.timer = null;
    beep();
    const isWork = !this.isBreakMode();
    // 统计
    const today = $D.today();
    const pomo = Store.get('pomo', { totalSessions:0, totalMin:0, history:{} });
    if(isWork){
      pomo.totalSessions = (pomo.totalSessions||0) + 1;
      pomo.totalMin = (pomo.totalMin||0) + this.workMin;
      if(!pomo.history[today]) pomo.history[today] = { sessions:0, min:0 };
      pomo.history[today].sessions++; pomo.history[today].min += this.workMin;
    }
    Store.set('pomo', pomo);
    const ds = Store.get('dailyStats', {});
    if(!ds[today]) ds[today] = { total:0, done:0, focus:0, vocab:0 };
    ds[today].focus = (ds[today].focus||0) + this.workMin;
    Store.set('dailyStats', ds);
    // 自动切休息/工作
    const active = document.querySelector('.pomo-tab.active');
    const mode = active ? active.dataset.mode : 'focus';
    if(mode === 'focus'){
      this.setMode('break');
      document.querySelectorAll('.pomo-tab').forEach(t => t.classList.toggle('active', t.dataset.mode==='break'));
    } else {
      this.setMode('focus');
      document.querySelectorAll('.pomo-tab').forEach(t => t.classList.toggle('active', t.dataset.mode==='focus'));
    }
    this.state = this.isBreakMode() ? 'breaking' : 'working';
    this.renderRing();
    this.renderStats();
    this.start();
    toast(isWork ? '🍅 专注完成！休息一下吧～' : '☕ 休息结束，开始下一轮专注！');
  },

  renderRing(){
    const el = document.getElementById('ringFg');
    const timeEl = document.getElementById('pomoTime');
    const stateEl = document.getElementById('pomoState');
    if(!el) return;
    const C = 2 * Math.PI * 98;
    const pct = this.total > 0 ? this.remain / this.total : 0;
    el.style.strokeDasharray = C;
    el.style.strokeDashoffset = C * (1 - pct);
    timeEl.textContent = this.fmtTime(this.remain);
    const stateMap = { idle:'准备开始', working:'🍅 专注中', breaking:'☕ 休息中', paused:'⏸ 已暂停' };
    stateEl.textContent = stateMap[this.state] || '';
    const colorMap = { idle:'#5BB8A3', working:'#FF8A5C', breaking:'#6FA8DC', paused:'#B8C7C3' };
    el.style.stroke = colorMap[this.state] || '#5BB8A3';
    this.updateBtn();
    this.renderStats();
  },

  setRingColor(isBreak){ const el = document.getElementById('ringFg'); if(el) el.style.stroke = isBreak ? '#6FA8DC' : '#FF8A5C'; },

  fmtTime(s){
    const m = Math.floor(s/60), ss = s%60;
    return String(m).padStart(2,'0') + ':' + String(ss).padStart(2,'0');
  },

  updateBtn(){
    const s = document.getElementById('pomoStart');
    const p = document.getElementById('pomoPause');
    if(!s || !p) return;
    if(this.state === 'working' || this.state === 'breaking'){
      s.textContent = '⏸ 暂停';
      p.textContent = '⏸ 暂停';
    } else if(this.state === 'paused'){
      s.textContent = '▶ 继续';
      p.textContent = '▶ 继续';
    } else {
      s.textContent = '▶ 开始';
      p.textContent = '⏸ 暂停';
    }
  },

  renderStats(){
    const pomo = Store.get('pomo', { totalSessions:0, history:{} });
    const ds = Store.get('dailyStats', {});
    const today = $D.today();
    const todayS = (pomo.history && pomo.history[today]) ? pomo.history[today].sessions : 0;
    const todayMin = (ds[today] && ds[today].focus) || 0;
    const e1 = document.getElementById('pomoToday'); if(e1) e1.textContent = todayS;
    const e2 = document.getElementById('pomoTodayMin'); if(e2) e2.textContent = todayMin;
    const e3 = document.getElementById('pomoTotal'); if(e3) e3.textContent = pomo.totalSessions||0;
  }
};

/* 提示音（WebAudio 本地生成，无需音频文件） */
function beep(){
  try{
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    [880, 660].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = f;
      g.gain.setValueAtTime(0.18, ctx.currentTime + i*0.28);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i*0.28 + 0.22);
      o.start(ctx.currentTime + i*0.28);
      o.stop(ctx.currentTime + i*0.28 + 0.24);
    });
  }catch(e){}
}

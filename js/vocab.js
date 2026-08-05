/* ============ vocab.js：背单词模块（高频优先 + 遗忘曲线复习） ============ */
'use strict';

/* 合并四个词库文件（按考频从高到低排列） */
window.VOCAB = [].concat(window.VOCAB1||[], window.VOCAB2||[], window.VOCAB3||[], window.VOCAB4||[]);

/* 词频分级（按词库位置，越靠前越高频） */
function wordFreqBand(idx){
  const total = window.VOCAB.length;
  if(idx < 150) return { name:'🔥高频', cls:'tag-vocab' };
  if(idx < 300) return { name:'⭐次高频', cls:'tag-vocab' };
  if(idx < 450) return { name:'📘中频', cls:'tag-custom' };
  return { name:'📗低频', cls:'tag-politics' };
}

const Vocab = {
  state(){ return Store.get('vocab', { pos:0, learned:{}, wrong:[], lastDate:null }); },
  save(s){ Store.set('vocab', s); },

  /* 生成今日学习列表：错词优先 → 到期复习词 → 新词 */
  todayList(){
    const st = getSettings();
    const s = this.state();
    const today = $D.today();
    const learnMap = s.learned || {};

    // 新词（从游标往后取未学过的，词库按高频排列 → 高频词优先）
    const newWords = [];
    let i = s.pos || 0;
    let guard = 0;
    while(newWords.length < (st.vocabPerDay||20) && i < window.VOCAB.length && guard < window.VOCAB.length){
      const w = window.VOCAB[i];
      if(!learnMap[w.v]) newWords.push(w);
      i++; guard++;
    }
    s.pos = i;

    // 错词（没记住的，今天优先复习）
    const wrongWords = (s.wrong||[])
      .map(v => window.VOCAB.find(w => w.v === v))
      .filter(w => w && learnMap[w.v]);

    // 到期复习词（遗忘曲线：学习后第1/2/4/7/15天）
    const reviewWords = [];
    Object.keys(learnMap).forEach(v => {
      const l = learnMap[v];
      (l.reviews||[]).forEach(r => {
        if(r.due === today && !r.done) reviewWords.push(window.VOCAB.find(w => w.v === v));
      });
    });
    const rw = reviewWords.filter(w => w && !wrongWords.includes(w));
    this.save(s);
    return { newWords, reviewWords: rw, wrongWords };
  },

  /* 学新词后标记 */
  markNew(word, known){
    const s = this.state(); const today = $D.today();
    const v = word.v;
    if(!s.learned[v]){
      s.learned[v] = { date:today, reviews: REVIEW_GAP.map(g => ({ due:$D.add(today,g), done:false })), mastered:false };
    }
    this.applyResult(s, v, known);
    this.save(s);
    this.bumpDailyVocab();
  },

  /* 复习词后标记 */
  markReview(word, known){
    const s = this.state(); const today = $D.today();
    const v = word.v;
    const l = s.learned[v];
    if(l){
      const r = (l.reviews||[]).find(x => x.due === today && !x.done);
      if(r) r.done = true;
      if((l.reviews||[]).every(x => x.done)) l.mastered = true;
    }
    this.applyResult(s, v, known);
    this.save(s);
    this.bumpDailyVocab();
  },

  applyResult(s, v, known){
    if(known){
      s.wrong = (s.wrong||[]).filter(x => x !== v);
    } else {
      if(!(s.wrong||[]).includes(v)) s.wrong.push(v);
    }
  },

  bumpDailyVocab(){
    const today = $D.today();
    const ds = Store.get('dailyStats', {});
    if(!ds[today]) ds[today] = { total:0, done:0, focus:0, vocab:0 };
    ds[today].vocab = (ds[today].vocab||0) + 1;
    Store.set('dailyStats', ds);
  },

  stats(){
    const s = this.state();
    const vals = Object.values(s.learned||{});
    return {
      learned: vals.length,
      mastered: vals.filter(l => l.mastered).length,
      wrong: (s.wrong||[]).length,
      total: window.VOCAB.length
    };
  }
};

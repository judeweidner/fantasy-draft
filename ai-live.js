(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const pct=v=>Math.round(clamp(v,0,1)*100);
  const rankedAvail=()=>avail().filter(p=>Number.isFinite(p.fp));
  const quality=p=>Number.isFinite(p.fp)?p.fp:baseRank(p);

  function targetUserPick(){
    const current=S.picks.length+1;
    if(teamForPick(current)===S.my){
      for(let n=current+1;n<current+40;n++) if(teamForPick(n)===S.my) return n;
      return null;
    }
    return nextMine();
  }
  function snipeRisk(p){
    try{
      const current=S.picks.length+1,target=targetUserPick();
      if(!target||target<=current)return 0;
      let survive=1;
      const start=teamForPick(current)===S.my?current+1:current;
      for(let n=start;n<target;n++){
        const team=teamForPick(n);if(team===S.my)continue;
        survive*=1-singleTeamDraftProb(team,p,n);
      }
      return 1-survive;
    }catch(e){return 0}
  }
  function tierGap(p){
    const same=rankedAvail().filter(x=>x.pos===p.pos).sort((a,b)=>quality(a)-quality(b));
    const i=same.findIndex(x=>x.name===p.name),next=i>=0?same[i+1]:null;
    return {next,gap:next?Math.max(0,quality(next)-quality(p)):0};
  }
  function need(p){return typeof positionNeedPercent==='function'?positionNeedPercent(p.pos):teamNeedScore(S.my,p)}
  function adjustedADP(p){return typeof roomAdjustedADP==='function'?roomAdjustedADP(p):market(p)}
  function urgency(p){
    const risk=snipeRisk(p),tg=tierGap(p),n=need(p),current=S.picks.length+1,fall=current-adjustedADP(p);
    return clamp(Math.round(risk*42+Math.min(24,tg.gap*3)+n*.22+Math.max(0,Math.min(14,fall*.45))),0,100);
  }
  function reasons(p){
    const out=[],n=Math.round(need(p)),risk=pct(snipeRisk(p)),tg=tierGap(p),current=S.picks.length+1,radp=Math.round(adjustedADP(p)),fall=current-radp;
    if(n>=80)out.push(`${p.pos} is a major roster need (${n}%)`);else if(n>=60)out.push(`${p.pos} is a strong roster need (${n}%)`);
    if(fall>=8)out.push(`${Math.round(fall)} picks past room-adjusted ADP`);else if(fall<=-10)out.push(`${Math.abs(Math.round(fall))} picks ahead of room cost`);
    if(tg.gap>=6)out.push(`large ${p.pos} tier cliff (${tg.gap.toFixed(1)})`);else if(tg.gap>=3)out.push(`meaningful ${p.pos} tier drop behind him`);
    if(risk>=70)out.push(`${risk}% estimated chance gone if you wait`);else if(risk>=45)out.push(`${risk}% snipe risk before your next pick`);
    if(p.newsTag)out.push(`${p.newsTag.toLowerCase()} news flag`);
    if(!out.length)out.push('strong best-player-available value');
    return out.slice(0,3);
  }
  function verdict(p){const u=urgency(p);return u>=80?'TAKE NOW':u>=64?'LEAN TAKE':u>=45?'WATCH':'BEST VALUE'}
  function topRecommendations(){
    return rankedAvail().sort((a,b)=>rec(b)-rec(a)).slice(0,3);
  }
  function recentRun(){
    const recent=S.picks.slice(-8).map(pk=>P.find(p=>p.name===pk.name)).filter(Boolean),counts={QB:0,RB:0,WR:0,TE:0,K:0,DST:0};
    recent.forEach(p=>counts[p.pos]=(counts[p.pos]||0)+1);
    return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
  }
  function biggestValue(){
    const current=S.picks.length+1;
    return rankedAvail().map(p=>({p,fall:current-adjustedADP(p)})).sort((a,b)=>b.fall-a.fall)[0]||null;
  }
  function alertLines(){
    const lines=[],current=S.picks.length+1,onClock=teamForPick(current),run=recentRun(),needs=['QB','RB','WR','TE','K','DST'].map(pos=>({pos,n:typeof positionNeedPercent==='function'?positionNeedPercent(pos):0})).sort((a,b)=>b.n-a.n),value=biggestValue();
    if(onClock===S.my)lines.push(`<span class="live-alert hot">YOUR PICK NOW</span> Pick ${current} — ${esc(S.teams[S.my])}`);else lines.push(`<span class="live-alert">Watching</span> ${esc(S.teams[onClock])} is on the clock • your next pick ${nextMine()||'—'}`);
    if(run&&run[1]>=3)lines.push(`<b>${run[0]} run:</b> ${run[1]} of the last ${Math.min(8,S.picks.length)} picks were ${run[0]}s.`);
    if(needs[0]&&needs[0].n>=70)lines.push(`<b>Roster pressure:</b> ${needs[0].pos} is your biggest need at ${Math.round(needs[0].n)}%.`);
    if(value&&value.fall>=8)lines.push(`<b>Market faller:</b> ${esc(value.p.name)} is about ${Math.round(value.fall)} picks past room-adjusted ADP.`);
    return lines;
  }
  function installLiveBoard(){
    const coach=document.getElementById('aiCoach');if(!coach)return null;
    let host=document.getElementById('coachLiveBoard');
    if(!host){
      host=document.createElement('div');host.id='coachLiveBoard';host.className='coach-live-board';
      const auto=document.getElementById('coachAuto');
      if(auto){auto.style.display='none';auto.before(host)}else coach.querySelector('.coach-head')?.after(host);
    }
    return host;
  }
  function renderLiveBoard(){
    const host=installLiveBoard();if(!host)return;
    const picks=topRecommendations(),alerts=alertLines();
    host.innerHTML=`
      <div class="live-section-head"><div><b>Live Recommendations</b><span>Updates automatically with the draft</span></div><span class="live-pulse">AUTO</span></div>
      <div class="live-rec-list">${picks.map((p,i)=>{
        const risk=pct(snipeRisk(p)),u=urgency(p),n=Math.round(need(p)),why=reasons(p),v=verdict(p);
        return `<div class="live-rec ${i===0?'top-pick':''}">
          <div class="live-rec-rank">${i+1}</div><div class="live-rec-main"><div class="live-rec-name">${esc(p.name)} <span class="pos ${p.pos}">${p.pos}</span></div><div class="live-rec-meta">Rec ${Math.round(rec(p))} • Need ${n}% • Snipe ${risk}% • Urgency ${u}</div><div class="live-rec-why">${why.map(x=>`<span>${esc(x)}</span>`).join('')}</div></div><div class="live-verdict">${v}</div>
        </div>`}).join('')}</div>
      <div class="live-alerts">${alerts.map(x=>`<div>${x}</div>`).join('')}</div>
      <div class="live-note">No prompt needed. These recommendations recalculate from rankings, your roster, room-adjusted ADP, tier cliffs, news flags, opponent needs and estimated snipe risk. Bye weeks remain excluded from ranking scores.</div>`;
  }

  let lastFingerprint='';
  function fingerprint(){
    const current=S.picks.length+1,top=rankedAvail().sort((a,b)=>rec(b)-rec(a)).slice(0,5).map(p=>p.name).join('|');
    return [S.picks.length,current,S.my,S.scoring,JSON.stringify(S.starters),top].join('::');
  }
  function tick(){
    if(!document.getElementById('aiCoach'))return;
    const fp=fingerprint();if(fp===lastFingerprint)return;lastFingerprint=fp;renderLiveBoard();
  }
  const boot=setInterval(()=>{if(document.getElementById('aiCoach')){renderLiveBoard();lastFingerprint=fingerprint();clearInterval(boot)}},250);
  setInterval(tick,800);
  window.addEventListener('focus',()=>{lastFingerprint='';tick()});
})();

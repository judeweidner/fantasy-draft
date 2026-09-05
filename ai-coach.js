(() => {
  const COACH_KEY='ffDraftCoach_2026_v1';
  let messages=[];
  try{messages=JSON.parse(localStorage.getItem(COACH_KEY)||'[]')}catch(e){messages=[]}
  const persist=()=>localStorage.setItem(COACH_KEY,JSON.stringify(messages.slice(-30)));
  const pct=v=>Math.round(Math.max(0,Math.min(1,v))*100);
  const quality=p=>Number.isFinite(p.fp)?p.fp:baseRank(p);
  const getAvail=()=>avail().filter(p=>Number.isFinite(p.fp));
  const recentRun=()=>{
    const recent=S.picks.slice(-8).map(pk=>P.find(p=>p.name===pk.name)).filter(Boolean);
    const counts={QB:0,RB:0,WR:0,TE:0,K:0,DST:0};recent.forEach(p=>counts[p.pos]=(counts[p.pos]||0)+1);
    return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
  };
  const nextUserPick=()=>nextMine();
  function goneRisk(p){
    try{
      const current=S.picks.length+1,target=nextUserPick();if(!target||target<=current)return 0;
      let survive=1;
      for(let n=current;n<target;n++){
        const team=teamForPick(n);if(team===S.my)continue;
        survive*=1-singleTeamDraftProb(team,p,n);
      }
      return 1-survive;
    }catch(e){return 0}
  }
  function nextSamePos(p){
    return getAvail().filter(x=>x.pos===p.pos&&x.name!==p.name).sort((a,b)=>quality(a)-quality(b))[0]||null;
  }
  function urgency(p){
    const gone=goneRisk(p),next=nextSamePos(p),gap=next?Math.max(0,quality(next)-quality(p)):0,need=typeof positionNeedPercent==='function'?positionNeedPercent(p.pos):teamNeedScore(S.my,p);
    return Math.max(0,Math.min(100,Math.round(gone*50+Math.min(28,gap*3)+need*.22)));
  }
  function topBoard(n=5,posFilter=null){
    let a=getAvail().filter(p=>!posFilter||p.pos===posFilter);
    a.sort((a,b)=>rec(b)-rec(a));
    return a.slice(0,n);
  }
  function rosterNeeds(){
    return ['QB','RB','WR','TE','K','DST'].map(pos=>({pos,need:typeof positionNeedPercent==='function'?positionNeedPercent(pos):0})).sort((a,b)=>b.need-a.need);
  }
  function teamNeeds(teamIdx){
    return ['QB','RB','WR','TE','K','DST'].map(pos=>({pos,score:teamNeedScore(teamIdx,{pos})})).sort((a,b)=>b.score-a.score);
  }
  function boardSummary(){
    const best=topBoard(3),needs=rosterNeeds(),run=recentRun();
    const urgent=[...getAvail()].sort((a,b)=>urgency(b)-urgency(a)).slice(0,3);
    let out=[];
    if(best[0]) out.push(`<b>Best recommendation:</b> ${esc(best[0].name)} (${best[0].pos})`);
    if(urgent[0]) out.push(`<b>Highest urgency:</b> ${esc(urgent[0].name)} — ${urgency(urgent[0])}/100, ${pct(goneRisk(urgent[0]))}% chance gone before your next pick`);
    out.push(`<b>Biggest need:</b> ${needs[0].pos} ${needs[0].need}%`);
    if(run&&run[1]>=3) out.push(`<b>Draft run:</b> ${run[1]} ${run[0]}s in the last ${Math.min(8,S.picks.length)} picks`);
    return out.join('<br>');
  }
  function explainPlayer(p){
    if(!p)return 'I could not find that available player.';
    const need=typeof positionNeedPercent==='function'?positionNeedPercent(p.pos):0, risk=pct(goneRisk(p)), u=urgency(p), radp=typeof roomAdjustedADP==='function'?Math.round(roomAdjustedADP(p)):Math.round(market(p)), next=nextSamePos(p), gap=next?Math.max(0,quality(next)-quality(p)):0;
    return `<b>${esc(p.name)}</b> • ${p.pos} • ${p.team}<br>Recommendation score: <b>${Math.round(rec(p))}</b><br>Your ${p.pos} need: <b>${need}%</b><br>Chance gone before your next pick: <b>${risk}%</b><br>Pick urgency: <b>${u}/100</b><br>Market / room-adjusted cost: <b>${Math.round(market(p))} / ${radp}</b>${next?`<br>Next ${p.pos}: ${esc(next.name)} • tier gap ${gap.toFixed(1)}`:''}${p.newsNote?`<br><span class="coach-warn">${esc(p.newsTag||'NEWS')}: ${esc(p.newsNote)}</span>`:''}`;
  }
  function findPlayerInText(text){
    const t=text.toLowerCase();
    return getAvail().find(p=>t.includes(p.name.toLowerCase()))||getAvail().find(p=>p.name.toLowerCase().split(' ').every(part=>part.length<3||t.includes(part)));
  }
  function answer(raw){
    const text=raw.trim(),q=text.toLowerCase(),found=findPlayerInText(text);
    if(found&&(q.includes('why')||q.includes('wait')||q.includes('take')||q.includes('risk')||q.includes('player')||q===found.name.toLowerCase())) return explainPlayer(found);
    if(q.includes('who should')||q.includes('best pick')||q.includes('recommend')||q.includes('take now')){
      const a=topBoard(5);return `<b>My top five right now:</b><br>${a.map((p,i)=>`${i+1}. ${esc(p.name)} (${p.pos}) — score ${Math.round(rec(p))}, urgency ${urgency(p)}/100`).join('<br>')}`;
    }
    const posMatch=['QB','RB','WR','TE','K','DST'].find(p=>new RegExp(`\\b${p.toLowerCase()}\\b`).test(q));
    if(posMatch&&(q.includes('best')||q.includes('need')||q.includes('take')||q.includes('available'))){
      const a=topBoard(5,posMatch);return `<b>Best ${posMatch}s available:</b><br>${a.map((p,i)=>`${i+1}. ${esc(p.name)} — score ${Math.round(rec(p))}, urgency ${urgency(p)}/100`).join('<br>')}`;
    }
    if(q.includes('need')||q.includes('weakness')||q.includes('roster')){
      const n=rosterNeeds();return `<b>Your positional needs:</b><br>${n.map(x=>`${x.pos}: ${x.need}%`).join(' • ')}<br><br>Your biggest current need is <b>${n[0].pos}</b>.`;
    }
    if(q.includes('run')){
      const r=recentRun();return r&&r[1]>=2?`The strongest recent run is <b>${r[0]}</b>: ${r[1]} taken in the last ${Math.min(8,S.picks.length)} picks.`:'There is no strong position run in the last eight picks.';
    }
    if(q.includes('wait')){
      const a=[...getAvail()].sort((a,b)=>urgency(b)-urgency(a)).slice(0,5);return `<b>Players I would be most careful waiting on:</b><br>${a.map(p=>`${esc(p.name)} — urgency ${urgency(p)}/100, ${pct(goneRisk(p))}% chance gone`).join('<br>')}`;
    }
    const teamIdx=S.teams.findIndex(n=>q.includes(String(n).toLowerCase()));
    if(teamIdx>=0){const n=teamNeeds(teamIdx);return `<b>${esc(S.teams[teamIdx])}</b> currently profiles as needing: ${n.slice(0,3).map(x=>`${x.pos} (${Math.round(x.score)}/100)`).join(', ')}.`}
    if(q.includes('bye')) return 'Bye weeks are intentionally kept out of Recommendation. Use the Strategy Lab → Bye Week Simulator to preview roster congestion without changing player rankings.';
    return boardSummary();
  }
  function addMessage(role,html,saveIt=true){
    messages.push({role,html,ts:Date.now()});if(saveIt)persist();renderMessages();
  }
  function renderMessages(){
    const box=document.getElementById('coachMessages');if(!box)return;
    box.innerHTML=messages.slice(-16).map(m=>`<div class="coach-msg ${m.role}"><div class="coach-label">${m.role==='user'?'You':'Draft Coach'}</div><div>${m.html}</div></div>`).join('');
    box.scrollTop=box.scrollHeight;
  }
  function install(){
    const side=document.querySelector('#assistant .side');if(!side||document.getElementById('aiCoach'))return;
    const card=document.createElement('div');card.className='card ai-coach';card.id='aiCoach';
    card.innerHTML=`<div class="ch coach-head"><div><h3>AI Draft Coach</h3><div class="meta">Live board analysis</div></div><span class="coach-live">LIVE</span></div><div class="coach-auto" id="coachAuto"></div><div class="coach-chips"><button data-q="Who should I take?">Best pick</button><button data-q="Who can I not wait on?">Can’t wait</button><button data-q="What do I need?">My needs</button><button data-q="Is there a run?">Position run</button></div><div class="coach-messages" id="coachMessages"></div><form class="coach-form" id="coachForm"><input id="coachInput" placeholder="Ask about a player, team or pick…" autocomplete="off"><button class="btn primary" type="submit">Ask</button></form><div class="coach-foot">Uses your live rankings, room behavior, roster needs and snipe-risk model. No bye-week penalty is added to rankings.</div>`;
    side.prepend(card);
    card.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{const q=b.dataset.q;addMessage('user',esc(q));addMessage('coach',answer(q));});
    document.getElementById('coachForm').onsubmit=e=>{e.preventDefault();const inp=document.getElementById('coachInput'),q=inp.value.trim();if(!q)return;addMessage('user',esc(q));addMessage('coach',answer(q));inp.value='';};
    if(!messages.length)messages=[{role:'coach',html:'I’m watching the board. I’ll update as picks come off and can explain who to take, who may not make it back, position runs, roster needs, and opponent tendencies.',ts:Date.now()}];
    renderMessages();refreshAuto();
  }
  let lastPickCount=-1;
  function refreshAuto(){
    const host=document.getElementById('coachAuto');if(!host)return;
    host.innerHTML=`<div class="coach-auto-title">Right now</div>${boardSummary()}`;
    if(lastPickCount>=0&&S.picks.length!==lastPickCount&&S.picks.length>0){
      const pk=S.picks[S.picks.length-1],p=P.find(x=>x.name===pk.name),best=topBoard(1)[0];
      const msg=`<b>${esc(S.teams[pk.team])}</b> took <b>${esc(pk.name)}</b>${p?` (${p.pos})`:''}. ${best?`Your current top recommendation is <b>${esc(best.name)}</b>.`:''}`;
      messages.push({role:'coach',html:msg,ts:Date.now()});persist();renderMessages();
    }
    lastPickCount=S.picks.length;
  }
  install();
  const oldRender=window.render;
  if(typeof oldRender==='function'){
    window.render=function(){oldRender();install();refreshAuto();};
  }
  const timer=setInterval(()=>{if(document.getElementById('aiCoach'))refreshAuto();else install()},5000);
  window.addEventListener('beforeunload',()=>clearInterval(timer));
})();

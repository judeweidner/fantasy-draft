(() => {
  const POSITIONS=['QB','RB','WR','TE','K','DST'];
  const SKILL=['QB','RB','WR','TE'];
  const BYE_WEEK={CAR:5,KC:5,CIN:6,DET:6,MIA:6,MIN:6,BUF:7,JAC:7,LAC:7,WAS:7,HOU:8,NO:8,NYG:8,SF:8,PIT:9,TEN:9,CHI:10,DEN:10,PHI:10,TB:10,ATL:11,CLE:11,GB:11,LAR:11,NE:11,SEA:11,BAL:13,IND:13,LV:13,NYJ:13,ARI:14,DAL:14};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const ordinal=n=>`${n}${n%10===1&&n%100!==11?'st':n%10===2&&n%100!==12?'nd':n%10===3&&n%100!==13?'rd':'th'}`;

  function strategyQuality(p){
    if(!Number.isFinite(p.fp))return baseRank(p);
    if(Number.isFinite(p.espn))return p.fp*.7+p.espn*.3;
    return p.fp;
  }
  function playerValue(p){return 100*Math.exp(-Math.max(1,strategyQuality(p))/95)}

  function learningSnapshot(){
    const byPos=Object.fromEntries(POSITIONS.map(p=>[p,[]])),valid=[];
    S.picks.forEach(pk=>{
      const p=P.find(x=>x.name===pk.name);
      if(!p||!Number.isFinite(p.fp))return;
      const m=market(p);if(!Number.isFinite(m)||m>500)return;
      const row={...pk,pos:p.pos,diff:pk.pick-m,market:m};
      valid.push(row);if(byPos[p.pos])byPos[p.pos].push(row);
    });
    const position={};
    POSITIONS.forEach(pos=>{
      const rows=byPos[pos],n=rows.length,avg=n?rows.reduce((a,x)=>a+x.diff,0)/n:0,reliability=Math.min(1,n/6);
      position[pos]={n,raw:avg,offset:clamp(avg*reliability,-18,18),reliability};
    });
    const leagueCounts=Object.fromEntries(POSITIONS.map(p=>[p,0]));
    valid.forEach(x=>leagueCounts[x.pos]=(leagueCounts[x.pos]||0)+1);
    const leagueTotal=Math.max(1,valid.length);
    const teams=S.teams.map((name,team)=>{
      const rows=valid.filter(x=>x.team===team),counts=Object.fromEntries(POSITIONS.map(p=>[p,0]));
      rows.forEach(x=>counts[x.pos]=(counts[x.pos]||0)+1);
      const total=Math.max(1,rows.length),reliability=Math.min(1,rows.length/5),bias={};
      POSITIONS.forEach(pos=>{
        const teamShare=counts[pos]/total,leagueShare=(leagueCounts[pos]||0)/leagueTotal;
        bias[pos]=clamp((teamShare-leagueShare)*100*reliability,-28,28);
      });
      return{team,name,n:rows.length,bias,counts};
    });
    return{valid,position,teams};
  }

  function roomAdjustedADP(p){
    const m=market(p);if(!Number.isFinite(m))return m;
    const snap=learningSnapshot();return Math.max(1,m+(snap.position[p.pos]?.offset||0));
  }
  window.roomAdjustedADP=roomAdjustedADP;
  function teamBias(teamIdx,pos){return learningSnapshot().teams[teamIdx]?.bias[pos]||0}

  singleTeamDraftProb=function(teamIdx,p,currentPick){
    const need=teamNeedScore(teamIdx,p),mr=roomAdjustedADP(p),fall=Math.max(0,currentPick-mr);
    let value=mr<=currentPick+6?18:mr<=currentPick+18?10:mr<=currentPick+35?3:-8;
    value+=Math.min(15,fall*.45)+recentRunBonus(p.pos);if(!Number.isFinite(p.fp))value-=10;
    const raw=-4.5+need*.045+value*.06+teamBias(teamIdx,p.pos)*.018;
    return clamp(1/(1+Math.exp(-raw)),.01,.76);
  };

  function nextUserTargetPick(){
    const current=S.picks.length+1;
    if(teamForPick(current)===S.my)return nextPickForTeam(S.my,current);
    return nextMine();
  }
  function goneBeforeUserPick(p){
    const current=S.picks.length+1,target=nextUserTargetPick();if(!target||target<=current)return 0;
    let survive=1;
    for(let n=current;n<target;n++){
      const team=teamForPick(n);if(team===S.my)continue;
      survive*=1-singleTeamDraftProb(team,p,n);
    }
    return 1-survive;
  }
  function tierMetrics(p){
    const same=avail().filter(x=>x.pos===p.pos&&Number.isFinite(x.fp)).sort((a,b)=>strategyQuality(a)-strategyQuality(b));
    const i=same.findIndex(x=>x.name===p.name),next=i>=0?same[i+1]:null,gap=next?Math.max(0,strategyQuality(next)-strategyQuality(p)):0;
    const gone=goneBeforeUserPick(p),regret=gone*gap,need=typeof positionNeedPercent==='function'?positionNeedPercent(p.pos):teamNeedScore(S.my,p);
    const urgency=clamp(Math.round(gone*52+Math.min(28,gap*3.2)+need*.2),0,100);
    return{next,gap,gone,regret,need,urgency};
  }

  function positionProfileLabel(stat){
    if(!stat.n)return'No sample';const x=stat.offset;
    if(x<=-2)return`${Math.abs(x).toFixed(1)} picks early`;
    if(x>=2)return`${x.toFixed(1)} picks late`;
    return'Near market';
  }

  function positionStrength(teamIdx,pos){
    const r=roster(teamIdx).filter(p=>p.pos===pos).sort((a,b)=>strategyQuality(a)-strategyQuality(b));
    const base={QB:S.starters.QB,RB:S.starters.RB,WR:S.starters.WR,TE:S.starters.TE}[pos]||0;
    return r.reduce((score,p,i)=>score+playerValue(p)*(i<base?1:.28),0);
  }
  function depthStrength(teamIdx){
    const r=roster(teamIdx).filter(p=>SKILL.includes(p.pos)).sort((a,b)=>strategyQuality(a)-strategyQuality(b));
    const starterCount=S.starters.QB+S.starters.RB+S.starters.WR+S.starters.TE+S.starters.FLEX;
    return r.slice(starterCount).reduce((a,p)=>a+playerValue(p),0);
  }
  function allStrengths(){
    return S.teams.map((name,team)=>{
      const s={team,name};SKILL.forEach(pos=>s[pos]=positionStrength(team,pos));s.Depth=depthStrength(team);
      s.Overall=s.QB*.14+s.RB*.29+s.WR*.32+s.TE*.15+s.Depth*.10;return s;
    });
  }
  function rankOf(team,key,all){return[...all].sort((a,b)=>b[key]-a[key]).findIndex(x=>x.team===team)+1}
  function byeWeek(p){return BYE_WEEK[p?.team]||null}
  window.byeWeekForPlayer=byeWeek;

  function installStrategyUI(){
    if($('strategy'))return;
    const tabs=document.querySelector('.tabs'),lateBtn=[...tabs.querySelectorAll('.tab')].find(b=>b.dataset.tab==='late'),btn=document.createElement('button');
    btn.className='tab';btn.dataset.tab='strategy';btn.textContent='Strategy Lab';lateBtn?lateBtn.after(btn):tabs.appendChild(btn);
    const sec=document.createElement('section');sec.id='strategy';sec.className='hidden';
    sec.innerHTML=`<div class="strategy-grid">
      <div class="card strategy-main"><div class="ch strategy-head"><div><h2>Decision Board</h2><div class="meta">Tier cliffs, expected regret and room-adjusted draft behavior</div></div><div class="strategy-kpi" id="strategyNextPick"></div></div><div class="controls strategy-controls"><input id="strategySearch" placeholder="Search player or NFL team"><select id="strategyPos"><option value="ALL">All positions</option>${POSITIONS.map(p=>`<option value="${p}">${p}</option>`).join('')}</select><select id="strategySort"><option value="urgency">Pick urgency</option><option value="regret">Expected regret</option><option value="gone">Chance gone</option><option value="room">Room-adjusted ADP</option></select></div><div class="wrap strategy-table-wrap"><table class="strategy-table"><thead><tr><th>Player</th><th>Need</th><th>Tier cliff</th><th>Chance gone</th><th>Expected regret</th><th>Market</th><th>Room ADP</th><th>Verdict</th></tr></thead><tbody id="strategyRows"></tbody></table></div></div>
      <div class="strategy-side"><div class="card"><div class="ch"><h3>Draft-Room Learning</h3><span class="meta" id="roomSample"></span></div><div class="strategy-pad" id="roomTendencies"></div></div><div class="card"><div class="ch"><h3>Your Roster Strength</h3><span class="meta" id="strengthOverall"></span></div><div class="strategy-pad" id="strengthPanel"></div></div></div>
      <div class="card bye-card"><div class="ch"><div><h2>Bye Week Simulator</h2><div class="meta">Planning aid only — bye weeks do not change recommendation rankings.</div></div><select id="byeCandidate"><option value="">Current roster only</option></select></div><div class="bye-summary" id="byeSummary"></div><div class="bye-grid" id="byeGrid"></div></div>
      <div class="card league-strength-card"><div class="ch"><h2>League Roster Projection</h2><span class="meta">Relative strength from players drafted so far</span></div><div class="league-strength" id="leagueStrength"></div></div>
    </div>`;
    document.querySelector('.app').appendChild(sec);
    $('strategySearch').addEventListener('input',renderStrategy);['strategyPos','strategySort','byeCandidate'].forEach(id=>$(id).addEventListener('change',renderStrategy));
    document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{
      document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));
      ['assistant','late','strategy','board','teams','settings'].forEach(id=>{const el=$(id);if(el)el.classList.toggle('hidden',id!==b.dataset.tab)});
      if(b.dataset.tab==='strategy')renderStrategy();
    });
    const explainer=document.querySelector('#late .side .card:last-child .meta');
    if(explainer)explainer.textContent='Chance-gone estimates now learn from this draft room: positional need, roster depth, room-adjusted ADP, team tendencies, how far a player has fallen and recent position runs all influence the estimate.';
  }

  function renderDecisionBoard(){
    if(!$('strategyRows'))return;
    const q=$('strategySearch').value.toLowerCase(),filter=$('strategyPos').value,sort=$('strategySort').value;
    let rows=avail().filter(p=>Number.isFinite(p.fp)&&(filter==='ALL'||p.pos===filter)&&(!q||p.name.toLowerCase().includes(q)||String(p.team).toLowerCase().includes(q)));
    const metrics=new Map(rows.map(p=>[p.name,tierMetrics(p)]));
    rows.sort((a,b)=>{const A=metrics.get(a.name),B=metrics.get(b.name);if(sort==='regret')return B.regret-A.regret||strategyQuality(a)-strategyQuality(b);if(sort==='gone')return B.gone-A.gone||strategyQuality(a)-strategyQuality(b);if(sort==='room')return roomAdjustedADP(a)-roomAdjustedADP(b);return B.urgency-A.urgency||strategyQuality(a)-strategyQuality(b)});
    $('strategyNextPick').innerHTML=`Your target pick <b>${nextUserTargetPick()||'—'}</b>`;
    $('strategyRows').innerHTML=rows.map(p=>{
      const m=metrics.get(p.name),pct=Math.round(m.gone*100),gap=m.gap,verdict=m.urgency>=80?'TAKE NOW':m.urgency>=63?'LEAN TAKE':m.urgency>=45?'WATCH':'CAN WAIT',cls=m.urgency>=80?'verdict-take':m.urgency>=63?'verdict-lean':m.urgency>=45?'verdict-watch':'verdict-wait',cliff=gap>=8?'Major cliff':gap>=4?'Tier drop':gap>=2?'Small drop':'Flat tier';
      return`<tr><td><div class="playerline"><div><div class="name">${esc(p.name)}</div><div class="meta">${p.pos} • ${p.team} • quality ${strategyQuality(p).toFixed(1)}</div></div><button class="btn primary draft-inline" onclick="draftIndex(${P.indexOf(p)})">Draft</button></div></td><td><b>${Math.round(m.need)}%</b></td><td><b>${gap.toFixed(1)}</b><div class="meta">${cliff}${m.next?` → ${esc(m.next.name)}`:''}</div></td><td><b>${pct}%</b></td><td><b>${m.regret.toFixed(1)}</b><div class="meta">rank pts</div></td><td>${Math.round(market(p))}</td><td><b>${Math.round(roomAdjustedADP(p))}</b></td><td><span class="verdict ${cls}">${verdict}</span><div class="meta">urgency ${m.urgency}/100</div></td></tr>`;
    }).join('');
  }

  function renderRoomLearning(){
    if(!$('roomTendencies'))return;const snap=learningSnapshot();$('roomSample').textContent=`${snap.valid.length} market-comparable picks`;
    const posCards=SKILL.map(pos=>{const st=snap.position[pos],cls=st.offset<=-2?'early':st.offset>=2?'late':'neutral';return`<div class="room-pos"><span class="pos ${pos}">${pos}</span><b>${positionProfileLabel(st)}</b><small>${st.n} sample${st.n===1?'':'s'}</small><i class="${cls}" style="--room:${Math.min(100,Math.abs(st.offset)*5)}%"></i></div>`}).join('');
    const learned=snap.teams.filter(t=>t.n>=2).map(t=>{const best=SKILL.map(pos=>({pos,b:t.bias[pos]})).sort((a,b)=>Math.abs(b.b)-Math.abs(a.b))[0];if(!best||Math.abs(best.b)<6)return`<div class="team-learn"><b>${esc(t.name)}</b><span>Balanced so far</span><small>${t.n} picks learned</small></div>`;return`<div class="team-learn"><b>${esc(t.name)}</b><span>${best.b>0?'Leans':'Avoids'} ${best.pos}</span><small>${t.n} picks learned</small></div>`}).slice(0,8).join('');
    $('roomTendencies').innerHTML=`<div class="room-pos-grid">${posCards}</div><div class="room-help">Negative room movement means that position is being taken earlier than public market cost. Small samples are automatically shrunk toward market.</div><div class="team-learning-list">${learned||'<span class="meta">Team-specific tendencies appear after managers have made a few picks.</span>'}</div>`;
  }

  function renderStrength(){
    if(!$('strengthPanel'))return;const all=allStrengths(),keys=['QB','RB','WR','TE','Depth'],ranks=Object.fromEntries(keys.map(k=>[k,rankOf(S.my,k,all)])),overall=rankOf(S.my,'Overall',all),weakness=[...keys].sort((a,b)=>ranks[b]-ranks[a])[0];
    $('strengthOverall').textContent=`${ordinal(overall)} of ${S.teams.length}`;
    $('strengthPanel').innerHTML=`<div class="strength-grid">${keys.map(k=>{const rank=ranks[k],pct=Math.round((S.teams.length-rank+1)/S.teams.length*100);return`<div class="strength-item"><span>${k}</span><b>${ordinal(rank)}</b><i><em style="width:${pct}%"></em></i></div>`}).join('')}</div><div class="strength-callout"><span>Biggest relative weakness</span><b>${weakness}</b><small>${ordinal(ranks[weakness])} in the league right now</small></div>`;
    const sorted=[...all].sort((a,b)=>b.Overall-a.Overall);$('leagueStrength').innerHTML=sorted.map((x,i)=>`<div class="league-row ${x.team===S.my?'mine':''}"><span class="league-rank">${i+1}</span><b>${esc(x.name)}</b><span>QB ${ordinal(rankOf(x.team,'QB',all))}</span><span>RB ${ordinal(rankOf(x.team,'RB',all))}</span><span>WR ${ordinal(rankOf(x.team,'WR',all))}</span><span>TE ${ordinal(rankOf(x.team,'TE',all))}</span><span>Depth ${ordinal(rankOf(x.team,'Depth',all))}</span></div>`).join('');
  }

  function renderBye(){
    if(!$('byeGrid'))return;const select=$('byeCandidate'),prior=select.value,available=avail().filter(p=>Number.isFinite(p.fp)&&byeWeek(p)).sort((a,b)=>strategyQuality(a)-strategyQuality(b));
    select.innerHTML='<option value="">Current roster only</option>'+available.map(p=>`<option value="${esc(p.name)}">${esc(p.name)} — ${p.pos}, ${p.team}, Week ${byeWeek(p)}</option>`).join('');if(available.some(p=>p.name===prior))select.value=prior;
    const candidate=available.find(p=>p.name===select.value)||null,sl=slots(),starterMap=new Map();sl.forEach(([label,p])=>{if(p&&!starterMap.has(p.name))starterMap.set(p.name,label!=='BENCH')});
    const rosterPlayers=mine(),weeks=[5,6,7,8,9,10,11,13,14];
    $('byeGrid').innerHTML=weeks.map(w=>{const current=rosterPlayers.filter(p=>byeWeek(p)===w),adding=candidate&&byeWeek(candidate)===w,total=current.length+(adding?1:0),starterCount=current.filter(p=>starterMap.get(p.name)).length,posCounts={};current.forEach(p=>posCounts[p.pos]=(posCounts[p.pos]||0)+1);if(adding)posCounts[candidate.pos]=(posCounts[candidate.pos]||0)+1;const samePos=Math.max(0,...Object.values(posCounts)),severity=total>=3||starterCount>=3||samePos>=3?'heavy':total===2||starterCount===2||samePos===2?'watch':total===1?'light':'clear',label={heavy:'Heavy conflict',watch:'Watch',light:'Light',clear:'Clear'}[severity];return`<div class="bye-week ${severity}"><div class="bye-week-head"><b>Week ${w}</b><span>${label}</span></div><div class="bye-count">${total}<small>players off</small></div><div class="bye-names">${current.map(p=>`<span>${esc(p.name)} <small>${p.pos}</small></span>`).join('')}${adding?`<span class="preview">+ ${esc(candidate.name)} <small>${candidate.pos}</small></span>`:''}${!total?'<span class="meta">No roster conflicts</span>':''}</div></div>`}).join('');
    if(candidate){const w=byeWeek(candidate),existing=rosterPlayers.filter(p=>byeWeek(p)===w);$('byeSummary').innerHTML=`<span class="bye-pill">Preview: <b>${esc(candidate.name)}</b></span><span>Bye Week ${w}</span><span>${existing.length} current teammate${existing.length===1?'':'s'} already off that week</span><span class="meta">Informational only — no ranking effect.</span>`}else{const max=Math.max(0,...weeks.map(w=>rosterPlayers.filter(p=>byeWeek(p)===w).length));$('byeSummary').innerHTML=`<span class="bye-pill">Current roster</span><span>Worst bye overlap: <b>${max}</b> player${max===1?'':'s'}</span><span class="meta">Official 2026 NFL byes: Weeks 5–14, with no byes in Week 12.</span>`}
  }

  function renderStrategy(){if(!$('strategy'))return;renderDecisionBoard();renderRoomLearning();renderStrength();renderBye()}
  window.renderStrategy=renderStrategy;
  installStrategyUI();const baseRender=render;render=function(){baseRender();renderStrategy()};renderStrategy();
})();
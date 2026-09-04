(() => {
  const FACTOR_KEY = 'ffDraftFactors_2026_v1';
  const DEFAULT_FACTORS = { risk:true, upside:true, value:true, need:true };
  let factors;
  try { factors = {...DEFAULT_FACTORS, ...JSON.parse(localStorage.getItem(FACTOR_KEY)||'{}')}; }
  catch(e) { factors = {...DEFAULT_FACTORS}; }
  const saveFactors = () => localStorage.setItem(FACTOR_KEY, JSON.stringify(factors));
  const qualityRank = p => {
    if(!Number.isFinite(p.fp)) return baseRank(p);
    const vals = [[p.fp,.55]];
    if(Number.isFinite(p.espn)) vals.push([p.espn,.45]);
    const w = vals.reduce((a,x)=>a+x[1],0);
    const v = vals.reduce((a,x)=>a+x[0]*x[1],0)/w;
    return Math.max(1, v + scoringAdj(p));
  };
  const positionNeedPercent = p => {
    const r = mine(), c = count(r,p), s = S.starters, rd = round(S.picks.length+1);
    if(p==='RB'){
      if(c<s.RB) return Math.max(82,100-c*10);
      const target=s.RB+s.FLEX+2;
      if(c<target) return Math.max(28,72-(c-s.RB)*16);
      return 8;
    }
    if(p==='WR'){
      if(c<s.WR) return Math.max(82,100-c*10);
      const target=s.WR+s.FLEX+3;
      if(c<target) return Math.max(26,74-(c-s.WR)*14);
      return 8;
    }
    if(p==='QB'){
      if(c<s.QB) return rd<=3?55:rd<=6?75:96;
      if(c===s.QB && c<2 && rd>=9) return 22;
      return 5;
    }
    if(p==='TE'){
      if(c<s.TE) return rd<=3?58:rd<=6?76:94;
      if(c===s.TE && c<2 && rd>=10) return 20;
      return 5;
    }
    if(p==='K'){
      if(c<s.K) return rd<10?8:rd<12?38:90;
      return 0;
    }
    if(p==='DST'){
      if(c<s.DST) return rd<9?8:rd<11?42:92;
      return 0;
    }
    return 0;
  };
  window.positionNeedPercent = positionNeedPercent;
  const riskAdjustment = p => {
    const tag = String(p.newsTag||'').toUpperCase();
    const note = String(p.newsNote||'').toLowerCase();
    if(tag==='MAJOR RISK' || note.includes('not eligible to practice or play') || note.includes('exempt list')) return -90;
    if(tag==='INJURY'){
      if(note.includes('multiple months') || note.includes('months')) return -70;
      return -42;
    }
    if(tag==='ROLE DOWN') return -28;
    if(tag==='FALLER') return -16;
    return 0;
  };
  const upsideAdjustment = p => {
    const tag = String(p.newsTag||'').toUpperCase();
    const q = qualityRank(p), rd = round(S.picks.length+1);
    let b = 0;
    if(tag==='RISER') b += 18;
    if(tag==='ROLE UP') b += 17;
    if(tag==='POSITIVE') b += 14;
    if(tag==='MAJOR RISK' || tag==='INJURY'){
      const eliteStash = Math.max(0,100-q)*.18;
      const lateStash = Math.max(0,rd-6)*5;
      b += Math.min(40,eliteStash+lateStash);
    }
    return Math.round(b);
  };
  const valueAdjustment = p => {
    if(!Number.isFinite(p.fp)) return 0;
    const current = S.picks.length+1;
    const diff = current-market(p);
    return Math.round(Math.max(-32,Math.min(42,diff*1.05)));
  };
  const needAdjustment = p => Math.round(Math.max(-36,Math.min(40,(positionNeedPercent(p.pos)-50)*.8)));
  const factorBreakdown = p => ({
    base: 1000-qualityRank(p)*3,
    risk: factors.risk ? riskAdjustment(p) : 0,
    upside: factors.upside ? upsideAdjustment(p) : 0,
    value: factors.value ? valueAdjustment(p) : 0,
    need: factors.need ? needAdjustment(p) : 0
  });
  rec = p => {
    const b = factorBreakdown(p);
    return b.base+b.risk+b.upside+b.value+b.need;
  };
  const factorLabel = p => {
    const b=factorBreakdown(p), parts=[];
    if(factors.risk && b.risk) parts.push(`risk ${b.risk}`);
    if(factors.upside && b.upside) parts.push(`upside +${b.upside}`);
    if(factors.value && b.value) parts.push(`value ${b.value>0?'+':''}${b.value}`);
    if(factors.need && b.need) parts.push(`need ${b.need>0?'+':''}${b.need}`);
    return parts.join(' • ');
  };
  function installFactorUI(){
    const filters = $('filters');
    if(filters && !$('recFactorPanel')){
      const panel=document.createElement('div');
      panel.id='recFactorPanel';
      panel.className='rec-factor-panel';
      panel.innerHTML=`
        <div class="factor-title">
          <div><b>Recommendation Factors</b><span>Uncheck everything for pure player-quality ranking.</span></div>
          <div class="factor-hint">Checked factors change Recommendation only.</div>
        </div>
        <div class="factor-options">
          <label><input type="checkbox" data-factor="risk"> Availability risk</label>
          <label><input type="checkbox" data-factor="upside"> Future / upside</label>
          <label><input type="checkbox" data-factor="value"> Draft-cost value</label>
          <label><input type="checkbox" data-factor="need"> My team need</label>
        </div>
        <div class="position-needs" id="positionNeeds"></div>`;
      filters.parentNode.insertBefore(panel,filters);
      panel.querySelectorAll('[data-factor]').forEach(cb=>{
        cb.checked=!!factors[cb.dataset.factor];
        cb.addEventListener('change',()=>{
          factors[cb.dataset.factor]=cb.checked;
          saveFactors();
          if(typeof render==='function') render();
          else { renderRows(); renderSide(); renderNeedStrip(); }
        });
      });
    }
    const settingsGrid=document.querySelector('#settings .settings');
    if(settingsGrid && !$('draftOrderSetup')){
      const old = $('teamOrder');
      if(old && old.closest('.setting')) old.closest('.setting').style.display='none';
      const setup=document.createElement('div');
      setup.id='draftOrderSetup';
      setup.className='draft-order-setup';
      setup.innerHTML=`
        <div class="draft-order-head">
          <div><b>Draft Order</b><span>Enter each manager in Round 1 order.</span></div>
          <span class="snake-badge">SNAKE DRAFT</span>
        </div>
        <div class="snake-note">Round 1 runs Pick 1 → Pick 12. Round 2 automatically reverses Pick 12 → Pick 1, then continues alternating.</div>
        <div class="draft-order-grid">${Array.from({length:12},(_,i)=>`
          <label><span>Pick ${i+1}</span><input type="text" data-draft-slot="${i}"></label>`).join('')}
        </div>`;
      settingsGrid.parentNode.insertBefore(setup,settingsGrid);
      setup.querySelectorAll('[data-draft-slot]').forEach(inp=>{
        inp.addEventListener('change',()=>{
          const i=+inp.dataset.draftSlot;
          const v=inp.value.trim();
          if(!v){ inp.value=S.teams[i]; return; }
          S.teams[i]=v;
          save();
          render();
        });
      });
    }
  }
  function renderNeedStrip(){
    const host=$('positionNeeds');
    if(host){
      host.innerHTML=['QB','RB','WR','TE','K','DST'].map(p=>{
        const pct=positionNeedPercent(p);
        return `<div class="need-meter ${p}"><span>${p}</span><b>${pct}%</b><small>need</small><i><em style="width:${pct}%"></em></i></div>`;
      }).join('');
    }
    document.querySelectorAll('#filters .filter').forEach(btn=>{
      const p=btn.dataset.p;
      btn.textContent=p==='ALL'?'ALL':`${p} ${positionNeedPercent(p)}%`;
    });
  }
  const baseRenderSettings = renderSettings;
  renderSettings = function(){
    baseRenderSettings();
    installFactorUI();
    const setup=$('draftOrderSetup');
    if(setup) setup.querySelectorAll('[data-draft-slot]').forEach(inp=>{
      inp.value=S.teams[+inp.dataset.draftSlot]||'';
    });
    renderNeedStrip();
  };
  renderRows = function(){
    renderNeedStrip();
    const q=$('search').value.toLowerCase(), nf=$('newsFilter').value, sort=$('sort').value;
    let a=avail().filter(p=>(pos==='ALL'||p.pos===pos)&&(!q||p.name.toLowerCase().includes(q)||p.team.toLowerCase().includes(q))&&(nf!=='news'||p.newsNote));
    a.sort((x,y)=>sort==='fp'?baseRank(x)-baseRank(y):sort==='espn'?(x.espn||baseRank(x))-(y.espn||baseRank(y)):sort==='market'?market(x)-market(y):sort==='composite'?composite(x)-composite(y):rec(y)-rec(x));
    $('availableN').textContent=avail().length;
    $('rows').innerHTML=a.map((p,i)=>{
      const qRank=qualityRank(p), f=factorLabel(p), need=positionNeedPercent(p.pos);
      return `<tr>
        <td><b>${i+1}</b><div class="meta">${Number.isFinite(p.fp)?Math.round(rec(p))+' pts':'deep pool'}</div>${f?`<div class="factor-mini">${esc(f)}</div>`:''}</td>
        <td><div class="playerline"><div class="name">${esc(p.name)}</div><button class="btn primary draft-inline" onclick="draftIndex(${P.indexOf(p)})">Draft</button></div><div class="meta">${p.team}${p.sleeperId?' • Sleeper':''}</div></td>
        <td><span class="pos ${p.pos}">${p.pos}</span><div class="need-pct">${need}% need</div></td>
        <td><b>${Number.isFinite(p.fp)?composite(p).toFixed(1):'Unranked'}</b><div class="meta">quality ${Number.isFinite(p.fp)?qRank.toFixed(1):'—'}</div></td>
        <td>${Number.isFinite(p.fp)?p.fp:'—'}</td><td>${p.espn||'—'}</td><td>${Number.isFinite(p.fp)?market(p):'—'}</td>
        <td>${p.newsNote?`<div class="news"><span class="tag">${esc(p.newsTag)}</span><br>${esc(p.newsNote)}</div>`:(p.sleeperId?'<span class="meta">Sleeper active pool</span>':'<span class="meta">—</span>')}</td>
      </tr>`;
    }).join('');
  };
  renderSide = function(){
    renderNeedStrip();
    const a=avail().sort((x,y)=>rec(y)-rec(x));
    $('recs').innerHTML=a.slice(0,5).map((p,i)=>{
      const f=factorLabel(p);
      return `<div class="recommend"><span class="score">${Math.round(rec(p))}</span><b>#${i+1} ${esc(p.name)}</b><div class="meta">${p.pos} • ${p.team} • need ${positionNeedPercent(p.pos)}% • quality ${qualityRank(p).toFixed(1)}</div>${f?`<div class="factor-mini">${esc(f)}</div>`:''}${p.newsTag?`<div class="meta" style="color:#f2c96f">${esc(p.newsTag)}</div>`:''}</div>`;
    }).join('');
    $('mineName').textContent=S.teams[S.my];
    $('roster').innerHTML=slots().map(([s,p])=>`<div class="slot"><small>${s}</small><b>${p?esc(p.name):'<span class="meta">Empty</span>'}</b>${p?`<div class="meta">${p.pos} • ${p.team}</div>`:''}</div>`).join('');
    const n=nextMine(),best=a[0];
    const active=Object.entries(factors).filter(([,v])=>v).map(([k])=>({risk:'risk',upside:'upside',value:'value',need:'team need'}[k])).join(', ')||'none — pure player quality';
    $('intel').innerHTML=`<div><b>Next pick:</b> ${n}</div><div style="margin-top:6px"><b>Top recommendation:</b> ${best?esc(best.name):'—'}</div><div style="margin-top:7px"><b>Active factors:</b> ${active}</div><div style="margin-top:9px" class="meta">Position need: QB ${positionNeedPercent('QB')}%, RB ${positionNeedPercent('RB')}%, WR ${positionNeedPercent('WR')}%, TE ${positionNeedPercent('TE')}%, K ${positionNeedPercent('K')}%, D/ST ${positionNeedPercent('DST')}%.</div>`;
  };
  const style=document.createElement('style');
  style.textContent=`
    .rec-factor-panel{padding:11px 12px;border-bottom:1px solid var(--line);background:#0b1628}
    .factor-title{display:flex;justify-content:space-between;gap:12px;align-items:end;margin-bottom:8px}.factor-title b{display:block;font-size:13px}.factor-title span,.factor-hint{color:var(--muted);font-size:10px}
    .factor-options{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.factor-options label{display:flex;gap:7px;align-items:center;background:#12223a;border:1px solid #304566;border-radius:8px;padding:7px 9px;cursor:pointer;font-size:11px;font-weight:700}.factor-options input{accent-color:var(--green)}
    .position-needs{display:grid;grid-template-columns:repeat(6,minmax(80px,1fr));gap:7px}.need-meter{background:#101c30;border:1px solid #263a5c;border-radius:8px;padding:7px;position:relative;overflow:hidden}.need-meter span{font-weight:900}.need-meter b{float:right}.need-meter small{display:block;color:var(--muted);font-size:9px;margin-top:2px}.need-meter i{display:block;height:3px;background:#263a5c;border-radius:5px;margin-top:5px;overflow:hidden}.need-meter em{display:block;height:100%;background:currentColor}
    .need-meter.RB{color:#82e4bf}.need-meter.WR{color:#9bbcff}.need-meter.QB{color:#ffa8ae}.need-meter.TE{color:#efd47f}.need-meter.K{color:#cbb2ff}.need-meter.DST{color:#d4deef}.need-pct{font-size:9px;color:var(--muted);margin-top:3px;white-space:nowrap}.factor-mini{font-size:9px;color:#8fb7ee;margin-top:3px;max-width:175px}
    .draft-order-setup{margin:12px;background:#0c1728;border:1px solid var(--line);border-radius:11px;padding:12px}.draft-order-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.draft-order-head b{display:block;font-size:14px}.draft-order-head span:not(.snake-badge){color:var(--muted);font-size:10px}.snake-badge{background:var(--green);color:#07120d;border-radius:7px;padding:5px 8px;font-size:10px;font-weight:900}.snake-note{color:var(--muted);font-size:10px;margin:8px 0 10px}.draft-order-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.draft-order-grid label{font-size:9px;color:var(--muted);font-weight:800}.draft-order-grid input{width:100%;margin-top:3px}
    @media(max-width:900px){.position-needs{grid-template-columns:repeat(3,1fr)}.draft-order-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:520px){.position-needs{grid-template-columns:repeat(2,1fr)}.draft-order-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
  installFactorUI();
})();
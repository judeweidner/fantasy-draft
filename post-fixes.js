(() => {
  // Make ALL mean all visible players, not "all positions while another hidden filter remains active".
  const news = document.getElementById('newsFilter');
  if(news){
    if(news.options[0]) news.options[0].textContent='News: All players';
    if(news.options[1]) news.options[1].textContent='News: Updates only';
  }
  document.querySelectorAll('#filters .filter').forEach(btn => {
    btn.onclick = () => {
      pos = btn.dataset.p;
      if(pos === 'ALL'){
        const search = document.getElementById('search');
        if(search) search.value = '';
        if(news) news.value = 'all';
      }
      document.querySelectorAll('#filters .filter').forEach(x => x.classList.toggle('active', x === btn));
      renderRows();
      renderSide();
    };
  });

  // Add lighter penalties for fresh "monitor" / minor-news states when Availability Risk is enabled.
  const priorRec = rec;
  rec = p => {
    let score = priorRec(p);
    const riskBox = document.querySelector('[data-factor="risk"]');
    if(riskBox && riskBox.checked){
      const tag = String(p.newsTag || '').toUpperCase();
      if(tag === 'MONITOR') score -= 10;
      else if(tag === 'MINOR') score -= 3;
    }
    return score;
  };

  // Show exactly how fresh the automated source snapshot is.
  const header = document.querySelector('#assistant .ch .meta');
  if(header && window.LIVE_FANTASY_UPDATED_AT){
    const d = new Date(window.LIVE_FANTASY_UPDATED_AT);
    const stamp = document.createElement('span');
    stamp.id = 'dataFreshness';
    stamp.textContent = ` • rankings/news refreshed ${d.toLocaleString()}`;
    header.appendChild(stamp);
  }

  render();
})();

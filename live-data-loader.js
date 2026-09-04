(() => {
  const live = window.LIVE_FANTASY_DATA;
  if(!live || !Array.isArray(live.players) || live.players.length < 200) return;

  const fallbackByName = new Map(P.map(p => [String(p.name).toLowerCase(), p]));
  P = live.players.map((x, i) => {
    const fb = fallbackByName.get(String(x.name).toLowerCase()) || {};
    const fp = Number.isFinite(+x.fp) ? +x.fp : null;
    const espn = Number.isFinite(+x.espn) ? +x.espn : null;
    const adp = Number.isFinite(+x.adp) ? +x.adp : null;
    const base = fp || espn || (i + 1);
    return {
      fp,
      name: x.name,
      team: x.team || fb.team || 'FA',
      pos: x.pos || fb.pos,
      marketGap: adp && fp ? adp - fp : 0,
      adp,
      espn,
      fpExpert: Number.isFinite(+x.fpExpert) ? +x.fpExpert : null,
      newsTag: x.newsTag || '',
      newsDelta: Number.isFinite(+x.newsDelta) ? +x.newsDelta : 0,
      newsNote: x.newsNote || '',
      newsHeadline: x.newsHeadline || '',
      injuryStatus: x.injuryStatus || null,
      injuryBodyPart: x.injuryBodyPart || null,
      depthChartOrder: Number.isFinite(+x.depthChartOrder) ? +x.depthChartOrder : null,
      deepRank: base,
      liveRanked: true
    };
  });

  window.LIVE_FANTASY_UPDATED_AT = live.updatedAt || null;
  window.LIVE_FANTASY_RANKED_COUNT = live.rankedCount || P.length;
})();

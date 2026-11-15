/* =========================================================================
   Vues avancées : Earth Explorer, enquête Trend Detective, Global Comparison, About
   (utilise window.UI défini par app.js, STATS, CH, DATA)
   ========================================================================= */
window.VUES = (function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const NOMS_VERDICT = {
    hausse: ["▲ Increasing trend", "badge-up"], baisse: ["▼ Decreasing trend", "badge-down"],
    non_significatif: ["No statistically significant trend detected", "badge-flat"],
    insuffisant: ["Insufficient data", "badge-wait"], inconclusif: ["Inconclusive — the tests disagree", "badge-concept"],
  };
  const fp = (p) => (!Number.isFinite(p) ? "—" : p < 0.001 ? "&lt; 0.001" : p.toFixed(3));
  const verdictBadge = (v) => `<span class="badge ${NOMS_VERDICT[v][1]}">${NOMS_VERDICT[v][0]}</span>`;

  // =================================================================== régions
  /** Régions disponibles pour un jeu : avec cube mensuel -> toutes ; sinon la série fournie. */
  function regionsDisponibles(j) {
    const out = [];
    if (j.cube) {
      out.push({ id: "maroc", nom: "Morocco (inside borders)", type: "masque" });
      out.push({ id: "nord", nom: "North Morocco (≥ 33°N)", type: "zone", f: (la) => la >= 33 });
      out.push({ id: "centre", nom: "Centre (29–33°N)", type: "zone", f: (la) => la >= 29 && la < 33 });
      out.push({ id: "sud", nom: "South (< 29°N)", type: "zone", f: (la) => la < 29 });
      out.push({ id: "fenetre", nom: "Whole map window (land + ocean)", type: "fenetre" });
      out.push({ id: "boite", nom: "Custom box…", type: "boite" });
      out.push({ id: "cellule", nom: "Single grid cell / city…", type: "cellule" });
    } else if (j.type === "serie") {
      out.push({ id: "serie", nom: j.meta.zone === "World" ? "World (team series)" : j.id === "h2o" ? "Morocco box (team series)" : "Morocco (provided series)", type: "serie" });
    }
    if (j.globalSemestres) out.push({ id: "globalsem", nom: j.globalSemestres.zone, type: "globalsem" });
    if (j.globalMensuel) out.push({ id: "global", nom: "Near-global (60°S–60°N)", type: "global" });
    return out;
  }

  /** Série mensuelle d'une région : { mois, valeurs, n_cellules }. */
  function serieRegion(j, r, opts) {
    if (r.type === "global") return { mois: j.globalMensuel.mois, valeurs: j.globalMensuel.valeurs.map((v) => (v === null ? NaN : v)), cellules: "global" };
    if (r.type === "globalsem") {
      const g = j.globalSemestres, plev = j.niveaux[j.niveauDefaut].plev;
      return { semestriel: true, etiq: g.etiq, valeurs: (g.niveaux[String(plev)] || []).map((v) => (v === null ? NaN : v)), cellules: "global" };
    }
    if (r.type === "serie") {
      const n = j.niveaux[j.niveauDefaut];
      // série semestrielle fournie : on la renvoie telle quelle (marquée comme semestrielle)
      return { semestriel: true, etiq: j.etiq, valeurs: n.moyenne, nb: n.nb_mois || j.etiq.map(() => 6), cellules: "—" };
    }
    const c = j.cube, nl = j.lat.length, nc = j.lon.length, m = CH.masque(j, j.niveaux[j.niveauDefaut]);
    const sel = [];
    for (let i = 0; i < nl; i++) for (let k = 0; k < nc; k++) {
      const la = j.lat[i], lo = j.lon[k], idx = i * nc + k;
      let ok = false;
      if (r.type === "masque") ok = m[idx];
      else if (r.type === "zone") ok = m[idx] && r.f(la);
      else if (r.type === "fenetre") ok = true;
      else if (r.type === "boite") ok = la >= opts.la0 && la <= opts.la1 && lo >= opts.lo0 && lo <= opts.lo1;
      if (ok) sel.push([idx, Math.cos(la * Math.PI / 180)]);
    }
    if (r.type === "cellule") {
      let bi = 0, bk = 0;
      j.lat.forEach((la, i) => { if (Math.abs(la - opts.lat) < Math.abs(j.lat[bi] - opts.lat)) bi = i; });
      j.lon.forEach((lo, k) => { if (Math.abs(lo - opts.lon) < Math.abs(j.lon[bk] - opts.lon)) bk = k; });
      sel.push([bi * nc + bk, 1]);
      r.nom = `Cell ${j.lat[bi].toFixed(2)}°N, ${j.lon[bk].toFixed(2)}°E${opts.ville ? " (" + opts.ville + ")" : ""}`;
    }
    const tc = nl * nc, valeurs = [];
    for (let t = 0; t < c.mois.length; t++) {
      let s = 0, w = 0;
      for (const [idx, p] of sel) {
        const v = c.valeurs[t * tc + idx];
        if (v !== null && Number.isFinite(v)) { s += v * (opts.agg === "simple" ? 1 : p); w += opts.agg === "simple" ? 1 : p; }
      }
      // au moins la moitié des cellules sélectionnées valides
      const nvalid = sel.filter(([idx]) => c.valeurs[t * tc + idx] !== null).length;
      valeurs.push(w && nvalid >= Math.max(1, sel.length / 2) ? s / w : NaN);
    }
    return { mois: c.mois, valeurs, cellules: sel.length };
  }

  /** Lance l'analyse d'une région sur une période. */
  function analyserRegion(j, r, opts) {
    const s = serieRegion(j, r, opts);
    let sem, mois = [], valeurs = [];
    if (s.semestriel) {
      const nbm = s.nb || s.etiq.map(() => 6);
      const garde = s.etiq.map((e, i) => e >= opts.debut && e <= opts.fin && nbm[i] >= 6);   // complete semesters only
      const etiq = s.etiq.filter((_, i) => garde[i]), val = s.valeurs.filter((_, i) => garde[i]).map((v) => (v === null ? NaN : v));
      const anom = new Array(etiq.length).fill(NaN), z = anom.slice();
      ["S1", "S2"].forEach((t) => {
        const idx = etiq.map((e, i) => (e.endsWith(t) && Number.isFinite(val[i]) ? i : -1)).filter((i) => i >= 0);
        if (!idx.length) return;
        const mo = idx.reduce((a, i) => a + val[i], 0) / idx.length;
        const sd = Math.sqrt(idx.reduce((a, i) => a + (val[i] - mo) ** 2, 0) / Math.max(1, idx.length - 1));
        idx.forEach((i) => { anom[i] = val[i] - mo; z[i] = anom[i] / sd; });
      });
      sem = { etiq, val, anom, z, nb: etiq.map(() => 6), t: etiq.map((e) => +e.slice(0, 4) + (e.endsWith("S1") ? .25 : .75)) };
    } else {
      s.mois.forEach((m, i) => { const e = semDe(m); if (e >= opts.debut && e <= opts.fin) { mois.push(m); valeurs.push(s.valeurs[i]); } });
      sem = STATS.semestres(mois, valeurs);
    }
    const res = STATS.analyser(sem.t, sem.anom, j.meta.alpha || 0.05);
    const manquants = mois.length ? valeurs.filter((v) => !Number.isFinite(v)).length / mois.length : 0;
    return { nom: r.nom, region: r, sem, res, mois, valeurs, cellules: s.cellules, manquants };
  }

  // semesters 2004-S1 … 2026-S2 (one value every 6 months)
  const SEMESTRES = []; for (let a = 2004; a <= 2026; a++) SEMESTRES.push(`${a}-S1`, `${a}-S2`);
  const semDe = (m) => `${m.slice(0, 4)}-S${+m.slice(5, 7) <= 6 ? 1 : 2}`;
  const optSem = (sel) => SEMESTRES.map((e) => `<option ${e === sel ? "selected" : ""}>${e}</option>`).join("");
  const FIG_SEULES = { aot: "MERRA-2 reanalysis (model-derived)", no2: "Aura OMI", snow: "dataset not stated on the figures" };

  // =================================================================== Trend Detective : formulaire
  function enquete(conteneur, varInitiale) {
    const U = UI, jeux = Object.values(DATA.jeux).filter((j) => j.cube || j.type === "serie");
    if (!jeux.length) { conteneur.innerHTML = U.vide("No dataset ready for investigation", "Investigations need monthly data (cube) or a semester series. Run the notebooks or tools/build_site_data.py."); return; }
    const j0 = jeux.find((j) => j.id === varInitiale) || jeux.find((j) => j.type === "serie") || jeux[0];
    conteneur.innerHTML = `
      <div class="card">
        <div class="section-head"><div><div class="eyebrow">New investigation</div><h2>Select · Analyze · Interpret</h2></div>${U.badge("stat", "Statistical analysis output")}</div>
        <div class="form-grid">
          <label>Environmental variable<select data-e="var">${jeux.map((j) => `<option value="${j.id}" ${j === j0 ? "selected" : ""}>${CH.nomVar(j.id)} — ${U.esc(j.unite)}</option>`).join("")}
            ${Object.keys(FIG_SEULES).filter((id) => !DATA.jeux[id] && (DATA.galerie[id] || []).length).map((id) => `<option value="fig:${id}" ${varInitiale === id ? "selected" : ""}>${CH.nomVar(id)} — team semester figures</option>`).join("")}</select></label>
          <label>From semester<select data-e="debut">${optSem("2004-S1")}</select></label>
          <label>To semester<select data-e="fin">${optSem("2026-S2")}</select></label>
          <label>Spatial aggregation<select data-e="agg"><option value="cos">Area-weighted mean (cos latitude)</option><option value="simple">Simple mean of cells</option></select></label>
        </div>
        <p class="small muted" style="margin:.9rem 0 .4rem">Regions to compare (select one or more):</p>
        <div class="regions" data-e="regions"></div>
        <div class="form-grid hidden" data-e="boite" style="margin-top:.7rem">
          <label>Lat min<input type="number" step="0.5" data-b="la0" value="30"></label><label>Lat max<input type="number" step="0.5" data-b="la1" value="35"></label>
          <label>Lon min<input type="number" step="0.5" data-b="lo0" value="-10"></label><label>Lon max<input type="number" step="0.5" data-b="lo1" value="-5"></label></div>
        <div class="form-grid hidden" data-e="cellule" style="margin-top:.7rem">
          <label>City<select data-c="ville"><option value="">— choose —</option>${(GEO.villes || []).map((v) => `<option value="${v.lat},${v.lon},${U.esc(v.nom)}">${U.esc(v.nom)}</option>`).join("")}</select></label>
          <label>Latitude<input type="number" step="0.1" data-c="lat" value="33.6"></label><label>Longitude<input type="number" step="0.1" data-c="lon" value="-7.6"></label>
          <span class="small muted">A cell is a grid square, not a station: its size is shown in the results.</span></div>
        <div style="margin-top:1rem;display:flex;gap:.6rem;flex-wrap:wrap"><button class="btn btn-primary" data-e="go">Run the investigation</button>
          <span class="small muted" data-e="info"></span></div>
      </div>
      <div data-e="sortie" style="margin-top:1.1rem"></div>`;
    const ctl = (k) => $(`[data-e="${k}"]`, conteneur);
    let choisies = new Set(["maroc", "serie"]);
    function majVariable() {
      if (ctl("var").value.startsWith("fig:")) {
        const id = ctl("var").value.slice(4);
        ctl("regions").innerHTML = `<span class="small muted">Morocco and World figures produced by the team (${U.esc(FIG_SEULES[id])}).</span>`;
        ctl("info").innerHTML = "The team's semester values for this variable exist as figures only: the figures are shown, no number is re-extracted.";
        ctl("boite").classList.add("hidden"); ctl("cellule").classList.add("hidden");
        return;
      }
      const j = DATA.jeux[ctl("var").value];
      const regs = regionsDisponibles(j);
      choisies = new Set([regs[0].id]);
      ctl("regions").innerHTML = regs.map((r) => `<button class="chip" data-r="${r.id}" aria-pressed="${choisies.has(r.id)}">${r.nom}</button>`).join("");
      $$("[data-r]", conteneur).forEach((b) => b.addEventListener("click", () => {
        const id = b.dataset.r; choisies.has(id) ? choisies.delete(id) : choisies.add(id);
        b.setAttribute("aria-pressed", String(choisies.has(id)));
        ctl("boite").classList.toggle("hidden", !choisies.has("boite")); ctl("cellule").classList.toggle("hidden", !choisies.has("cellule"));
      }));
      const sems = j.cube ? j.cube.mois.map(semDe) : j.etiq;
      ctl("debut").value = sems[0]; ctl("fin").value = sems.at(-1);
      ctl("info").innerHTML = `${U.esc(j.meta.produit || "")} · ${j.cube ? `monthly data ${j.cube.mois[0]} → ${j.cube.mois.at(-1)}, grid ${U.resolution(j)}` : `semester series ${j.etiq[0]} → ${j.etiq.at(-1)}`}`;
      ctl("boite").classList.add("hidden"); ctl("cellule").classList.add("hidden");
    }
    $('[data-c="ville"]', conteneur).addEventListener("change", (e) => {
      if (!e.target.value) return; const [la, lo] = e.target.value.split(",");
      $('[data-c="lat"]', conteneur).value = la; $('[data-c="lon"]', conteneur).value = lo;
    });
    ctl("var").addEventListener("change", majVariable);
    ctl("go").addEventListener("click", lancer);
    majVariable();

    function lancer() {
      if (ctl("debut").value > ctl("fin").value) [ctl("debut").value, ctl("fin").value] = [ctl("fin").value, ctl("debut").value];
      if (ctl("var").value.startsWith("fig:")) return figuresSeules(ctl("sortie"), ctl("var").value.slice(4));
      const j = DATA.jeux[ctl("var").value], regs = regionsDisponibles(j).filter((r) => choisies.has(r.id));
      if (!regs.length) { ctl("sortie").innerHTML = U.vide("Choose at least one region", ""); return; }
      const ville = $('[data-c="ville"]', conteneur).value.split(",")[2];
      const opts = { debut: ctl("debut").value, fin: ctl("fin").value, agg: ctl("agg").value,
        la0: +$('[data-b="la0"]', conteneur).value, la1: +$('[data-b="la1"]', conteneur).value, lo0: +$('[data-b="lo0"]', conteneur).value, lo1: +$('[data-b="lo1"]', conteneur).value,
        lat: +$('[data-c="lat"]', conteneur).value, lon: +$('[data-c="lon"]', conteneur).value, ville };
      const resultats = regs.map((r) => analyserRegion(j, { ...r }, opts));
      afficher(ctl("sortie"), j, resultats, opts);
    }
    if (varInitiale) setTimeout(lancer, 50);
  }

  /** Variables analysed by the team as figures only (no numeric file): show their semester figures. */
  function figuresSeules(el, id) {
    const U = UI, ims = DATA.galerie[id] || [];
    const sem = ims.filter((im) => /semester|6 months|continent/i.test(im.titre)), autres = ims.filter((im) => !sem.includes(im));
    el.innerHTML = `<div class="card"><div class="section-head"><div><div class="eyebrow">Investigation · ${U.esc(CH.nomVar(id))}</div><h3>The team's semester analysis</h3></div>${U.badge(id === "aot" ? "model" : id === "no2" ? "obs" : "team")}</div>
      <p class="small muted">Source: ${U.esc(FIG_SEULES[id])}. These results exist as figures (2004–2026, one point every 6 months). The site does not re-extract numbers from images, so no new statistical test is computed here; the period selector does not apply.</p>
      <div class="gallery">${[...sem, ...autres].map((im) => U.figure(im, id)).join("")}</div></div>`;
    U.attacherGalerie(el);
  }

  function interpretation(j, r) {
    const a = r.res, u = j.unite;
    if (a.verdict === "insuffisant") return `The record for <b>${r.nom}</b> covers ${a.n} valid semester(s) over ${a.duree.toFixed(1)} years. At least 10 semesters spanning 5 years are needed before a trend can be tested: <b>no conclusion about change is possible yet</b> — this is not evidence of stability.`;
    const sens = a.pente > 0 ? "increased" : "decreased";
    let txt = `Over ${r.sem.etiq[0]} → ${r.sem.etiq.at(-1)}, ${CH.nomVar(j.id).toLowerCase()} over <b>${r.nom}</b> ${sens} by about <b>${UI.fmt(Math.abs(a.pente), 3)} ${UI.esc(u)} per decade</b> (95 % CI ${UI.fmt(a.ic_bas, 3)} to ${UI.fmt(a.ic_haut, 3)}). `;
    if (a.verdict === "hausse" || a.verdict === "baisse") txt += `Both the regression (p = ${fp(a.p_reg)}) and the corrected Mann-Kendall test (p = ${fp(a.mk_hr_p)}) support this trend. This is statistical evidence of change over the period, <b>not proof of its cause</b>.`;
    else if (a.verdict === "inconclusif") txt += `The regression (p = ${fp(a.p_reg)}) and the Mann-Kendall test (p = ${fp(a.mk_hr_p)}) disagree: the evidence is <b>inconclusive</b>; a few extreme semesters may drive the linear fit.`;
    else txt += `Neither test reaches p &lt; 0.05 (regression p = ${fp(a.p_reg)}, Mann-Kendall p = ${fp(a.mk_hr_p)}). <b>A non-significant trend does not mean that nothing changes</b>: the record may be too short or too variable to establish it.`;
    return txt;
  }

  function afficher(el, j, R, opts) {
    const U = UI, u = j.unite;
    const ok = R.filter((r) => r.res.verdict !== "insuffisant");
    const lignesTable = [];
    R.forEach((r) => r.sem.etiq.forEach((e, i) => lignesTable.push([r.nom, e, r.sem.nb[i], r.sem.val[i], r.sem.anom[i], r.sem.z[i]])));
    // comparaisons deux à deux
    const paires = [];
    for (let a = 0; a < ok.length; a++) for (let b = a + 1; b < ok.length; b++) {
      const d = STATS.difference(ok[a].res, ok[b].res);
      const chevauche = [ok[a].region.type, ok[b].region.type].includes("masque") && ["zone", "cellule", "boite"].some((t) => [ok[a].region.type, ok[b].region.type].includes(t));
      paires.push({ a: ok[a], b: ok[b], d, chevauche });
    }
    el.innerHTML = `
      ${R.map((r) => {
        const a = r.res, nm = r.mois.length || r.sem.etiq.length * 6;
        return `<div class="card" style="margin-bottom:1rem">
          <div class="section-head"><div><div class="eyebrow">Investigation · ${U.esc(CH.nomVar(j.id))}</div><h3>${U.esc(r.nom)}</h3></div>${verdictBadge(a.verdict)}</div>
          <div class="indic">
            <div><b>${U.esc(j.meta.produit || "—")}</b><span>Dataset · ${j.nature === "observation" ? "satellite observations" : "model-derived"}</span></div>
            <div><b>${r.sem.etiq[0] || "—"} → ${r.sem.etiq.at(-1) || "—"}</b><span>Analysis period (${opts.debut}–${opts.fin})</span></div>
            <div><b>${a.n} semesters</b><span>Observations · ${r.mois.length ? r.mois.length + " months" : "semester series"} · ${r.cellules} cell(s)</span></div>
            <div><b>${Math.round(100 * (1 - r.manquants))} %</b><span>Data completeness (months with valid data)</span></div>
            <div><b>${a.verdict === "insuffisant" ? "—" : (a.pente >= 0 ? "+" : "") + U.fmt(a.pente, 3)}</b><span>${U.tip("Trend")} (${U.esc(u)} / decade)</span></div>
            <div><b>${a.verdict === "insuffisant" ? "—" : `[${U.fmt(a.ic_bas, 3)} ; ${U.fmt(a.ic_haut, 3)}]`}</b><span>${U.tip("Confidence interval")} 95 %</span></div>
            <div><b>${a.verdict === "insuffisant" ? "—" : `${fp(a.p_reg)} / ${fp(a.mk_hr_p)}`}</b><span>p regression / p ${U.tip("Mann-Kendall test")}</span></div>
            <div><b>${a.verdict === "insuffisant" ? "—" : U.fmt(a.sen, 3)}</b><span>${U.tip("Sen's slope")} (${U.esc(u)} / decade)</span></div>
          </div>
          <p style="margin-top:.9rem">${interpretation(j, r)}</p>
          ${a.verdict !== "insuffisant" && Number.isFinite(STATS.moy(r.sem.val)) && STATS.moy(r.sem.val) > 0 ? `<p class="small muted">Rate: ${U.fmt(a.pente / 10, 4)} ${U.esc(u)} per year · ${U.fmt(a.pente / STATS.moy(r.sem.val) * 100, 2)} % of the mean per decade · lag-1 autocorrelation of residuals ${U.fmt(a.r1, 2)} (effective sample size ${U.fmt(a.neff, 1)}).</p>` : ""}
        </div>`; }).join("")}
      ${paires.length ? `<div class="card" style="margin-bottom:1rem"><h3>Do the regions behave differently?</h3>
        <p class="small muted">The difference between two trends is tested directly (z-test on the slope difference, using each trend's autocorrelation-corrected standard error). One significant and one non-significant trend do <b>not</b> by themselves show that two regions differ.</p>
        <div class="table-wrap"><table><thead><tr><th>Regions</th><th>Trend difference (${U.esc(u)}/decade)</th><th>95 % CI</th><th>p</th><th>Conclusion</th></tr></thead><tbody>
        ${paires.map((p) => `<tr><td>${U.esc(p.a.nom)} − ${U.esc(p.b.nom)}</td><td class="num-cell">${U.fmt(p.d.d, 3)}</td><td class="num-cell">[${U.fmt(p.d.ic_bas, 3)} ; ${U.fmt(p.d.ic_haut, 3)}]</td><td class="num-cell">${fp(p.d.p)}</td>
          <td>${p.d.p < 0.05 ? '<span class="badge badge-up">Statistically different</span>' : '<span class="badge badge-flat">Difference not established</span>'}${p.chevauche ? '<br><span class="small muted">Overlapping regions: they share cells, so the test is only indicative.</span>' : ""}</td></tr>`).join("")}
        </tbody></table></div><p class="small muted">Nearby regions are spatially correlated; the test assumes independent series and can overstate differences.</p></div>` : ""}
      <div class="grid g2">
        <div class="card">${U.plotHead("Semester time series", U.badge("stat", "Statistical analysis output"), `<button class="chip" data-v="anomalie" aria-pressed="true">Anomalies</button><button class="chip" data-v="valeur">Semester means</button>`)}
          <div data-p="serie" class="plot tall"></div><p class="plot-note">Anomaly = semester mean minus the mean of the same semester type (S1 or S2): the seasonal cycle is removed. Dashed lines: fitted trends.</p></div>
        <div class="card">${U.plotHead(R.some((r) => r.mois.length) ? "Monthly regional means" : "Distribution", U.badge(j.nature === "observation" ? "obs" : "model", j.nature === "observation" ? "From satellite observations" : "Model-derived"))}
          <div data-p="mensuel" class="plot tall"></div><p class="plot-note">${R.some((r) => r.mois.length) ? "Monthly means of the selected cells (raw temporal averages, not deseasonalised)." : ""}</p></div>
      </div>
      ${R.some((r) => r.mois.length > 6) ? `<div class="card" style="margin-top:1rem">${U.plotHead("Seasonal distribution of monthly values", U.badge("stat", "Statistical analysis output"))}<div data-p="distrib" class="plot"></div></div>` : ""}
      <div class="card" style="margin-top:1rem">${U.plotHead("Investigation data", "", `<button class="btn small" data-dl="table">Download CSV</button>`)}
        <div class="table-wrap" style="max-height:340px;overflow:auto"><table class="mini-table"><thead><tr><th data-s="0">Region</th><th data-s="1">Semester</th><th data-s="2">Months</th><th data-s="3">Mean (${U.esc(u)})</th><th data-s="4">Anomaly</th><th data-s="5">z-score</th></tr></thead><tbody data-e="tbody"></tbody></table></div></div>`;
    let vueS = "anomalie";
    const tracer = () => CH.enquete($('[data-p="serie"]', el), R.filter((r) => r.sem.etiq.length), { vue: vueS, unite: u });
    tracer();
    $$("[data-v]", el).forEach((b) => b.addEventListener("click", () => { vueS = b.dataset.v; $$("[data-v]", el).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); tracer(); }));
    const avecMois = R.filter((r) => r.mois.length);
    if (avecMois.length) CH.lignes($('[data-p="mensuel"]', el), avecMois.map((r) => ({ nom: r.nom, x: r.mois.map((m) => m + "-15"), y: r.valeurs })), { unite: u });
    else CH.distribution($('[data-p="mensuel"]', el), R.map((r) => ({ nom: r.nom, mois: r.sem.etiq.map((e) => (e.endsWith("S1") ? "x-04" : "x-10")), valeurs: r.sem.val })), u);
    if ($('[data-p="distrib"]', el)) CH.distribution($('[data-p="distrib"]', el), avecMois.map((r) => ({ nom: r.nom, mois: r.mois, valeurs: r.valeurs })), u);
    let tri = [1, 1];
    const remplir = () => {
      const lg = [...lignesTable].sort((x, y) => (x[tri[0]] > y[tri[0]] ? tri[1] : x[tri[0]] < y[tri[0]] ? -tri[1] : 0));
      $('[data-e="tbody"]', el).innerHTML = lg.map((l) => `<tr><td>${U.esc(l[0])}</td><td>${l[1]}</td><td class="num-cell">${l[2]}</td><td class="num-cell">${U.fmt(l[3], 3)}</td><td class="num-cell">${U.fmt(l[4], 3)}</td><td class="num-cell">${U.fmt(l[5], 2)}</td></tr>`).join("");
    };
    remplir();
    $$("[data-s]", el).forEach((th) => th.addEventListener("click", () => { const k = +th.dataset.s; tri = [k, tri[0] === k ? -tri[1] : 1]; remplir(); }));
    $('[data-dl="table"]', el).addEventListener("click", () => CH.csv(`investigation_${j.id}`, ["region", "semester", "months", `mean_${u}`, "anomaly", "z_score"], lignesTable));
  }

  // =================================================================== Earth Explorer
  function earth() {
    const U = UI, jeux = Object.values(DATA.jeux);
    const globaux = jeux.filter((j) => j.globale);
    const regionaux = jeux.filter((j) => j.niveaux.length && j.niveaux[0].carte);
    const v0 = (globaux[0] || regionaux[0]);
    $("#vue").innerHTML = `
      <div class="section-head"><div><div class="eyebrow">Explore</div><h1>Earth Explorer</h1>
        <p class="lead">Rotate the Earth, switch to the flat map to zoom and pan, choose a variable and click anywhere to inspect the value of the nearest grid cell.</p></div></div>
      ${U.workflow("explore")}
      ${v0 ? `<section class="grid" style="grid-template-columns:1.7fr 1fr;margin-top:1.2rem">
        <div class="card">${U.plotHead("Atmosphere explorer", "", `
            <select data-x="var" aria-label="Variable">${[...new Set([...globaux, ...regionaux])].map((j) => `<option value="${j.id}">${CH.nomVar(j.id)}${j.globale ? " — global" : " — Morocco window"}</option>`).join("")}</select>
            <select data-x="champ" aria-label="Field"><option value="moyenne">Mean of all days</option><option value="dernier">Latest day</option></select>
            <button class="chip" data-x="globe" aria-pressed="true">3D globe</button><button class="chip" data-x="plan">2D map</button>`)}
          <div id="x-plot" class="plot tall" style="min-height:560px"></div>
          <p class="plot-note" id="x-note"></p></div>
        <div class="card"><h3>Point inspection</h3><div id="x-insp" class="muted">Click on the globe or the map.</div>
          <hr style="border:0;border-top:1px solid var(--line);margin:1rem 0"><h3>About this layer</h3><div id="x-info" class="small"></div></div>
      </section>` : U.vide("No gridded data loaded", "Run tools/build_site_data.py to add global or regional grids.")}
      <section class="section"><div class="section-head"><div><div class="eyebrow">Team results</div><h2>Global figures from the project</h2></div></div>
        <p class="muted small">Global maps prepared by the team for variables whose gridded files are not yet in the site. They are shown as figures, with their source as stated.</p>
        <div class="gallery">${Object.entries(DATA.galerie).flatMap(([id, ims]) => ims.filter((im) => /global|world|mondial/i.test(im.titre)).map((im) => U.figure(im, id))).join("") || '<p class="muted">No global figure available.</p>'}</div></section>`;
    if (!v0) return;
    U.attacherGalerie($("#vue"));
    const etat = { id: v0.id, champ: "moyenne", mode: "globe" };
    const inspecter = (lat, lon) => {
      const j = DATA.jeux[etat.id];
      let html = `<div class="kpi" style="font-size:1.5rem">${lat.toFixed(1)}°, ${lon.toFixed(1)}°</div>`;
      if (j.globale) {
        const g = j.globale, i = Math.round((lat - g.lat0) / g.dlat), k = Math.round((lon - g.lon0) / g.dlon);
        const v = g[etat.champ] && g[etat.champ][i * g.nlon + k];
        html += `<p><b>${v === null || v === undefined ? "no data" : U.fmt(v, 1) + " " + U.esc(j.unite)}</b> — nearest ${g.dlat}° × ${g.dlon}° cell (${(g.lat0 + i * g.dlat).toFixed(1)}°, ${(g.lon0 + k * g.dlon).toFixed(1)}°)</p>`;
      }
      const e = j.meta.etendue;
      if (e && lon >= e[0] && lon <= e[1] && lat >= e[2] && lat <= e[3]) html += `<p>Inside the Morocco analysis window. <a href="#/trends/${j.id}">Investigate trends here →</a></p>`;
      else html += `<p class="small muted">Outside the Morocco analysis window: only the mapped value is available for this location.</p>`;
      $("#x-insp").innerHTML = html;
    };
    const tracer = () => {
      const j = DATA.jeux[etat.id], el = $("#x-plot");
      CH.purger(el.parentElement);
      $('[data-x="champ"]').disabled = !j.globale || !j.globale.dernier;
      if (j.globale && etat.mode === "globe") CH.globe(el, j, { champ: etat.champ, pas: 3, rotation: false, onclick: inspecter });
      else if (j.globale) CH.carteGlobale(el, j, etat.champ, inspecter);
      else CH.carteRegion(el, j, { niveau: j.niveauDefaut, mode: j.niveaux[j.niveauDefaut].carte.moyenne ? "moyenne" : "pente", onclick: inspecter });
      const g = j.globale;
      $("#x-note").innerHTML = g ? `${etat.champ === "moyenne" ? `Mean of ${g.jours || j.meta.jours} days (${U.esc(g.periode || "")})` : `Single day: ${U.esc(g.dernier_jour)}`} · ${U.badge("obs")}`
        : `Regional window only — global coverage is not part of the processed file. ${U.badge(j.type === "serie" ? "proc" : "obs")}`;
      $("#x-info").innerHTML = `<table><tr><td>Variable</td><td>${CH.nomVar(j.id)}</td></tr><tr><td>Dataset</td><td>${U.esc(j.meta.produit || "")}</td></tr>
        <tr><td>Unit</td><td>${U.esc(j.unite)}</td></tr><tr><td>Grid</td><td>${g ? g.dlat + "° × " + g.dlon + "°" : U.resolution(j)}</td></tr>
        <tr><td>Period</td><td>${U.esc(g ? g.periode || "" : U.periode(j))}</td></tr><tr><td>Colour scale</td><td>${j.id === "ozone" ? "100–500 DU (as NASA OMI images)" : "automatic"}</td></tr></table>
        <p style="margin-top:.6rem"><a href="#/variable/${j.id}">Open the ${CH.nomVar(j.id)} explorer →</a></p>`;
    };
    $('[data-x="var"]').addEventListener("change", (e) => { etat.id = e.target.value; tracer(); });
    $('[data-x="champ"]').addEventListener("change", (e) => { etat.champ = e.target.value; tracer(); });
    ["globe", "plan"].forEach((m) => $(`[data-x="${m}"]`).addEventListener("click", () => {
      etat.mode = m; $$('[data-x="globe"],[data-x="plan"]').forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.x === m))); tracer();
    }));
    tracer();
  }

  // =================================================================== Global comparison
  function global() {
    const U = UI, jeux = Object.values(DATA.jeux).filter((j) => j.globalMensuel || j.globalQuotidien);
    const sem = Object.values(DATA.jeux).filter((j) => j.globalSemestres);
    const autres = CATALOGUE.variables.filter((v) => !jeux.find((j) => j.id === v.id) && !sem.find((j) => j.id === v.id));
    $("#vue").innerHTML = `
      <div class="section-head"><div><div class="eyebrow">Compare</div><h1>Morocco vs. Global</h1>
        <p class="lead">How does Morocco's atmosphere compare with the rest of the planet? Comparisons use the same dataset, units, days and aggregation method for both areas.</p></div></div>
      ${U.workflow("compare")}
      ${sem.map((j, k) => `<section class="section card" id="gs-${j.id}">
          <div class="section-head"><div><div class="eyebrow">${U.esc(j.meta.produit || "")}</div><h2>${CH.nomVar(j.id)}: Morocco vs. World, one point every 6 months</h2></div>${U.badge("obs")}</div>
          <p class="muted small">Level ${j.niveaux[j.niveauDefaut].plev} hPa (≈ 16 km). Morocco = ${U.esc(j.meta.zone_texte)}; World = ${U.esc(j.globalSemestres.zone)}. Team CSV files, same method for both areas.</p>
          <div data-gs="plot-${k}" class="plot tall"></div><div data-gs="tab-${k}" style="margin-top:1rem"></div></section>`).join("")}
      ${jeux.length ? jeux.map((j, k) => `<section class="section card" id="g-${j.id}">
          <div class="section-head"><div><div class="eyebrow">${U.esc(j.meta.produit || "")}</div><h2>${CH.nomVar(j.id)}: Morocco vs. near-global mean</h2></div>${U.badge("obs")}</div>
          <div class="indic" data-g="kpi-${k}"></div>
          <div class="grid g2" style="margin-top:1rem"><div><div data-g="quot-${k}" class="plot"></div><p class="plot-note">Daily means: Morocco (cells inside the borders, cos-latitude weighted) and the near-global band 60°S–60°N (same weighting; polar regions excluded because they are unobserved in polar night).</p></div>
            <div><div data-g="hist-${k}" class="plot"></div><p class="plot-note">Where does Morocco sit in the global distribution? Histogram of the near-global grid mean, with Morocco's mean marked.</p></div></div>
          <div data-g="tend-${k}" style="margin-top:1rem"></div></section>`).join("")
      : U.vide("No global series loaded", "Global comparisons need near-global series (produced by tools/build_site_data.py for ozone).")}
      <section class="section card"><h2>Other variables</h2>
        <p class="muted">For ${autres.map((v) => v.nom).join(", ")}, the processed files do not contain a Morocco series and a world series built the same way, so no quantitative Morocco-vs-world comparison is computed here. The team's global and Morocco figures are shown side by side in each variable page and in the <a href="#/earth">Earth Explorer</a>.</p></section>`;
    sem.forEach((j, k) => {
      const opts = { debut: j.etiq[0], fin: j.etiq.at(-1), agg: "cos" };
      const R = [analyserRegion(j, { id: "serie", nom: "Morocco", type: "serie" }, opts), analyserRegion(j, { id: "globalsem", nom: "World", type: "globalsem" }, opts)];
      CH.enquete($(`[data-gs="plot-${k}"]`), R, { vue: "anomalie", unite: j.unite });
      const d = STATS.difference(R[0].res, R[1].res);
      $(`[data-gs="tab-${k}"]`).innerHTML = `<div class="table-wrap"><table><thead><tr><th>Area</th><th>Semesters</th><th>Trend (${U.esc(j.unite)}/decade)</th><th>95 % CI</th><th>Verdict</th></tr></thead><tbody>
        ${R.map((r) => `<tr><td>${r.nom}</td><td class="num-cell">${r.res.n}</td><td class="num-cell">${U.fmt(r.res.pente, 3)}</td><td class="num-cell">[${U.fmt(r.res.ic_bas, 3)} ; ${U.fmt(r.res.ic_haut, 3)}]</td><td>${verdictBadge(r.res.verdict)}</td></tr>`).join("")}
        ${d ? `<tr><td><b>Difference</b></td><td></td><td class="num-cell">${U.fmt(d.d, 3)}</td><td class="num-cell">[${U.fmt(d.ic_bas, 3)} ; ${U.fmt(d.ic_haut, 3)}]</td><td>${d.p < .05 ? '<span class="badge badge-up">Statistically different</span>' : '<span class="badge badge-flat">Difference not established</span>'} (p = ${fp(d.p)})</td></tr>` : ""}</tbody></table></div>
        <p class="small muted">Morocco rises ${R[0].res.pente > R[1].res.pente ? "a little faster" : "a little slower"} than the world; the difference is ${d && d.p < .05 ? "significant" : "not significant: Morocco follows the global change"}. The Morocco box is part of the world grid, so the test is only indicative.</p>`;
    });
    jeux.forEach((j, k) => {
      const q = j.quotidien, gq = j.globalQuotidien, d0 = (x) => new Date(x.debut + "T00:00:00Z").getTime();
      // aligne les deux séries sur un calendrier commun ; trous = null (pas de ligne tracée à travers les jours manquants)
      const carte = (x) => { const m = new Map(); if (x) x.jours.forEach((dj, i) => { const v = x.valeurs[i]; if (v !== null && Number.isFinite(v)) m.set(d0(x) + dj * 864e5, v); }); return m; };
      const mq = carte(q), mg = carte(gq), tous = [...new Set([...mq.keys(), ...mg.keys()])].sort((a, b) => a - b);
      const cal = [];
      if (tous.length) for (let t = tous[0]; t <= tous.at(-1); t += 864e5) cal.push(t);
      const iso = cal.map((t) => new Date(t).toISOString().slice(0, 10));
      if (cal.length) CH.lignes($(`[data-g="quot-${k}"]`), [{ nom: "Morocco", x: iso, y: cal.map((t) => mq.get(t) ?? null), couleur: CH.C.cyan },
        { nom: "Near-global (60°S–60°N)", x: iso, y: cal.map((t) => mg.get(t) ?? null), couleur: CH.C.amber }], { unite: j.unite });
      const communs = cal.filter((t) => mq.has(t) && mg.has(t));
      const mm = STATS.moy(communs.map((t) => mq.get(t))), gm = STATS.moy(communs.map((t) => mg.get(t)));
      // histogramme du champ global moyen (60S-60N)
      const g = j.globale, vals = [];
      if (g) for (let i = 0; i < g.nlat; i++) { const la = g.lat0 + i * g.dlat; if (la < -60 || la > 60) continue; for (let c = 0; c < g.nlon; c++) { const v = g.moyenne[i * g.nlon + c]; if (v !== null) vals.push(v); } }
      const pct = vals.length ? Math.round(100 * vals.filter((v) => v < mm).length / vals.length) : NaN;
      if (vals.length) Plotly.newPlot($(`[data-g="hist-${k}"]`), [{ type: "histogram", x: vals, nbinsx: 50, marker: { color: "rgba(79,141,255,.6)" }, name: "grid cells", hovertemplate: `%{x} ${j.unite}: %{y} cells<extra></extra>` }],
        { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: CH.C.plot, font: { color: CH.C.text, family: "IBM Plex Sans" }, margin: { l: 55, r: 15, t: 15, b: 45 },
          xaxis: { title: { text: j.unite }, gridcolor: CH.C.grid }, yaxis: { title: { text: "Grid cells" }, gridcolor: CH.C.grid }, showlegend: false,
          shapes: [{ type: "line", x0: mm, x1: mm, yref: "paper", y0: 0, y1: 1, line: { color: CH.C.cyan, width: 3 } }],
          annotations: [{ x: mm, yref: "paper", y: 1, text: ` Morocco ${U.fmt(mm, 1)}`, showarrow: false, xanchor: "left", font: { color: CH.C.cyan } }] }, { responsive: true, displaylogo: false });
      $(`[data-g="kpi-${k}"]`).innerHTML = `<div><b>${U.fmt(mm, 1)} ${U.esc(j.unite)}</b><span>Morocco mean (${communs.length} days with both)</span></div>
        <div><b>${U.fmt(gm, 1)} ${U.esc(j.unite)}</b><span>Near-global mean (same ${communs.length} days)</span></div>
        <div><b>${U.fmt(mm - gm, 1)} ${U.esc(j.unite)}</b><span>Difference Morocco − global</span></div>
        <div><b>${Number.isFinite(pct) ? pct + " %" : "—"}</b><span>of near-global grid cells have a lower mean than Morocco</span></div>`;
      // tendances comparées si assez de données
      const out = $(`[data-g="tend-${k}"]`);
      if (j.cube && j.globalMensuel) {
        const opts = { debut: semDe(j.cube.mois[0]), fin: semDe(j.cube.mois.at(-1)), agg: "cos" };
        const rm = analyserRegion(j, { id: "maroc", nom: "Morocco", type: "masque" }, opts);
        const rg = analyserRegion(j, { id: "global", nom: "Near-global", type: "global" }, opts);
        if (rm.res.verdict === "insuffisant") out.innerHTML = `<div class="callout">Trend comparison: <b>insufficient data</b> (${rm.res.n} semester(s) over ${rm.res.duree.toFixed(1)} years). With the complete OMI record in the resources folder (2004–2026), run <span class="mono">tools/build_site_data.py</span> and this section will compare Morocco's and the global trends with significance tests.</div>`;
        else {
          const d = STATS.difference(rm.res, rg.res);
          out.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Area</th><th>Trend (${U.esc(j.unite)}/decade)</th><th>95 % CI</th><th>Verdict</th></tr></thead><tbody>
            ${[rm, rg].map((r) => `<tr><td>${r.nom}</td><td class="num-cell">${U.fmt(r.res.pente, 3)}</td><td class="num-cell">[${U.fmt(r.res.ic_bas, 3)} ; ${U.fmt(r.res.ic_haut, 3)}]</td><td>${verdictBadge(r.res.verdict)}</td></tr>`).join("")}
            <tr><td><b>Difference</b></td><td class="num-cell">${U.fmt(d.d, 3)}</td><td class="num-cell">[${U.fmt(d.ic_bas, 3)} ; ${U.fmt(d.ic_haut, 3)}]</td><td>${d.p < .05 ? '<span class="badge badge-up">Statistically different</span>' : '<span class="badge badge-flat">Difference not established</span>'} (p = ${fp(d.p)})</td></tr></tbody></table></div>`;
        }
      }
    });
  }

  // =================================================================== About
  function about() {
    const U = UI;
    $("#vue").innerHTML = `
      <section class="grid" style="grid-template-columns:1fr 1.3fr;align-items:center;gap:2rem">
        <div style="text-align:center"><img class="about-logo" src="assets/logo.svg" alt="DOORAtmosphere logo"></div>
        <div><div class="eyebrow">About</div><h1>DOORAtmosphere</h1><p class="lead"><b>Open the DOOR to Earth's Atmosphere.</b> Discover · Observe · Reveal.</p>
          <p>An interactive scientific investigation platform built for the <a href="https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/" target="_blank" rel="noopener">2026 NASA Space Apps Challenge — Be An Earth System Trend Detective!</a> It turns satellite observations and model-derived datasets into maps, time series and statistically tested trends, from the whole planet down to Morocco.</p></div>
      </section>
      <section class="section"><div class="section-head"><div><div class="eyebrow">The four questions</div><h2>Every investigation answers</h2></div></div>
        <div class="grid g4">${[["WHAT is changing?", "Identify variables with potential temporal change.", "#/variables"], ["WHERE is it changing?", "Locate the regions where change occurs, and where it does not.", "#/earth"],
          ["HOW MUCH is it changing?", "Quantify the rate of change per decade with its uncertainty.", "#/trends"], ["IS THE CHANGE SIGNIFICANT?", "Test the evidence: regression and Mann-Kendall, or 'insufficient data'.", "#/trends"]]
          .map(([t, d, h]) => `<a class="card clickable" href="${h}" style="color:inherit;text-decoration:none"><h3>${t}</h3><p class="muted small">${d}</p></a>`).join("")}</div></section>
      <section class="section">${U.workflow("")}</section>
      <section class="section card"><h2>NASA challenge objectives → where to find them</h2><div class="table-wrap"><table><thead><tr><th>Objective</th><th>In DOORAtmosphere</th></tr></thead><tbody>
        <tr><td>1 · Identify Earth science variables</td><td><a href="#/variables">Variables catalogue</a> — one explorer per variable with data</td></tr>
        <tr><td>2 · Acquire data for a region</td><td><a href="#/earth">Earth Explorer</a> (point inspection) and <a href="#/trends">Trend Detective</a> (Morocco, zones, custom box, single cell, near-global)</td></tr>
        <tr><td>3 · Generate and visualise time series</td><td>Monthly and semester series, daily records, seasonal cycles, distributions</td></tr>
        <tr><td>4 · Quantify trends</td><td>Slope per decade and per year, % of the mean, Theil–Sen slope, 95 % confidence interval</td></tr>
        <tr><td>5 · Investigate significance</td><td>Regression with autocorrelation correction + Mann-Kendall (Hamed–Rao); verdicts including <i>insufficient data</i> and <i>inconclusive</i></td></tr>
        <tr><td>6 · Reveal geographical differences</td><td>Regional comparison with a direct test of the trend difference, <a href="#/maroc">Morocco zones</a>, <a href="#/global">Morocco vs. global</a></td></tr>
      </tbody></table></div></section>
      <section class="section card" id="datasets"><div class="section-head"><div><div class="eyebrow">Summary</div><h2>All the datasets of the project</h2></div></div>
        <ol class="sommaire">${CATALOGUE.datasets.map((d) => `<li><a href="#/variable/${d.id}">${U.esc(d.nom)}</a> — <span class="muted">${U.esc(d.source)}</span></li>`).join("")}</ol>
        <div class="table-wrap"><table><thead><tr><th>Dataset</th><th>Source</th><th>Kind</th><th>Files given by the team</th><th>On this site</th><th>Still to do</th></tr></thead><tbody>
          ${CATALOGUE.datasets.map((d) => `<tr><td><b>${U.esc(d.nom)}</b></td><td class="small">${U.esc(d.source)}</td><td class="small">${U.esc(d.type)}</td><td class="small">${U.esc(d.fichiers)}</td><td class="small">${U.esc(d.site)}</td><td class="small muted">${U.esc(d.reste)}</td></tr>`).join("")}
          ${CATALOGUE.enAttente.map((d) => `<tr><td><b>${U.esc(d.nom)}</b></td><td class="small">—</td><td class="small">Not yet available</td><td class="small">${U.esc(d.ou)}</td><td class="small">Not shown (no data)</td><td class="small muted">${U.esc(d.raison)}</td></tr>`).join("")}
        </tbody></table></div></section>
      <section class="section card"><div class="section-head"><div><div class="eyebrow">The team</div><h2>${U.esc(CATALOGUE.equipe.nom)} — founding members</h2></div></div>
        <p>${U.esc(CATALOGUE.equipe.texte)}</p>
        <div class="team-grid">${CATALOGUE.equipe.membres.map(([p, n]) => `<div class="team-member"><span class="team-ini" aria-hidden="true">${U.esc(p[0] + n[0])}</span><b>${U.esc(p)} ${U.esc(n)}</b></div>`).join("")}</div></section>
      <section class="section grid g2">
        <div class="card"><h3>Data and integrity</h3><p class="small">Every number on this site comes from files in <span class="mono">site/data/</span>, produced from NASA datasets by the project's notebooks and scripts. Conceptual simulations are labelled as such, model-derived results are distinguished from observations, and missing data are reported instead of filled in. See <a href="#/methodology">Methodology</a>.</p></div>
        <div class="card"><h3>Credits</h3><p class="small">NASA Earthdata (Aura OMI, Aura MLS, Terra MODIS, GPM IMERG, MERRA-2) · Natural Earth borders · Plotly.js (MIT) · Space Grotesk and IBM Plex fonts (SIL Open Font License). Logo and interface: original DOORAtmosphere design.</p></div>
      </section>`;
  }

  return { enquete, earth, global, about, regionsDisponibles, analyserRegion };
})();

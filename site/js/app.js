/* =========================================================================
   DOORAtmosphere – application (routeur + vues)
   ========================================================================= */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const VAR = (id) => CATALOGUE.variables.find((v) => v.id === id);
  const fmt = CH.fmt;
  const vue = () => $("#vue");
  let nettoyages = [];

  // ---------------------------------------------------------------- petits composants
  const BADGES = {
    obs: ["badge-obs", "Real observation"], proc: ["badge-proc", "Processed result (NASA data)"],
    concept: ["badge-concept", "Conceptual illustration"], img: ["badge-img", "Image products"], wait: ["badge-wait", "Awaiting data"],
    model: ["badge-model", "Model-derived estimate"], stat: ["badge-stat", "Statistical analysis output"], team: ["badge-proc", "Team analysis figure"],
    deco: ["badge-wait", "Decorative visual"],
  };
  const TYPE_FIG = { model: "model", obs: "obs", team: "team" };
  const badge = (k, txt) => `<span class="badge ${BADGES[k][0]}">${txt || BADGES[k][1]}</span>`;
  function badgeStatut(id) {
    const s = DATA.statut(id);
    return s === "data" ? badge("proc", "Processed data") : s === "snapshot" ? badge("obs", "Observation snapshot")
      : s === "images" ? badge("img", `${DATA.galerie[id].length} image products`) : badge("wait");
  }
  const series = () => Object.values(DATA.jeux).filter((j) => j.type === "serie");
  const seriesMaroc = () => series().filter((j) => j.meta.zone !== "World");
  const zoneJ = (j) => (j.meta.zone === "World" ? "World" : "Morocco");
  const avecCarte = () => Object.values(DATA.jeux).filter((j) => j.niveaux.length && j.niveaux[0].carte);
  const periode = (j) => (j.type === "serie" ? `${j.etiq[0]} → ${j.etiq.at(-1)}` : j.meta.premier_jour || "single date");
  const resolution = (j) => (j.lat.length > 1 ? `${Math.abs(j.lat[1] - j.lat[0]).toFixed(2).replace(/\.?0+$/, "")}°` : "–");
  function tendance(j, niveau) {
    const n = j.niveaux[niveau ?? j.niveauDefaut];
    return n && n.tendance ? n.tendance : null;
  }
  const significatif = (t, a = 0.05) => t && t.p_reg < a && (t.mk_hr_p ?? t.mk_p) < a;
  function verdict(t, j) {
    if (!t) return badge("wait", "No trend");
    if (!significatif(t, j.meta.alpha || 0.05)) return `<span class="badge badge-flat">No significant trend</span>`;
    return t.pente > 0 ? `<span class="badge badge-up">▲ Significant increase</span>` : `<span class="badge badge-down">▼ Significant decrease</span>`;
  }
  const moyenneMaroc = (j) => { const m = j.niveaux[j.niveauDefaut].moyenne.filter(Number.isFinite); return m.length ? m.reduce((a, b) => a + b, 0) / m.length : NaN; };
  function statsCarteMaroc(j) {
    const n = j.niveaux[j.niveauDefaut], c = n.carte || {}, m = CH.masque(j, n), v = (c.moyenne || []).filter((x, i) => m[i] && x !== null);
    if (!v.length) return null;
    return { min: Math.min(...v), max: Math.max(...v), moy: v.reduce((a, b) => a + b, 0) / v.length, n: v.length };
  }
  const plotHead = (titre, typeBadge, outils = "") => `<div class="plot-head"><div><h3>${titre}</h3>${typeBadge}</div><div class="plot-tools">${outils}</div></div>`;
  const vide = (titre, texte) => `<div class="empty">${W.MASCOTTE}<h3>${titre}</h3><p>${texte}</p></div>`;
  // info-bulle de glossaire
  const tip = (terme, texte) => {
    const g = CATALOGUE.glossaire.find(([t]) => t.toLowerCase() === terme.toLowerCase());
    return g ? `<abbr class="tip" tabindex="0" data-tip="${esc(g[1])}">${esc(texte || terme)}</abbr>` : esc(texte || terme);
  };
  // fil de l'enquête (DISCOVER → REVEAL)
  const ETAPES = [["discover", "Discover", "the variables", "#/variables"], ["select", "Select", "variable & region", "#/trends"], ["explore", "Explore", "Earth & maps", "#/earth"],
    ["visualize", "Visualize", "time series", "#/maroc"], ["analyze", "Analyze", "trends & tests", "#/trends"], ["compare", "Compare", "regions", "#/global"],
    ["interpret", "Interpret", "with limits", "#/methodology"], ["reveal", "Reveal", "the findings", "#/about"]];
  const workflow = (actif) => `<nav class="workflow" aria-label="Investigation workflow">${ETAPES.map(([k, t, s, h]) => `<a href="${h}" class="${k === actif ? "on" : ""}" ${k === actif ? 'aria-current="step"' : ""}>${t}<small>${s}</small></a>`).join("")}</nav>`;
  // figure de galerie avec badge de type
  const figure = (im, id, i) => `<figure data-v="${id}" data-i="${i ?? (DATA.galerie[id] || []).indexOf(im)}" tabindex="0"><img loading="lazy" src="${esc(im.src)}" alt="${esc((VAR(id) || {}).nom + " – " + im.titre)}">
    <figcaption><span class="fig-title">${esc(im.titre)}</span>${im.explication ? `<span class="fig-text">${esc(im.explication)}</span>` : ""}${badge(TYPE_FIG[im.type] || "img", im.type === "model" ? "Model-derived (MERRA-2)" : im.type === "obs" ? "Satellite observation" : "Team analysis figure")}</figcaption></figure>`;
  function attacherGalerie(racine) {
    $$(".gallery figure", racine).forEach((f) => {
      const ouvrir = () => lightbox(DATA.galerie[f.dataset.v][+f.dataset.i], VAR(f.dataset.v));
      f.addEventListener("click", ouvrir); f.addEventListener("keydown", (e) => { if (e.key === "Enter") ouvrir(); });
    });
  }

  // ---------------------------------------------------------------- exports CSV
  const EXPORT = {
    serie(j, k) {
      const n = j.niveaux[k];
      CH.csv(`${j.id}_semesters${n.plev ? "_" + n.plev + "hPa" : ""}`, ["semester", "mid_date", `morocco_mean_${j.unite}`, `anomaly_${j.unite}`, "z_score", `trend_line_${j.unite}`],
        j.etiq.map((e, i) => [e, j.dates[i], n.moyenne[i], n.anomalie[i], n.z[i], n.ligne[i]]));
    },
    carte(j, k) {
      const n = j.niveaux[k], c = n.carte || {}, m = CH.masque(j, n), rows = [];
      j.lat.forEach((la, i) => j.lon.forEach((lo, q) => {
        const idx = i * j.lon.length + q;
        rows.push([la, lo, c.moyenne ? c.moyenne[idx] : "", c.pente ? c.pente[idx] : "", c.sig ? c.sig[idx] : "", m[idx] ? 1 : 0]);
      }));
      CH.csv(`${j.id}_map`, ["lat", "lon", `mean_${j.unite}`, `trend_${j.unite}_per_decade`, "significant", "in_morocco"], rows);
    },
    cycle(j) { CH.csv(`${j.id}_seasonal_cycle`, ["month", `mean_${j.unite}`, "std_between_years"], j.cycle.mois.map((m, i) => [m, j.cycle.moyenne[i], j.cycle.ecart_type[i]])); },
    profil(j) { CH.csv(`${j.id}_vertical_profile`, Object.keys(j.profils[0]), j.profils.map((p) => Object.values(p))); },
    quotidien(j) {
      const q = j.quotidien, d0 = new Date(q.debut + "T00:00:00Z");
      CH.csv(`${j.id}_daily_morocco`, ["date", `morocco_mean_${j.unite}`], q.jours.map((d, i) => [new Date(d0.getTime() + d * 864e5).toISOString().slice(0, 10), q.valeurs[i]]));
    },
  };

  window.UI = { esc, fmt, badge, vide, tip, workflow, figure, attacherGalerie, plotHead, periode, resolution };

  // ================================================================= ACCUEIL
  function vueAccueil() {
    const vars = CATALOGUE.variables;
    const nData = vars.filter((v) => ["data", "snapshot"].includes(DATA.statut(v.id))).length;
    const nImg = vars.filter((v) => (DATA.galerie[v.id] || []).length).length;
    const S = seriesMaroc();
    const debut = S.length ? S.map((j) => j.etiq[0]).sort()[0].slice(0, 4) : "–";
    const fin = S.length ? S.map((j) => j.etiq.at(-1)).sort().at(-1).slice(0, 4) : "–";
    const oz = DATA.jeux.ozone;
    const legende = oz && oz.globale ? (oz.meta.jours > 1 ? `Real observation — OMI total ozone, mean of ${oz.meta.jours} days (${oz.meta.premier_jour} → ${oz.meta.dernier_jour})`
      : `Real observation — OMI total ozone, ${oz.meta.premier_jour}`) : "Drag to rotate the Earth";
    vue().innerHTML = `
      <section class="hero">
        <div>
          <div class="eyebrow">NASA Space Apps Challenge 2026 · Be An Earth System Trend Detective</div>
          <h1>Open the DOOR to Earth's <span class="grad">Atmosphere</span>.</h1>
          <p class="lead">An interactive laboratory that turns NASA satellite observations into maps, trends and stories — from the whole planet down to Morocco, from the Atlantic coast to the Atlas and the Sahara.</p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="#/maroc">Explore Morocco</a>
            <a class="btn" href="#/trends">Become a Trend Detective</a>
            <a class="btn btn-ghost" href="#/earth">Earth Explorer →</a>
          </div>
          <div class="stats-ribbon">
            <div class="card"><div class="kpi">${vars.length}</div><div class="muted small">atmospheric &amp; environmental variables</div></div>
            <div class="card"><div class="kpi">${nData}</div><div class="muted small">with processed NASA data</div></div>
            <div class="card"><div class="kpi">${nImg}</div><div class="muted small">with image products</div></div>
            <div class="card"><div class="kpi">${S.length ? `${debut}<small>–${fin.slice(2)}</small>` : "—"}</div><div class="muted small">period of the time series</div></div>
          </div>
        </div>
        <div class="hero-globe"><div id="globe" class="globe-plot" aria-label="Rotating globe"></div>
          <svg class="aura" viewBox="0 0 600 600" aria-hidden="true">
            <defs><radialGradient id="faisceau-aura" cx="0" cy="0" r="1"><stop offset="0" stop-color="#7cf3ff" stop-opacity=".55"/><stop offset="1" stop-color="#7cf3ff" stop-opacity="0"/></radialGradient></defs>
            <g transform="rotate(-18 300 300)">
              <ellipse cx="300" cy="300" rx="285" ry="92" fill="none" stroke="rgba(124,243,255,.35)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <path id="orbite-aura" d="M 15 300 A 285 92 0 1 0 585 300 A 285 92 0 1 0 15 300" fill="none"/>
              <g class="aura-sat">
                <animateMotion dur="16s" repeatCount="indefinite"><mpath href="#orbite-aura"/></animateMotion>
                <g class="aura-scan"><path d="M0 0 L-38 140 L38 140 Z" fill="url(#faisceau-aura)"/><path d="M-30 110 L30 110" stroke="#7cf3ff" stroke-width="2" opacity=".7"><animate attributeName="opacity" values=".1;.9;.1" dur="1.2s" repeatCount="indefinite"/></path></g>
                <rect x="-26" y="-6" width="18" height="12" fill="#2f5fb3" stroke="#9cc7ff"/><rect x="8" y="-6" width="18" height="12" fill="#2f5fb3" stroke="#9cc7ff"/>
                <rect x="-8" y="-9" width="16" height="18" rx="2" fill="#d9a441" stroke="#fff3c4"/>
                <text x="0" y="-16" text-anchor="middle" font-size="13" fill="#e8f6ff" font-family="Space Grotesk, sans-serif">Aura · OMI</text>
              </g>
            </g>
          </svg><div class="globe-caption">${esc(legende)}</div></div>
      </section>

      <section class="section">
        <div class="section-head"><div><div class="eyebrow">How an investigation works</div><h2>From discovery to revelation</h2></div><a href="#/trends">Start an investigation →</a></div>
        ${workflow("discover")}
        <div class="grid g4" style="margin-top:1rem">${[["WHAT", "is changing?", "#/variables"], ["WHERE", "is it changing?", "#/earth"], ["HOW MUCH", "is it changing?", "#/trends"], ["IS IT SIGNIFICANT", "or just noise?", "#/trends"]]
          .map(([a, b, h]) => `<a class="card clickable" href="${h}" style="color:inherit;text-decoration:none"><div class="kpi" style="font-size:1.25rem">${a}</div><p class="muted small">${b}</p></a>`).join("")}</div>
      </section>

      <section class="section">
        <div class="section-head"><div><div class="eyebrow">Discover</div><h2>Seven windows on the atmosphere</h2></div>
          <a href="#/variables">See all variables →</a></div>
        <div class="grid cards">${vars.map(carteVariable).join("")}</div>
      </section>

      <section class="section">
        <div class="section-head"><div><div class="eyebrow">Observe · Reveal</div><h2>Three questions behind every chart</h2></div></div>
        <div class="story">
          <div class="card"><div class="num">01</div><h3>What do we observe?</h3><p>Maps and time series computed from NASA satellite products, with their units, period and resolution always visible.</p></div>
          <div class="card"><div class="num">02</div><h3>Why does it matter?</h3><p>Each variable is linked to health, water, energy or climate — with Morocco-centred examples.</p></div>
          <div class="card"><div class="num">03</div><h3>What does the science tell us?</h3><p>Trends are tested for significance, and every explorer states what the data can and cannot establish.</p></div>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><div><div class="eyebrow">Trend Detective</div><h2>What the data say about Morocco</h2></div><a href="#/trends">Open the investigation →</a></div>
        ${S.length ? `<div class="grid cards">${S.map(carteResultat).join("")}</div>`
          : `<div class="callout info">No multi-year processed series is loaded yet.</div>`}
      </section>`;
    $$(".var-card", vue()).forEach((c) => c.addEventListener("click", () => { location.hash = c.dataset.href; }));
    CH.globe($("#globe"), oz);
  }

  function carteVariable(v) {
    return `<article class="card clickable var-card" style="--c:${v.couleur}" data-href="#/variable/${v.id}" tabindex="0" role="link" aria-label="${esc(v.nom)}"
      onkeydown="if(event.key==='Enter')location.hash='#/variable/${v.id}'">
      <span class="bar"></span><div class="sym">${v.symbole}</div><h3>${v.nom}</h3><p class="muted small">${v.resume}</p>
      <div class="foot"><span class="small muted">${v.categorie}</span>${badgeStatut(v.id)}</div></article>`;
  }
  function carteResultat(j) {
    const v = VAR(j.id), t = tendance(j), moy = moyenneMaroc(j);
    return `<article class="card clickable var-card" style="--c:${v.couleur}" data-href="#/variable/${j.id}" onclick="location.hash='#/variable/${j.id}'">
      <span class="bar"></span><div class="small muted">${v.nom} · ${zoneJ(j)} · ${periode(j)}${j.niveaux.length > 1 ? ` · ${j.niveaux[j.niveauDefaut].plev} hPa` : ""}</div>
      <div class="kpi">${t ? (t.pente >= 0 ? "+" : "") + fmt(t.pente, 3) : "–"} <small>${esc(j.unite)}/decade</small></div>
      <div class="small muted">${Number.isFinite(moy) ? `${fmt(t.pente / moy * 100, 1)} % of the mean per decade · ` : ""}p = ${t ? fmt(t.p_reg, 3) : "–"}</div>
      <div class="foot">${verdict(t, j)}${badge("proc")}</div></article>`;
  }

  // ================================================================= LISTE DES VARIABLES
  function vueVariables() {
    const cats = [...new Set(CATALOGUE.variables.map((v) => v.categorie))];
    vue().innerHTML = `
      <div class="section-head"><div><div class="eyebrow">Explorers</div><h1>Variables</h1>
        <p class="lead">Each variable has its own explorer, adapted to its physical meaning, units, resolution and available data.</p></div></div>
      <div class="chips" style="margin-bottom:1rem" role="group" aria-label="Filter">
        <button class="chip" aria-pressed="true" data-f="*">All</button>
        <button class="chip" data-f="statut:data">With processed data</button><button class="chip" data-f="statut:images">With images</button>
        ${cats.map((c) => `<button class="chip" data-f="cat:${c}">${c}</button>`).join("")}</div>
      <div class="grid cards" id="liste">${CATALOGUE.variables.map(carteVariable).join("")}</div>`;
    const appliquer = (f) => {
      $$(".var-card", vue()).forEach((c, i) => {
        const v = CATALOGUE.variables[i], s = DATA.statut(v.id);
        const ok = f === "*" || (f === "statut:data" && (s === "data" || s === "snapshot")) || (f === "statut:images" && (DATA.galerie[v.id] || []).length) || f === `cat:${v.categorie}`;
        c.classList.toggle("hidden", !ok);
      });
    };
    $$("[data-f]", vue()).forEach((b) => b.addEventListener("click", () => {
      $$("[data-f]", vue()).forEach((x) => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true"); appliquer(b.dataset.f);
    }));
    $$(".var-card", vue()).forEach((c) => c.addEventListener("click", () => { location.hash = c.dataset.href; }));
  }

  // ================================================================= EXPLORATEUR D'UNE VARIABLE
  function vueVariable(id) {
    const v = VAR(id);
    if (!v) return vueIntrouvable();
    const j = DATA.jeux[id], imgs = DATA.galerie[id] || [];
    const t = j ? tendance(j) : null;
    const sc = j ? statsCarteMaroc(j) : null;

    let observe;
    if (j && j.type === "serie") {
      const moy = moyenneMaroc(j);
      observe = `Over ${esc(j.meta.zone_texte || "Morocco")}, the average ${j.niveaux.length > 1 ? `at ${j.niveaux[j.niveauDefaut].plev} hPa ` : ""}is <b>${fmt(moy, 3)} ${esc(j.unite)}</b> (${periode(j)}). The fitted trend is <b>${t.pente >= 0 ? "+" : ""}${fmt(t.pente, 3)} ${esc(j.unite)} per decade</b> (95 % CI ${fmt(t.ic_bas, 3)} to ${fmt(t.ic_haut, 3)}; p = ${fmt(t.p_reg, 3)}), which is <b>${significatif(t) ? "statistically significant" : "not statistically significant"}</b>.`;
    } else if (j && sc) {
      observe = `On ${esc(j.meta.premier_jour || "the available date")}, values over Morocco range from <b>${fmt(sc.min, 1)}</b> to <b>${fmt(sc.max, 1)} ${esc(j.unite)}</b> (mean ${fmt(sc.moy, 1)} over ${sc.n} grid cells). A single date shows a spatial pattern, not a trend.`;
    } else if (imgs.length) {
      observe = `${imgs.length} image products are available in the resources for this variable. They are shown below as they were produced; no values are extracted from them.`;
    } else {
      observe = `No processed observations are loaded for this variable yet. The explorer will fill in automatically when <span class="mono">site/data/${v.fichier}</span> is added.`;
    }

    vue().innerHTML = `
      <section class="var-hero" style="--c:${v.couleur}">
        <div>
          <div class="eyebrow"><a href="#/variables">Variables</a> · ${v.categorie}</div>
          <div class="sym-big">${v.symbole}</div>
          <h1>${v.nom}</h1>
          <p class="lead">${v.resume}</p>
          <div class="chips">${badgeStatut(id)}<span class="badge badge-flat">Unit: ${esc(j ? j.unite : v.unite)}</span>
            ${j ? `<span class="badge badge-flat">${esc(j.meta.produit || "")}</span><span class="badge badge-flat">Grid ${resolution(j)}</span>` : ""}</div>
        </div>
        <div class="card">
          <h3>At a glance — ${j && j.meta.zone === "World" ? "World" : "Morocco"}</h3>
          ${j && j.type === "serie" ? `<div class="kpi">${t.pente >= 0 ? "+" : ""}${fmt(t.pente, 3)} <small>${esc(j.unite)}/decade</small></div>
              <div>${verdict(t, j)}</div>
              <table style="margin-top:.8rem"><tr><td>Period</td><td class="num-cell">${periode(j)}</td></tr>
              <tr><td>${zoneJ(j)} mean</td><td class="num-cell">${fmt(moyenneMaroc(j), 3)} ${esc(j.unite)}</td></tr>
              <tr><td>Regression p</td><td class="num-cell">${fmt(t.p_reg, 3)}</td></tr>
              <tr><td>Mann-Kendall p (corrected)</td><td class="num-cell">${fmt(t.mk_hr_p, 3)}</td></tr>
              <tr><td>Sen's slope</td><td class="num-cell">${fmt(t.sen ?? NaN, 3)} ${esc(j.unite)}/decade</td></tr></table>`
          : j && sc ? `<div class="kpi">${fmt(sc.moy, 1)} <small>${esc(j.unite)}</small></div><p class="muted small">Mean over ${sc.n} Moroccan grid cells on ${esc(j.meta.premier_jour)} — min ${fmt(sc.min, 0)}, max ${fmt(sc.max, 0)}.</p>${badge("obs")}`
          : vide("No numbers yet", imgs.length ? "Image products are available below." : "This variable is waiting for processed data.")}
        </div>
      </section>

      <section class="section story" style="--c:${v.couleur}">
        <div class="card"><div class="num">01</div><h3>What do we observe?</h3><p>${observe}</p></div>
        <div class="card"><div class="num">02</div><h3>Why does it matter?</h3><p>${v.pourquoi}</p></div>
        <div class="card"><div class="num">03</div><h3>What does the science tell us?</h3><p>${v.science}</p></div>
      </section>

      <section class="section card" style="--c:${v.couleur}">
        <div class="section-head"><div><div class="eyebrow">Understand</div><h2>What is ${v.nom.toLowerCase()}?</h2></div>${badge("concept")}</div>
        <p>${v.definition}</p>
        ${W.chaine(v)}
        <div id="widget" style="margin-top:1.4rem"></div>
      </section>

      <section class="section" id="donnees">
        <div class="section-head"><div><div class="eyebrow">Observe</div><h2>Data explorer</h2></div></div>
        ${j ? blocsDonnees(j) : ""}
        ${imgs.length ? `<div class="card" style="margin-top:1rem">${plotHead("Team results and image products", badge("img"))}
            <p class="muted small">Figures as produced by the team from the project resources. Each one is labelled: <i>satellite observation</i>, <i>model-derived</i> (MERRA-2 reanalysis) or <i>team analysis figure</i> when the source dataset is not stated. Values are not re-extracted from images. Open one to enlarge.</p>
            <div class="gallery">${imgs.map((im, i) => figure(im, id, i)).join("")}</div></div>` : ""}
        ${!j && !imgs.length ? vide("No data loaded for this variable", `Add <span class="mono">site/data/${v.fichier}</span> (same format as the other variables) or images in the resources folder, then run <span class="mono">tools/build_site_data.py</span>. See <a href="#/methodology">Methodology &amp; Data</a>.`) : ""}
      </section>

      <section class="section grid g2">
        <div class="card"><h3>What the results reveal</h3><ul class="list-tight">${revele(j, v, imgs).map((x) => `<li>${x}</li>`).join("")}</ul></div>
        <div class="card"><h3>What they cannot establish</h3><ul class="list-tight">${[...v.limites,
          "A statistical trend describes a change over the observed period; it does not identify its cause.",
          "Values describe grid-cell averages, not conditions at a precise street or station."].map((x) => `<li>${x}</li>`).join("")}</ul></div>
      </section>`;

    const stop = W.monter($("#widget"), v);
    if (stop) nettoyages.push(stop);
    if (j) monterDonnees(j);
    attacherGalerie(vue());
  }

  function revele(j, v, imgs) {
    const out = [];
    if (j && j.type === "serie") {
      const t = tendance(j), st = CH.statsCellules(j), n = j.niveaux[j.niveauDefaut];
      out.push(`Direction over ${periode(j)}: ${t.pente >= 0 ? "increase" : "decrease"} of ${fmt(Math.abs(t.pente), 3)} ${esc(j.unite)} per decade — ${significatif(t) ? "<b>significant</b> by both tests" : "<b>not significant</b> (cannot be distinguished from natural variability)"}.`);
      if (n.tendance_pre && j.finPre) out.push(`Before the break (${j.etiq[0].slice(0, 4)}–${j.finPre}): ${n.tendance_pre.pente >= 0 ? "+" : ""}${fmt(n.tendance_pre.pente, 3)} ${esc(j.unite)}/decade (p = ${fmt(n.tendance_pre.p_reg, 3)}). Comparing both periods shows how much recent semesters weigh on the trend.`);
      if (st) out.push(`Inside Morocco, ${Math.round(100 * st.plusSig / st.total)} % of grid cells show a significant increase and ${Math.round(100 * st.moinsSig / st.total)} % a significant decrease; local trends range from ${fmt(st.min, 3)} to ${fmt(st.max, 3)} ${esc(j.unite)}/decade.`);
      const s = j.meta.z_seuil || 1.5, hauts = j.etiq.filter((_, i) => n.z[i] >= s), bas = j.etiq.filter((_, i) => n.z[i] <= -s);
      out.push(`Exceptional semesters (|z| ≥ ${s}): ${hauts.length ? "high " + hauts.join(", ") : "no high"}; ${bas.length ? "low " + bas.join(", ") : "no low"}.`);
    } else if (j) {
      const sc = statsCarteMaroc(j);
      if (sc) out.push(`On ${esc(j.meta.premier_jour)}, a north–south contrast of ${fmt(sc.max - sc.min, 0)} ${esc(j.unite)} across Morocco.`);
      out.push("With a single date, only the spatial pattern can be described; adding the daily files of the resources folder turns this into a trend analysis.");
    }
    if (imgs.length) out.push(`${imgs.length} image products document the spatial patterns of ${v.nom.toLowerCase()} in the resources.`);
    if (!out.length) out.push("Nothing yet — this explorer is ready for data.");
    return out;
  }

  function blocsDonnees(j) {
    const n0 = j.niveaux[j.niveauDefaut], c = n0.carte || {};
    const optNiveaux = j.niveaux.length > 1 ? `<label class="small muted">Level <select data-ctl="niveau">${j.niveaux.map((n, i) => `<option value="${i}" ${i === j.niveauDefaut ? "selected" : ""}>${n.plev} hPa</option>`).join("")}</select></label>` : "";
    const typeCarte = j.type === "serie" ? badge("proc") : badge("obs");
    const aCarte = j.niveaux.some((n) => n.carte && (n.carte.moyenne || n.carte.pente));
    let h = `<div class="grid g2">` + (!aCarte ? "" : `
      <div class="card">${plotHead("Map — Morocco and surroundings", typeCarte,
        `${optNiveaux}${c.moyenne ? `<button class="chip" data-mode="moyenne" aria-pressed="true">Mean</button>` : ""}${c.pente ? `<button class="chip" data-mode="pente" ${c.moyenne ? "" : 'aria-pressed="true"'}>Trend</button>` : ""}
         ${c.pente_pre ? `<button class="chip" data-per="pre">Until ${j.finPre}</button>` : ""}<button class="btn small" data-dl="carte">CSV</button>`)}
        <div id="p-carte" class="plot tall"></div>
        <p class="plot-note">White line: Morocco's borders used for the averages${j.meta.boite ? " (for this coarse grid the average uses the box " + j.meta.boite.lat.join("–") + "°N, " + j.meta.boite.lon.join("–") + "°E)" : ""}. Dots on the trend map: significant cells (p &lt; ${j.meta.alpha || 0.05}). Hover a city for the nearest grid-cell value.${j.meta.carte_texte ? " " + esc(j.meta.carte_texte) : ""}</p></div>`);
    if (j.type === "serie") {
      h += `<div class="card">${plotHead("Time series — one point every 6 months", badge("proc"),
        `<button class="chip" data-vue="anomalie" aria-pressed="true">Anomaly</button><button class="chip" data-vue="valeur">Values</button>
         <select data-ctl="filtre" aria-label="Semesters"><option value="tous">S1 + S2</option><option value="S1">S1 only</option><option value="S2">S2 only</option></select>
         <button class="btn small" data-dl="serie">CSV</button>`)}
        <div id="p-serie" class="plot tall"></div>
        <p class="plot-note">Anomaly = semester value minus the mean of the same semester type (S1 or S2). Use the slider below the chart to zoom into a period.</p></div>
      </div><div class="grid g2" style="margin-top:1.1rem">
      <div class="card">${plotHead("Anomaly detection", badge("proc"), `<button class="btn small" data-dl="serie">CSV</button>`)}
        <div id="p-anom" class="plot"></div><p class="plot-note">Red: exceptionally high (z ≥ ${j.meta.z_seuil || 1.5}); blue: exceptionally low.</p></div>`;
      if (j.profils.length) h += `<div class="card">${plotHead("Vertical profile of trends", badge("proc"), `<button class="btn small" data-dl="profil">CSV</button>`)}<div id="p-profil" class="plot"></div><p class="plot-note">Big red markers: significant at that pressure level. Lower pressure = higher altitude.</p></div>`;
      else if (j.cycle) h += `<div class="card">${plotHead("Seasonal cycle — Morocco", badge("proc"), `<button class="btn small" data-dl="cycle">CSV</button>`)}<div id="p-cycle" class="plot"></div><p class="plot-note">Monthly mean over all years; error bars = variability between years. Green: S1 months, violet: S2 months.</p></div>`;
      h += `</div>`;
    } else {
      h += `<div class="card">${plotHead("Global view", badge("obs"))}<div id="p-globale" class="plot tall"></div>
        <p class="plot-note">Same colour scale as the NASA OMI images (100–500 DU). White cells: no data (e.g. polar night).</p></div></div>`;
    }
    if (j.quotidien && j.quotidien.valeurs.length > 1) h += `<div class="card" style="margin-top:1.1rem">${plotHead("Daily Morocco average", badge("obs", "Real observations, area-weighted"), `<button class="btn small" data-dl="quotidien">CSV</button>`)}<div id="p-quot" class="plot"></div></div>`;
    if (j.type === "serie" && j.globale) h += `<div class="card" style="margin-top:1.1rem">${plotHead("Global view — multi-year mean", badge("obs"))}<div id="p-globale" class="plot tall"></div></div>`;
    return h;
  }

  function monterDonnees(j) {
    const etat = { niveau: j.niveauDefaut, mode: j.niveaux[j.niveauDefaut].carte?.moyenne ? "moyenne" : "pente", periode: "complete", vue: "anomalie", filtre: "tous" };
    const carte = () => CH.carteRegion($("#p-carte"), j, { niveau: etat.niveau, mode: etat.mode, periode: etat.periode });
    const serie = () => $("#p-serie") && CH.serie($("#p-serie"), j, { niveau: etat.niveau, vue: etat.vue, filtre: etat.filtre });
    const anom = () => $("#p-anom") && CH.anomaliesZ($("#p-anom"), j, { niveau: etat.niveau });
    carte(); serie(); anom();
    $("#p-profil") && CH.profil($("#p-profil"), j);
    $("#p-cycle") && CH.cycle($("#p-cycle"), j);
    $("#p-quot") && CH.quotidien($("#p-quot"), j);
    $("#p-globale") && CH.carteGlobale($("#p-globale"), j, "moyenne");
    const presser = (sel, b) => { $$(sel, vue()).forEach((x) => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true"); };
    $$("[data-mode]", vue()).forEach((b) => b.addEventListener("click", () => { etat.mode = b.dataset.mode; if (etat.mode === "moyenne") etat.periode = "complete"; presser("[data-mode]", b); $$("[data-per]").forEach((x) => x.setAttribute("aria-pressed", "false")); carte(); }));
    $$("[data-per]", vue()).forEach((b) => b.addEventListener("click", () => {
      const on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", String(on));
      etat.periode = on ? "pre" : "complete"; etat.mode = "pente"; presser("[data-mode]", $('[data-mode="pente"]')); carte();
    }));
    $$("[data-vue]", vue()).forEach((b) => b.addEventListener("click", () => { etat.vue = b.dataset.vue; presser("[data-vue]", b); serie(); }));
    const f = $('[data-ctl="filtre"]'); f && f.addEventListener("change", () => { etat.filtre = f.value; serie(); });
    const nv = $('[data-ctl="niveau"]'); nv && nv.addEventListener("change", () => { etat.niveau = +nv.value; carte(); serie(); anom(); });
    $$("[data-dl]", vue()).forEach((b) => b.addEventListener("click", () => EXPORT[b.dataset.dl](j, etat.niveau)));
  }

  function lightbox(im, v) {
    const lb = $("#lightbox");
    $("img", lb).src = im.src; $("img", lb).alt = `${v.nom} – ${im.titre}`;
    $("figcaption", lb).textContent = `${v.nom} · ${im.titre}${im.explication ? " — " + im.explication : ""} · ${im.type === "model" ? "Model-derived estimate" : im.type === "obs" ? "Satellite observation" : "Team analysis figure"} · ${im.source || ""} · file: ${im.origine}`;
    lb.hidden = false; $(".lightbox-close", lb).focus();
  }

  // ================================================================= MAROC
  function vueMaroc(sous) {
    const J = avecCarte(), S = seriesMaroc(), T = series();
    vue().innerHTML = `
      <div class="section-head"><div><div class="eyebrow">Regional window</div><h1>Morocco Atmospheric Analysis</h1>
        <p class="lead">Morocco as an interactive laboratory: from the Atlantic coast and the Mediterranean to the Atlas Mountains, the inland plateaus and the Saharan territories.</p></div></div>

      ${J.length ? `
      <section class="grid" style="grid-template-columns:1.6fr 1fr">
        <div class="card">${plotHead("Interactive map of Morocco", "",
          `<select data-ctl="var" aria-label="Variable">${J.map((j) => `<option value="${j.id}">${CH.nomVar(j.id)}</option>`).join("")}</select>
           <button class="chip" data-mode="moyenne" aria-pressed="true">Mean</button><button class="chip" data-mode="pente">Trend</button>`)}
          <div id="m-carte" class="plot tall"></div><p class="plot-note" id="m-note"></p></div>
        <div class="card"><h3>Values at Moroccan cities</h3><p class="muted small">Nearest grid cell — its size is shown below; a cell can cover tens of kilometres.</p>
          <div class="table-wrap"><table id="m-villes"></table></div></div>
      </section>
      <section class="section card"><div class="section-head"><div><div class="eyebrow">Geographical comparison</div><h2>North, centre and south</h2></div><span id="m-zbadge"></span></div>
        <p class="muted small">Zones defined by latitude inside Morocco's borders: North ≥ 33°N (Mediterranean, Rif, Atlantic plains), Centre 29–33°N (Atlas, Souss, eastern plateaus), South &lt; 29°N (Saharan territories). Averages of grid cells in each zone.</p>
        <div class="grid g2"><div class="table-wrap"><table id="m-zones"></table></div><div id="m-zplot" class="plot short"></div></div></section>`
      : vide("No map data loaded yet", "Run the notebooks or tools/build_site_data.py to add data for Morocco.")}

      <section class="section card">
        <div class="section-head"><div><div class="eyebrow">Morocco Atmospheric Evolution Dashboard</div><h2>All variables at a glance</h2></div></div>
        ${S.length ? `<div class="table-wrap"><table><thead><tr><th>Variable</th><th>Period</th><th>Morocco mean</th><th>Trend / decade</th><th>% of mean / decade</th><th>95 % CI</th><th>p (regression)</th><th>p (MK corrected)</th><th>Verdict</th></tr></thead><tbody>
          ${S.map((j) => { const t = tendance(j), m = moyenneMaroc(j); return `<tr><td><a href="#/variable/${j.id}">${CH.nomVar(j.id)}</a>${j.niveaux.length > 1 ? ` <span class="muted small">${j.niveaux[j.niveauDefaut].plev} hPa</span>` : ""}</td><td class="num-cell">${periode(j)}</td>
            <td class="num-cell">${fmt(m, 3)} ${esc(j.unite)}</td><td class="num-cell">${t.pente >= 0 ? "+" : ""}${fmt(t.pente, 3)}</td><td class="num-cell">${fmt(t.pente / m * 100, 1)} %</td>
            <td class="num-cell">[${fmt(t.ic_bas, 3)} ; ${fmt(t.ic_haut, 3)}]</td><td class="num-cell">${fmt(t.p_reg, 3)}</td><td class="num-cell">${fmt(t.mk_hr_p, 3)}</td><td>${verdict(t, j)}</td></tr>`; }).join("")}
          </tbody></table></div>
          <h3 style="margin-top:1.4rem">Every substance — what the data show over Morocco</h3>
          <div class="table-wrap"><table><thead><tr><th>Substance</th><th>Source</th><th>Over Morocco</th><th>Context</th></tr></thead><tbody>${CATALOGUE.variables.map(ligneMaroc).join("")}</tbody></table></div>
          <div style="margin-top:1rem">${plotHead("Semester evolution, 2004 → 2026 (one point every 6 months)", badge("proc"), `<select data-ctl="serie" aria-label="Variable">${T.map((j) => `<option value="${j.id}">${CH.nomVar(j.id)} — ${zoneJ(j)}</option>`).join("")}</select>
            <select data-ctl="filtre" aria-label="Semesters"><option value="tous">S1 + S2</option><option value="S1">S1 only</option><option value="S2">S2 only</option></select>`)}<div id="m-serie" class="plot"></div></div>`
        : `<p class="muted">No multi-year series loaded yet.</p>`}
      </section>

      <section class="section card" id="compare">
        <div class="section-head"><div><div class="eyebrow">Multi-variable comparison</div><h2>Do variables move together?</h2></div>${badge("proc")}</div>
        ${T.length >= 2 ? `<p class="small muted">Morocco series where they exist; world series (methane, vegetation) otherwise.</p><div class="grid g2"><div><div id="m-comp" class="plot"></div><p class="plot-note">Standardised anomalies (z-scores) put variables with different units on the same scale. Grey band: ±1.5 σ.</p></div>
          <div><div id="m-corr" class="plot"></div><p class="plot-note">Pearson correlation of semester z-scores over the common semesters (n). Shown only when n ≥ 8.</p></div></div>
          <div class="callout" style="margin-top:1rem"><b>Exploratory, not causal.</b> A correlation means two series vary together over these semesters. It can come from a common cause (season, circulation), from chance, or from a real physical link — the correlation alone cannot tell which.</div>`
        : `<p class="muted">At least two multi-year series are needed (currently ${T.length}).</p>`}
      </section>
      <section class="section card"><div class="section-head"><div><div class="eyebrow">All substances over Morocco</div><h2>The team's Morocco results for every substance</h2></div>${badge("img")}</div>
        <p class="muted small">Every substance of the project, seen over Morocco: maps and semester analyses produced by the team. Click a figure to enlarge it.</p>
        ${CATALOGUE.variables.map((v) => { const ims = (DATA.galerie[v.id] || []).filter((im) => im.zone === "Morocco");
          return ims.length ? `<h3 style="margin:1rem 0 .5rem"><a href="#/variable/${v.id}">${v.nom}</a></h3><div class="gallery">${ims.map((im) => figure(im, v.id, DATA.galerie[v.id].indexOf(im))).join("")}</div>` : ""; }).join("")}</section>
      <section class="section callout info">Want to know whether these changes are real trends? <a href="#/trends">Open Morocco Trend Detective →</a></section>`;

    if (J.length) {
      const etat = { id: J[0].id, mode: J[0].niveaux[J[0].niveauDefaut].carte.moyenne ? "moyenne" : "pente" };
      const maj = () => {
        const j = DATA.jeux[etat.id], n = j.niveaux[j.niveauDefaut], c = n.carte;
        if (etat.mode === "pente" && !c.pente) etat.mode = "moyenne";
        if (etat.mode === "moyenne" && !c.moyenne) etat.mode = "pente";
        $$("[data-mode]").forEach((b) => { b.setAttribute("aria-pressed", String(b.dataset.mode === etat.mode)); b.disabled = !c[b.dataset.mode]; });
        CH.carteRegion($("#m-carte"), j, { niveau: j.niveauDefaut, mode: etat.mode });
        $("#m-note").innerHTML = `${esc(CH.nomVar(j.id))} · ${esc(j.meta.produit || "")} · ${periode(j)} · grid ${resolution(j)} · ${j.type === "serie" ? "processed result" : "real observation"}`;
        const vals = c[etat.mode], u = etat.mode === "pente" ? `${j.unite}/decade` : j.unite;
        $("#m-villes").innerHTML = `<thead><tr><th>City</th><th>Value</th></tr></thead><tbody>${(GEO.villes || []).map((v) => {
          const x = valeurProche(j, vals, v.lat, v.lon);
          return `<tr><td>${esc(v.nom)}</td><td class="num-cell">${fmt(x, 3)} ${esc(u)}</td></tr>`; }).join("")}</tbody>`;
        zones(j, etat.mode);
      };
      $('[data-ctl="var"]').addEventListener("change", (e) => { etat.id = e.target.value; maj(); });
      $$("[data-mode]").forEach((b) => b.addEventListener("click", () => { etat.mode = b.dataset.mode; maj(); }));
      maj();
    }
    if (S.length) {
      const st = { id: T[0].id, filtre: "tous" };
      const tr = () => { const j = DATA.jeux[st.id]; CH.serie($("#m-serie"), j, { niveau: j.niveauDefaut, filtre: st.filtre }); };
      $('[data-ctl="serie"]').addEventListener("change", (e) => { st.id = e.target.value; tr(); });
      $$('[data-ctl="filtre"]').forEach((f) => f.addEventListener("change", (e) => { st.filtre = e.target.value; tr(); }));
      tr();
    }
    if (T.length >= 2) { CH.comparaisonZ($("#m-comp"), T); CH.matriceCorrelation($("#m-corr"), T); }
    if (sous === "compare") setTimeout(() => $("#compare").scrollIntoView({ behavior: "smooth" }), 300);
  }

  /** One row per substance: the best Morocco information available (numbers, map statistics or the team's Morocco figure). */
  function ligneMaroc(v) {
    const j = DATA.jeux[v.id], ims = (DATA.galerie[v.id] || []).filter((im) => im.zone === "Morocco");
    let src = "", maroc = "", ctx = "";
    if (j) src = esc(j.meta.produit || "");
    else if (ims[0]) src = esc(ims[0].source);
    if (j && j.type === "serie" && j.meta.zone !== "World") {
      const t = tendance(j); maroc = `${t.pente >= 0 ? "+" : ""}${fmt(t.pente, 3)} ${esc(j.unite)}/decade (${periode(j)}) ${verdict(t, j)}`;
    } else if (j && j.cube) {
      maroc = `Mean ${fmt(moyenneMaroc(j), 1)} ${esc(j.unite)} over ${periode(j)} — too short for a trend`;
    } else if (j) {
      const c = (j.niveaux[j.niveauDefaut] || {}).carte;
      if (c && c.pente) { const st = CH.statsCellules(j); if (st) maroc = `Trend map inside Morocco (${periode(j)}): ${Math.round(100 * st.plusSig / st.total)} % of cells with a significant increase, ${Math.round(100 * st.moinsSig / st.total)} % with a significant decrease`; }
    }
    if (!maroc && ims[0]) maroc = esc(ims[0].explication || ims[0].titre);
    if (j && j.type === "serie" && j.meta.zone === "World") { const t = tendance(j); ctx = `World: ${t.pente >= 0 ? "+" : ""}${fmt(t.pente, 3)} ${esc(j.unite)}/decade ${verdict(t, j)}`; }
    else { const w = (DATA.galerie[v.id] || []).find((im) => im.zone === "World"); if (w) ctx = esc(w.explication || w.titre); }
    return `<tr><td><a href="#/variable/${v.id}">${esc(v.nom)}</a></td><td class="small">${src}</td><td class="small">${maroc || "—"}</td><td class="small muted">${ctx || "—"}</td></tr>`;
  }

  function valeurProche(j, vals, lat, lon) {
    let bi = 0, bk = 0;
    j.lat.forEach((la, i) => { if (Math.abs(la - lat) < Math.abs(j.lat[bi] - lat)) bi = i; });
    j.lon.forEach((lo, k) => { if (Math.abs(lo - lon) < Math.abs(j.lon[bk] - lon)) bk = k; });
    const v = vals[bi * j.lon.length + bk];
    return v === null || v === undefined ? NaN : v;
  }

  function zones(j, mode) {
    const n = j.niveaux[j.niveauDefaut], c = n.carte, m = CH.masque(j, n), vals = c[mode];
    const Z = [["North (≥ 33°N)", (la) => la >= 33], ["Centre (29–33°N)", (la) => la >= 29 && la < 33], ["South (< 29°N)", (la) => la < 29]];
    const res = Z.map(([nom, f]) => {
      let s = 0, w = 0, k = 0, sig = 0;
      j.lat.forEach((la, i) => j.lon.forEach((_, q) => {
        const idx = i * j.lon.length + q, v = vals[idx];
        if (!m[idx] || !f(la) || v === null) return;
        const p = Math.cos(la * Math.PI / 180); s += v * p; w += p; k++; if (c.sig && c.sig[idx]) sig++;
      }));
      return { nom, v: w ? s / w : NaN, k, sig };
    });
    const u = mode === "pente" ? `${j.unite}/decade` : j.unite;
    $("#m-zones").innerHTML = `<thead><tr><th>Zone</th><th>${mode === "pente" ? "Mean trend" : "Mean"}</th><th>Cells</th>${mode === "pente" ? "<th>Significant cells</th>" : ""}</tr></thead><tbody>
      ${res.map((r) => `<tr><td>${r.nom}</td><td class="num-cell">${fmt(r.v, 3)} ${esc(u)}</td><td class="num-cell">${r.k}</td>${mode === "pente" ? `<td class="num-cell">${r.sig}</td>` : ""}</tr>`).join("")}</tbody>`;
    $("#m-zbadge").innerHTML = j.type === "serie" ? badge("proc") : badge("obs");
    Plotly.newPlot($("#m-zplot"), [{ type: "bar", x: res.map((r) => r.nom), y: res.map((r) => r.v), marker: { color: [CH.C.turq, CH.C.cyan, CH.C.amber] },
      hovertemplate: `%{x}<br>%{y:.4g} ${u}<extra></extra>` }],
      { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(255,255,255,.02)", font: { color: "#dbe8ff" }, margin: { l: 60, r: 10, t: 10, b: 40 },
        yaxis: { title: { text: u }, gridcolor: "rgba(160,190,255,.1)" } }, { responsive: true, displaylogo: false });
  }

  // ================================================================= TREND DETECTIVE
  function vueTrends(varInit) {
    const S = series();
    vue().innerHTML = `
      <div class="section-head"><div><div class="eyebrow">NASA Space Apps Challenge · Be An Earth System Trend Detective</div><h1>Trend Detective</h1>
        <p class="lead">Does a variable increase, decrease or stay stable? Is the change the same everywhere? A good detective checks the evidence before concluding.</p></div></div>
      ${workflow("analyze")}
      <section class="section" id="enquete"></section>
      <section class="grid g2">
        <div class="card"><h3>The detective's checklist</h3><ul class="detective-check">
          <li><b>Coverage:</b> how many years and semesters? Short records give uncertain trends.</li>
          <li><b>Resolution:</b> how large is a grid cell? Can it resolve the region I am asking about?</li>
          <li><b>Variability:</b> is the trend larger than the year-to-year noise? Look at the confidence interval.</li>
          <li><b>Significance:</b> do both the regression and the Mann-Kendall test agree (p &lt; 0.05)?</li>
          <li><b>Geography:</b> do all places change the same way, or do some regions show opposite trends?</li>
          <li><b>Context:</b> could an event (eruption, drought, instrument change) explain part of the signal?</li></ul></div>
        <div class="card"><h3>How the verdict is decided</h3>
          <p>Values are averaged every 6 months (S1 = Jan–Jun, S2 = Jul–Dec). Each semester is compared with the same semester type to remove the seasonal cycle. A straight line is fitted to these anomalies; its slope is the <b>trend per decade</b>.</p>
          <p>The trend is called <span class="badge badge-up">▲ Increasing</span> / <span class="badge badge-down">▼ Decreasing</span> only when the linear regression (corrected for autocorrelation) <i>and</i> the corrected Mann-Kendall test both give p &lt; 0.05. <span class="badge badge-flat">No significant trend</span> means neither test does — “not proven”, not “no change”. <span class="badge badge-concept">Inconclusive</span> means the two tests disagree. <span class="badge badge-wait">Insufficient data</span> means fewer than 10 semesters or less than 5 years: no test is run.</p></div>
      </section>

      <section class="section"><div class="section-head"><div><div class="eyebrow">Verdicts</div><h2>Case files — every substance with semester data</h2></div></div>
        ${series().length ? `<div class="grid cards">${series().map(carteResultat).join("")}</div>` : vide("No case files yet", "Multi-year series from the notebooks or the data builder will appear here.")}
        ${["no2", "snow"].filter((id) => !DATA.jeux[id]).length ? `<p class="muted small" style="margin-top:.8rem">${["no2", "snow"].filter((id) => !DATA.jeux[id]).map((id) => CH.nomVar(id)).join(" and ")}: the team's semester analyses exist as figures only (see their variable pages); no verdict is computed from images.</p>` : ""}
      </section>

      ${S.length ? `
      <section class="section card"><div class="section-head"><div><div class="eyebrow">Spatial heterogeneity</div><h2>Same variable, different places</h2></div>${badge("proc")}</div>
        <div id="t-rep" class="plot short"></div><div id="t-rep-txt" class="plot-note"></div></section>
      <section class="section grid g2">
        <div class="card">${plotHead("Trend map", badge("proc"), `<select data-ctl="tvar" aria-label="Variable">${S.filter((j) => j.niveaux[j.niveauDefaut].carte?.pente).map((j) => `<option value="${j.id}">${CH.nomVar(j.id)}</option>`).join("")}</select>`)}
          <div id="t-carte" class="plot tall"></div><p class="plot-note">Red = increase, blue (or brown for water variables) = decrease; dots = significant cells.</p></div>
        <div class="card">${plotHead("Anomaly investigation", badge("proc"), `<select data-ctl="avar" aria-label="Variable">${S.map((j) => `<option value="${j.id}">${CH.nomVar(j.id)}</option>`).join("")}</select>`)}
          <div id="t-anom" class="plot tall"></div><div id="t-anom-txt" class="plot-note"></div></div>
      </section>` : ""}
      <section class="section callout">Interpretation requires care: a trend computed over ~20 years can be influenced by a few extreme semesters at the start or end of the record, by changes in the satellite instruments, or by the size of the grid cells. Different locations may show opposite trends even for the same variable.</section>`;
    VUES.enquete($("#enquete"), varInit);
    if (!S.length) return;
    CH.repartition($("#t-rep"), S);
    $("#t-rep-txt").innerHTML = S.map((j) => { const s = CH.statsCellules(j); return s ? `<b>${CH.nomVar(j.id)}</b>: local trends from ${fmt(s.min, 3)} to ${fmt(s.max, 3)} ${esc(j.unite)}/decade over ${s.total} cells${s.min < 0 && s.max > 0 ? " — <i>opposite signs coexist inside Morocco</i>" : ""}.` : ""; }).filter(Boolean).join("<br>");
    const tv = $('[data-ctl="tvar"]'), av = $('[data-ctl="avar"]');
    const carte = () => { const j = DATA.jeux[tv.value]; j && CH.carteRegion($("#t-carte"), j, { niveau: j.niveauDefaut, mode: "pente" }); };
    const anom = () => {
      const j = DATA.jeux[av.value], n = j.niveaux[j.niveauDefaut], s = j.meta.z_seuil || 1.5;
      CH.anomaliesZ($("#t-anom"), j, { niveau: j.niveauDefaut });
      const ex = j.etiq.map((e, i) => [e, n.z[i]]).filter(([, z]) => Math.abs(z) >= s);
      $("#t-anom-txt").innerHTML = ex.length ? `Exceptional semesters: ${ex.map(([e, z]) => `<b style="color:${z > 0 ? "#ff8a95" : "#8db6ff"}">${e}</b> (z = ${z.toFixed(2)})`).join(", ")}.` : "No exceptional semester at this threshold.";
    };
    tv && tv.options.length && (tv.addEventListener("change", carte), carte());
    av.addEventListener("change", anom); anom();
  }

  // ================================================================= MÉTHODOLOGIE
  function vueMethodo(ancre) {
    const lignes = CATALOGUE.variables.map((v) => {
      const j = DATA.jeux[v.id], im = (DATA.galerie[v.id] || []).length;
      return `<tr><td><a href="#/variable/${v.id}">${v.nom}</a></td><td>${j ? esc(j.meta.produit || "") + (j.meta.version ? " v" + esc(j.meta.version) : "") : im ? "Image products (resources folder)" : "—"}</td>
        <td class="num-cell">${j ? periode(j) : "—"}</td><td class="num-cell">${j ? resolution(j) : "—"}</td><td>${esc(j ? j.unite : v.unite)}</td>
        <td>${badgeStatut(v.id)}</td><td class="mono small">data/${v.fichier}</td>
        <td>${j && j.type === "serie" ? `<button class="btn small" data-csv="${v.id}">Semesters CSV</button>` : j ? `<button class="btn small" data-csvmap="${v.id}">Map CSV</button>` : ""}</td></tr>`;
    }).join("");
    vue().innerHTML = `
      <div class="section-head"><div><div class="eyebrow">Transparency</div><h1>Methodology &amp; Data</h1>
        <p class="lead">Where every number comes from, how it was processed, and what it cannot tell.</p></div></div>
      <section class="card"><h3>Data sources</h3><p class="small">The site uses only the files given by the team; each source is named as it is (no dataset is attributed to an instrument it does not come from). Full list with files: <a href="#/about">About → All the datasets</a>.</p>
        <div class="table-wrap"><table><thead><tr><th>Variable</th><th>Source</th><th>Kind</th><th>On this site</th></tr></thead><tbody>
        ${CATALOGUE.datasets.map((d) => `<tr><td><a href="#/variable/${d.id}">${esc(d.nom)}</a></td><td class="small">${esc(d.source)}</td><td class="small">${esc(d.type)}</td><td class="small">${esc(d.site)}</td></tr>`).join("")}</tbody></table></div>
        <p class="small muted">Time scale for every analysis: one value every 6 months (S1 = January–June, S2 = July–December), 2004 → 2026; only complete semesters enter the trends. Not yet available (no data received, so not shown): ${CATALOGUE.enAttente.map((d) => esc(d.nom)).join(", ")}.</p></section>
      <section class="card"><h3>How to read the labels</h3><div class="chips">${badge("obs")} <span class="small muted">values read directly from a satellite product (one day, or daily averages).</span></div>
        <div class="chips" style="margin-top:.4rem">${badge("proc")} <span class="small muted">statistics computed from NASA data (semester means, anomalies, trends).</span></div>
        <div class="chips" style="margin-top:.4rem">${badge("concept")} <span class="small muted">illustrations and simulations to explain a concept — never observations.</span></div>
        <div class="chips" style="margin-top:.4rem">${badge("img")} <span class="small muted">images from the project resources, shown as produced.</span></div></section>

      <section class="section card"><h2>Datasets</h2><div class="table-wrap"><table><thead><tr><th>Variable</th><th>Product</th><th>Period</th><th>Grid</th><th>Unit</th><th>Status</th><th>Site file</th><th>Download</th></tr></thead><tbody>${lignes}</tbody></table></div>
        <p class="muted small" style="margin-top:.8rem">All processed data, scripts and figures: <a href="https://drive.google.com/drive/u/1/folders/1NqFjRBhkjbjTr3gJFQz927s9xHRP3Dm5" target="_blank" rel="noopener">project resources folder</a>.</p></section>

      <section class="section grid g2">
        <div class="card"><h2>Processing</h2><ol class="list-tight">
          <li><b>Water vapour (Aura MLS Level-3, monthly)</b>: team Colab notebook → semester means for the Morocco box and the world at every pressure level, trend map and vertical profile (CSV files).</li>
          <li><b>Aerosol optical thickness (MERRA-2 M2TMNXAER v5.12.4, TOTEXTTAU 550 nm)</b>: one time-averaged map per semester downloaded by the team from NASA Giovanni (NetCDF, 0.5° × 0.625°). The site averages the cells inside Morocco and the whole world, and computes a trend in every cell.</li>
          <li><b>Vegetation (Terra MODIS MOD13C2 v061 NDVI, monthly 0.05°)</b>: team notebook → world semester series and trend map (CSV, values divided by 10⁸ on this site).</li>
          <li><b>Methane</b>: semester statistics table of the team (values copied from the table into a CSV).</li>
          <li><b>Ozone (Aura OMI TO3 daily 1° text grids)</b> is processed by <span class="mono">tools/build_site_data.py</span>: daily area-weighted Morocco mean (days with at least half of the cells valid), monthly cell means (at least 5 valid days).</li>
          <li>Morocco averages use the grid cells whose centre lies inside Morocco's borders (Natural Earth, with the southern provinces), weighted by cos(latitude). MLS water vapour uses a box (24–38°N, 16°W–0°) because its grid is too coarse.</li>
          <li><b>NO₂ (Aura OMI) and snowmelt</b>: semester analyses delivered as figures by the team; they are shown with an explanation and are not re-measured from the images.</li>
          <li>All 44 team figures are renamed by substance and labelled (satellite observation / model-derived / team figure).</li></ol></div>
        <div class="card"><h2>Statistics</h2><ul class="list-tight">
          <li>Time scale: one value every 6 months, from 2004 to 2026 (S1 = Jan–Jun, S2 = Jul–Dec). Only complete semesters (6 months; 7 for the AOT periods that start in June) enter a trend.</li>
          <li>Anomaly and z-score against semesters of the same type; exceptional when |z| ≥ 1.5.</li>
          <li>Trend: least-squares slope per decade on anomalies; 95 % confidence interval and p-value with an effective sample size corrected for lag-1 autocorrelation.</li>
          <li>Mann-Kendall test (original and Hamed–Rao corrected) and Sen's slope.</li>
          <li>Significant only when regression p and corrected Mann-Kendall p are both &lt; 0.05.</li>
          <li>Comparison period: H₂O until 2021 (before the Hunga Tonga eruption).</li>
          <li>Check: the site reproduces the team's water-vapour result exactly (+0.209 ppmv per decade over Morocco at 100 hPa).</li></ul></div>
      </section>

      <section class="section grid g2">
        <div class="card"><h2>Limitations</h2><ul class="list-tight">
          <li>Satellite columns (O₃, NO₂, HCHO, CH₄, AOT) are not ground-level concentrations.</li>
          <li>MLS water vapour has only a few grid cells over Morocco; results describe the wider region.</li>
          <li>AOT values come from MERRA-2, a reanalysis (model constrained by observations): model-derived estimates.</li>
          <li>Ozone: only October–December 2004 is loaded; the full OMI record must be processed locally.</li>
          <li>A single day shows a spatial pattern, not a trend.</li>
          <li>About 20 years of data is short for climate trends; a significant trend does not identify its cause.</li></ul></div>
        <div class="card"><h2>Update the data</h2><ol class="list-tight">
          <li>Team results: <span class="mono">python tools/build_team_data.py &lt;figures&gt; &lt;DOSSIER NASA&gt; &lt;AOT Giovanni files&gt;</span>.</li>
          <li>Full OMI ozone record: <span class="mono">python tools/build_site_data.py &lt;OMI_Data&gt;</span>.</li>
          <li>Open <span class="mono">site/index.html</span>. New variables appear automatically when <span class="mono">site/data/donnees_&lt;id&gt;.js</span> exists.</li></ol></div>
      </section>

      <section class="section card" id="glossaire"><h2>Glossary</h2><dl class="def-grid">
        ${CATALOGUE.glossaire.map(([t, d]) => `<dt id="glossary-${RECHERCHE.slug(t)}">${t}</dt><dd>${d}</dd>`).join("")}</dl></section>

      <section class="section card"><h2>References</h2><ul class="list-tight">
        <li>MERRA-2 tavgM_2d_aer_Nx (M2TMNXAER) v5.12.4, total aerosol extinction AOT 550 nm — via <a href="https://giovanni.gsfc.nasa.gov" target="_blank" rel="noopener">NASA Giovanni</a>, doi:10.5067/FH9A0MLJPC7N</li>
        <li>MODIS/Terra Vegetation Indices Monthly L3 Global 0.05° CMG (MOD13C2) v061 — <a href="https://lpdaac.usgs.gov/products/mod13c2v061/" target="_blank" rel="noopener">NASA LP DAAC</a>, doi:10.5067/MODIS/MOD13C2.061</li>
        <li>Aura MLS Level 3 monthly water vapour (ML3MBH2O V005) and OMI total ozone daily grids — <a href="https://disc.gsfc.nasa.gov" target="_blank" rel="noopener">NASA GES DISC</a></li>
        <li>Borders and coastlines — <a href="https://www.naturalearthdata.com" target="_blank" rel="noopener">Natural Earth</a> (public domain)</li>
        <li>Methane warming potential — IPCC Sixth Assessment Report (AR6), Working Group I, Chapter 7</li>
        <li>Charts — <a href="https://plotly.com/javascript/" target="_blank" rel="noopener">Plotly.js</a> (MIT licence)</li></ul></section>`;
    $$("[data-csv]", vue()).forEach((b) => b.addEventListener("click", () => { const j = DATA.jeux[b.dataset.csv]; EXPORT.serie(j, j.niveauDefaut); }));
    $$("[data-csvmap]", vue()).forEach((b) => b.addEventListener("click", () => { const j = DATA.jeux[b.dataset.csvmap]; EXPORT.carte(j, j.niveauDefaut); }));
    if (ancre) setTimeout(() => { const t = document.getElementById(ancre); if (t) { t.scrollIntoView({ behavior: "smooth", block: "center" }); t.style.color = "#fff"; t.nextElementSibling && (t.nextElementSibling.style.background = "rgba(55,226,255,.1)"); } }, 200);
  }

  // ================================================================= RECHERCHE / 404
  function vueRecherche(q) {
    const res = RECHERCHE.chercher(q);
    vue().innerHTML = `<div class="section-head"><div><div class="eyebrow">Search</div><h1>Results for “${esc(q)}”</h1>
      <p class="muted">${res.length} result(s)</p></div></div><div class="card search-results" style="position:static;max-height:none">${RECHERCHE.html(res, -1, 50)}</div>`;
  }
  function vueIntrouvable() { vue().innerHTML = vide("This page does not exist", `<a href="#/">Back to the DOOR</a>`); }

  // ================================================================= ROUTEUR
  function route() {
    nettoyages.forEach((f) => { try { f(); } catch (_) {} }); nettoyages = [];
    CH.purger(vue());
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const [a, b] = h.split("/");
    $$(".nav a").forEach((x) => x.classList.toggle("active", x.dataset.route === (a || "home") || (a === "variable" && x.dataset.route === "variables")));
    $("#nav").classList.remove("open"); $("#menu-toggle").setAttribute("aria-expanded", "false");
    let titre = "DOORAtmosphere";
    if (!a) vueAccueil();
    else if (a === "variables") { vueVariables(); titre = "Variables · DOORAtmosphere"; }
    else if (a === "variable") { vueVariable(b); titre = `${(VAR(b) || {}).nom || ""} · DOORAtmosphere`; }
    else if (a === "maroc") { vueMaroc(b); titre = "Morocco · DOORAtmosphere"; }
    else if (a === "trends") { vueTrends(b); titre = "Trend Detective · DOORAtmosphere"; }
    else if (a === "earth") { VUES.earth(); titre = "Earth Explorer · DOORAtmosphere"; }
    else if (a === "global") { VUES.global(); titre = "Global Comparison · DOORAtmosphere"; }
    else if (a === "about") { VUES.about(); titre = "About · DOORAtmosphere"; }
    else if (a === "methodology") { vueMethodo(b); titre = "Methodology & Data · DOORAtmosphere"; }
    else if (a === "search") { vueRecherche(h.slice(7)); titre = "Search · DOORAtmosphere"; }
    else vueIntrouvable();
    document.title = titre;
    if (!(a === "methodology" && b) && !(a === "maroc" && b)) window.scrollTo({ top: 0 });
    $("#vue").focus({ preventScroll: true });
  }

  // ================================================================= DÉMARRAGE
  async function demarrer() {
    THEME.init();
    $("#theme-toggle").addEventListener("click", () => THEME.basculer());
    INTRO.init();
    vue().innerHTML = `<div class="empty">${W.MASCOTTE}<p>Loading data…</p></div>`;
    await DATA.charger();
    RECHERCHE.construire(); RECHERCHE.attacher();
    $("#menu-toggle").addEventListener("click", () => { const o = $("#nav").classList.toggle("open"); $("#menu-toggle").setAttribute("aria-expanded", String(o)); });
    const lb = $("#lightbox");
    lb.addEventListener("click", (e) => { if (e.target === lb || e.target.closest(".lightbox-close")) lb.hidden = true; });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") lb.hidden = true; });
    addEventListener("hashchange", route);
    // re-trace les graphiques avec les couleurs du thème (sans perdre l'état des formulaires sur les pages simples)
    THEME.surChangement(() => route());
    route();
  }
  demarrer();
})();

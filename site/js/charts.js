/* =========================================================================
   Graphiques Plotly (cartes, séries, anomalies, profils, cycle, globe…)
   Toutes les valeurs tracées viennent des jeux chargés par loader.js
   ========================================================================= */
window.CH = (function () {
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const C = {};
  [["text", "--text"], ["muted", "--muted"], ["grid", "--plot-grid"], ["cyan", "--cyan"], ["turq", "--turq"], ["violet", "--violet"],
   ["red", "--red"], ["blue", "--blue"], ["amber", "--amber"], ["plot", "--plot-bg"], ["hover", "--hover-bg"]]
    .forEach(([k, v]) => Object.defineProperty(C, k, { get: () => css(v), enumerable: true }));
  const jour = () => document.documentElement.dataset.theme === "day";

  const ECHELLES = {
    jet: [[0, "#00007f"], [.125, "#0000ff"], [.375, "#00ffff"], [.625, "#ffff00"], [.875, "#ff0000"], [1, "#7f0000"]],
    brbg: [[0, "#543005"], [.1, "#8c510a"], [.2, "#bf812d"], [.3, "#dfc27d"], [.4, "#f6e8c3"], [.5, "#f5f5f5"],
           [.6, "#c7eae5"], [.7, "#80cdc1"], [.8, "#35978f"], [.9, "#01665e"], [1, "#003c30"]],
    rdbu: [[0, "#053061"], [.1, "#2166ac"], [.2, "#4393c3"], [.3, "#92c5de"], [.4, "#d1e5f0"], [.5, "#f7f7f7"],
           [.6, "#fddbc7"], [.7, "#f4a582"], [.8, "#d6604d"], [.9, "#b2182b"], [1, "#67001f"]],
  };
  const MOYENNE = { precipitation: "YlGnBu", hcho: "YlOrRd", ozone: ECHELLES.jet, h2o: "Blues", aot: "YlOrRd",
                    no2: "YlOrRd", methane: "Viridis", radiation: "Hot", wind: "Viridis", snow: "Blues", evaporation: "YlGnBu" };
  const TENDANCE = (id) => (id === "precipitation" || id === "evaporation" || id === "snow" || id === "vegetation" ? ECHELLES.brbg : ECHELLES.rdbu);

  function layout(extra = {}) {
    return Object.assign({
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: C.plot,
      font: { family: "IBM Plex Sans, Segoe UI, system-ui, sans-serif", color: C.text, size: 12 },
      margin: { l: 60, r: 20, t: 20, b: 50 }, hoverlabel: { bgcolor: C.hover, bordercolor: C.cyan, font: { color: C.text } },
      legend: { orientation: "h", y: -0.18, bgcolor: "rgba(0,0,0,0)" },
      xaxis: { gridcolor: C.grid, zerolinecolor: C.grid, linecolor: C.grid },
      yaxis: { gridcolor: C.grid, zerolinecolor: jour() ? "rgba(0,0,0,.25)" : "rgba(255,255,255,.25)", linecolor: C.grid },
    }, extra);
  }
  const config = (nom) => ({ responsive: true, displaylogo: false, scrollZoom: false,
                             toImageButtonOptions: { filename: "DOORAtmosphere_" + nom, scale: 2 },
                             modeBarButtonsToRemove: ["lasso2d", "select2d"] });

  const fmt = (v, d = 2) => (Number.isFinite(v) ? (Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 100 ? v.toFixed(Math.min(d, 1)) : v.toFixed(d)) : "–");
  const nonNul = (a) => a.filter((v) => Number.isFinite(v));

  function grille(jeu, valeurs) {
    const nl = jeu.lat.length, nc = jeu.lon.length, z = [];
    for (let i = 0; i < nl; i++) z.push(valeurs.slice(i * nc, (i + 1) * nc).map((v) => (v === null ? NaN : v)));
    return z;
  }

  /** Masque Maroc d'un jeu : cellules au Maroc, sinon boîte (H2O), sinon tout. */
  function masque(jeu, niveau) {
    const n = jeu.lat.length * jeu.lon.length;
    const m = (niveau && niveau.carte && niveau.carte.au_maroc) || jeu.auMaroc;
    if (m && m.length === n) return m.map((x) => x === 1);
    const b = jeu.meta.boite;
    const out = [];
    for (let i = 0; i < jeu.lat.length; i++) for (let k = 0; k < jeu.lon.length; k++) {
      out.push(b ? jeu.lat[i] >= b.lat[0] && jeu.lat[i] <= b.lat[1] && jeu.lon[k] >= b.lon[0] && jeu.lon[k] <= b.lon[1] : true);
    }
    return out;
  }

  function tracesGeo(region = true) {
    const G = window.GEO || {};
    const t = [];
    if (region) {
      if (G.cotes_region) t.push({ type: "scatter", mode: "lines", x: G.cotes_region.lon, y: G.cotes_region.lat, hoverinfo: "skip",
                                   line: { color: "rgba(10,20,40,.85)", width: 1 }, showlegend: false });
      if (G.frontieres_region) t.push({ type: "scatter", mode: "lines", x: G.frontieres_region.lon, y: G.frontieres_region.lat,
                                        hoverinfo: "skip", line: { color: "rgba(10,20,40,.6)", width: .8, dash: "dot" }, showlegend: false });
      if (G.maroc_contour) t.push({ type: "scatter", mode: "lines", x: G.maroc_contour.lon, y: G.maroc_contour.lat, hoverinfo: "skip",
                                    line: { color: "#ffffff", width: 2.2 }, name: "Morocco (Natural Earth)", showlegend: false });
    } else if (G.cotes_monde) {
      t.push({ type: "scatter", mode: "lines", x: G.cotes_monde.lon, y: G.cotes_monde.lat, hoverinfo: "skip",
               line: { color: "rgba(5,10,25,.9)", width: .9 }, showlegend: false });
    }
    return t;
  }

  /** Valeur de la cellule la plus proche d'un point. */
  function valeurProche(jeu, valeurs, lat, lon) {
    let bi = 0, bk = 0, dmin = 1e9;
    jeu.lat.forEach((la, i) => { const d = Math.abs(la - lat); if (d < dmin) { dmin = d; bi = i; } });
    dmin = 1e9;
    jeu.lon.forEach((lo, k) => { const d = Math.abs(lo - lon); if (d < dmin) { dmin = d; bk = k; } });
    const v = valeurs[bi * jeu.lon.length + bk];
    return v === null ? NaN : v;
  }

  // ---------------------------------------------------------------------
  function carteRegion(el, jeu, { niveau = 0, mode = "moyenne", periode = "complete", villes = true, onclick = null } = {}) {
    const n = jeu.niveaux[niveau], c = n.carte || {};
    const cle = mode === "pente" ? (periode === "pre" ? "pente_pre" : "pente") : "moyenne";
    const vals = c[cle];
    if (!vals) return false;
    const z = grille(jeu, vals);
    const u = jeu.unite;
    const tr = [];
    let tr0;
    if (mode === "pente") {
      const lim = quantile(nonNul(vals.map(Math.abs)), 0.98) || 1;
      tr0 = { type: "heatmap", x: jeu.lon, y: jeu.lat, z, colorscale: TENDANCE(jeu.id), zmin: -lim, zmax: lim, zmid: 0,
              colorbar: { title: { text: `${u}/decade`, side: "right" }, thickness: 12, len: .9 },
              hovertemplate: `lat %{y:.2f}°, lon %{x:.2f}°<br>trend <b>%{z:.3g} ${u}/decade</b><extra></extra>` };
      tr.push(tr0);
      const sig = c[periode === "pre" ? "sig_pre" : "sig"] || [];
      const sx = [], sy = [];
      sig.forEach((s, idx) => { if (s) { sy.push(jeu.lat[Math.floor(idx / jeu.lon.length)]); sx.push(jeu.lon[idx % jeu.lon.length]); } });
      if (sx.length && sx.length < 60000) tr.push({ type: sx.length > 3000 ? "scattergl" : "scatter", mode: "markers", x: sx, y: sy,
        marker: { size: sx.length > 3000 ? 2 : 4, color: "rgba(0,0,0,.75)" }, name: "significant (p < 0.05)", hoverinfo: "skip" });
    } else {
      tr0 = { type: "heatmap", x: jeu.lon, y: jeu.lat, z, colorscale: MOYENNE[jeu.id] || "Viridis",
              colorbar: { title: { text: u, side: "right" }, thickness: 12, len: .9 },
              hovertemplate: `lat %{y:.2f}°, lon %{x:.2f}°<br><b>%{z:.4g} ${u}</b><extra></extra>` };
      tr.push(tr0);
    }
    tr.push(...tracesGeo(true));
    if (villes && window.GEO && GEO.villes) {
      const vv = GEO.villes.filter((v) => inRange(v, jeu));
      tr.push({ type: "scatter", mode: "markers+text", x: vv.map((v) => v.lon), y: vv.map((v) => v.lat), text: vv.map((v) => v.nom),
        textposition: "top center", textfont: { size: 10, color: "#ffffff" },
        marker: { size: 6, color: "#ffffff", line: { color: "#0b1636", width: 1.5 } },
        customdata: vv.map((v) => valeurProche(jeu, vals, v.lat, v.lon)),
        hovertemplate: `<b>%{text}</b><br>nearest grid cell: %{customdata:.4g} ${mode === "pente" ? u + "/decade" : u}<extra></extra>`,
        showlegend: false });
    }
    const e = jeu.meta.etendue || [d3min(jeu.lon), d3max(jeu.lon), d3min(jeu.lat), d3max(jeu.lat)];
    Plotly.newPlot(el, tr, layout({
      margin: { l: 45, r: 10, t: 10, b: 40 }, showlegend: mode === "pente",
      legend: { x: 0, y: 0, bgcolor: "rgba(4,8,23,.6)" },
      xaxis: { range: [e[0], e[1]], title: { text: "Longitude (°)" }, gridcolor: C.grid, constrain: "domain" },
      yaxis: { range: [e[2], e[3]], title: { text: "Latitude (°)" }, gridcolor: C.grid, scaleanchor: "x", scaleratio: 1, constrain: "domain" },
    }), config(`${jeu.id}_${cle}`));
    if (onclick) el.on("plotly_click", (e) => { const p = e.points && e.points.find((q) => q.data.type === "heatmap"); if (p) onclick(p.y, p.x, p.z); });
    return true;
  }
  function inRange(v, jeu) {
    const e = jeu.meta.etendue || [-180, 180, -90, 90];
    return v.lon >= e[0] && v.lon <= e[1] && v.lat >= e[2] && v.lat <= e[3];
  }
  const d3min = (a) => Math.min(...a), d3max = (a) => Math.max(...a);
  function quantile(a, q) { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; }

  // ---------------------------------------------------------------------
  function gglobale(jeu) {
    const g = jeu.globale; const lat = [], lon = [];
    for (let i = 0; i < g.nlat; i++) lat.push(g.lat0 + i * g.dlat);
    for (let k = 0; k < g.nlon; k++) lon.push(g.lon0 + k * g.dlon);
    return { g, lat, lon };
  }
  function carteGlobale(el, jeu, champ = "moyenne", onclick = null) {
    if (!jeu.globale || !jeu.globale[champ]) return false;
    const { g, lat, lon } = gglobale(jeu);
    const z = [];
    for (let i = 0; i < g.nlat; i++) z.push(g[champ].slice(i * g.nlon, (i + 1) * g.nlon).map((v) => (v === null ? NaN : v)));
    Plotly.newPlot(el, [
      { type: "heatmap", x: lon, y: lat, z, colorscale: ECHELLES.jet, zmin: 100, zmax: 500,
        colorbar: { title: { text: "DU", side: "right" }, thickness: 12 },
        hovertemplate: "lat %{y:.1f}°, lon %{x:.1f}°<br><b>%{z:.0f} DU</b><extra></extra>" },
      ...tracesGeo(false),
    ], layout({ margin: { l: 45, r: 10, t: 10, b: 40 }, showlegend: false,
      xaxis: { range: [-180, 180], dtick: 60, ticksuffix: "°", gridcolor: C.grid, constrain: "domain" },
      yaxis: { range: [-90, 90], dtick: 30, ticksuffix: "°", gridcolor: C.grid, scaleanchor: "x", scaleratio: 1, constrain: "domain" } }),
    config(`ozone_global_${champ}`));
    if (onclick) el.on("plotly_click", (e) => { const p = e.points && e.points.find((q) => q.data.type === "heatmap"); if (p) onclick(p.y, p.x, p.z); });
    return true;
  }

  // ---------------------------------------------------------------------
  let rotation = null;
  function globe(el, jeu, { champ: nomChamp = "moyenne", pas = 4, rotation: tourner = true, onclick = null } = {}) {
    const tr = [];
    if (jeu && jeu.globale && jeu.globale[nomChamp]) {
      const { g, lat, lon } = gglobale(jeu);
      const la = [], lo = [], v = [];
      const champ = g[nomChamp];
      for (let i = 1; i < g.nlat; i += pas) for (let k = 1; k < g.nlon; k += pas) {
        const x = champ[i * g.nlon + k];
        if (x !== null) { la.push(lat[i]); lo.push(lon[k]); v.push(x); }
      }
      tr.push({ type: "scattergeo", lat: la, lon: lo, mode: "markers",
        marker: { size: 6.5, color: v, colorscale: ECHELLES.jet, cmin: 100, cmax: 500, opacity: .85, line: { width: 0 } },
        hovertemplate: "%{lat:.0f}°, %{lon:.0f}°<br><b>%{marker.color:.0f} DU</b><extra>OMI total ozone</extra>" });
    }
    const G = window.GEO || {};
    if (G.maroc_contour) tr.push({ type: "scattergeo", mode: "lines", lon: G.maroc_contour.lon, lat: G.maroc_contour.lat,
      line: { color: "#ffffff", width: 2 }, hoverinfo: "skip" });
    tr.push({ type: "scattergeo", mode: "markers", lon: [-7.6], lat: [31.8], marker: { size: 9, color: C.turq, line: { color: "#fff", width: 1.5 } },
              hovertemplate: "<b>Morocco</b><extra></extra>" });
    let lonRot = -10;
    Plotly.newPlot(el, tr, {
      paper_bgcolor: "rgba(0,0,0,0)", margin: { l: 0, r: 0, t: 0, b: 0 }, showlegend: false, dragmode: "pan",
      geo: { projection: { type: "orthographic", rotation: { lon: lonRot, lat: 20 } }, bgcolor: "rgba(0,0,0,0)",
             showocean: true, oceancolor: jour() ? "#5aa0dc" : "#0a2a5c", showland: true, landcolor: jour() ? "#cfe3c0" : "#16345f", showcountries: true,
             countrycolor: jour() ? "rgba(30,60,90,.35)" : "rgba(160,200,255,.25)", coastlinecolor: jour() ? "rgba(20,50,80,.6)" : "rgba(160,220,255,.6)", showframe: false,
             lataxis: { showgrid: true, gridcolor: "rgba(55,226,255,.12)" }, lonaxis: { showgrid: true, gridcolor: "rgba(55,226,255,.12)" } },
      hoverlabel: { bgcolor: C.hover, bordercolor: C.cyan, font: { color: C.text } },
    }, { responsive: true, displayModeBar: false });
    let pause = false;
    el.on && el.on("plotly_relayouting", () => { pause = true; });
    el.addEventListener("pointerdown", () => { pause = true; });
    if (onclick) el.on("plotly_click", (e) => { const p = e.points && e.points[0]; if (p && Number.isFinite(p.lat)) onclick(p.lat, p.lon); });
    arreterGlobe();
    if (!tourner || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    rotation = setInterval(() => {
      if (pause || document.hidden || !document.body.contains(el)) return;
      lonRot = (lonRot + 0.6) % 360;
      Plotly.relayout(el, { "geo.projection.rotation.lon": lonRot > 180 ? lonRot - 360 : lonRot });
    }, 90);
  }
  function arreterGlobe() { if (rotation) clearInterval(rotation); rotation = null; }

  // ---------------------------------------------------------------------
  function ligneEvenement(jeu) {
    if (jeu.evenement === null || jeu.evenement === undefined || !jeu.dates[jeu.evenement]) return { shapes: [], annotations: [] };
    const d = new Date(jeu.dates[jeu.evenement]); d.setMonth(d.getMonth() - 3);
    const x = d.toISOString().slice(0, 10);
    return {
      shapes: [{ type: "line", x0: x, x1: x, yref: "paper", y0: 0, y1: 1, line: { color: C.amber, dash: "dash", width: 1.5 } }],
      annotations: jeu.nomCoupure ? [{ x, yref: "paper", y: 1, text: " " + jeu.nomCoupure, showarrow: false, xanchor: "left",
                                      yanchor: "top", font: { color: C.amber, size: 11 } }] : [],
    };
  }

  function serie(el, jeu, { niveau = 0, vue = "anomalie", filtre = "tous" } = {}) {
    const n = jeu.niveaux[niveau];
    const garde = jeu.etiq.map((e) => filtre === "tous" || e.endsWith(filtre));
    const pick = (a) => a.filter((_, i) => garde[i]);
    const x = pick(jeu.dates), etq = pick(jeu.etiq), u = jeu.unite;
    const tr = [];
    if (vue === "anomalie") {
      const an = pick(n.anomalie);
      tr.push({ type: "scatter", x: [...x, ...[...x].reverse()],
        y: [...pick(n.ic_haut_ligne), ...pick(n.ic_bas_ligne).reverse()], fill: "toself", fillcolor: "rgba(79,141,255,.18)",
        line: { width: 0 }, name: "95 % confidence interval of the trend", hoverinfo: "skip" });
      tr.push({ type: "bar", x, y: an, customdata: etq, name: "Semester anomaly",
        marker: { color: an.map((v) => (v >= 0 ? "rgba(255,93,108,.65)" : "rgba(79,141,255,.7)")) },
        hovertemplate: `<b>%{customdata}</b><br>anomaly %{y:.3g} ${u}<extra></extra>` });
      tr.push({ type: "scatter", x, y: pick(n.ligne), mode: "lines", line: { color: C.cyan, width: 3 },
        name: `Trend ${jeu.etiq[0].slice(0, 4)}–${jeu.etiq.at(-1).slice(0, 4)}`, hoverinfo: "skip" });
      if (n.ligne_pre && jeu.npre) {
        const xs = jeu.dates.slice(0, jeu.npre).filter((_, i) => garde[i]);
        const ys = n.ligne_pre.filter((_, i) => garde[i]);
        tr.push({ type: "scatter", x: xs, y: ys, mode: "lines", line: { color: C.amber, width: 2.5, dash: "dash" },
          name: `Trend ${jeu.etiq[0].slice(0, 4)}–${jeu.finPre}`, hoverinfo: "skip" });
      }
    } else {
      const m = pick(n.moyenne);
      ["S1", "S2"].forEach((s, k) => {
        const idx = etq.map((e, i) => (e.endsWith(s) ? i : -1)).filter((i) => i >= 0);
        if (!idx.length) return;
        tr.push({ type: "scatter", mode: "lines+markers", x: idx.map((i) => x[i]), y: idx.map((i) => m[i]),
          customdata: idx.map((i) => etq[i]), name: s === "S1" ? "S1 (Jan–Jun)" : "S2 (Jul–Dec)",
          line: { color: k ? C.violet : C.turq, width: 2 }, marker: { size: 6 },
          hovertemplate: `<b>%{customdata}</b><br>%{y:.4g} ${u}<extra></extra>` });
      });
    }
    const ev = ligneEvenement(jeu);
    Plotly.newPlot(el, tr, layout({
      barmode: "overlay", shapes: ev.shapes, annotations: ev.annotations,
      xaxis: { type: "date", gridcolor: C.grid, rangeslider: { visible: true, thickness: .07, bgcolor: "rgba(255,255,255,.03)" } },
      yaxis: { title: { text: vue === "anomalie" ? `Anomaly (${u})` : u }, gridcolor: C.grid, zerolinecolor: "rgba(255,255,255,.3)" },
      legend: { orientation: "h", y: -0.35 }, margin: { l: 65, r: 20, t: 20, b: 40 },
    }), config(`${jeu.id}_serie`));
  }

  function anomaliesZ(el, jeu, { niveau = 0 } = {}) {
    const n = jeu.niveaux[niveau], s = jeu.meta.z_seuil || 1.5;
    const col = n.z.map((z) => (z >= s ? C.red : z <= -s ? C.blue : "rgba(160,180,220,.45)"));
    Plotly.newPlot(el, [{ type: "bar", x: jeu.dates, y: n.z, customdata: jeu.etiq.map((e, i) => [e, n.anomalie[i]]),
      marker: { color: col }, hovertemplate: `<b>%{customdata[0]}</b><br>z = %{y:.2f}<br>anomaly %{customdata[1]:.3g} ${jeu.unite}<extra></extra>` }],
    layout({ showlegend: false, ...ligneEvenementZ(jeu, s),
      xaxis: { type: "date", gridcolor: C.grid }, yaxis: { title: { text: "z-score (σ)" }, gridcolor: C.grid } }),
    config(`${jeu.id}_anomalies`));
  }
  function ligneEvenementZ(jeu, s) {
    const ev = ligneEvenement(jeu);
    ev.shapes.push({ type: "line", xref: "paper", x0: 0, x1: 1, y0: s, y1: s, line: { color: C.red, dash: "dot", width: 1 } },
                   { type: "line", xref: "paper", x0: 0, x1: 1, y0: -s, y1: -s, line: { color: C.blue, dash: "dot", width: 1 } });
    return ev;
  }

  function profil(el, jeu) {
    if (!jeu.profils.length) return false;
    const groupes = {};
    jeu.profils.forEach((p) => { (groupes[p.periode] = groupes[p.periode] || []).push(p); });
    const couleurs = [C.cyan, C.amber];
    const tr = Object.entries(groupes).map(([per, ps], k) => ({
      type: "scatter", mode: "lines+markers", name: per, y: ps.map((p) => p.plev_hPa), x: ps.map((p) => p.pente_ppmv_par_decennie),
      error_x: { type: "data", symmetric: false, array: ps.map((p) => p.ic95_haut - p.pente_ppmv_par_decennie),
                 arrayminus: ps.map((p) => p.pente_ppmv_par_decennie - p.ic95_bas), color: couleurs[k % 2], thickness: 1 },
      line: { color: couleurs[k % 2], dash: k ? "dash" : "solid" },
      marker: { size: ps.map((p) => (p.significatif ? 10 : 6)), color: ps.map((p) => (p.significatif ? C.red : couleurs[k % 2])) },
      customdata: ps.map((p) => [p.pct_par_decennie, p.p_regression, p.significatif ? "significant" : "not significant"]),
      hovertemplate: "%{y} hPa<br><b>%{x:.3f} ppmv/decade</b> (%{customdata[0]:.1f} %/decade)<br>p = %{customdata[1]:.3f}, %{customdata[2]}<extra>%{fullData.name}</extra>",
    }));
    Plotly.newPlot(el, tr, layout({
      shapes: [{ type: "line", x0: 0, x1: 0, yref: "paper", y0: 0, y1: 1, line: { color: C.muted, width: 1 } }],
      xaxis: { title: { text: "Trend (ppmv per decade)" }, gridcolor: C.grid },
      yaxis: { title: { text: "Pressure (hPa)" }, type: "log", autorange: "reversed", gridcolor: C.grid },
    }), config("h2o_profil"));
    return true;
  }

  const MOIS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function cycle(el, jeu) {
    if (!jeu.cycle) return false;
    const c = jeu.cycle;
    Plotly.newPlot(el, [{ type: "bar", x: c.mois.map((m) => MOIS[m - 1]), y: c.moyenne,
      error_y: { type: "data", array: c.ecart_type.map((v) => v ?? 0), color: C.muted, thickness: 1.2 },
      marker: { color: c.mois.map((m) => (m <= 6 ? "rgba(46,230,197,.75)" : "rgba(139,108,255,.75)")) },
      hovertemplate: `<b>%{x}</b><br>mean %{y:.4g} ${jeu.unite}<br>± %{error_y.array:.3g} (1 σ between years)<extra></extra>` }],
    layout({ showlegend: false, yaxis: { title: { text: jeu.unite }, gridcolor: C.grid }, xaxis: { gridcolor: C.grid } }),
    config(`${jeu.id}_cycle`));
    return true;
  }

  function quotidien(el, jeu) {
    const q = jeu.quotidien; if (!q || q.valeurs.length < 2) return false;
    const d0 = new Date(q.debut + "T00:00:00Z");
    const x = q.jours.map((j) => new Date(d0.getTime() + j * 864e5).toISOString().slice(0, 10));
    const moy = moyenneGlissante(q.jours, q.valeurs, 15);
    Plotly.newPlot(el, [
      { type: "scattergl", mode: "markers", x, y: q.valeurs, name: "Daily Morocco mean", marker: { size: 3, color: "rgba(55,226,255,.35)" },
        hovertemplate: `%{x}<br><b>%{y:.1f} ${jeu.unite}</b><extra></extra>` },
      { type: "scattergl", mode: "lines", x, y: moy, name: "31-day running mean", line: { color: C.amber, width: 2 }, hoverinfo: "skip" },
    ], layout({ xaxis: { type: "date", gridcolor: C.grid, rangeslider: { visible: true, thickness: .07 } },
                yaxis: { title: { text: jeu.unite }, gridcolor: C.grid }, legend: { orientation: "h", y: -0.35 } }),
    config(`${jeu.id}_quotidien`));
    return true;
  }
  function moyenneGlissante(jours, v, demi) {
    const out = []; let a = 0, b = 0, s = 0, n = 0;
    for (let i = 0; i < v.length; i++) {
      while (b < v.length && jours[b] <= jours[i] + demi) { s += v[b]; n++; b++; }
      while (jours[a] < jours[i] - demi) { s -= v[a]; n--; a++; }
      out.push(n >= 10 ? s / n : NaN);
    }
    return out;
  }

  // ---------------------------------------------------------------------
  function comparaisonZ(el, jeux) {
    const pal = {}; CATALOGUE.variables.forEach((v) => { pal[v.id] = v.couleur; });
    const tr = jeux.map((j) => ({ type: "scatter", mode: "lines+markers", name: nomVar(j.id), x: j.dates,
      y: j.niveaux[j.niveauDefaut].z, customdata: j.etiq, line: { color: pal[j.id], width: 2 }, marker: { size: 5 },
      hovertemplate: `<b>${nomVar(j.id)}</b> %{customdata}<br>z = %{y:.2f}<extra></extra>` }));
    Plotly.newPlot(el, tr, layout({ xaxis: { type: "date", gridcolor: C.grid },
      yaxis: { title: { text: "Standardised anomaly (z)" }, gridcolor: C.grid },
      shapes: [{ type: "rect", xref: "paper", x0: 0, x1: 1, y0: -1.5, y1: 1.5, fillcolor: "rgba(255,255,255,.04)", line: { width: 0 } }] }),
    config("comparaison_z"));
  }
  const nomVar = (id) => (CATALOGUE.variables.find((v) => v.id === id) || {}).nom || id;

  function correlations(jeux) {
    const res = [];
    for (const a of jeux) for (const b of jeux) {
      const za = {}, pa = [], pb = [];
      a.etiq.forEach((e, i) => { za[e] = a.niveaux[a.niveauDefaut].z[i]; });
      b.etiq.forEach((e, i) => { const v = za[e]; const w = b.niveaux[b.niveauDefaut].z[i]; if (Number.isFinite(v) && Number.isFinite(w)) { pa.push(v); pb.push(w); } });
      res.push({ a: a.id, b: b.id, n: pa.length, r: pa.length >= 8 ? pearson(pa, pb) : NaN });
    }
    return res;
  }
  function pearson(x, y) {
    const n = x.length, mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    return sxy / Math.sqrt(sxx * syy);
  }
  function matriceCorrelation(el, jeux) {
    const r = correlations(jeux), noms = jeux.map((j) => nomVar(j.id));
    const z = jeux.map((a) => jeux.map((b) => r.find((x) => x.a === a.id && x.b === b.id).r));
    const txt = jeux.map((a) => jeux.map((b) => { const x = r.find((q) => q.a === a.id && q.b === b.id); return Number.isFinite(x.r) ? `${x.r.toFixed(2)}<br>n=${x.n}` : `n=${x.n}`; }));
    Plotly.newPlot(el, [{ type: "heatmap", x: noms, y: noms, z, text: txt, texttemplate: "%{text}", zmin: -1, zmax: 1,
      colorscale: ECHELLES.rdbu, colorbar: { title: { text: "r" }, thickness: 12 },
      hovertemplate: "%{y} × %{x}<br>%{text}<extra>Pearson correlation of semester z-scores</extra>" }],
    layout({ margin: { l: 130, r: 20, t: 10, b: 110 }, xaxis: { tickangle: -30 }, yaxis: { autorange: "reversed" } }),
    config("correlations"));
  }

  /** Répartition des tendances locales dans le Maroc (cellules significatives + / − / non significatives). */
  function statsCellules(jeu) {
    const n = jeu.niveaux[jeu.niveauDefaut], c = n.carte || {};
    if (!c.pente) return null;
    const m = masque(jeu, n);
    const r = { plusSig: 0, moinsSig: 0, plus: 0, moins: 0, total: 0, min: Infinity, max: -Infinity };
    c.pente.forEach((p, i) => {
      if (!m[i] || p === null) return;
      r.total++; r.min = Math.min(r.min, p); r.max = Math.max(r.max, p);
      const s = c.sig && c.sig[i];
      if (p >= 0) s ? r.plusSig++ : r.plus++; else s ? r.moinsSig++ : r.moins++;
    });
    return r.total ? r : null;
  }
  function repartition(el, jeux) {
    const lignes = jeux.map((j) => ({ j, s: statsCellules(j) })).filter((x) => x.s);
    if (!lignes.length) return false;
    const y = lignes.map((l) => nomVar(l.j.id)), pct = (k) => lignes.map((l) => (100 * l.s[k]) / l.s.total);
    const T = (k, nom, col) => ({ type: "bar", orientation: "h", y, x: pct(k), name: nom, marker: { color: col },
      customdata: lignes.map((l) => l.s.total), hovertemplate: `%{y}<br>${nom}: %{x:.0f} % of %{customdata} cells<extra></extra>` });
    Plotly.newPlot(el, [T("moinsSig", "Significant decrease", C.blue), T("moins", "Decrease, not significant", "rgba(79,141,255,.35)"),
      T("plus", "Increase, not significant", "rgba(255,93,108,.35)"), T("plusSig", "Significant increase", C.red)],
    layout({ barmode: "stack", margin: { l: 150, r: 20, t: 10, b: 50 }, xaxis: { title: { text: "% of grid cells inside Morocco" }, range: [0, 100], gridcolor: C.grid },
             legend: { orientation: "h", y: -0.3 } }), config("repartition_tendances"));
    return true;
  }

  // ---------------------------------------------------------------------
  function csv(nom, entetes, lignes) {
    const esc = (v) => { const s = v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v)) ? "" : String(v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const texte = [entetes.join(","), ...lignes.map((l) => l.map(esc).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + texte], { type: "text/csv;charset=utf-8" }));
    a.download = `DOORAtmosphere_${nom}.csv`; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /** Série temporelle de plusieurs régions issue d'une enquête (STATS.semestres + STATS.analyser). */
  const PALETTE = ["#37e2ff", "#ffb547", "#c084fc", "#2ee6c5", "#ff6b9a", "#9bd36b"];
  function enquete(el, regions, { vue = "anomalie", unite = "" } = {}) {
    const tr = [];
    regions.forEach((r, k) => {
      const col = PALETTE[k % PALETTE.length], s = r.sem, a = r.res;
      const x = s.etiq.map((e) => `${e.slice(0, 4)}-${e.endsWith("S1") ? "04" : "10"}-01`);
      const y = vue === "anomalie" ? s.anom : s.val;
      tr.push({ type: "scatter", mode: "lines+markers", x, y, name: r.nom, line: { color: col, width: 2 }, marker: { size: 6 },
        customdata: s.etiq.map((e, i) => [e, s.nb[i], s.z[i]]),
        hovertemplate: `<b>${r.nom}</b> %{customdata[0]}<br>%{y:.4g} ${unite}<br>z = %{customdata[2]:.2f} · %{customdata[1]} months<extra></extra>` });
      if (vue === "anomalie" && a && a.slope !== undefined) {
        const tm = s.t.reduce((p, v) => p + v, 0) / s.t.length;
        tr.push({ type: "scatter", mode: "lines", x, y: s.t.map((t) => a.intercept + a.slope * t), name: `${r.nom} — trend`,
          line: { color: col, width: 3, dash: "dash" }, hoverinfo: "skip" });
        if (regions.length === 1) {
          const ym = s.anom.filter(Number.isFinite).reduce((p, v) => p + v, 0) / s.anom.filter(Number.isFinite).length;
          tr.unshift({ type: "scatter", x: [...x, ...[...x].reverse()],
            y: [...s.t.map((t) => ym + a.ic_haut / 10 * (t - tm)), ...s.t.map((t) => ym + a.ic_bas / 10 * (t - tm)).reverse()],
            fill: "toself", fillcolor: "rgba(79,141,255,.18)", line: { width: 0 }, name: "95 % CI of the trend", hoverinfo: "skip" });
        }
      }
    });
    Plotly.newPlot(el, tr, layout({ xaxis: { type: "date", gridcolor: C.grid, rangeslider: { visible: true, thickness: .07 } },
      yaxis: { title: { text: vue === "anomalie" ? `Anomaly (${unite}) — deseasonalised` : `Semester mean (${unite})` }, gridcolor: C.grid },
      legend: { orientation: "h", y: -0.35 } }), config("enquete"));
  }

  /** Distribution des valeurs mensuelles par saison (boîtes). */
  function distribution(el, regions, unite) {
    const SAIS = { 12: "DJF", 1: "DJF", 2: "DJF", 3: "MAM", 4: "MAM", 5: "MAM", 6: "JJA", 7: "JJA", 8: "JJA", 9: "SON", 10: "SON", 11: "SON" };
    const tr = regions.map((r, k) => ({ type: "box", name: r.nom, x: r.mois.map((m) => SAIS[+m.slice(5, 7)]), y: r.valeurs,
      marker: { color: PALETTE[k % PALETTE.length], size: 3 }, boxpoints: "outliers", hovertemplate: `%{x}: %{y:.4g} ${unite}<extra>${r.nom}</extra>` }));
    Plotly.newPlot(el, tr, layout({ boxmode: "group", xaxis: { categoryorder: "array", categoryarray: ["DJF", "MAM", "JJA", "SON"], gridcolor: C.grid,
      title: { text: "Season (DJF = Dec–Feb …)" } }, yaxis: { title: { text: `Monthly mean (${unite})` }, gridcolor: C.grid } }), config("distribution"));
  }

  /** Séries mensuelles ou quotidiennes superposées (ex. Maroc vs global). */
  function lignes(el, series, { unite = "", type = "date", titreY = "" } = {}) {
    const tr = series.map((s, k) => ({ type: s.x.length > 2000 ? "scattergl" : "scatter", mode: s.mode || "lines+markers", x: s.x, y: s.y, name: s.nom,
      line: { color: s.couleur || PALETTE[k % PALETTE.length], width: 2 }, marker: { size: s.x.length > 200 ? 3 : 6 },
      hovertemplate: `<b>${s.nom}</b><br>%{x}<br>%{y:.4g} ${unite}<extra></extra>` }));
    Plotly.newPlot(el, tr, layout({ xaxis: { type, gridcolor: C.grid, rangeslider: { visible: true, thickness: .07 } },
      yaxis: { title: { text: titreY || unite }, gridcolor: C.grid }, legend: { orientation: "h", y: -0.35 } }), config("comparaison"));
  }

  function purger(root) { arreterGlobe(); root.querySelectorAll(".js-plotly-plot").forEach((el) => Plotly.purge(el)); }

  return { enquete, distribution, lignes, PALETTE, css, carteRegion, carteGlobale, globe, arreterGlobe, serie, anomaliesZ, profil, cycle, quotidien, comparaisonZ,
           matriceCorrelation, repartition, statsCellules, correlations, masque, grille, csv, purger, fmt, nomVar, C };
})();

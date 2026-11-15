/* =========================================================================
   Moteur de recherche (variables, concepts, pages, lieux, jeux de données)
   ========================================================================= */
window.RECHERCHE = (function () {
  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[₀-₉]/g, (c) => "0123456789"["₀₁₂₃₄₅₆₇₈₉".indexOf(c)]);
  let index = [];

  function construire() {
    index = [];
    CATALOGUE.variables.forEach((v) => index.push({
      cat: "Variables", titre: `${v.nom} (${v.symbole})`, desc: v.resume, url: `#/variable/${v.id}`, ico: v.symbole, couleur: v.couleur,
      cles: [v.nom, v.symbole, v.id, v.categorie, ...v.mots].map(norm), texte: norm(v.definition + " " + v.science),
    }));
    CATALOGUE.pages.forEach(([t, url, d, m]) => index.push({ cat: "Pages & tools", titre: t, desc: d, url, ico: "→", cles: [t, ...m].map(norm), texte: norm(d) }));
    CATALOGUE.glossaire.forEach(([t, d, m]) => index.push({ cat: "Concepts", titre: t, desc: d, url: `#/methodology/glossary-${slug(t)}`, ico: "i",
      cles: [t, ...m].map(norm), texte: norm(d) }));
    (window.GEO && GEO.villes || []).forEach((v) => index.push({ cat: "Places", titre: v.nom, desc: `Morocco · ${v.lat.toFixed(2)}°N, ${Math.abs(v.lon).toFixed(2)}°W — inspect values at the nearest grid cell`,
      url: `#/maroc`, ico: "⌖", cles: [v.nom, "morocco", "maroc"].map(norm), texte: "" }));
    [["Morocco", "Dedicated Morocco Atmospheric Analysis", "#/maroc", ["morocco", "maroc", "kingdom of morocco", "atlas", "sahara", "rif"]],
     ["Global / World", "Global ozone map and rotating globe", "#/variable/ozone", ["global", "world", "monde", "earth", "planet"]]]
      .forEach(([t, d, u, m]) => index.push({ cat: "Places", titre: t, desc: d, url: u, ico: "⌖", cles: m.map(norm), texte: norm(d) }));
    Object.values(DATA.jeux).forEach((j) => index.push({ cat: "Datasets", titre: `${CH.nomVar(j.id)} — ${j.meta.produit || "processed data"}`,
      desc: j.type === "serie" ? `${j.etiq[0]} → ${j.etiq.at(-1)} · ${j.unite}` : `Snapshot · ${j.unite}`, url: `#/variable/${j.id}`, ico: "▦",
      cles: [j.meta.produit, j.id, "data", "dataset", "données"].map(norm), texte: "" }));
    [["Anomaly detection", "Exceptional semesters (z-score)", "#/trends", ["anomaly", "anomalies", "extreme", "exceptionnel", "z-score"]],
     ["Compare variables", "Standardised anomalies and correlations in Morocco", "#/maroc/compare", ["compare", "comparer", "correlation", "corrélation", "multi-variable"]],
     ["Download data", "CSV downloads for every chart", "#/methodology", ["download", "télécharger", "csv", "export"]]]
      .forEach(([t, d, u, m]) => index.push({ cat: "Pages & tools", titre: t, desc: d, url: u, ico: "⤓", cles: m.map(norm), texte: norm(d) }));
  }
  const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }

  function chercher(q) {
    const nq = norm(q).trim();
    if (!nq) return [];
    const mots = nq.split(/\s+/);
    const res = [];
    for (const it of index) {
      let score = 0;
      for (const c of it.cles) {
        if (c === nq) score = Math.max(score, 100);
        else if (c.startsWith(nq)) score = Math.max(score, 70);
        else if (c.includes(nq)) score = Math.max(score, 45);
      }
      if (score < 45) {
        let s = 0;
        for (const m of mots) {
          const toks = it.cles.join(" ").split(/[^a-z0-9']+/);
          if (toks.some((t) => t.startsWith(m))) s += 30;
          else if (m.length >= 4 && toks.some((t) => t.length >= 4 && lev(t, m) <= (m.length > 6 ? 2 : 1))) s += 18;
          else if (m.length >= 3 && new RegExp("(^|[^a-z])" + m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(it.texte)) s += 10;
        }
        score = Math.max(score, s / mots.length);
      }
      if (score >= 10) res.push({ ...it, score });
    }
    const ordre = { "Variables": 0, "Places": 1, "Pages & tools": 2, "Datasets": 3, "Concepts": 4 };
    return res.sort((a, b) => b.score - a.score || ordre[a.cat] - ordre[b.cat]);
  }

  function html(res, sel = 0, limite = 4) {
    if (!res.length) return `<div class="search-empty">No result. Try “ozone”, “Morocco”, “trend”, “dust”…</div>`;
    const groupes = {};
    res.forEach((r) => { (groupes[r.cat] = groupes[r.cat] || []).push(r); });
    let i = 0, out = "";
    for (const cat of ["Variables", "Places", "Pages & tools", "Datasets", "Concepts"]) {
      if (!groupes[cat]) continue;
      out += `<div class="search-group">${cat}</div>`;
      for (const r of groupes[cat].slice(0, limite)) {
        out += `<a class="search-item ${i === sel ? "sel" : ""}" role="option" href="${r.url}" data-i="${i}">
          <span class="ico" style="color:${r.couleur || "var(--cyan)"}">${r.ico}</span>
          <span class="txt"><b>${r.titre}</b><span>${r.desc}</span></span></a>`;
        i++;
      }
    }
    return out;
  }

  function attacher() {
    const inp = document.getElementById("search-input"), box = document.getElementById("search-results");
    let res = [], sel = 0, visibles = [];
    const fermer = () => { box.hidden = true; inp.setAttribute("aria-expanded", "false"); };
    const ouvrir = () => {
      res = chercher(inp.value);
      box.innerHTML = html(res, sel) + (res.length ? `<a class="search-item" href="#/search/${encodeURIComponent(inp.value)}"><span class="ico">⋯</span><span class="txt"><b>All results for “${inp.value.replace(/</g, "")}”</b></span></a>` : "");
      visibles = [...box.querySelectorAll(".search-item")];
      box.hidden = !inp.value.trim(); inp.setAttribute("aria-expanded", String(!box.hidden));
    };
    inp.addEventListener("input", () => { sel = 0; ouvrir(); });
    inp.addEventListener("focus", () => { if (inp.value.trim()) ouvrir(); });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + visibles.length) % Math.max(1, visibles.length);
        visibles.forEach((v, i) => v.classList.toggle("sel", i === sel)); visibles[sel] && visibles[sel].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cible = visibles[sel];
        location.hash = cible ? cible.getAttribute("href") : `#/search/${encodeURIComponent(inp.value)}`;
        fermer(); inp.blur();
      } else if (e.key === "Escape") { fermer(); inp.blur(); }
    });
    box.addEventListener("click", () => { fermer(); inp.value = ""; });
    document.addEventListener("click", (e) => { if (!e.target.closest(".search")) fermer(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); inp.focus(); }
    });
  }

  return { construire, chercher, html, attacher, norm, slug };
})();

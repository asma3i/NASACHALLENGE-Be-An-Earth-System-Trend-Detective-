/* =========================================================================
   Chargement des données (site/data/*.js)
   Chaque fichier définit window.DONNEES : on les charge un par un et on
   range chaque jeu dans DATA.jeux[id]. Fonctionne aussi en file:// .
   ========================================================================= */
window.DATA = { jeux: {}, galerie: window.GALERIE || {}, pret: false };

(function () {
  function chargerScript(src) {
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => { const d = window.DONNEES; window.DONNEES = undefined; s.remove(); resolve(d || null); };
      s.onerror = () => { s.remove(); resolve(null); };
      document.head.appendChild(s);
    });
  }

  const num = (v) => (v === null || v === undefined ? NaN : v);

  /** Les notebooks écrivent certains textes en français : on les affiche en anglais. */
  const EN = [[/le Maroc/g, "Morocco"], [/Maroc/g, "Morocco"], [/avec les provinces du Sud/g, "including the southern provinces"],
              [/sans les provinces du Sud/g, "without the southern provinces"], [/boîte/g, "box"], [/°O/g, "°W"],
              [/années sèches/g, "dry years"], [/mm\/mois/g, "mm/month"], [/molécules/g, "molecules"]];
  const enAnglais = (t) => (typeof t === "string" ? EN.reduce((x, [a, b]) => x.replace(a, b), t) : t);

  /** Date du milieu d'un semestre "2005-S1" -> "2005-04-01" */
  function dateSemestre(e) {
    const [a, s] = e.split("-S");
    return `${a}-${s === "1" ? "04" : "10"}-01`;
  }

  /** Met tous les formats (notebooks H2O / précipitations / HCHO, builder ozone) dans une forme commune. */
  function normaliser(id, d) {
    const meta = { ...(d.meta || {}) };
    ["zone_texte", "nom_coupure", "unite"].forEach((k) => { meta[k] = enAnglais(meta[k]); });
    const niveaux = (d.niveaux || []).map((n) => ({
      ...n,
      moyenne: (n.moyenne || []).map(num), anomalie: (n.anomalie || []).map(num), z: (n.z || []).map(num),
      bande: (n.bande || []).map(num), ligne: (n.ligne || []).map(num),
      ligne_pre: n.ligne_pre ? n.ligne_pre.map(num) : null,
      ic_bas_ligne: (n.ic_bas_ligne || []).map(num), ic_haut_ligne: (n.ic_haut_ligne || []).map(num),
    }));
    const evenement = d.evenement ?? d.hunga ?? null;
    let nomCoupure = meta.nom_coupure || "";
    if (!nomCoupure && id === "h2o" && evenement !== null) nomCoupure = "Hunga Tonga eruption (Jan 2022)";
    const etiq = d.etiq || [];
    return {
      id, brut: d, meta, etiq, dates: etiq.map(dateSemestre), niveaux,
      niveauDefaut: d.niveau_defaut || 0, lat: d.lat || [], lon: d.lon || [],
      profils: d.profils || [], cycle: d.cycle || null, quotidien: d.quotidien || null,
      mensuel: d.mensuel || null, globale: d.globale || null,
      evenement, npre: d.npre ?? null, finPre: meta.fin_pre || null, nomCoupure,
      type: meta.type || (etiq.length ? "serie" : "instantane"),
      unite: meta.unite || "", auMaroc: d.au_maroc || null,
      cube: d.cube || null, globalMensuel: d.global_mensuel || null, globalQuotidien: d.global_quotidien || null,
      nature: meta.nature || "observation",
      globalSemestres: d.global_semestres || null, couverture: d.couverture || null,
    };
  }

  DATA.charger = async function () {
    const vars = CATALOGUE.variables;
    for (const v of vars) {
      const d = await chargerScript(`data/${v.fichier}`);
      if (d) {
        try { DATA.jeux[v.id] = normaliser(v.id, d); }
        catch (e) { console.warn("Données illisibles :", v.fichier, e); }
      }
    }
    DATA.pret = true;
    return DATA;
  };

  /** Statut d'une variable : données traitées, images, ou en attente. */
  DATA.statut = function (id) {
    const j = DATA.jeux[id];
    if (j && j.type === "serie") return "data";
    if (j) return "snapshot";
    if ((DATA.galerie[id] || []).length) return "images";
    return "pending";
  };

  DATA.dateSemestre = dateSemestre;
})();

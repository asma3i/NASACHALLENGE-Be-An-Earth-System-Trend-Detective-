/* =========================================================================
   Moteur statistique (navigateur) — même méthode que les notebooks :
   régression linéaire avec IC corrigé de l'autocorrélation lag-1,
   Mann-Kendall (original + Hamed-Rao), pente de Theil-Sen,
   comparaison de deux tendances.
   ========================================================================= */
window.STATS = (function () {
  // ---------- fonctions spéciales
  function lgamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (const k of c) ser += k / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  function betacf(a, b, x) {
    const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300;
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
      const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function betai(a, b, x) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  /** p bilatéral de Student */
  const pStudent = (t, df) => betai(df / 2, 0.5, df / (df + t * t));
  /** quantile de Student (bisection) */
  function tQuantile(p, df) { // P(T <= q) = p, p > 0.5
    let lo = 0, hi = 1000;
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; (1 - pStudent(m, df) / 2 < p) ? lo = m : hi = m; }
    return (lo + hi) / 2;
  }
  function erf(x) { // Abramowitz-Stegun 7.1.26 (précision 1.5e-7)
    const s = Math.sign(x); x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
  }
  const pNormal = (z) => 1 - erf(Math.abs(z) / Math.SQRT2); // bilatéral

  // ---------- outils
  const moy = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const fini = (a) => a.filter(Number.isFinite);
  function rangs(a) {
    const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Array(a.length);
    for (let i = 0; i < idx.length;) {
      let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  }

  /** Régression linéaire (t en années) avec IC 95 % et p corrigés de l'autocorrélation lag-1. */
  function regression(t, y) {
    const n = y.length, tm = moy(t), ym = moy(y);
    let sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sxx += (t[i] - tm) ** 2; sxy += (t[i] - tm) * (y[i] - ym); }
    const b = sxy / sxx, a = ym - b * tm;
    const res = y.map((v, i) => v - (a + b * t[i]));
    const a1 = res.slice(1), a0 = res.slice(0, -1), m1 = moy(a1), m0 = moy(a0);
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < a1.length; i++) { sab += (a1[i] - m1) * (a0[i] - m0); saa += (a1[i] - m1) ** 2; sbb += (a0[i] - m0) ** 2; }
    const r1 = saa && sbb ? sab / Math.sqrt(saa * sbb) : 0;   // comme np.corrcoef(res[1:], res[:-1])
    const neff = Math.min(n, Math.max(3, n * (1 - r1) / (1 + r1)));
    const se = Math.sqrt(res.reduce((s, v) => s + v * v, 0) / (n - 2) / sxx);
    const df = Math.max(neff - 2, 1), tc = tQuantile(0.975, df);
    return { pente: b, intercept: a, se, r1, neff, ic_bas: b - tc * se, ic_haut: b + tc * se, p: pStudent(Math.abs(b / se), df) };
  }

  /** Test de Mann-Kendall (avec ex aequo) + version Hamed-Rao + pente de Theil-Sen. */
  function mannKendall(y, t) {
    const n = y.length;
    let s = 0;
    const pentes = [];
    for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
      s += Math.sign(y[j] - y[i]);
      pentes.push((y[j] - y[i]) / ((t ? t[j] - t[i] : j - i) || 1e-9));
    }
    pentes.sort((a, b) => a - b);
    const sen = pentes.length % 2 ? pentes[(pentes.length - 1) / 2] : (pentes[pentes.length / 2 - 1] + pentes[pentes.length / 2]) / 2;
    const groupes = {}; y.forEach((v) => { groupes[v] = (groupes[v] || 0) + 1; });
    let varS = n * (n - 1) * (2 * n + 5);
    Object.values(groupes).forEach((tp) => { if (tp > 1) varS -= tp * (tp - 1) * (2 * tp + 5); });
    varS /= 18;
    const z = (v) => (s > 0 ? (s - 1) / Math.sqrt(v) : s < 0 ? (s + 1) / Math.sqrt(v) : 0);
    const p = pNormal(z(varS));
    // Hamed & Rao (1998) : variance corrigée par l'autocorrélation des rangs de la série sans tendance
    const senIdx = (() => { const p2 = []; for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) p2.push((y[j] - y[i]) / (j - i)); p2.sort((a, b) => a - b); return p2.length % 2 ? p2[(p2.length - 1) / 2] : (p2[p2.length / 2 - 1] + p2[p2.length / 2]) / 2; })();
    const det = y.map((v, i) => v - senIdx * (i + 1));
    const r = rangs(det), rm = moy(r);
    const c0 = r.reduce((acc, v) => acc + (v - rm) ** 2, 0);
    let somme = 0;
    const seuil = 1.959963984540054 / Math.sqrt(n);
    for (let k = 1; k < n - 1; k++) {
      let ck = 0; for (let i = 0; i < n - k; i++) ck += (r[i] - rm) * (r[i + k] - rm);
      const rho = ck / c0;
      if (Math.abs(rho) > seuil) somme += (n - k) * (n - k - 1) * (n - k - 2) * rho;
    }
    const facteur = 1 + 2 / (n * (n - 1) * (n - 2)) * somme;
    const pHR = pNormal(z(varS * Math.max(facteur, 1e-6)));
    return { s, p, pHR, sen, z: z(varS) };
  }

  /**
   * Analyse complète d'une série (dates en années décimales, valeurs).
   * Retour en unités / décennie, comme les notebooks.
   */
  function analyser(t, y, alpha = 0.05) {
    const ok = y.map((v, i) => Number.isFinite(v) && Number.isFinite(t[i]));
    const tt = t.filter((_, i) => ok[i]), yy = y.filter((_, i) => ok[i]);
    const n = yy.length, duree = n ? tt[n - 1] - tt[0] : 0;
    if (n < 10 || duree < 5) return { verdict: "insuffisant", n, duree };
    const r = regression(tt, yy), mk = mannKendall(yy, tt);
    const sigReg = r.p < alpha, sigMK = mk.pHR < alpha;
    let verdict;
    if (sigReg && sigMK) verdict = r.pente > 0 ? "hausse" : "baisse";
    else if (sigReg !== sigMK) verdict = "inconclusif";
    else verdict = "non_significatif";
    if (sigReg && sigMK && Math.sign(r.pente) !== Math.sign(mk.sen)) verdict = "inconclusif";
    return { verdict, n, duree, pente: r.pente * 10, ic_bas: r.ic_bas * 10, ic_haut: r.ic_haut * 10, se: r.se * 10,
             p_reg: r.p, mk_p: mk.p, mk_hr_p: mk.pHR, sen: mk.sen * 10, r1: r.r1, neff: r.neff,
             intercept: r.intercept, slope: r.pente };
  }

  /** Test de la différence entre deux tendances (z, approximation normale, séries supposées indépendantes). */
  function difference(a, b) {
    if (!a || !b || !Number.isFinite(a.se) || !Number.isFinite(b.se)) return null;
    const d = a.pente - b.pente, se = Math.sqrt(a.se ** 2 + b.se ** 2), z = d / se;
    return { d, se, z, p: pNormal(z), ic_bas: d - 1.96 * se, ic_haut: d + 1.96 * se };
  }

  /** Mois "AAAA-MM" -> année décimale (milieu du mois). */
  const anneeMois = (m) => +m.slice(0, 4) + (+m.slice(5, 7) - 0.5) / 12;

  /** Série mensuelle -> semestres (S1 = janv-juin, S2 = juil-déc), anomalies par type, z-scores. */
  function semestres(mois, valeurs, minMois = 3) {
    const g = {};
    mois.forEach((m, i) => {
      if (!Number.isFinite(valeurs[i])) return;
      const k = `${m.slice(0, 4)}-S${+m.slice(5, 7) <= 6 ? 1 : 2}`;
      (g[k] = g[k] || []).push(valeurs[i]);
    });
    const etiq = Object.keys(g).filter((k) => g[k].length >= minMois).sort();
    const val = etiq.map((k) => moy(g[k])), nb = etiq.map((k) => g[k].length);
    const anom = new Array(etiq.length).fill(NaN), z = new Array(etiq.length).fill(NaN);
    ["S1", "S2"].forEach((s) => {
      const idx = etiq.map((e, i) => (e.endsWith(s) ? i : -1)).filter((i) => i >= 0);
      if (!idx.length) return;
      const m = moy(idx.map((i) => val[i]));
      const sd = idx.length > 1 ? Math.sqrt(idx.reduce((acc, i) => acc + (val[i] - m) ** 2, 0) / (idx.length - 1)) : NaN;
      idx.forEach((i) => { anom[i] = val[i] - m; z[i] = (val[i] - m) / sd; });
    });
    const t = etiq.map((e) => +e.slice(0, 4) + (e.endsWith("S1") ? 0.25 : 0.75));
    return { etiq, val, nb, anom, z, t };
  }

  return { analyser, regression, mannKendall, difference, semestres, anneeMois, pStudent, pNormal, tQuantile, rangs, fini, moy };
})();
if (typeof module !== "undefined") module.exports = window.STATS;

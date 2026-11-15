"""
DOORAtmosphere — add the AerO-Club team's results to the website (same format as the notebooks' step 11).

Usage:
  python tools/build_team_data.py  <figures folder>  <DOSSIER NASA folder>  [<AOT Giovanni folder>]

  <figures folder>       aot/, methane/, no2/, snow/, h2o_maroc/, h2o_monde/, ndvi/  (team images)
  <DOSSIER NASA folder>  h2o_maroc/, h2o_monde/, ndvi/                               (team CSV files)

Writes:
  site/data/donnees.js              water vapour (Aura MLS) — Morocco box, 42 levels, + world series
  site/data/donnees_vegetation.js   vegetation NDVI (Terra MODIS) — world series + trend map of the Morocco window
  site/data/donnees_methane.js      methane — world series (values copied from the team's statistics table)
  site/data/galerie.js              team figures renamed by substance, with title + explanation
  site/assets/images/<substance>/   the renamed figures

Every value comes from a team CSV file or from data/team/methane_semestres_transcrit.csv.
Trend statistics use the same method as the notebooks (regression with lag-1 autocorrelation
correction + Mann-Kendall / Hamed-Rao + Sen slope); only complete semesters (6 months) are used.
"""
import csv, json, math, os, shutil, sys
from collections import defaultdict
from datetime import date

import numpy as np
import pymannkendall as mk
from scipy import stats

ICI = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(os.path.dirname(ICI), "site")
DATA = os.path.join(SITE, "data")
IMG = os.path.join(SITE, "assets", "images")
NDVI_FACTEUR = 1e8   # team CSV = NDVI x 10^8 (MODIS scale factor 10 000 multiplied instead of divided)
ALPHA, Z_SEUIL = 0.05, 1.5


def lire_csv(p):
    with open(p, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def nb(x):
    try:
        v = float(x)
        return None if math.isnan(v) else v
    except (TypeError, ValueError):
        return None


def liste(a, n=5):
    return [None if (v is None or not np.isfinite(v)) else round(float(v), n) for v in np.asarray(a, dtype=float)]


def t_sem(e):  # same time axis as the notebooks: middle month of the semester
    return int(e[:4]) + ((4 if e.endswith("S1") else 10) - 0.5) / 12


def analyser(t, y):
    ok = np.isfinite(y)
    t, y = np.asarray(t)[ok], np.asarray(y)[ok]
    if len(y) < 10 or t[-1] - t[0] < 5:
        return None
    r = stats.linregress(t, y)
    res = y - (r.intercept + r.slope * t)
    r1 = np.corrcoef(res[1:], res[:-1])[0, 1]
    neff = float(np.clip(len(y) * (1 - r1) / (1 + r1), 3, len(y)))
    se = np.sqrt(np.sum(res ** 2) / (len(y) - 2) / np.sum((t - t.mean()) ** 2))
    tc = stats.t.ppf(0.975, max(neff - 2, 1))
    m1, m2 = mk.original_test(y), mk.hamed_rao_modification_test(y)
    return dict(pente=r.slope * 10, ic_bas=(r.slope - tc * se) * 10, ic_haut=(r.slope + tc * se) * 10,
                p_reg=float(2 * stats.t.sf(abs(r.slope / se), max(neff - 2, 1))), mk_p=float(m1.p), mk_hr_p=float(m2.p),
                sen=float(m1.slope * 20), tendance=m1.trend, n=int(len(y)), intercept=r.intercept, slope=r.slope)


def niveau(etiq, val, nbm, npre=None, plev=None, carte=None):
    """Same keys as the notebooks' 'niveaux' entries."""
    val = np.array([np.nan if v is None else v for v in val], dtype=float)
    complet = (np.array(nbm) >= 6) & (np.array(nbm) <= 7)   # 6-month semesters (7 when the team's period starts in June)
    t = np.array([t_sem(e) for e in etiq])
    anom, z, bande = np.full(len(val), np.nan), np.full(len(val), np.nan), np.full(len(val), np.nan)
    for k in ("S1", "S2"):
        idx = np.array([i for i, e in enumerate(etiq) if e.endswith(k)])
        ok = idx[complet[idx] & np.isfinite(val[idx])]
        m, sd = val[ok].mean(), val[ok].std(ddof=1)
        anom[idx] = val[idx] - m
        z[idx] = np.where(complet[idx], (val[idx] - m) / sd, np.nan)
        bande[idx] = Z_SEUIL * sd
    y = np.where(complet, anom, np.nan)
    r = analyser(t, y)
    r2 = analyser(t[:npre], y[:npre]) if npre else None
    ok = np.isfinite(y)
    ybar, tbar = y[ok].mean(), t[ok].mean()
    st = lambda d: None if d is None else {k: float(v) if k != "tendance" else v for k, v in d.items() if k not in ("intercept", "slope")}
    anom = np.where(complet, anom, np.nan)      # incomplete semesters: value kept, no anomaly
    return dict(plev=plev, moyenne=liste(val), anomalie=liste(anom), z=liste(z, 3), bande=liste(bande),
                tendance=st(r), tendance_pre=st(r2),
                ligne=liste(r["intercept"] + r["slope"] * t) if r else [],
                ligne_pre=liste(r2["intercept"] + r2["slope"] * t[:npre]) if r2 else None,
                ic_bas_ligne=liste(ybar + r["ic_bas"] / 10 * (t - tbar)) if r else [],
                ic_haut_ligne=liste(ybar + r["ic_haut"] / 10 * (t - tbar)) if r else [],
                carte=carte, nb_mois=list(map(int, nbm)))


def dans_maroc(lat, lon, poly):
    from matplotlib.path import Path
    chemins = [Path(np.array(p)) for p in poly]
    pts = np.array([(lo, la) for la in lat for lo in lon])
    m = np.zeros(len(pts), bool)
    for c in chemins:
        m |= c.contains_points(pts)
    return [int(v) for v in m]


def geo():
    s = open(os.path.join(DATA, "geo.js"), encoding="utf-8").read()
    return json.loads(s[s.index("{"):].rstrip().rstrip(";"))


# ------------------------------------------------------------------ water vapour
def h2o(nasa):
    rows = lire_csv(os.path.join(nasa, "h2o_maroc", "4_detection_anomalies.csv"))
    monde = lire_csv(os.path.join(nasa, "h2o_monde", "4_detection_anomalies.csv"))
    etiq = sorted({x["semestre"] for x in rows})
    nbm = {x["semestre"]: int(float(x["nb_mois"])) for x in rows}
    val, valm = defaultdict(dict), defaultdict(dict)
    for x in rows:
        val[round(float(x["plev_hPa"]), 4)][x["semestre"]] = nb(x["h2o_moyen_ppmv"])
    for x in monde:
        valm[round(float(x["plev_hPa"]), 4)][x["semestre"]] = nb(x["h2o_moyen_ppmv"])
    # MLS starts in August 2004: 2004-S1 has no value -> drop it
    etiq = [e for e in etiq if val[100.0].get(e) is not None]
    npre = sum(1 for e in etiq if e <= "2021-S2")
    # map of the Morocco window (team CSV, 100 hPa)
    cr = lire_csv(os.path.join(nasa, "h2o_maroc", "1_carte.csv"))
    lat = sorted({float(x["lat"]) for x in cr}); lon = sorted({float(x["lon"]) for x in cr})
    idx = {(float(x["lat"]), float(x["lon"])): x for x in cr}
    g = lambda k, f=nb: [f(idx[(la, lo)][k]) if (la, lo) in idx else None for la in lat for lo in lon]
    carte = dict(moyenne=g("h2o_moyen_ppmv"), pente=g("tendance_ppmv_par_decennie"), sig=g("significatif", lambda v: int(v == "True")),
                 pente_pre=g("tendance_2004_2021_ppmv_par_decennie"), sig_pre=g("significatif_2004_2021", lambda v: int(v == "True")),
                 au_maroc=g("dans_zone_moyennee", lambda v: int(v == "True")))
    niveaux = []
    for p in sorted(val, reverse=True):
        if p < 1:            # keep the stratosphere and lower mesosphere (261 -> 1 hPa)
            continue
        niveaux.append(niveau(etiq, [val[p].get(e) for e in etiq], [nbm[e] for e in etiq], npre, plev=p, carte=carte if p == 100.0 else None))
    defaut = [n["plev"] for n in niveaux].index(100.0)
    profils = [dict(periode=x["periode"], plev_hPa=nb(x["plev_hPa"]), pente_ppmv_par_decennie=nb(x["pente_ppmv_par_decennie"]),
                    ic95_bas=nb(x["ic95_bas"]), ic95_haut=nb(x["ic95_haut"]), pct_par_decennie=nb(x["pct_par_decennie"]),
                    p_regression=nb(x["p_regression"]), significatif=x["significatif"] == "True")
               for x in lire_csv(os.path.join(nasa, "h2o_maroc", "3_profil_vertical.csv"))]
    ref = lire_csv(os.path.join(nasa, "h2o_maroc", "2_graphe_temporel.csv"))[0]
    calc = niveaux[defaut]["tendance"]
    print(f"   H2O 100 hPa Morocco: site {calc['pente']:+.4f} [{calc['ic_bas']:.4f}; {calc['ic_haut']:.4f}]  "
          f"team {float(ref['pente_ppmv_par_decennie']):+.4f} [{float(ref['ic95_bas']):.4f}; {float(ref['ic95_haut']):.4f}]")
    return dict(
        meta=dict(zone="Maroc", zone_texte="the Morocco box (24–38°N, 16°W–0°)", variable="h2o", titre="Water vapour (H₂O)",
                  etendue=[-20, 5, 18, 42], boite=None, taille_marqueur=60, produit="Aura MLS Level-3 H₂O (team notebook)",
                  version="", unite="ppmv", alpha=ALPHA, z_seuil=Z_SEUIL, fin_pre="2021", nom_coupure="Hunga Tonga eruption (Jan 2022)",
                  genere_le=date.today().isoformat(), debut=etiq[0], fin=etiq[-1], source_csv="DOSSIER NASA / LE MAROC VAPEUR H2O",
                  carte_texte="The map is the team's 100 hPa result; other levels have no map."),
        etiq=etiq, evenement=etiq.index("2022-S1"), hunga=etiq.index("2022-S1"), npre=npre,
        lat=lat, lon=lon, au_maroc=carte["au_maroc"], niveaux=niveaux, niveau_defaut=defaut, profils=profils,
        global_semestres=dict(zone="World (whole MLS grid)", etiq=etiq,
                              niveaux={("null" if n["plev"] is None else f"{n['plev']:g}"): liste([valm[n["plev"]].get(e) for e in etiq]) for n in niveaux}),
    )


# ------------------------------------------------------------------ vegetation
def vegetation(nasa):
    rows = lire_csv(os.path.join(nasa, "ndvi", "1_serie_mondiale_semestrielle.csv"))
    etiq = [x["semestre"] for x in rows]
    vals = [nb(x["ndvi_moyen"]) / NDVI_FACTEUR for x in rows]
    nbm = [int(float(x["nb_mois"])) for x in rows]
    # trend map of the Morocco window from the 0.5° team CSV
    lat = [round(19.25 + 0.5 * i, 2) for i in range(38)]          # 19.25 .. 37.75
    lon = [round(-19.75 + 0.5 * k, 2) for k in range(44)]         # -19.75 .. 1.75
    pos = {(la, lo): i for i, (la, lo) in enumerate((la, lo) for la in lat for lo in lon)}
    pente, sig = [None] * len(pos), [0] * len(pos)
    for x in lire_csv(os.path.join(nasa, "ndvi", "2_carte_tendance_ndvi.csv")):
        k = (round(float(x["latitude"]), 2), round(float(x["longitude"]), 2))
        if k in pos:
            v = nb(x["tendance_ndvi_par_decennie"])
            pente[pos[k]] = None if v is None else round(v / NDVI_FACTEUR, 5)
            sig[pos[k]] = int(x["significatif_p05"] == "True")
    am = dans_maroc(lat, lon, geo()["maroc"])
    carte = dict(pente=pente, sig=sig, au_maroc=am)
    n = niveau(etiq, vals, nbm, plev=None, carte=carte)
    return dict(
        meta=dict(zone="World", zone_texte="the whole planet (land, latitude-weighted)", variable="vegetation", titre="Vegetation greenness (NDVI)",
                  etendue=[-20, 2, 19, 38], boite=None, taille_marqueur=12, produit="Terra MODIS MOD13C2 v061 NDVI (team notebook)", version="061",
                  unite="NDVI", alpha=ALPHA, z_seuil=Z_SEUIL, fin_pre=None, nom_coupure="", genere_le=date.today().isoformat(),
                  debut=etiq[0], fin=etiq[-1], note_echelle="Team CSV values divided by 10^8 (scale factor multiplied instead of divided).",
                  carte_texte="Map: NDVI trend per decade over the Morocco window (team CSV, 0.5°). Time series: whole planet."),
        etiq=etiq, evenement=None, npre=None, lat=lat, lon=lon, au_maroc=am, niveaux=[n], niveau_defaut=0, profils=[])


# ------------------------------------------------------------------ methane
def methane():
    rows = lire_csv(os.path.join(os.path.dirname(ICI), "data", "team", "methane_semestres_transcrit.csv"))
    etiq = [x["semestre"] for x in rows]
    n = niveau(etiq, [nb(x["mean_ppbv"]) for x in rows], [6] * len(rows))
    return dict(
        meta=dict(zone="World", zone_texte="the whole planet (grid cells with data, about 79 % of the grid)", variable="methane",
                  titre="Methane (CH₄)", etendue=[-20, 2, 19, 38], boite=None, produit="Team methane statistics table (dataset not stated)",
                  unite="ppb", alpha=ALPHA, z_seuil=Z_SEUIL, fin_pre=None, nom_coupure="", genere_le=date.today().isoformat(),
                  debut=etiq[0], fin=etiq[-1], nature="team"),
        etiq=etiq, evenement=None, npre=None, lat=[], lon=[], niveaux=[n], niveau_defaut=0, profils=[],
        couverture=[nb(x["coverage_percent"]) for x in rows])


# ------------------------------------------------------------------ AOT (Giovanni time-averaged maps, MERRA-2 M2TMNXAER)
def aot(dossier):
    import glob, netCDF4
    from matplotlib.path import Path
    fs = sorted(glob.glob(os.path.join(dossier, "aot_*.nc")))
    ds = netCDF4.Dataset(fs[0]); lat = ds["lat"][:].data; lon = ds["lon"][:].data; ds.close()
    LA, LO = np.meshgrid(lat, lon, indexing="ij")
    m = np.zeros(LA.shape, bool)
    for poly in geo()["maroc"]:
        m |= Path(np.array(poly)).contains_points(np.c_[LO.ravel(), LA.ravel()]).reshape(LA.shape)
    w = np.cos(np.deg2rad(LA))
    fen = (LA >= 19) & (LA <= 38) & (LO >= -20) & (LO <= 2)
    il, ik = np.where(fen.any(1))[0], np.where(fen.any(0))[0]
    etiq, nbm, vm, vw, cartes, periodes = [], [], [], [], [], []
    for f in fs:
        d = netCDF4.Dataset(f)
        a = d["M2TMNXAER_5_12_4_TOTEXTTAU"][:].filled(np.nan).astype(float)
        a0, a1 = d.userstartdate[:7], d.userenddate[:7]; d.close()
        y0, m0, y1, m1 = int(a0[:4]), int(a0[5:]), int(a1[:4]), int(a1[5:])
        etiq.append(f"{y0}-S{1 if m0 == 1 else 2}"); nbm.append((y1 - y0) * 12 + m1 - m0 + 1); periodes.append(f"{a0} to {a1}")
        vm.append(np.nansum(a[m] * w[m]) / np.sum(w[m]))
        vw.append(np.nansum(a * w) / np.nansum(w * np.isfinite(a)))
        cartes.append(a[np.ix_(il, ik)])
    C = np.array(cartes)
    t = np.array([t_sem(e) for e in etiq]); ok = (np.array(nbm) >= 6) & (np.array(nbm) <= 7)
    # per-cell trend of deseasonalised semester values
    A = C.copy()
    for k in ("S1", "S2"):
        idx = [i for i, e in enumerate(etiq) if e.endswith(k)]
        okk = [i for i in idx if ok[i]]
        A[idx] -= C[okk].mean(0)
    pente = np.full(C.shape[1:], np.nan); sig = np.zeros(C.shape[1:], int)
    for i in range(C.shape[1]):
        for k in range(C.shape[2]):
            r = analyser(t[ok], A[ok, i, k])
            if r:
                pente[i, k] = r["pente"]
                sig[i, k] = int(r["p_reg"] < ALPHA and r["mk_hr_p"] < ALPHA)
    la, lo = lat[il].tolist(), lon[ik].tolist()
    am = m[np.ix_(il, ik)].ravel().astype(int).tolist()
    carte = dict(moyenne=liste(C[ok].mean(0).ravel(), 4), pente=liste(pente.ravel(), 4), sig=sig.ravel().tolist(), au_maroc=am)
    n = niveau(etiq, vm, nbm, plev=None, carte=carte)
    print(f"   AOT Morocco: trend {n['tendance']['pente']:+.4f} per decade, p={n['tendance']['p_reg']:.3f}, {n['tendance']['n']} semesters")
    return dict(
        meta=dict(zone="Maroc", zone_texte="Morocco (grid cells inside the borders, latitude-weighted)", variable="aot",
                  titre="Aerosol optical thickness (AOT 550 nm)", etendue=[-20, 2, 19, 38], boite=None, taille_marqueur=10,
                  produit="MERRA-2 M2TMNXAER v5.12.4 TOTEXTTAU — Giovanni time-averaged maps (0.5° × 0.625°)", version="5.12.4",
                  unite="AOT (no unit)", alpha=ALPHA, z_seuil=Z_SEUIL, fin_pre=None, nom_coupure="", genere_le=date.today().isoformat(),
                  debut=etiq[0], fin=etiq[-1], nature="model",
                  periodes=periodes, note_periodes="Periods as chosen in Giovanni by the team: some second semesters start in June (7 months); 2026 covers January–September and is not used for the trend."),
        etiq=etiq, evenement=None, npre=None, lat=la, lon=lo, au_maroc=am, niveaux=[n], niveau_defaut=0, profils=[],
        global_semestres=dict(zone="World (whole MERRA-2 grid, latitude-weighted)", etiq=etiq, niveaux={"null": liste(vw, 5)}))


# ------------------------------------------------------------------ figures
def figures(dossier):
    cfg = json.load(open(os.path.join(ICI, "figures.json"), encoding="utf-8"))["figures"]
    if os.path.isdir(IMG):
        shutil.rmtree(IMG)
    gal = defaultdict(list)
    from PIL import Image
    for f in cfg:
        src = os.path.join(dossier, f["src"])
        if not os.path.exists(src):
            print("   missing:", f["src"]); continue
        ext = os.path.splitext(src)[1].lower()
        rel = f"assets/images/{f['id']}/{f['nom']}{ext}"
        os.makedirs(os.path.join(SITE, os.path.dirname(rel)), exist_ok=True)
        shutil.copyfile(src, os.path.join(SITE, rel))
        w, h = Image.open(src).size
        e = dict(src=rel, titre=f["titre"], explication=f["explication"], type=f["type"], source=f["source"], zone=f["zone"],
                 origine=f["nom"] + ext, date=None, largeur=w, hauteur=h)
        (gal[f["id"]].insert(0, e) if f.get("main") else gal[f["id"]].append(e))
    return gal


def ecrire(nom, obj, var="DONNEES"):
    p = os.path.join(DATA, nom)
    with open(p, "w", encoding="utf-8") as f:
        f.write(f"window.{var} = " + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("   ->", nom, os.path.getsize(p) // 1024, "KB")


def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    fig, nasa = sys.argv[1], sys.argv[2]
    if len(sys.argv) > 3:
        ecrire("donnees_aot.js", aot(sys.argv[3]))
    ecrire("donnees.js", h2o(nasa))
    ecrire("donnees_vegetation.js", vegetation(nasa))
    ecrire("donnees_methane.js", methane())
    ecrire("galerie.js", figures(fig), "GALERIE")


if __name__ == "__main__":
    import warnings
    warnings.filterwarnings("ignore")
    main()

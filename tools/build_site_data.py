"""
DOORAtmosphere – prépare les données du site à partir du dossier de ressources (Google Drive "OMI_Data").

Usage (dans le dossier du projet) :
    pip install numpy scipy pymannkendall pillow
    python tools/build_site_data.py  "C:/chemin/vers/OMI_Data"

Le script parcourt le dossier (et les .zip qu'il contient) et :
  1. OZONE  : lit tous les fichiers OMI TO3 journaliers (.txt), calcule la moyenne quotidienne sur le Maroc,
              les moyennes mensuelles par cellule de 1°, les semestres, anomalies et tendances
              (même méthode que les notebooks H2O / précipitations / HCHO) -> site/data/donnees_ozone.js
  2. IMAGES : copie les cartes / images (AOT, NO2, vent, neige, irradiation, méthane...) dans
              site/assets/images/<variable>/ et écrit le catalogue site/data/galerie.js
  3. DONNÉES DES NOTEBOOKS : copie les fichiers donnees*.js trouvés (H2O, précipitations, HCHO) dans site/data/

Rien n'est inventé : chaque valeur du site vient de ces fichiers.
"""
import argparse
import io
import json
import math
import re
import shutil
import sys
import zipfile
from datetime import date, datetime
from pathlib import Path

import numpy as np
from scipy import stats

RACINE = Path(__file__).resolve().parent.parent
SITE = RACINE / "site"
DATA = SITE / "data"
IMAGES = SITE / "assets" / "images"

ETENDUE = (-20, 2, 19, 38)          # fenêtre Maroc : lon_min, lon_max, lat_min, lat_max
ALPHA, Z_SEUIL, MOIS_MIN_SEMESTRE = 0.05, 1.5, 3
JOURS_MIN_MOIS = 5                  # jours valides minimum pour une moyenne mensuelle de cellule
FRACTION_MIN_JOUR = 0.5             # part minimale des cellules du Maroc pour une moyenne quotidienne

# variable -> mots-clés recherchés dans le chemin (dossier le plus proche du fichier prioritaire)
MOTS = {
    "methane": ["methane", "ch4"], "aot": ["aot", "aerosol", "aod"], "ozone": ["ozone", "o3", "omto3"],
    "no2": ["no2"], "wind": ["wind", "vent"], "snow": ["snow", "neige"],
    "radiation": ["irradiation", "radiation", "rayonnement"], "evaporation": ["evapo"],
    "h2o": ["h2o", "vapeur", "water_vapor", "water vapor"], "precipitation": ["precip", "imerg", "pluie"],
    "hcho": ["hcho", "formald"],
}
EXT_IMAGES = {".png", ".jpg", ".jpeg", ".gif", ".webp"}


# =====================================================================
# Parcours du dossier (fichiers normaux + contenu des .zip)
# =====================================================================
class Entree:
    def __init__(self, chemin, lire, taille):
        self.chemin, self.lire, self.taille = chemin, lire, taille   # chemin "logique" (str), fonction -> bytes


def parcourir(dossier):
    for p in sorted(Path(dossier).rglob("*")):
        if not p.is_file() or "__pycache__" in p.parts:
            continue
        rel = str(p.relative_to(dossier)).replace("\\", "/")
        if p.suffix.lower() == ".zip":
            try:
                z = zipfile.ZipFile(p)
            except zipfile.BadZipFile:
                print("  ! zip illisible :", rel)
                continue
            for info in z.infolist():
                if not info.is_dir():
                    yield Entree(f"{rel[:-4]}/{info.filename}", (lambda z=z, n=info.filename: z.read(n)), info.file_size)
        else:
            yield Entree(rel, p.read_bytes, p.stat().st_size)


def classer(chemin):
    parties = [x.lower() for x in re.split(r"[/\\]", chemin)]
    for partie in reversed(parties):                     # dossier le plus proche du fichier en premier
        mots = re.split(r"[^a-z0-9]+", partie)
        for var, cles in MOTS.items():
            if any(c in mots or (len(c) > 3 and c in partie) for c in cles):
                return var
    return None


# =====================================================================
# Ozone : lecture rapide des fichiers OMI TO3 (grille 1° en texte, champs de 3 caractères)
# =====================================================================
MOIS_EN = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}


def lire_to3(octets):
    """-> (date, grille 180x360 en DU avec NaN, latitudes, longitudes) ou None."""
    texte = octets.decode("ascii", errors="ignore").splitlines()
    if len(texte) < 10 or "TO3" not in texte[0] and "Ozone" not in texte[0]:
        return None
    m = re.search(r"Day:\s*\d+\s+(\w{3})\s+(\d+),\s*(\d{4})", texte[0])
    if not m:
        return None
    jour = date(int(m.group(3)), MOIS_EN[m.group(1)], int(m.group(2)))
    nlon = int(re.search(r"(\d+)\s+bins", texte[1]).group(1))
    nlat = int(re.search(r"(\d+)\s+bins", texte[2]).group(1))
    blocs, buf = [], []
    for ligne in texte[3:]:
        if "lat =" in ligne:
            buf.append(ligne.split("lat =")[0][1:].rstrip())
            blocs.append("".join(buf))
            buf = []
        else:
            buf.append(ligne[1:76].ljust(75))
    if len(blocs) != nlat or any(len(b) != 3 * nlon for b in blocs):
        return None
    a = np.frombuffer("".join(blocs).encode(), dtype=np.uint8).reshape(nlat, nlon, 3).astype(np.int16)
    a = np.where(a == 32, 48, a) - 48                    # espace -> 0
    g = (a[..., 0] * 100 + a[..., 1] * 10 + a[..., 2]).astype(float)
    g[g <= 0] = np.nan
    lat = np.linspace(-90 + 90 / nlat, 90 - 90 / nlat, nlat)
    lon = np.linspace(-180 + 180 / nlon, 180 - 180 / nlon, nlon)
    return jour, g, lat, lon


def masque_maroc(lat, lon):
    """Cellules dont le centre est au Maroc (frontière de site/data/geo.js, avec les provinces du Sud)."""
    from matplotlib.path import Path as MPath
    geo = json.loads((DATA / "geo.js").read_text(encoding="utf-8").split("=", 1)[1].rstrip().rstrip(";"))
    LON, LAT = np.meshgrid(lon, lat)
    pts = np.c_[LON.ravel(), LAT.ravel()]
    m = np.zeros(len(pts), bool)
    for anneau in geo["maroc"]:
        m |= MPath(anneau).contains_points(pts)
    return m.reshape(LAT.shape)


# =====================================================================
# Statistiques (même méthode que les notebooks)
# =====================================================================
def annees(dates):
    return np.array([d.year + (d.month - 0.5) / 12 for d in dates])


def regression_grille(y, t, nmin=20):
    """y : (n_temps, n_cellules) -> pente/décennie et p-value (autocorrélation lag-1 corrigée)."""
    ok = np.isfinite(y)
    n = ok.sum(0)
    T = np.where(ok, t[:, None], np.nan)
    tm, ym = np.nanmean(T, 0), np.nanmean(y, 0)
    sxx = np.nansum((T - tm) ** 2, 0)
    with np.errstate(invalid="ignore", divide="ignore"):
        pente = np.nansum((T - tm) * (y - ym), 0) / sxx
        res = y - (ym + pente * (T - tm))
        r1 = np.nansum(res[1:] * res[:-1], 0) / np.nansum(res ** 2, 0)
        neff = np.clip(n * (1 - r1) / (1 + r1), 3, None)
        neff = np.minimum(neff, n)
        se = np.sqrt(np.nansum(res ** 2, 0) / (n - 2) / sxx)
        p = 2 * stats.t.sf(np.abs(pente / se), np.maximum(neff - 2, 1))
    bad = n < nmin
    pente, p = pente * 10, p
    pente[bad], p[bad] = np.nan, np.nan
    return pente, p


def mann_kendall(x):
    try:
        import pymannkendall as mk
        a, b = mk.original_test(x), mk.hamed_rao_modification_test(x)
        return a.p, b.p, a.trend, a.slope
    except ImportError:                                  # repli : test de Mann-Kendall simple
        n = len(x)
        s = sum(np.sign(x[j] - x[i]) for i in range(n - 1) for j in range(i + 1, n))
        var = n * (n - 1) * (2 * n + 5) / 18
        z = (s - np.sign(s)) / math.sqrt(var) if s else 0.0
        p = 2 * stats.norm.sf(abs(z))
        pentes = [(x[j] - x[i]) / (j - i) for i in range(n - 1) for j in range(i + 1, n)]
        tend = "no trend" if p >= ALPHA else ("increasing" if z > 0 else "decreasing")
        return p, p, tend, float(np.median(pentes))


def analyser(dates, y):
    ok = np.isfinite(y)
    t, v = annees(np.array(dates)[ok]), y[ok]
    r = stats.linregress(t, v)
    res = v - (r.intercept + r.slope * t)
    r1 = np.corrcoef(res[1:], res[:-1])[0, 1]
    neff = float(np.clip(len(v) * (1 - r1) / (1 + r1), 3, len(v)))
    se = math.sqrt(np.sum(res ** 2) / (len(v) - 2) / np.sum((t - t.mean()) ** 2))
    tc = stats.t.ppf(0.975, max(neff - 2, 1))
    mk_p, mk_hr_p, tend, sen = mann_kendall(v)
    return dict(pente=r.slope * 10, ic_bas=(r.slope - tc * se) * 10, ic_haut=(r.slope + tc * se) * 10,
                p_reg=float(2 * stats.t.sf(abs(r.slope / se), max(neff - 2, 1))), mk_p=float(mk_p),
                mk_hr_p=float(mk_hr_p), sen=float(sen) * 20, tendance=str(tend), n=int(len(v)),
                intercept=r.intercept, slope=r.slope)


def liste(a, n=3):
    a = np.asarray(a, dtype=float).ravel()
    return [round(float(x), n) if np.isfinite(x) else None for x in a]


# =====================================================================
# Ozone : série complète
# =====================================================================
def lire_csv_grille(entree):
    """CSV de l'équipe (ex. morocco_ozone_grid_daily_all.csv) : colonnes date, lat, lon, ozone -> {jour: {(lat, lon): v}}."""
    import csv
    texte = entree.lire().decode("utf-8", errors="ignore").splitlines()
    lecteur = csv.DictReader(texte)
    cols = {c.lower(): c for c in (lecteur.fieldnames or [])}
    cd = next((cols[c] for c in cols if "date" in c or c == "day"), None)
    cla = next((cols[c] for c in cols if c.startswith("lat")), None)
    clo = next((cols[c] for c in cols if c.startswith("lon")), None)
    cv = next((cols[c] for c in cols if "ozone" in c or c.endswith("_du") or c == "du"), None)
    if not all((cd, cla, clo, cv)):
        print("  CSV ignoré (colonnes non reconnues) :", entree.chemin, lecteur.fieldnames)
        return {}
    out = {}
    for r in lecteur:
        try:
            j = date.fromisoformat(r[cd][:10]); v = float(r[cv])
        except (ValueError, TypeError):
            continue
        if v > 0:
            out.setdefault(j, {})[(float(r[cla]), float(r[clo]))] = v
    print(f"  CSV de l'équipe : {entree.chemin} -> {len(out)} jours")
    return out


def moyenne_ponderee(g, w):
    ok = np.isfinite(g) & (w > 0)
    return float(np.sum(np.where(ok, g, 0) * w) / np.sum(w * ok)) if ok.any() else np.nan


def traiter_ozone(entrees):
    fichiers = [e for e in entrees if e.chemin.lower().endswith(".txt") and classer(e.chemin) in ("ozone", None)
                and e.taille > 100_000]
    csvs = [e for e in entrees if e.chemin.lower().endswith(".csv") and "ozone" in e.chemin.lower() and "grid" in e.chemin.lower()]
    if not fichiers and not csvs:
        print("Ozone : aucun fichier OMI TO3 trouvé")
        return
    print(f"Ozone : {len(fichiers)} fichiers .txt candidats, {len(csvs)} CSV de grille…")
    lo0, lo1, la0, la1 = ETENDUE
    lat_w = np.arange(la0 + 0.5, la1, 1.0)            # grille 1° de la fenêtre (centres en x.5)
    lon_w = np.arange(lo0 + 0.5, lo1, 1.0)
    masque = masque_maroc(lat_w, lon_w)
    poids = np.cos(np.deg2rad(lat_w))[:, None] * masque
    grilles, jours, glob_jour = {}, {}, {}
    somme_g = compte_g = None
    dernier, lat, lon = None, None, None
    for i, e in enumerate(fichiers):
        r = lire_to3(e.lire())
        if r is None:
            continue
        jour, g, lat, lon = r
        if somme_g is None:
            il = [int(np.argmin(np.abs(lat - x))) for x in lat_w]
            jl = [int(np.argmin(np.abs(lon - x))) for x in lon_w]
            bande = (lat >= -60) & (lat <= 60)
            wg = np.cos(np.deg2rad(lat))[:, None] * np.ones((1, len(lon)))
            wg[~bande] = 0
            somme_g, compte_g = np.zeros_like(g), np.zeros_like(g)
        ok = np.isfinite(g)
        somme_g += np.where(ok, g, 0); compte_g += ok
        grilles[jour] = g[np.ix_(il, jl)]
        gm = g[bande]
        if np.isfinite(gm).mean() >= FRACTION_MIN_JOUR:
            glob_jour[jour] = moyenne_ponderee(g, wg)
        if dernier is None or jour > dernier[0]:
            dernier = (jour, g)
        if (i + 1) % 500 == 0:
            print(f"   {i + 1}/{len(fichiers)} fichiers lus")
    for e in csvs:                                     # résultats déjà traités par l'équipe
        for jour, cellules in lire_csv_grille(e).items():
            if jour in grilles:
                continue
            w = np.full((len(lat_w), len(lon_w)), np.nan)
            for (la, lo), v in cellules.items():
                i = int(round(la - lat_w[0])); k = int(round(lo - lon_w[0]))
                if 0 <= i < len(lat_w) and 0 <= k < len(lon_w):
                    w[i, k] = v
            grilles[jour] = w
    if not grilles:
        print("Ozone : aucun fichier OMI TO3 lisible")
        return
    for jour, w in grilles.items():
        v = np.isfinite(w) & masque
        if v.sum() >= FRACTION_MIN_JOUR * masque.sum():
            jours[jour] = moyenne_ponderee(w, poids)
    dates = sorted(grilles)
    print(f"Ozone : {len(dates)} jours, de {dates[0]} à {dates[-1]} ({len(glob_jour)} jours avec moyenne quasi-globale)")

    mois = sorted({(d.year, d.month) for d in dates})
    meta = dict(zone="Maroc", zone_texte="le Maroc (avec les provinces du Sud)", variable="ozone",
                titre="Total ozone column (O₃)", produit="Aura OMI TO3 daily Level-3 1°×1° grid",
                version="", unite="DU", alpha=ALPHA, z_seuil=Z_SEUIL, etendue=list(ETENDUE), boite=None,
                taille_marqueur=40, fin_pre=None, nom_coupure="", genere_le=date.today().isoformat(),
                jours=len(dates), premier_jour=str(dates[0]), dernier_jour=str(dates[-1]),
                nature="observation", resolution_temporelle="daily", couverture_globale=bool(somme_g is not None))
    sortie = dict(meta=meta, lat=liste(lat_w, 2), lon=liste(lon_w, 2), au_maroc=[int(x) for x in masque.ravel()])
    if somme_g is not None:
        moyenne_globale = np.where(compte_g > 0, somme_g / np.maximum(compte_g, 1), np.nan)
        sortie["globale"] = dict(lat0=float(lat[0]), lon0=float(lon[0]), dlat=float(lat[1] - lat[0]),
                                 dlon=float(lon[1] - lon[0]), nlat=len(lat), nlon=len(lon),
                                 moyenne=liste(moyenne_globale, 1), dernier_jour=str(dernier[0]),
                                 dernier=liste(dernier[1], 0) if len(dates) > 1 else None,
                                 periode=f"{dates[0]} → {dates[-1]}", jours=int(len(glob_jour)))

    def serie_quotidienne(dct):
        d0 = min(dct)
        return dict(debut=str(d0), jours=[(d - d0).days for d in sorted(dct)], valeurs=[round(dct[d], 1) for d in sorted(dct)])
    if jours:
        sortie["quotidien"] = serie_quotidienne(jours)
    if glob_jour:
        sortie["global_quotidien"] = serie_quotidienne(glob_jour)
        sortie["global_quotidien"]["zone"] = "Near-global mean, 60°S–60°N"

    # moyennes mensuelles : par cellule (cube), Maroc, quasi-global
    cube = []
    for (an, m) in mois:
        pile = np.stack([grilles[d] for d in dates if d.year == an and d.month == m])
        moy = np.nanmean(pile, 0)
        moy[np.isfinite(pile).sum(0) < JOURS_MIN_MOIS] = np.nan
        cube.append(moy)
    cube = np.stack(cube)
    etiq_mois = [f"{a}-{m:02d}" for a, m in mois]
    sortie["cube"] = dict(mois=etiq_mois, valeurs=liste(cube, 1),
                          n_jours=[sum(1 for d in dates if (d.year, d.month) == am) for am in mois])
    m_maroc = np.array([moyenne_ponderee(c, poids) for c in cube])
    sortie["mensuel"] = dict(mois=etiq_mois, valeurs=liste(m_maroc, 2))
    if glob_jour:
        gm = {am: [v for d, v in glob_jour.items() if (d.year, d.month) == am] for am in mois}
        sortie["global_mensuel"] = dict(mois=etiq_mois, valeurs=liste([np.mean(v) if len(v) >= JOURS_MIN_MOIS else np.nan
                                                                       for v in gm.values()], 2),
                                        zone="Near-global mean, 60°S–60°N")
    carte_moy = np.nanmean(np.stack([grilles[d] for d in dates]), 0)

    def instantane(msg):
        print("Ozone :", msg)
        meta["type"] = "instantane"
        sortie["niveaux"] = [dict(plev=None, carte=dict(moyenne=liste(carte_moy, 1), au_maroc=sortie["au_maroc"]))]
        ecrire("donnees_ozone.js", sortie)

    if len(mois) < 24:
        return instantane(f"seulement {len(mois)} mois -> cartes et séries courtes, sans tendance")
    code = np.array([an * 10 + (1 if m <= 6 else 2) for an, m in mois])
    codes = [c for c in sorted(set(code)) if (np.isfinite(m_maroc[code == c]).sum()) >= MOIS_MIN_SEMESTRE]
    sem = np.stack([np.nanmean(cube[code == c], 0) for c in codes])
    type_s = np.array([c % 10 for c in codes])
    anom = np.full_like(sem, np.nan)
    for k in (1, 2):
        sub = sem[type_s == k]
        anom[type_s == k] = sub - np.nanmean(sub, 0)
    t_sem = [date(c // 10, 4 if c % 10 == 1 else 10, 1) for c in codes]
    pente, pval = regression_grille(anom.reshape(len(codes), -1), annees(t_sem))
    m_sem = np.array([np.nanmean(m_maroc[code == c]) for c in codes])
    a_sem, z_sem = np.full_like(m_sem, np.nan), np.full_like(m_sem, np.nan)
    for k in (1, 2):
        sub = m_sem[type_s == k]
        a_sem[type_s == k] = sub - sub.mean()
        z_sem[type_s == k] = a_sem[type_s == k] / sub.std(ddof=1)
    if np.isfinite(a_sem).sum() < 12:
        return instantane("moins de 12 semestres valides -> pas de tendance calculée")
    r = analyser(t_sem, a_sem)
    t = annees(t_sem)
    sd = {k: float(np.std(a_sem[type_s == k], ddof=1)) for k in (1, 2)}
    ybar, tbar = float(np.nanmean(a_sem)), float(t.mean())
    etiq = [f"{c // 10}-S{c % 10}" for c in codes]
    meta.update(type="serie", debut=etiq[0], fin=etiq[-1])
    tend = {k: v for k, v in r.items() if k not in ("intercept", "slope")}
    sortie.update(etiq=etiq, hunga=None, evenement=None, npre=None, niveau_defaut=0, profils=[])
    sortie["niveaux"] = [dict(
        plev=None, moyenne=liste(m_sem, 2), anomalie=liste(a_sem, 3), z=liste(z_sem, 3),
        bande=liste([Z_SEUIL * sd[k] for k in type_s], 3), tendance=tend, tendance_pre=None,
        ligne=liste(r["intercept"] + r["slope"] * t, 3), ligne_pre=None,
        ic_bas_ligne=liste(ybar + r["ic_bas"] / 10 * (t - tbar), 3),
        ic_haut_ligne=liste(ybar + r["ic_haut"] / 10 * (t - tbar), 3),
        carte=dict(moyenne=liste(carte_moy, 1), pente=liste(pente, 3),
                   sig=[int(x) for x in (np.nan_to_num(pval, nan=1) < ALPHA)], au_maroc=sortie["au_maroc"]))]
    clim = [m_maroc[[i for i, (_, mm) in enumerate(mois) if mm == k]] for k in range(1, 13)]
    sortie["cycle"] = dict(mois=list(range(1, 13)), moyenne=liste([np.nanmean(c) for c in clim], 2),
                           ecart_type=liste([np.nanstd(c, ddof=1) if len(c) > 1 else np.nan for c in clim], 2))
    print(f"Ozone : {len(codes)} semestres, tendance Maroc {r['pente']:+.2f} DU/décennie (p = {r['p_reg']:.3f})")
    ecrire("donnees_ozone.js", sortie)


# =====================================================================
# Images
# =====================================================================
def date_nom(nom):
    for motif, fmt in [(r"(\d{4})m(\d{2})(\d{2})", "{0}-{1}-{2}"), (r"(\d{4})[-_.](\d{2})[-_.](\d{2})", "{0}-{1}-{2}"),
                       (r"(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)", "{0}-{1}-{2}"), (r"(\d{4})[-_.](\d{2})(?!\d)", "{0}-{1}"),
                       (r"(?<!\d)(19\d{2}|20\d{2})(?!\d)", "{0}")]:
        m = re.search(motif, nom)
        if m:
            return fmt.format(*m.groups())
    return None


def traiter_images(entrees, max_px):
    import hashlib
    legendes = {}
    f_leg = Path(__file__).with_name("legendes_figures.json")
    if f_leg.exists():
        legendes = {k: v for k, v in json.loads(f_leg.read_text(encoding="utf-8")).items() if not k.startswith("_")}
    vus = set()
    try:
        from PIL import Image
    except ImportError:
        Image = None
        print("Images : Pillow absent, copie sans redimensionnement (pip install pillow pour des pages plus légères)")
    galerie = {}
    for e in entrees:
        ext = Path(e.chemin).suffix.lower()
        if ext not in EXT_IMAGES:
            continue
        var = classer(e.chemin)
        if var is None:
            continue
        data = e.lire()
        empreinte = hashlib.sha1(data).hexdigest()
        if empreinte in vus:                         # même image présente deux fois (dossier + zip)
            continue
        vus.add(empreinte)
        nom = re.sub(r"[^A-Za-z0-9._-]+", "_", e.chemin.replace("/", "__"))[-120:]
        dst = IMAGES / var / nom
        dst.parent.mkdir(parents=True, exist_ok=True)
        if Image is not None and ext in (".png", ".jpg", ".jpeg"):
            try:
                im = Image.open(io.BytesIO(data))
                im.thumbnail((max_px, max_px))
                if ext == ".png":
                    im.save(dst, optimize=True)
                else:
                    im.convert("RGB").save(dst, quality=85, optimize=True)
                l, h = im.size
            except Exception:
                dst.write_bytes(data); l = h = None
        else:
            dst.write_bytes(data); l = h = None
        leg = legendes.get(Path(e.chemin).name, {})
        galerie.setdefault(var, []).append(dict(src=f"assets/images/{var}/{nom}", titre=leg.get("titre", Path(e.chemin).stem),
                                                type=leg.get("type", "team"), source=leg.get("source", ""),
                                                origine=e.chemin, date=None if leg else date_nom(Path(e.chemin).name),
                                                largeur=l, hauteur=h))
    for v in galerie.values():
        v.sort(key=lambda x: x["origine"])
    ecrire("galerie.js", galerie, nom_global="GALERIE")
    print("Images :", {k: len(v) for k, v in galerie.items()} or "aucune")


def copier_donnees(entrees):
    for e in entrees:
        nom = Path(e.chemin).name
        if re.fullmatch(r"donnees(_[a-z0-9]+)?\.js", nom) and nom != "donnees_ozone.js":
            (DATA / nom).write_bytes(e.lire())
            print("Données copiées :", e.chemin, "->", f"site/data/{nom}")


def ecrire(nom, objet, nom_global="DONNEES"):
    p = DATA / nom
    p.write_text(f"window.{nom_global} = " + json.dumps(objet, ensure_ascii=False, separators=(",", ":")) + ";\n",
                 encoding="utf-8")
    print(f"   -> {p.relative_to(RACINE)} ({p.stat().st_size / 1e6:.2f} Mo)")


def main():
    import warnings
    warnings.filterwarnings("ignore", category=RuntimeWarning)
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dossier", help="dossier de ressources (ex. OMI_Data téléchargé depuis Google Drive)")
    a = ap.parse_args()
    if not Path(a.dossier).is_dir():
        sys.exit(f"Dossier introuvable : {a.dossier}")
    print("Lecture de", a.dossier)
    entrees = list(parcourir(a.dossier))
    print(f"{len(entrees)} fichiers trouvés (zip compris)")
    copier_donnees(entrees)
    traiter_ozone(entrees)
    # Les figures de l'équipe sont gérées par tools/build_team_data.py (noms par substance + explications).
    print("Terminé. Relancez ensuite tools/build_team_data.py pour mettre à jour les séries semestrielles de l'ozone.")


if __name__ == "__main__":
    main()

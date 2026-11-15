"""
Wind and solar irradiation: semester series + Morocco maps from tools/extract_maps.py output.
Usage: python tools/build_maps_data.py <maps_values.json>
Writes site/data/donnees_wind.js and site/data/donnees_radiation.js (same format as the notebooks).
"""
import json, sys, warnings
from datetime import date
import numpy as np
sys.path.insert(0, __import__("os").path.dirname(__file__))
from build_team_data import niveau, analyser, t_sem, dans_maroc, geo, ecrire, liste, ALPHA, Z_SEUIL

META = {
    "wind": dict(variable="wind", titre="Wind speed at 50 m", unite="m/s", fichier="donnees_wind.js",
                 produit="Wind speed 50 m — semester maps produced by the team (maps_wind), values recovered from the colour scale"),
    "radiation": dict(variable="radiation", titre="Surface solar irradiation (SWGDN)", unite="W/m²", fichier="donnees_radiation.js",
                      produit="Irradiation SWGDN — semester maps produced by the team (maps_irradiation), values recovered from the colour scale"),
}


def jeu(d, cle):
    S = d["semestres"]
    etiq = [s["etiq"] for s in S]
    nbm = [6] * len(S)
    lat, lon = d["lat"], d["lon"]
    G = np.array([[np.nan if v is None else v for v in s["grille"]] for s in S])
    t = np.array([t_sem(e) for e in etiq])
    moy = np.nanmean(G, 0)
    pente, sig = [], []
    for k in range(G.shape[1]):
        y = G[:, k].copy()
        for typ in ("S1", "S2"):
            i = np.array([e.endswith(typ) for e in etiq])
            y[i] = y[i] - np.nanmean(y[i])
        r = analyser(t, y)
        pente.append(None if r is None else round(r["pente"], 4))
        sig.append(int(bool(r) and r["p_reg"] < ALPHA and r["mk_hr_p"] < ALPHA))
    am = dans_maroc(lat, lon, geo()["maroc"])
    carte = dict(moyenne=liste(moy, 3), pente=pente, sig=sig, au_maroc=am)
    n = niveau(etiq, [s["maroc"] for s in S], nbm, plev=None, carte=carte)
    m = META[cle]
    sat = max(s["sat_maroc"] for s in S)
    return dict(
        meta=dict(zone="Maroc", zone_texte="Morocco (map pixels inside the borders, latitude-weighted)", variable=m["variable"], titre=m["titre"],
                  etendue=[-20, 2, 19, 38], boite=None, taille_marqueur=12, produit=m["produit"], version="", unite=m["unite"],
                  alpha=ALPHA, z_seuil=Z_SEUIL, fin_pre=None, nom_coupure="", genere_le=date.today().isoformat(), debut=etiq[0], fin=etiq[-1],
                  nature="team", echelle=[d["vmin"], d["vmax"]],
                  note_methode=f"Values read from the colours of the team's maps (fixed colour bar {d['vmin']:.4g}–{d['vmax']:.4g} {m['unite']}); "
                               f"pixels beyond the bar are clipped (at most {sat:.1f} % of Morocco's pixels in one semester)."),
        etiq=etiq, evenement=None, npre=None, lat=lat, lon=lon, au_maroc=am, niveaux=[n], niveau_defaut=0, profils=[],
        global_semestres=dict(zone="World (whole map, latitude-weighted)", etiq=etiq, niveaux={"null": [s["monde"] for s in S]}),
        saturation=dict(maroc=[s["sat_maroc"] for s in S], monde=[s["sat_monde"] for s in S]))


if __name__ == "__main__":
    warnings.filterwarnings("ignore")
    D = json.load(open(sys.argv[1]))
    for cle in ("wind", "radiation"):
        j = jeu(D[cle], cle)
        tr = j["niveaux"][0]["tendance"]
        print(cle, j["etiq"][0], j["etiq"][-1], "trend/decade", round(tr["pente"], 4), [round(tr["ic_bas"], 4), round(tr["ic_haut"], 4)], "p", round(tr["p_reg"], 4), round(tr["mk_hr_p"], 4))
        ecrire(META[cle]["fichier"], j)

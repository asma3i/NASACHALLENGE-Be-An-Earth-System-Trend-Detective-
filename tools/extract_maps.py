"""
Recover the values of the team's wind and irradiation maps (one PNG per semester) by inverting their colour bar.

The maps were drawn by the team with a fixed colour scale (identical colour bar on every semester),
so each pixel colour corresponds to one value. Values beyond the colour bar (arrows) are clipped to its ends.
Output: per semester, the Morocco mean (pixels inside the borders, cos-latitude weighted), the world mean,
the share of clipped pixels, and a 1° grid of the Morocco window.

Usage: python tools/extract_maps.py <maps_wind folder> <maps_irradiation folder> <out.json>
"""
import glob, json, os, re, sys
import numpy as np
from PIL import Image
from scipy.spatial import cKDTree
from matplotlib.path import Path

X0, X1, Y0, Y1 = 77, 825, 34, 456            # inner plot area (pixels) = lon -180..180, lat 90..-90
BAR = (880, 889, 54, 435)                    # colour-bar rectangle (x0, x1, y0, y1)
CFG = {"wind": dict(ticks=[(99, 10), (176, 8), (253, 6), (330, 4), (408, 2)], unite="m/s"),
       "irr": dict(ticks=[(100, 250), (185, 200), (270, 150), (356, 100)], unite="W/m²")}

ICI = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(ICI, "..", "site", "data", "geo.js"), encoding="utf-8").read()
MAROC = [Path(np.array(p)) for p in json.loads(s[s.index("{"):].rstrip().rstrip(";"))["maroc"]]


def lut(img, ticks):
    a = np.asarray(img.convert("RGB")).astype(float)
    ys = np.arange(BAR[2], BAR[3] + 1)
    cols = a[BAR[2]:BAR[3] + 1, BAR[0]:BAR[1] + 1].mean(1)
    ty, tv = np.array(ticks).T
    p = np.polyfit(ty, tv, 1)
    return cols, np.polyval(p, ys), np.polyval(p, [BAR[2], BAR[3]])


def traiter(dossier, cle):
    fs = sorted(glob.glob(os.path.join(dossier, "*.png")))
    cols, vals, (vmax, vmin) = lut(Image.open(fs[0]), CFG[cle]["ticks"])
    arbre = cKDTree(cols)
    nx, ny = X1 - X0 + 1, Y1 - Y0 + 1
    lon = -180 + (np.arange(nx) + .5) * 360 / nx
    lat = 90 - (np.arange(ny) + .5) * 180 / ny
    LO, LA = np.meshgrid(lon, lat)
    w = np.cos(np.deg2rad(LA))
    pts = np.c_[LO.ravel(), LA.ravel()]
    dans = np.zeros(len(pts), bool)
    for c in MAROC:
        dans |= c.contains_points(pts)
    dans = dans.reshape(LA.shape)
    # Morocco window 1° grid (19-38N, 20W-2E)
    glat = np.arange(19.5, 38, 1.0); glon = np.arange(-19.5, 2, 1.0)
    out = dict(unite=CFG[cle]["unite"], vmin=round(float(vmin), 3), vmax=round(float(vmax), 3), lat=glat.tolist(), lon=glon.tolist(), semestres=[])
    for f in fs:
        e = re.search(r"(\d{4}-S[12])", os.path.basename(f)).group(1)
        a = np.asarray(Image.open(f).convert("RGB")).astype(float)[Y0:Y1 + 1, X0:X1 + 1]
        dist, idx = arbre.query(a.reshape(-1, 3))
        v = vals[idx].reshape(LA.shape)
        bad = dist.reshape(LA.shape) > 30            # not a colour of the scale
        v = np.where(bad, np.nan, v)
        sat = (idx == 0) | (idx == len(vals) - 1)
        sat = sat.reshape(LA.shape)
        ok = np.isfinite(v)
        mm = ok & dans
        grille = []
        for la in glat:
            for lo in glon:
                m = ok & (np.abs(LA - la) <= .5) & (np.abs(LO - lo) <= .5)
                grille.append(round(float(v[m].mean()), 3) if m.any() else None)
        out["semestres"].append(dict(
            etiq=e, maroc=round(float((v[mm] * w[mm]).sum() / w[mm].sum()), 4),
            monde=round(float((v[ok] * w[ok]).sum() / w[ok].sum()), 4),
            sat_maroc=round(float(sat[mm].mean() * 100), 2), sat_monde=round(float((sat & ok).sum() / ok.sum() * 100), 2),
            pixels_maroc=int(mm.sum()), grille=grille, fichier=os.path.basename(f)))
        print(cle, e, out["semestres"][-1]["maroc"], out["semestres"][-1]["monde"], out["semestres"][-1]["sat_maroc"], out["semestres"][-1]["sat_monde"])
    return out


if __name__ == "__main__":
    res = {"wind": traiter(sys.argv[1], "wind"), "radiation": traiter(sys.argv[2], "irr")}
    json.dump(res, open(sys.argv[3], "w"))

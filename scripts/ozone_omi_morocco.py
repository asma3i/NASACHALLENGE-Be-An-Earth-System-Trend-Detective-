"""
Visualisation of an OMI (Aura) Total Ozone Column (TO3) gridded ASCII file
 - Figure 1 : global map (same style as the NASA OMI images)
 - Figure 2 : Morocco only (data clipped to the national border)
 - CSV      : ozone values of every 1° x 1° cell inside Morocco

Usage:
    pip install numpy matplotlib geopandas shapely
    python ozone_omi_morocco.py                 -> a window opens to choose the .txt
    python ozone_omi_morocco.py data.txt        -> or give the file directly
    python ozone_omi_morocco.py a.txt b.txt     -> several days at once
    add --no-sahara to draw Morocco without the southern provinces
Results are saved next to the .txt:  <name>_global.png, <name>_morocco.png, <name>_morocco.csv

File format (NASA TOMS/OMI ".txt" Level-3 grid):
    3 header lines, then 180 latitude blocks (89.5S -> 89.5N),
    each block = 360 values (179.5W -> 179.5E) written as 3-character fields,
    25 per line, the block ends with "lat = xx.x". 0 = no data.
"""

import os
import re
import sys
import urllib.request

import numpy as np
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import geopandas as gpd
import shapely
from matplotlib.path import Path
from matplotlib.patches import PathPatch

# ----------------------------------------------------------------------------
# Settings
# ----------------------------------------------------------------------------
VMIN, VMAX = 100, 500            # colour scale in Dobson Units (same as the image)
CMAP = plt.get_cmap("jet").copy()
CMAP.set_bad("white")            # cells without data (value 0)

NE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "natural_earth")  # border cache
NE_NAME = "ne_50m_admin_0_countries"
NE_URL = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
          "master/50m_cultural/" + NE_NAME)


# ----------------------------------------------------------------------------
# 1. Read the OMI file
# ----------------------------------------------------------------------------
def read_omi_grid(path):
    with open(path, "r") as f:
        lines = f.read().splitlines()

    header = lines[0].strip()
    # longitude / latitude description (lines 2 and 3)
    nlon = int(re.search(r"(\d+)\s+bins", lines[1]).group(1))
    nlat = int(re.search(r"(\d+)\s+bins", lines[2]).group(1))

    rows, lats, buf = [], [], ""
    for line in lines[3:]:
        if "lat =" in line:
            data_part, lat_part = line.split("lat =")
            buf += data_part[1:].rstrip()
            lats.append(float(lat_part))
            # values are fixed-width 3-character fields (no separator!)
            vals = _split_fixed(buf, nlon)
            rows.append(vals)
            buf = ""
        else:
            buf += line[1:76].ljust(75)   # 1 leading space + 25 values x 3 chars

    grid = np.array(rows, dtype=float)               # shape (nlat, nlon)
    grid = np.ma.masked_less_equal(grid, 0)          # 0 = missing
    lats = np.array(lats)
    lons = np.linspace(-180 + 180 / nlon, 180 - 180 / nlon, nlon)
    return header, lons, lats, grid


def _split_fixed(buf, n):
    """Cut the concatenated string into n integers of 3 characters each."""
    if len(buf) != 3 * n:
        raise ValueError(f"expected {3 * n} characters, got {len(buf)}")
    return [int(buf[3 * i: 3 * i + 3]) for i in range(n)]


# ----------------------------------------------------------------------------
# 2. Country borders (Natural Earth)
# ----------------------------------------------------------------------------
def load_countries():
    os.makedirs(NE_DIR, exist_ok=True)
    for ext in ("shp", "shx", "dbf", "prj"):
        dst = os.path.join(NE_DIR, f"{NE_NAME}.{ext}")
        if not os.path.exists(dst):
            print("downloading", os.path.basename(dst))
            urllib.request.urlretrieve(f"{NE_URL}.{ext}", dst)
    return gpd.read_file(os.path.join(NE_DIR, f"{NE_NAME}.shp"))


def morocco_geometry(countries, include_sahara=True):
    names = ["Morocco", "Western Sahara"] if include_sahara else ["Morocco"]
    return countries[countries.ADMIN.isin(names)].geometry.union_all()


def geom_to_path(geom):
    """shapely (Multi)Polygon -> matplotlib Path (used to clip the image)."""
    polys = geom.geoms if geom.geom_type == "MultiPolygon" else [geom]
    verts, codes = [], []
    for p in polys:
        for ring in [p.exterior, *p.interiors]:
            xy = np.asarray(ring.coords)
            verts.extend(xy)
            codes.extend([Path.MOVETO] + [Path.LINETO] * (len(xy) - 2) + [Path.CLOSEPOLY])
    return Path(np.array(verts), codes)


# ----------------------------------------------------------------------------
# 3. Global map
# ----------------------------------------------------------------------------
def plot_global(header, lons, lats, grid, countries, out="ozone_global.png"):
    lon_e = np.linspace(-180, 180, len(lons) + 1)
    lat_e = np.linspace(-90, 90, len(lats) + 1)

    fig, ax = plt.subplots(figsize=(14, 7.6))
    pm = ax.pcolormesh(lon_e, lat_e, grid, cmap=CMAP, vmin=VMIN, vmax=VMAX,
                       shading="flat")
    countries.boundary.plot(ax=ax, color="black", linewidth=0.5)

    ax.set_xlim(-180, 180); ax.set_ylim(-90, 90)
    ax.set_xticks(range(-180, 181, 60))
    ax.set_yticks(range(-90, 91, 30))
    ax.set_xticklabels([_lon_lbl(x) for x in range(-180, 181, 60)])
    ax.set_yticklabels([_lat_lbl(y) for y in range(-90, 91, 30)])
    ax.set_aspect("equal")
    ax.set_xlabel(""); ax.set_ylabel("")

    date, gen = _parse_header(header)
    ax.set_title(f"OMI (Aura) – Total Ozone Column (TO3)\n{date}  |  {gen}",
                 loc="left", fontsize=13)

    cb = fig.colorbar(pm, ax=ax, orientation="horizontal", pad=0.07,
                      fraction=0.05, aspect=50)
    cb.set_label("Total Ozone Column (Dobson Units)")
    fig.tight_layout()
    fig.savefig(out, dpi=150)
    print("saved", out)
    return fig


# ----------------------------------------------------------------------------
# 4. Morocco only
# ----------------------------------------------------------------------------
def plot_morocco(header, lons, lats, grid, countries, include_sahara=True,
                 out="ozone_morocco.png", csv_out="ozone_morocco.csv"):
    mar = morocco_geometry(countries, include_sahara)
    minx, miny, maxx, maxy = mar.bounds
    pad = 1.5

    # --- cells whose centre lies inside Morocco (for statistics / CSV)
    LON, LAT = np.meshgrid(lons, lats)
    inside = shapely.contains_xy(mar, LON, LAT)
    vals = grid[inside]
    valid = vals.compressed() if np.ma.isMaskedArray(vals) else vals
    w = np.cos(np.deg2rad(LAT[inside]))[~np.ma.getmaskarray(vals)]
    mean_w = np.average(valid, weights=w)

    np.savetxt(csv_out,
               np.column_stack([LAT[inside], LON[inside], vals.filled(np.nan)]),
               delimiter=",", header="lat,lon,ozone_DU", comments="", fmt="%.1f")
    print("saved", csv_out, f"({inside.sum()} cells)")

    # --- local colour scale (stretched to Morocco's range -> more contrast)
    lo, hi = np.floor(valid.min() / 5) * 5, np.ceil(valid.max() / 5) * 5
    norm = mcolors.Normalize(lo, hi)

    lon_e = np.linspace(-180, 180, len(lons) + 1)
    lat_e = np.linspace(-90, 90, len(lats) + 1)

    fig, axes = plt.subplots(1, 2, figsize=(15, 7.5),
                             gridspec_kw={"width_ratios": [1, 1]})

    # (a) regional view with the global 100-500 DU scale
    ax = axes[0]
    pm0 = ax.pcolormesh(lon_e, lat_e, grid, cmap=CMAP, vmin=VMIN, vmax=VMAX)
    countries.boundary.plot(ax=ax, color="black", linewidth=0.5)
    gpd.GeoSeries([mar]).boundary.plot(ax=ax, color="magenta", linewidth=2)
    ax.set_xlim(minx - 8, maxx + 8); ax.set_ylim(miny - 6, maxy + 6)
    ax.set_aspect("equal")
    ax.set_title("North-West Africa – global scale (100–500 DU)\nMorocco outlined in magenta")
    fig.colorbar(pm0, ax=ax, orientation="horizontal", pad=0.08,
                 label="Dobson Units")

    # (b) Morocco isolated: image clipped to the border, local scale
    ax = axes[1]
    countries.plot(ax=ax, color="#eeeeee", edgecolor="#999999", linewidth=0.5)
    pm1 = ax.pcolormesh(lon_e, lat_e, grid, cmap=CMAP, norm=norm)
    clip = PathPatch(geom_to_path(mar), transform=ax.transData,
                     facecolor="none")
    ax.add_patch(clip)
    pm1.set_clip_path(clip)
    gpd.GeoSeries([mar]).boundary.plot(ax=ax, color="black", linewidth=1.2)

    # write the value of each 1° cell
    for la, lo_, v in zip(LAT[inside], LON[inside], vals):
        if v is not np.ma.masked:
            ax.text(lo_, la, f"{v:.0f}", ha="center", va="center", fontsize=6.5,
                    color="black" if norm(v) > 0.25 else "white")

    ax.set_xlim(minx - pad, maxx + pad); ax.set_ylim(miny - pad, maxy + pad)
    ax.set_aspect("equal")
    ax.set_xticks(np.arange(np.floor(minx), maxx + 1, 2))
    ax.set_yticks(np.arange(np.floor(miny), maxy + 1, 2))
    ax.grid(color="white", alpha=0.3, linewidth=0.5)
    ax.set_title("Morocco – total ozone (local scale)\n"
                 f"min {valid.min():.0f}  |  mean {mean_w:.1f}  |  "
                 f"max {valid.max():.0f} DU   ({len(valid)} cells of 1°×1°)")
    fig.colorbar(pm1, ax=ax, orientation="horizontal", pad=0.08,
                 label="Dobson Units")

    for a in axes:
        a.set_xlabel("Longitude (°)"); a.set_ylabel("Latitude (°)")

    date, _ = _parse_header(header)
    fig.suptitle(f"OMI (Aura) TO3 – {date}", fontsize=14)
    fig.tight_layout()
    fig.savefig(out, dpi=150)
    print("saved", out)
    return fig


# ----------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------
def _parse_header(h):
    m = re.search(r"Day:\s*(\d+)\s+(\w+\s+\d+,\s*\d+)", h)
    date = f"Day {m.group(1)} ({m.group(2)})" if m else h
    g = re.search(r"(GEN:\S+.*?LECT:\s*[\d:]+\s*[ap]m)", h)
    return date, (g.group(1) if g else "")


def _lon_lbl(x):
    return "0°" if x == 0 else f"{abs(x)}°{'E' if x > 0 else 'W'}"


def _lat_lbl(y):
    return "0°" if y == 0 else f"{abs(y)}°{'N' if y > 0 else 'S'}"


# ----------------------------------------------------------------------------
def choose_file():
    """Ask for the .txt file: file dialog if possible, otherwise type the path."""
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk(); root.withdraw(); root.attributes("-topmost", True)
        path = filedialog.askopenfilename(
            title="Choose the OMI ozone .txt file",
            filetypes=[("Text files", "*.txt"), ("All files", "*.*")])
        root.destroy()
        if path:
            return path
    except Exception:
        pass
    return input("Path of the OMI .txt file: ").strip().strip('"')


def run(path, include_sahara=True, show=True):
    """Full pipeline: read the .txt -> global map + Morocco map + CSV."""
    header, lons, lats, grid = read_omi_grid(path)
    print(header)
    print(f"grid {grid.shape}, valid cells: {grid.count()}, "
          f"range {grid.min():.0f}-{grid.max():.0f} DU")

    # results are saved next to the .txt file, named after it
    base = os.path.splitext(os.path.abspath(path))[0]
    countries = load_countries()
    plot_global(header, lons, lats, grid, countries, out=base + "_global.png")
    plot_morocco(header, lons, lats, grid, countries, include_sahara,
                 out=base + "_morocco.png", csv_out=base + "_morocco.csv")
    if show:
        plt.show()


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    include_sahara = "--no-sahara" not in sys.argv
    files = args if args else [choose_file()]
    for f in files:                      # you can give several .txt files at once
        if not os.path.isfile(f):
            sys.exit(f"File not found: {f}")
        run(f, include_sahara, show=(len(files) == 1))

# DOORAtmosphere — Be An Earth System Trend Detective

*Open the DOOR to Earth's Atmosphere. Discover · Observe · Reveal.*

**NASA Space Apps Challenge 2026** — challenge *Be An Earth System Trend Detective!*
Team **AerO-Club**: Aya LACHKAR · Abderazzak ASMAY · Naouar EL KENDI · Said OUKAAI · Asmae EL GHAZI · Omar BENRAQQOUCH

DOORAtmosphere is an interactive website that turns NASA Earth-observation data into maps, semester time series and
statistically tested trends, from the whole planet down to Morocco. Every analysis uses **one value every 6 months**
(S1 = January–June, S2 = July–December) from 2004 to 2026.

➡ **Open the site:** `site/index.html` (works offline, no installation) — or the GitHub Pages link once Pages is enabled (see below).

---

## Repository structure

```
.
├── site/                    The website (static HTML/CSS/JS, ready for GitHub Pages)
│   ├── index.html
│   ├── css/  js/            Interface, charts, statistics (js/stats.js), animations
│   ├── data/                Processed data read by the site (one file per variable)
│   ├── assets/              Logo and the team's figures, renamed by substance
│   └── vendor/              Plotly.js, world map, fonts (offline)
├── notebooks/               Google Colab notebooks (download → clean → semesters → trends → figures)
├── tools/                   Python pipeline that builds site/data/ from the team's files
├── scripts/                 Stand-alone scripts (e.g. OMI ozone map for Morocco)
├── data/team/               Small processed files from the team (CSV), used to rebuild the site
├── docs/                    Methodology, datasets, results
└── .github/workflows/       Automatic deployment of site/ to GitHub Pages
```

## Variables and data sources

| Variable | Source | Period on the site | Analysis |
|---|---|---|---|
| Water vapour (H₂O) | NASA Aura MLS Level-3 | 2004-S2 → 2025-S2, Morocco + World, 30 pressure levels | Semester trend, maps, vertical profile |
| Aerosol optical thickness (AOT) | NASA MERRA-2 M2TMNXAER (TOTEXTTAU), via NASA Giovanni | 2004-S2 → 2026-S1, Morocco | Semester trend, maps |
| Vegetation (NDVI) | NASA Terra MODIS MOD13C2 v061 | 2004-S1 → 2026-S2, World + Morocco trend map | Semester trend, maps |
| Methane (CH₄) | Team figures and statistics table | 2004-S1 → 2026-S1, World | Semester trend, figures |
| Solar irradiation (SWGDN) | Team semester maps (MERRA-2 variable SWGDN) | 2004-S1 → 2026-S1, Morocco + World | Semester trend, maps |
| Wind speed at 50 m | Team semester maps | 2004-S1 → 2026-S1, Morocco + World | Semester trend, maps |
| Ozone (O₃) | NASA Aura OMI OMTO3d | Oct–Dec 2004 on the site (full record to process locally) | Maps, daily series |
| Nitrogen dioxide (NO₂) | NASA Aura OMI | 2004–2026 (figures) | Team figures |
| Snowmelt | Team figures | 2004–2026 (figures) | Team figures |

Not yet available (no data received, not shown in analyses): precipitation, formaldehyde (HCHO), evaporation.
Details: [docs/datasets.md](docs/datasets.md).

## Main results (Morocco unless stated, semester analysis)

| Variable | Trend per decade | 95 % range | Verdict |
|---|---|---|---|
| Water vapour, 100 hPa (≈16 km) | **+0.209 ppmv** | +0.127 to +0.292 | Significant increase |
| Water vapour, 100 hPa, World | +0.178 ppmv | +0.114 to +0.243 | Significant increase |
| Methane, World | **+25.6 ppb** | +24.1 to +27.1 | Significant increase |
| Vegetation NDVI, World | +0.0092 | +0.0077 to +0.0107 | Significant increase (greening) |
| Solar irradiation | +1.45 W/m² | −0.11 to +3.01 | Inconclusive (tests disagree) |
| Wind speed at 50 m | +0.064 m/s | −0.07 to +0.20 | No significant trend |
| AOT | −0.008 | −0.020 to +0.005 | No significant trend |

A trend is called significant only if both the regression (corrected for autocorrelation) and the Mann-Kendall test
(Hamed–Rao) give p < 0.05. See [docs/methodology.md](docs/methodology.md) and [docs/results.md](docs/results.md).

## Rebuild the data

```bash
pip install -r requirements.txt
python tools/build_team_data.py  <figures folder>  <DOSSIER NASA folder>  <AOT Giovanni folder>
python tools/extract_maps.py     <maps_wind>  <maps_irradiation>  data/team/wind_radiation_values_from_maps.json
python tools/build_maps_data.py  data/team/wind_radiation_values_from_maps.json
python tools/build_site_data.py  <OMI_Data folder>        # full OMI ozone record (large files)
```

The raw NASA files (several GB) and the team's figure folders stay on the team's Google Drive; see [data/README.md](data/README.md).

## Publish with GitHub Pages

Settings → Pages → Source: **GitHub Actions**. The workflow `.github/workflows/pages.yml` publishes `site/` on every push to `main`.

## Credits

NASA Earthdata (Aura OMI, Aura MLS, Terra MODIS, MERRA-2, Giovanni) · Natural Earth borders · Plotly.js (MIT) ·
Space Grotesk and IBM Plex fonts (SIL Open Font License). French version of this file: [README.fr.md](README.fr.md).

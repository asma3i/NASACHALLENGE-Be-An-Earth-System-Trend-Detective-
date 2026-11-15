# Data

## `data/team/` (in this repository)

Small processed files produced by the team, used by `tools/` to rebuild `site/data/`:

| File | Content |
|---|---|
| `h2o_maroc/*.csv`, `h2o_monde/*.csv` | Water vapour (Aura MLS): trend map, semester series, vertical profile, anomalies — Morocco box and World |
| `ndvi/1_serie_mondiale_semestrielle.csv` | World vegetation NDVI by semester (values × 10⁸, divided on the site) |
| `methane_semestres_transcrit.csv` | Methane by semester, copied from the team's statistics table |
| `wind_radiation_values_from_maps.json` | Wind and irradiation values recovered from the 45 semester maps (`tools/extract_maps.py`) |

## Raw data (team Google Drive, not in the repository)

| Folder | Content |
|---|---|
| `O3/` | 8 022 daily OMI OMTO3d `.txt` maps (2004–2026) + yearly zips; `morocco_ozone_grid_daily_all.csv` |
| `AOT/` | 44 Giovanni MERRA-2 NetCDF semester maps (NTcf AOT) + 6 figures |
| `Irradiation/`, `Wind/` | 45 semester maps each (PNG) |
| `Methane/` | 12 figures + statistics table |
| `NO2/` | 10 OMI figures |
| `Snowfall/` | 4 snowmelt figures |
| `DOSSIER NASA/` | Water vapour (Morocco, World) and vegetation notebooks with their CSV and PNG outputs |
| `NTcf AOT/` (2.2 GB zip) | Large-scale AOT archive |

The 8 MB NDVI trend-map CSV (`2_carte_tendance_ndvi.csv`) is also on the Drive; the site keeps only its Morocco window.

# Pipeline (`tools/`)

| Script | Role |
|---|---|
| `build_team_data.py` | Water vapour, vegetation, methane, AOT and the figure gallery → `site/data/donnees*.js`, `site/data/galerie.js`, `site/assets/images/` |
| `figures.json` | Title, explanation, type and source of every figure |
| `extract_maps.py` | Reads the values of the wind and irradiation semester maps from their fixed colour bar |
| `build_maps_data.py` | Wind and irradiation series and Morocco maps → `site/data/donnees_wind.js`, `donnees_radiation.js` |
| `build_site_data.py` | OMI ozone daily files (`.txt`, `.zip`, team CSV) → `site/data/donnees_ozone.js` |

All trends use the same method as the notebooks; see `docs/methodology.md`.

# DOORAtmosphere — site web (équipe AerO-Club)

*Open the DOOR to Earth's Atmosphere. Discover · Observe · Reveal.*

Site statique : ouvrez `site/index.html` (double-clic suffit, fonctionne hors ligne). Mode jour / nuit avec le bouton ☾/☀.

Équipe AerO-Club : Aya LACHKAR · Abderazzak ASMAY · Naouar EL KENDI · Said OUKAAI · Asmae EL GHAZI · Omar BENRAQQOUCH
(page About, pied de page ; liste dans `site/js/catalog.js`, section `equipe`).

## Données du site (`site/data/`)

| Fichier | Contenu | Origine |
|---|---|---|
| `donnees.js` | Vapeur d'eau, boîte Maroc (24–38°N, 16°W–0°), 30 niveaux (261 → 1 hPa), un point par semestre 2004-S2 → 2025-S2, carte de tendance à 100 hPa, profil vertical, + série monde | CSV de l'équipe (Aura MLS) |
| `donnees_vegetation.js` | Végétation NDVI, série monde 2004-S1 → 2026-S2 + carte de tendance de la fenêtre Maroc (0,5°) | CSV de l'équipe (Terra MODIS MOD13C2) — valeurs divisées par 10⁸ |
| `donnees_methane.js` | Méthane, série monde 2004-S1 → 2026-S1 | tableau de l'équipe recopié dans `data/team/methane_semestres_transcrit.csv` |
| `donnees_aot.js` | AOT (MERRA-2 M2TMNXAER, via Giovanni), Maroc, un point par semestre 2004-S2 → 2026-S1 + carte | 44 fichiers NetCDF Giovanni du dossier « NTcf AOT » |
| `donnees_wind.js`, `donnees_radiation.js` | Vent à 50 m et rayonnement SWGDN, Maroc + monde, 45 semestres 2004-S1 → 2026-S1, cartes moyenne et tendance (1°) | 45 cartes PNG par variable (maps_wind, maps_irradiation) ; valeurs relues par inversion de l'échelle de couleur fixe (`tools/extract_maps.py`, puis `tools/build_maps_data.py`) |
| `donnees_ozone.js` | Ozone OMI réel, octobre–décembre 2004 | fichiers OMI du Drive |
| `galerie.js` | 44 figures de l'équipe, renommées par substance, avec titre + explication | `tools/figures.json` |

Les figures sont dans `site/assets/images/<substance>/` (aot, h2o, methane, no2, snow, vegetation), par ex. `aot-01-world-mean-map.jpg`.

Méthode identique aux notebooks (régression corrigée de l'autocorrélation + Mann-Kendall Hamed-Rao + pente de Sen). Seuls les semestres complets (6 mois) entrent dans les tendances. Contrôle : le site retrouve le résultat de l'équipe pour la vapeur d'eau au Maroc à 100 hPa (+0,209 ppmv/décennie, IC 95 % 0,127–0,292 ; +0,129 avant Hunga Tonga).

**À corriger dans le notebook NDVI :** les valeurs sont NDVI × 10⁸, le facteur d'échelle MODIS (10 000) a été multiplié au lieu de divisé.

## Variables sans données (non affichées dans les analyses)

Précipitations, HCHO et évaporation (aucun fichier). Elles sont listées dans About → All the datasets. Aucune donnée n'est inventée.

## Mettre à jour

```
pip install numpy scipy matplotlib pillow pymannkendall
python tools/build_team_data.py "<dossier des figures>" "<DOSSIER NASA>" "<dossier AOT Giovanni>"   # vapeur d'eau, NDVI, méthane, AOT, figures
python tools/build_site_data.py "<OMI_Data>"                              # ozone complet 2004–2026 (gros fichiers, sur votre PC)
```

- `<dossier des figures>` : sous-dossiers aot/, methane/, no2/, snow/, h2o_maroc/, h2o_monde/, ndvi/ ; titres et explications dans `tools/figures.json`.
- `<DOSSIER NASA>` : h2o_maroc/, h2o_monde/, ndvi/ avec les CSV des notebooks.
- AOT, NO₂ et fonte des neiges n'existent pour l'instant qu'en images : exportez leurs CSV semestriels pour qu'ils soient analysés comme la vapeur d'eau.

## Données ajoutées (classification)

Dossier source : `OMI_Data/` (sur le PC de l'équipe), classé par catégorie :

| Catégorie | Dossier | Contenu |
|---|---|---|
| Ozone (O3) | `O3/` | 8 022 cartes quotidiennes `.txt` (2004–2026) + 19 archives `.zip` + 1 `.BAD` |
| Irradiation | `Irradiation/` | 45 cartes PNG (S1/S2 par année) + zip |
| Vent | `Wind/` | 45 cartes PNG (S1/S2 par année) + zip |
| AOT | `AOT/` | photos terrain (19 dont méthane) + 44 fichiers HDF5 (NTcf AOT) + zips |
| Méthane | `Methane/` | 13 photos terrain |
| NO₂ | `NO2/` | 10 images PNG + zip |
| Neige (snowfall) | `Snowfall/` | 4 images PNG + zip |

Les fichiers générés (`.png`/`.csv` intermédiaires) ont été retirés de la catégorie O3 pour ne garder que l'essentiel.

## Mettre en ligne

Le dossier `site/` se publie tel quel (GitHub Pages, Netlify, serveur de l'école).

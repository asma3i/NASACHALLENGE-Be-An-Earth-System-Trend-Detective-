# Notebooks (Google Colab)

Each notebook follows the same steps: NASA Earthdata login → download → cleaning and Morocco mask →
monthly means → semesters (S1/S2) → anomalies → trend (regression + Mann-Kendall) → unusual semesters → maps and
graphs → export (`donnees*.js` / CSV) for the website.

| Notebook | Variable | Product |
|---|---|---|
| `Maroc_H2O_Trend_Detective_Colab.ipynb` | Water vapour | Aura MLS ML3MBH2O |
| `Maroc_Precipitations_Trend_Detective_Colab.ipynb` | Precipitation | GPM IMERG monthly V07 |
| `Maroc_HCHO_Trend_Detective_Colab.ipynb` | Formaldehyde | Aura OMI OMHCHOd V003 |

The world water-vapour and vegetation notebooks (`H2O_Trend_Detective_MLS.ipynb`,
`Vegetation_Cover_Trend_Detective_Global_2004.ipynb`) are in the team's Drive folder `DOSSIER NASA`.

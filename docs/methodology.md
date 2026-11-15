# Methodology

## 1. One value every 6 months
Monthly NASA data are averaged over the area (Morocco: cells inside the borders, or the team's box for water vapour;
World: whole grid), with a cos(latitude) weight so that small polar cells do not count as much as tropical ones.
Months are then grouped by semester: **S1 = January–June, S2 = July–December**. Only complete semesters (6 months)
enter the trend.

## 2. Anomalies
Each S1 is compared with the mean of all S1, each S2 with the mean of all S2. The difference (anomaly) removes the
seasonal cycle.

## 3. Trend
Ordinary least-squares line through the anomalies, given per decade. The 95 % confidence interval uses an effective
sample size corrected for lag-1 autocorrelation of the residuals: n_eff = n (1 − r1) / (1 + r1).

## 4. Significance
Two independent tests: the regression above and the Mann-Kendall test with the Hamed–Rao correction (plus the
Theil–Sen slope). Verdicts:

| Verdict | Rule |
|---|---|
| Significant increase / decrease | both p < 0.05 |
| No significant trend | both p ≥ 0.05 |
| Inconclusive | the two tests disagree |
| Insufficient data | fewer than 10 semesters or less than 5 years |

## 5. Unusual semesters
z-score of the anomaly within its semester type; |z| ≥ 1.5 is flagged.

## 6. Regional comparison
The difference between two trends is tested directly (z-test on the slope difference using both corrected standard
errors). Overlapping areas (Morocco inside the World) make this test indicative only.

## 7. Checks
The site's JavaScript statistics (`site/js/stats.js`) reproduce the Python notebooks to 4 decimals; the water-vapour
result of the team (+0.209 ppmv/decade over Morocco at 100 hPa, 95 % CI 0.127–0.292) is recomputed exactly.

## 8. Data-quality notes
- **NDVI**: the team's CSV holds NDVI × 10⁸ (MODIS scale factor multiplied instead of divided); the site divides by 10⁸.
- **Methane**: semester values copied from the team's statistics table (a figure); dataset name not written on it.
- **Wind and irradiation**: values recovered from the colours of the team's maps (fixed colour bar); precision about
  ±0.03 m/s and ±0.5 W/m²; values beyond the bar are clipped (up to 11 % of Morocco's pixels for very calm wind).
- **AOT**: MERRA-2 is a reanalysis (model constrained by observations), shown as *model-derived*.
- **Ozone**: only October–December 2004 is processed on the site; the full record must be built locally.

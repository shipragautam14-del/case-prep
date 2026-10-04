# JASP specification for the GoodBelly final model

**Status: JASP was NOT executed in the environment that produced this package (no JASP installation or integration was available). No JASP output exists, and none is reported anywhere in the submission.** The independent cross-check of the Excel workbook is a separate statsmodels (Python) fit (see `analysis.py` and the "Excel vs JASP" sheet).

## Data
Open `GoodBelly_JASP_Data.csv` (1,386 rows). Columns: Store, Region (text; "NA" is a real region), Date, Sales, Price, Rep, Endcap, Demo, D13 (=Demo1-3), D45 (=Demo4-5), Natural, Fitness, EndRep (=Endcap x Rep). Set Rep, Endcap, Demo, D13, D45, EndRep to *Scale* (0/1) so they enter as numeric dummies with reference category 0.

## Analyses to run (Regression > Classical > Linear Regression)
1. **Descriptives** - Sales, Price, Rep, Endcap, Demo, D13, D45, Natural, Fitness. **Correlation** matrix (Pearson).
2. **Model development** - Dependent: Sales. Method: Enter.
   - M1: Price, Rep, Endcap, Demo, D13, D45, Natural, Fitness
   - M2: Price, Rep, Endcap, Demo, D13, D45
   - M3: M1 + EndRep
   - Final: Price, Rep, Endcap, Demo, D13, D45, EndRep
   Use *Model* with several blocks (M1 -> Final) for R² change / F change. For stepwise, set Method = Forward/Backward/Stepwise with p-in 0.05 and p-out 0.10.
3. **Final model output** - Statistics: Estimates with 95% CI, Model fit (R², adj R², ANOVA), Collinearity diagnostics (VIF, tolerance), Durbin-Watson, Casewise diagnostics.
4. **Diagnostics plots** - Residuals vs fitted, Q-Q / P-P plot of standardized residuals, residual histogram; save Cook's distance, leverage, Mahalanobis, studentized residuals to the data.
5. **Demo / Endcap analyses** - read directly from the final-model coefficients; for Endcap + Endcap x Rep (effect when Rep = 1) use the covariance matrix of estimates (Statistics > Covariance matrix) or re-centre Rep.

## Values to compare (Excel / Python reference)
| Statistic | Reference |
|---|---|
| R² | 0.805856 |
| Adjusted R² | 0.804870 |
| F (7, 1378) | 817.120 |
| Std. error of regression | 49.0320 |
| Intercept | 276.5735 |
| Price | -22.0664 |
| Sales Rep | 59.4618 |
| Endcap | 0.6204 |
| Demo | 106.7527 |
| Demo1-3 | 73.3698 |
| Demo4-5 | 74.5520 |
| Endcap x Sales Rep | 453.8033 |
| Durbin-Watson | 2.0916 |

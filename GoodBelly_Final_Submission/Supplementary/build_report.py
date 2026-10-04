import json, sys
from docx import Document
from docx.shared import Pt, Inches, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
RES=sys.argv[1]; OUT=sys.argv[2]; R=json.load(open(f'{RES}/results.json')); FIG=f'{RES}/fig/'
M=R['models']; F=M['F']; cf={c['var']:c for c in F['coef']}; m1=M['1']; c1={c['var']:c for c in m1['coef']}
doc=Document(); sec=doc.sections[0]; sec.page_width=Cm(21); sec.page_height=Cm(29.7)
for s in ('left_margin','right_margin'): setattr(sec,s,Inches(1))
sec.top_margin=Inches(0.9); sec.bottom_margin=Inches(0.9)
st=doc.styles['Normal']; st.font.name='Calibri'; st.font.size=Pt(10.5); st.element.rPr.rFonts.set(qn('w:eastAsia'),'Calibri')
st.paragraph_format.space_after=Pt(5); st.paragraph_format.line_spacing=1.08
NAVY=RGBColor(0x1f,0x4e,0x79)
for n,sz in (('Heading 1',14),('Heading 2',11.5)):
    h=doc.styles[n]; h.font.name='Calibri'; h.font.size=Pt(sz); h.font.bold=True; h.font.color.rgb=NAVY; h.paragraph_format.space_before=Pt(10 if n=='Heading 1' else 6); h.paragraph_format.space_after=Pt(4); h.paragraph_format.keep_with_next=True
    h.element.rPr.rFonts.set(qn('w:eastAsia'),'Calibri')
def P(t='',bold=False,italic=False,size=None,align=None,after=None,color=None):
    p=doc.add_paragraph(); add_runs(p,t,bold,italic,size,color)
    if align: p.alignment=align
    if after is not None: p.paragraph_format.space_after=Pt(after)
    return p
def add_runs(p,t,bold=False,italic=False,size=None,color=None):
    parts=t.split('**')
    for i,x in enumerate(parts):
        if not x: continue
        r=p.add_run(x); r.bold=bold or (i%2==1); r.italic=italic
        if size: r.font.size=Pt(size)
        if color: r.font.color.rgb=color
def B(t,size=None):
    p=doc.add_paragraph(style='List Bullet'); add_runs(p,t,size=size); p.paragraph_format.space_after=Pt(2); return p
def H1(t): doc.add_heading(t,1)
def H2(t): doc.add_heading(t,2)
def shade(cell,hexc):
    tcPr=cell._tc.get_or_add_tcPr(); sh=OxmlElement('w:shd'); sh.set(qn('w:val'),'clear'); sh.set(qn('w:color'),'auto'); sh.set(qn('w:fill'),hexc); tcPr.append(sh)
def table(rows,widths=None,caption=None,size=9,bold_last=False,align_right_from=1,hl=None):
    if caption: 
        c=P(caption,bold=True,size=9.5,after=2); c.paragraph_format.keep_with_next=True
    t=doc.add_table(rows=len(rows),cols=len(rows[0])); t.style='Table Grid'; t.alignment=WD_TABLE_ALIGNMENT.CENTER
    for i,row in enumerate(rows):
        for j,v in enumerate(row):
            cell=t.cell(i,j); cell.text=''; p=cell.paragraphs[0]; p.paragraph_format.space_after=Pt(0); p.paragraph_format.line_spacing=1.0
            add_runs(p,str(v),bold=(i==0 or (hl is not None and i in hl)),size=size)
            if i==0: shade(cell,'1F4E79'); [setattr(r.font.color,'rgb',RGBColor(255,255,255)) or None for r in p.runs]
            elif hl is not None and i in hl: shade(cell,'FFF2CC')
            if j>=align_right_from and i>0: p.alignment=WD_ALIGN_PARAGRAPH.RIGHT
            if i==0: p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    if widths:
        t.autofit=False
        tot=sum(widths); widths=[w*6.5/tot for w in widths] if tot>6.5 else widths
        for j,w in enumerate(widths): t.columns[j].width=Inches(w)
        for row in t.rows:
            for j,w in enumerate(widths): row.cells[j].width=Inches(w)
    for i,row in enumerate(t.rows):
        trPr=row._tr.get_or_add_trPr(); cs=OxmlElement('w:cantSplit'); trPr.append(cs)
        if i<len(t.rows)-1:
            for c in row.cells:
                for p in c.paragraphs: p.paragraph_format.keep_with_next=True
    doc.add_paragraph().paragraph_format.space_after=Pt(2)
    return t
def fig(name,w,cap):
    p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.keep_with_next=True; p.paragraph_format.space_after=Pt(2); p.add_run().add_picture(FIG+name,width=Inches(w))
    c=P(cap,italic=True,size=9,align=WD_ALIGN_PARAGRAPH.CENTER,after=6)
def pb(): doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
def pv(p): return '<0.001' if p<0.001 else f'{p:.3f}'
def f1(x): return f'{x:,.1f}'
def sgn(x): return f'{x:+.1f}'
# ============ COVER ============
for _ in range(5): P('')
P('GoodBelly: Using Statistics to Justify the Marketing Expense',bold=True,size=24,align=WD_ALIGN_PARAGRAPH.CENTER,color=NAVY,after=14)
P('Regression analysis of the in-store demo and endcap programs',italic=True,size=13,align=WD_ALIGN_PARAGRAPH.CENTER,after=40)
P('Decision Sciences II',bold=True,size=15,align=WD_ALIGN_PARAGRAPH.CENTER,after=2)
P('Indian Institute of Management Bangalore',size=13,align=WD_ALIGN_PARAGRAPH.CENTER,after=2)
P('PGP 2026–28',size=13,align=WD_ALIGN_PARAGRAPH.CENTER,after=34)
P('Group: [GROUP NUMBER]',bold=True,size=13,align=WD_ALIGN_PARAGRAPH.CENTER,after=8)
P('Members',bold=True,size=12,align=WD_ALIGN_PARAGRAPH.CENTER,after=2)
for i in range(1,6): P(f'[NAME {i}]  –  [ROLL NUMBER {i}]',size=12,align=WD_ALIGN_PARAGRAPH.CENTER,after=1)
P('')
P('Case study submission: 6 October 2026, 9:00 AM IST',size=10.5,align=WD_ALIGN_PARAGRAPH.CENTER)
P('Case: GoodBelly: Using Statistics to Justify the Marketing Expense (WDI W92C52)',italic=True,size=9.5,align=WD_ALIGN_PARAGRAPH.CENTER)
pb()
# ============ EXEC SUMMARY ============
P('Executive Summary',bold=True,size=15,color=NAVY,after=3)
es=lambda t: P(t,size=9.6,after=3)
es('**Business problem.** GoodBelly\'s management wants proof that in-store demos and endcap displays justify their cost. We use 1,386 store-week records (126 Whole Foods stores, 11 weeks, 4 May–13 Jul 2010) to measure how weekly units sold relate to promotions, after controlling for price, regional sales-rep coverage and store surroundings.')
es('**Approach.** Following the course sequence we ran baseline regressions, a full multiple regression, variable selection (partial F-tests; p-in 0.05, p-out 0.10), an interaction test, and the full assumption/outlier/influence diagnostics. Calculations were done in Excel (LINEST, formula-driven) and cross-checked against an independent statistical package; the two agree to six decimals. JASP was not available and was not run.')
es(f'**Final model** (R² {F["r2"]:.3f}, adjusted R² {F["adj"]:.3f}, F = {F["F"]:.0f}, p < 0.001, SE = {F["se"]:.1f} units): Sales = {cf["const"]["b"]:.1f} {cf["Price"]["b"]:.2f}·Price + {cf["Rep"]["b"]:.1f}·SalesRep + {cf["Endcap"]["b"]:.1f}·Endcap + {cf["Demo"]["b"]:.1f}·Demo + {cf["D13"]["b"]:.1f}·Demo1-3 + {cf["D45"]["b"]:.1f}·Demo4-5 + {cf["EndRep"]["b"]:.1f}·(Endcap×SalesRep). Natural Retailers and Fitness Centers add nothing (partial F p = 0.96) and were dropped.')
P('Key findings',bold=True,size=9.8,after=1)
B(f'**Demos work, and the lift lasts.** Holding other variables constant, a store with a demo this week is associated with +{cf["Demo"]["b"]:.0f} units/week (95% CI {cf["Demo"]["lo"]:.0f}–{cf["Demo"]["hi"]:.0f}), +{cf["D13"]["b"]:.0f} units in each of the following 1–3 weeks, and +{cf["D45"]["b"]:.0f} units 4–5+ weeks later; all p < 0.001. There is no measurable decay between weeks 1–3 and 4–5 (difference {R["partialF"]["d13_minus_d45"]["est"]:.1f}, p = 0.85). The data show the lift persists at least 4–5 weeks; they cannot show when it ends.',size=9.6)
B(f'**Endcaps work only with a regional sales rep.** Where Sales Rep = 1, an endcap is associated with +{R["endcap_rep1"]["est"]:.0f} units/week (CI {R["endcap_rep1"]["lo"]:.0f}–{R["endcap_rep1"]["hi"]:.0f}); with no regional rep the estimate is {cf["Endcap"]["b"]:.1f} (p = 0.96, but only 17 such observations). The interaction is highly significant (partial F = 948, p < 0.001) and raises R² from 0.67 to 0.81.',size=9.6)
B(f'**Other drivers.** A regional rep adds about {cf["Rep"]["b"]:.0f} units/week; each $1 of price is associated with {cf["Price"]["b"]:.0f} units.',size=9.6)
P('Model validity',bold=True,size=9.8,after=1)
es(f'Omitting the interaction caused apparent autocorrelation (Durbin-Watson {R["dw_m1"]:.2f}), non-constant variance and skewed residuals. The final model is clean: DW {R["dw_final"]:.2f}, Breusch-Pagan p = {R["bp"]["p"]:.2f}, residual skew {R["norm"]["skew"]:.2f}, all VIF < 3.2 (course threshold 4), largest Cook\'s D {R["counts_flags"]["maxcook"]:.3f}. Results are stable to excluding outliers and adding region, week or store dummies. The estimates are conditional associations from observational data, not proof of causation.')
P('Recommendations',bold=True,size=9.8,after=1)
B('Retain the demo program; its lift of ≈330 extra units per demoed store (demo week plus three follow-up weeks) is large relative to a 254-unit average week. Whether it pays depends on cost and margin, which are not in the data, so ROI cannot be calculated.',size=9.6)
B('Concentrate endcap effort (and the rep competition) on stores with regional rep coverage; do not expect endcaps alone to move sales. Test endcaps in rep-less stores before spending there.',size=9.6)
B('Record demo and endcap costs, margins and store selection rules, and run a randomised pilot to confirm that these associations are causal.',size=9.6)
pb()
# ============ 1 ============
H1('1. Case Objective and Business Context')
P('GoodBelly is a start-up probiotic juice brand with a small marketing budget, spent mainly on three-hour in-store sampling demos (restricted to Whole Foods stores from 2010) and on an endcap display competition among its five sales representatives. Management, led by the CFO, has asked the marketing manager to show statistically that these activities lift sales, and whether any lift is only temporary. The statistical objective is therefore to (i) model weekly units sold as a function of the promotions and controls, (ii) validate the model, (iii) quantify the demo effect and how long it lasts, (iv) test whether endcap placement matters, and (v) turn the results into recommendations. Cost, margin and ROI data are not provided, so recommendations are expressed in units of sales.')
# ============ 2 ============
H1('2. Data and Exploratory Analysis')
S=R['struct']
P(f'The workbook has one usable data sheet (“Real Data”) with {S["rows"]:,} rows and 12 columns, a balanced panel of {S["stores"]} stores × {S["weeks"]} weeks. There are no missing values or duplicate rows, no non-positive sales, and no data-entry errors. The dependent variable is Units Sold per store per week (“Sales”). The workbook also contains an “Explanation” sheet (the variable dictionary); no solution sheets are present and none were used. Two audit points matter:')
B(f'**Weeks.** The case text says 10 weeks, but the dataset has 11 weekly dates (4 May–13 Jul 2010); 126 × 11 = 1,386 confirms the data are complete. We use the dataset as supplied.')
B(f'**Region “NA”.** Region code “NA” (143 rows, 13 stores) is a genuine region; software that reads it as “missing” silently drops it. Region is not a model predictor, but we kept these rows. Sales Rep changes within {S["rep_changes"]} stores over the window, so it is treated as an observation-level indicator as defined in the case.')
rows=[['Variable','Mean','Median','Std dev','Min','Max','Coding / meaning']]
lab={'Sales':'Units Sold (Sales)','Price':'Average Retail Price ($)','Rep':'Sales Rep','Endcap':'Endcap','Demo':'Demo (this week)','D13':'Demo1-3','D45':'Demo4-5','Natural':'Natural Retailers','Fitness':'Fitness Centers'}
cod={'Sales':'units/store/week','Price':'$ per unit','Rep':'1 = regional rep (762 rows)','Endcap':'1 = endcap (53 rows)','Demo':'1 = demo this week (81)','D13':'1 = demo 1–3 wks ago (217)','D45':'1 = demo ≥4–5 wks ago (105)','Natural':'count within 5 miles','Fitness':'count within 5 miles'}
for a in R['audit']: rows.append([lab[a['var']],f'{a["mean"]:.3f}' if a['var'] not in('Sales',) else f'{a["mean"]:.1f}',f'{a["median"]:.2f}',f'{a["sd"]:.3f}' if a['var']!='Sales' else f'{a["sd"]:.1f}',f'{a["min"]:.2f}',f'{a["max"]:.2f}',cod[a['var']]])
table(rows,[1.45,0.6,0.65,0.65,0.5,0.7,1.85],'Table 1. Descriptive statistics (n = 1,386 for every variable)',size=8.5)
un=R['unadj']
P(f'**Unadjusted comparisons (descriptive only).** Mean weekly sales are {un["Demo"]["m1"]:.0f} units in demo weeks versus {un["Demo"]["m0"]:.0f} otherwise (+{un["Demo"]["diff"]:.0f}), {un["Endcap"]["m1"]:.0f} versus {un["Endcap"]["m0"]:.0f} with and without an endcap (+{un["Endcap"]["diff"]:.0f}), and {un["Rep"]["m1"]:.0f} versus {un["Rep"]["m0"]:.0f} with and without a regional rep (+{un["Rep"]["diff"]:.0f}); all Welch p < 0.001. These raw gaps do not control for other variables and are not causal effects. Figure 1 shows why the endcap gap needs care: nearly all of the endcap lift sits in stores that also have a regional rep.')
fig('F1_sales_rep_endcap.png',4.6,'Figure 1. Weekly units sold by Sales Rep and Endcap status (box = interquartile range, line = median). Endcap with a rep averages 757 units (n = 36); endcap without a rep averages 218 (n = 17), barely above 198 for stores with neither.')
cr=R['corr']
P(f'**Correlations.** Sales correlates most with Endcap × Sales Rep ({R["corr_endrep_sales"]:.2f}), Endcap ({cr["Sales"]["Endcap"]:.2f}), Sales Rep ({cr["Sales"]["Rep"]:.2f}), Demo1-3 ({cr["Sales"]["D13"]:.2f}), Demo ({cr["Sales"]["Demo"]:.2f}) and Demo4-5 ({cr["Sales"]["D45"]:.2f}). Price ({cr["Sales"]["Price"]:.2f}), Natural Retailers ({cr["Sales"]["Natural"]:.2f}) and Fitness Centers ({cr["Sales"]["Fitness"]:.2f}) are essentially uncorrelated with Sales. Price is positively correlated with Sales Rep ({cr["Price"]["Rep"]:.2f}), so rep stores charge more; this hides price\'s negative effect until Sales Rep is controlled. Predictors are otherwise weakly correlated (|r| ≤ 0.33), so multicollinearity is not a concern. Demo exposure is concentrated in June (Figure 7, Appendix); we therefore test for time effects in Section 8.')
# ============ 3 ============
H1('3. Model Development')
P('We built the model in stages, as taught in the course (OLS, adjusted R², t- and partial F-tests, p-in/p-out selection, dummy variables and interactions). Table 2 summarises the progression.')
def mrow(nm,k,vs,note):
    m=M[k]; return [nm,vs,f'{m["r2"]:.4f}',f'{m["adj"]:.4f}',f'{m["se"]:.1f}',f'{m["F"]:.1f}',f'{m["dw"]:.2f}',note]
rows=[['Model','Variables','R²','Adj R²','Std err','F','DW','Key finding'],
mrow('0A','0A','Price','Price alone explains nothing'),mrow('0B','0B','Demo','Demo alone: R² 0.11'),mrow('0C','0C','Endcap','Endcap alone: R² 0.35'),
mrow('1 Full MLR','1','8 predictors','Natural, Fitness insignificant; DW 1.38'),mrow('2 Selected','2','Model 1 − Natural − Fitness','Same fit with 2 fewer variables'),
mrow('3 Full + int.','3full','Model 1 + Endcap×Rep','Interaction adds 13 pts of R²'),mrow('FINAL','F','Model 2 + Endcap×Rep','Preferred: adj R² 0.805, DW 2.09')]
table(rows,[0.85,1.25,0.65,0.65,0.5,0.6,0.4,1.6],'Table 2. Model comparison (all models: n = 1,386; model p-value < 0.001 for models 0B onward)',size=8,hl=[7],align_right_from=2)
H2('Baseline and full model')
P(f'Simple regressions show that Price alone explains none of the variation (R² = 0.0004), Demo about 11% and Endcap about 35%. The full business model (Model 1) uses all eight candidate drivers. Its fit is respectable (R² = {m1["r2"]:.3f}, adjusted R² = {m1["adj"]:.3f}, F = {m1["F"]:.1f}, p < 0.001, SE = {m1["se"]:.1f}). Price ({c1["Price"]["b"]:.1f}, p < 0.001), Sales Rep (+{c1["Rep"]["b"]:.1f}), Endcap (+{c1["Endcap"]["b"]:.0f}), Demo (+{c1["Demo"]["b"]:.0f}), Demo1-3 (+{c1["D13"]["b"]:.1f}) and Demo4-5 (+{c1["D45"]["b"]:.1f}) are all significant at p < 0.001, while Natural Retailers ({c1["Natural"]["b"]:.2f}, p = {c1["Natural"]["p"]:.2f}) and Fitness Centers ({c1["Fitness"]["b"]:.2f}, p = {c1["Fitness"]["p"]:.2f}) are not. The Model 1 diagnostics, however, flag problems (Section 5 and 8): residuals are autocorrelated (DW = {R["dw_m1"]:.2f}), their variance is not constant, and their distribution is skewed (skew {R["norm_m1"]["skew"]:.2f}, excess kurtosis {R["norm_m1"]["kurt"]:.1f}).')
H2('Variable selection')
pf=R['partialF']
sa=R['step']['A']['log']; sb=R['step']['B']['log']
P(f'We applied the course stepwise procedure with p-in = 0.05 and p-out = 0.10, using partial F-tests at each step. On the eight original predictors, variables enter in the order Endcap, Sales Rep, Demo1-3, Demo, Demo4-5, Price; Natural Retailers and Fitness Centers never qualify. A joint partial F-test confirms the drop (F = {pf["natfit_drop_noint"][0]:.2f}, p = {pf["natfit_drop_noint"][1]:.2f}; with the interaction in the model, F = {pf["natfit_drop_final"][0]:.2f}, p = {pf["natfit_drop_final"][1]:.2f}). Business logic agrees: store surroundings matter little once the store already carries GoodBelly, and the retailers/fitness counts are fixed store attributes that cannot explain week-to-week changes. Removing them reduces VIFs and parsimony cost nothing (adjusted R² 0.6708 vs 0.6707). Every other variable passes its partial F-test (all p < 0.001) and is kept.')
H2('Interaction analysis')
P(f'Management\'s question is whether endcaps work, and Figure 1 suggests the answer depends on regional rep coverage. We tested Endcap × Sales Rep: the partial F-test is {pf["interaction_given_full"][0]:.0f} (p < 0.001), R² rises from {m1["r2"]:.3f} to {F["r2"]:.3f}, the standard error falls from {m1["se"]:.1f} to {F["se"]:.1f} units, and the autocorrelation and heteroscedasticity found in Model 1 disappear. This is not just an R² gain: the interaction is the mechanism, since the Endcap coefficient collapses from +{c1["Endcap"]["b"]:.0f} to {cf["Endcap"]["b"]:.1f} once it is included. We also tested six other candidate interactions (Price×Rep, Demo×Rep, Demo1-3×Rep, Demo4-5×Rep, Price×Endcap, Demo×Endcap): none is significant (all p ≥ 0.23), so none was added.')
H2('Final model selection')
P('Stepwise selection with the interaction in the pool, and backward elimination, both drop the Endcap main effect (p = 0.96). We nonetheless keep it, for three reasons: the course keeps the component terms of an interaction; it makes the Endcap coefficient directly interpretable (the endcap effect where Sales Rep = 0), which is itself a managerially relevant test; and the restricted model is statistically identical (partial F = 0.003, p = 0.96; adjusted R² 0.8050 vs 0.8049; all other coefficients within 1 unit). The final model is therefore the seven-predictor model in Section 4. It is the most defensible rather than the highest-R² choice: adding Natural Retailers and Fitness Centers back leaves R² unchanged (0.8059) and adjusted R² lower (0.8046).')
# ============ 4 ============
H1('4. Preferred Final Model')
P(f'**Sales = {cf["const"]["b"]:.2f} {cf["Price"]["b"]:.2f}·Price + {cf["Rep"]["b"]:.2f}·SalesRep + {cf["Endcap"]["b"]:.2f}·Endcap + {cf["Demo"]["b"]:.2f}·Demo + {cf["D13"]["b"]:.2f}·Demo1-3 + {cf["D45"]["b"]:.2f}·Demo4-5 + {cf["EndRep"]["b"]:.2f}·(Endcap × SalesRep) + ε**',after=4)
nm={'const':'Intercept','Price':'Average Retail Price','Rep':'Sales Rep','Endcap':'Endcap (when Sales Rep = 0)','Demo':'Demo (this week)','D13':'Demo1-3','D45':'Demo4-5','EndRep':'Endcap × Sales Rep'}
rows=[['Variable','Coefficient','Std. error','t','p-value','95% CI']]
for c in F['coef']: rows.append([nm[c['var']],f'{c["b"]:.3f}',f'{c["se"]:.3f}',f'{c["t"]:.2f}',pv(c['p']),f'[{c["lo"]:.2f}, {c["hi"]:.2f}]'])
table(rows,[2.0,0.85,0.8,0.65,0.7,1.4],'Table 3. Final model coefficients (dependent variable: weekly units sold; n = 1,386)',size=9)
P(f'**Fit.** R² = {F["r2"]:.4f}; adjusted R² = {F["adj"]:.4f}; standard error of the regression = {F["se"]:.2f} units; F(7, 1378) = {F["F"]:.2f}, model p-value < 0.001. The model explains about 81% of the variation in weekly store sales and typical predictions are within about ±{2*F["se"]:.0f} units (≈ ±2 SE) of actual.')
P('**Interpretation (holding other variables constant; conditional associations, not proven causal effects).**')
B(f'**Sales Rep:** a store with a regional rep sells about {cf["Rep"]["b"]:.0f} more units a week when there is no endcap (CI {cf["Rep"]["lo"]:.0f}–{cf["Rep"]["hi"]:.0f}).')
B(f'**Price:** each $1 higher average price is associated with {abs(cf["Price"]["b"]):.0f} fewer units (CI {abs(cf["Price"]["hi"]):.0f}–{abs(cf["Price"]["lo"]):.0f}); a one-standard-deviation ($0.46) price rise corresponds to about 10 fewer units.')
B(f'**Demo variables:** +{cf["Demo"]["b"]:.0f}, +{cf["D13"]["b"]:.0f} and +{cf["D45"]["b"]:.0f} units (Section 6).')
B(f'**Endcap:** because the model contains the interaction, the Endcap coefficient ({cf["Endcap"]["b"]:.2f}) is not the overall endcap effect. It is the effect where Sales Rep = 0; the effect where Sales Rep = 1 is {cf["Endcap"]["b"]:.2f} + {cf["EndRep"]["b"]:.2f} = {R["endcap_rep1"]["est"]:.1f} units (Section 7).')
B(f'**Intercept** ({cf["const"]["b"]:.0f}) is the fitted sales of a no-promotion, no-rep store at Price = 0, which lies outside the data range (price $2.89–$6.25), so it has no direct business meaning.')
# ============ 5 ============
H1('5. Model Diagnostics and Assumptions (Question 2)')
P('We checked each linear-regression assumption on the final model and, for contrast, on Model 1. The headline answer to Question 2 is yes, the final model satisfies the assumptions to a good approximation, but only after the interaction was added: the original model violated independence/constant variance because it was misspecified, not because of data errors. Checks that the data cannot settle (independence across stores, omitted variables) are discussed in Sections 8 and 10.')
H2('Linearity and homoscedasticity')
fig('F2_resid_fitted.png',4.3,'Figure 2. Standardized residuals vs fitted values, final model (dashed lines at ±3).')
P(f'**What is tested:** whether the mean residual is zero at every fitted level (linearity/correct specification) and whether residual spread is constant (homoscedasticity). **What the graph shows:** residuals form a horizontal band around zero from fitted values of ~180 to ~950 units with similar vertical spread across the range (the vertical stripes reflect the discrete dummy-variable combinations); there is no curve, funnel or trend. The few points beyond ±3 are discussed below. **Meaning:** no sign of non-linearity or changing variance. Supporting tests: mean residual is exactly zero within every Rep, Endcap and Demo group; adding Price² is not significant (p = {R["price_sq"]["p"]:.2f}); Breusch-Pagan LM = {R["bp"]["lm"]:.1f}, p = {R["bp"]["p"]:.3f}, not significant at 5% (Model 1: LM = {R["bp_m1"]["lm"]:.0f}, p < 0.001, a strong funnel). No transformation is needed; a log model fits worse (R² 0.61) and is unnecessary.')
H2('Normality of errors')
fig('F3_pp_hist.png',5.2,'Figure 3. Normal P-P plot (left) and histogram (right) of standardized residuals, final model.')
P(f'**What is tested:** whether errors are normal, which underpins the t-, F- and confidence-interval results. **What the graph shows:** the P-P points lie on the 45° line and the histogram matches the normal curve; skewness is {R["norm"]["skew"]:.2f} and excess kurtosis {R["norm"]["kurt"]:.2f} (Model 1: {R["norm_m1"]["skew"]:.2f} and {R["norm_m1"]["kurt"]:.1f}). **Meaning:** normality is well satisfied, so the coefficient inference is reliable. (With n = 1,386 formal tests detect trivial departures; here even Shapiro-Wilk does not reject, p = {R["norm"]["swp"]:.2f}.)')
H2('Independence and autocorrelation')
P(f'Observations are 126 stores observed repeatedly, so independence is not guaranteed. The data are sorted by store then week, which lets us apply the Durbin-Watson test to the within-store sequence. Model 1 gives d = {R["dw_m1"]:.3f} (first-order residual correlation {R["lag1_resid_corr_m1"]:.2f}), clear positive autocorrelation. The reason is specification: the large, persistent Endcap-with-rep effect stays in a store\'s residuals week after week when the interaction is missing. In the final model d = {R["dw_final"]:.3f} (lag-1 correlation {R["lag1_resid_corr"]:.2f}), consistent with no autocorrelation (the d-value lies in the “no autocorrelation” zone between dU and 4−dU; the tables in the course end at n = 200, and the bounds only tighten around 2 for larger n). Caveat: the test treats the rows as one sequence, so it is slightly contaminated at the 125 store boundaries, and it cannot detect store-level clustering. As a sensitivity check beyond the course, standard errors clustered by store leave all conclusions unchanged (Appendix C).')
H2('Multicollinearity')
vf=R['vif']
rows=[['Variable','Price','Sales Rep','Endcap','Demo','Demo1-3','Demo4-5','Endcap×Rep'],['VIF']+[f'{vf[k]:.2f}' for k in ['Price','Rep','Endcap','Demo','D13','D45','EndRep']],['Tolerance']+[f'{1/vf[k]:.2f}' for k in ['Price','Rep','Endcap','Demo','D13','D45','EndRep']]]
table(rows,[0.9,0.7,0.8,0.7,0.65,0.75,0.75,0.9],'Table 4. Variance inflation factors and tolerances, final model',size=8.5)
P('All VIFs are below the course threshold of 4 (maximum 3.17). The only elevated values, Endcap and Endcap × Sales Rep, reflect the structural overlap between a variable and its own interaction term. They are not a concern here: both coefficients are estimated precisely and Endcap × Rep has t = 30.8. In Model 1 every VIF was ≤ 1.15.')
H2('Outliers, leverage and influence')
fig('F6_influence.png',5.4,"Figure 4. Cook's distance (left; dashed = 4/(n−k−1)) and leverage vs standardized residual (right; dashed = 2(k+1)/n and 3(k+1)/n), final model.")
cfl=R['counts_flags']; ls=R['lev_structure']; th=R['thr']
P(f'**Outliers.** {cfl["std_gt2"]} observations (4.6%) have |studentized residual| > 2 (4.6% is expected under normality) and {cfl["std_gt3"]} exceed 3 (about 3.7 expected); the largest is {cfl["maxstd"]:.2f}. They show no pattern and no data-entry errors (Appendix D). **Leverage.** {cfl["lev2"]} observations exceed 2(k+1)/n = {th["lev2"]:.4f} and {cfl["lev3"]} exceed 3(k+1)/n = {th["lev3"]:.4f}; all 36 Endcap-with-rep rows are among the latter. They have high leverage because that combination is rare (2.6% of rows) and they define the interaction, so they are legitimate and essential, not errors. Likewise {cfl["mah10"]} observations have Mahalanobis distance > 10, driven by the rare dummy cells. **Influence.** No observation approaches Cook\'s D = 1 (maximum {cfl["maxcook"]:.3f}); {cfl["cook4"]} observations exceed the stricter 4/(n−k−1) = {th["cook4"]:.4f} cut-off, as expected with 1,386 observations (5.5%). We did not remove any observation. As a sensitivity test, excluding the {1386-R["sens_n"]} observations flagged by Cook\'s D or |t| > 3 changes no coefficient materially (Demo {R["sens"]["Excl. Cook>4/(n-k-1) or |t|>3"]["Demo"]:.1f}, Demo1-3 {R["sens"]["Excl. Cook>4/(n-k-1) or |t|>3"]["D13"]:.1f}, Demo4-5 {R["sens"]["Excl. Cook>4/(n-k-1) or |t|>3"]["D45"]:.1f}, Endcap×Rep {R["sens"]["Excl. Cook>4/(n-k-1) or |t|>3"]["EndRep"]:.1f}; Appendix B).')
H2('What additional analysis is needed to verify the model')
P('Beyond the above: (i) re-estimation with store-level effects or clustered standard errors to address repeated measurement; (ii) week effects to rule out a common time trend; (iii) region effects, because regional reps are organised by region; (iv) an out-of-sample or hold-out check; and (v) a designed experiment to address omitted variables. We carried out (i)–(iii) as sensitivity checks (Section 8); (iv)–(v) are future steps.')
# ============ 6 ============
H1('6. Demo Program Analysis (Question 3)')
fig('F5_demo.png',4.2,'Figure 5. Estimated demo lift (units per store-week) with 95% confidence intervals, final model.')
rows=[['Effect','Coefficient','Std. error','t','p-value','95% CI']]
for v,n in (('Demo','Demo, current week'),('D13','Demo1-3 (1–3 weeks after)'),('D45','Demo4-5 (4–5+ weeks after)')):
    c=cf[v]; rows.append([n,f'+{c["b"]:.1f}',f'{c["se"]:.2f}',f'{c["t"]:.1f}',pv(c['p']),f'[{c["lo"]:.1f}, {c["hi"]:.1f}]'])
table(rows,[2.1,0.9,0.8,0.6,0.7,1.3],'Table 5. Demo effects (units per store-week, other variables held constant)',size=9)
d13d45=pf['d13_minus_d45']; dd=pf['demo_minus_d13']
P(f'**Does the demo program boost sales? Yes.** Holding price, rep coverage and endcap constant, a store with a demo in the current week is associated with +{cf["Demo"]["b"]:.0f} units that week (CI {cf["Demo"]["lo"]:.0f}–{cf["Demo"]["hi"]:.0f}), about 42% of the average store-week (254 units). The three demo terms are jointly highly significant (F = {pf["demo_joint"][0]:.0f}, p < 0.001).')
P(f'**For how long does the sales lift last?** The lift does not fade within the window we can observe. Stores that had a demo 1–3 weeks earlier still sell +{cf["D13"]["b"]:.0f} units (CI {cf["D13"]["lo"]:.0f}–{cf["D13"]["hi"]:.0f}) and stores 4–5 or more weeks after a demo still sell +{cf["D45"]["b"]:.0f} units (CI {cf["D45"]["lo"]:.0f}–{cf["D45"]["hi"]:.0f}); both p < 0.001 and jointly F = {pf["lag_joint"][0]:.0f} (p < 0.001). The two lagged effects are statistically indistinguishable (difference {d13d45["est"]:.1f} units, 95% CI {d13d45["lo"]:.1f} to {d13d45["hi"]:.1f}, p = {pf["d13_eq_d45"][1]:.2f}). The lift in the demo week itself is larger than the later lift by {dd["est"]:.0f} units (CI {dd["lo"]:.0f}–{dd["hi"]:.0f}, p < 0.001), so the effect steps down after the demo week and then holds. Management\'s fear that sales “revert to normal shortly afterward” is therefore not supported over a 4–5 week horizon.')
P(f'**Limits on that answer.** Demo4-5 is defined as “at least 4–5 weeks ago” and the data end 11 weeks after the first date, so we can say the lift persists for at least 4–5 weeks; the data cannot show when, or whether, it eventually ends. The terms measure persistence of a store-level difference, which could also reflect stores that were chosen for demos being stronger (Section 10); store dummies, which compare each store with itself, still give +{R["sens"]["+ Store dummies (126)"]["Demo"]:.0f}, +{R["sens"]["+ Store dummies (126)"]["D13"]:.0f} and +{R["sens"]["+ Store dummies (126)"]["D45"]:.0f}, and week dummies +{R["sens"]["+ Week dummies"]["Demo"]:.0f}, +{R["sens"]["+ Week dummies"]["D13"]:.0f}, +{R["sens"]["+ Week dummies"]["D45"]:.0f}.')
P(f'**Business significance.** Taking the estimates at face value, a demoed store sells about {R["cum_lift"]["cum4"]:.0f} extra units across the demo week plus three following weeks (107 + 3 × 73), and about {R["cum_lift"]["cum_all"]:.0f} if the 4–5 week effect applies for two further weeks. This is illustrative arithmetic on the point estimates (it assumes the flags stay on for those weeks). Demo cost and unit margin are not in the data, so ROI cannot be calculated; the break-even condition is that the margin on ≈330 units exceeds the cost of one three-hour demo.')
# ============ 7 ============
H1('7. Product Placement / Endcap Analysis (Question 4)')
fig('F4_interaction.png',3.9,'Figure 6. Predicted weekly units by Endcap and Sales Rep (price at the sample mean, no demo), final model.')
P(f'**Step 1 – unadjusted.** Stores with an endcap average {un["Endcap"]["m1"]:.0f} units against {un["Endcap"]["m0"]:.0f} without (+{un["Endcap"]["diff"]:.0f}, p < 0.001); the one-variable regression returns the same +343. This mixes stores with and without regional reps and ignores other promotions. **Step 2 – adjusted (Model 1, no interaction).** Controlling for the other variables the average endcap coefficient is +{c1["Endcap"]["b"]:.0f} (CI {c1["Endcap"]["lo"]:.0f}–{c1["Endcap"]["hi"]:.0f}), but this single number averages two very different cases.')
P(f'**Step 3 – interaction.** In the final model the Endcap coefficient is {cf["Endcap"]["b"]:.1f} (SE {cf["Endcap"]["se"]:.1f}, p = {cf["Endcap"]["p"]:.2f}, CI {cf["Endcap"]["lo"]:.0f} to {cf["Endcap"]["hi"]:.0f}): the endcap effect when Sales Rep = 0. The interaction coefficient is +{cf["EndRep"]["b"]:.1f} (SE {cf["EndRep"]["se"]:.1f}, t = {cf["EndRep"]["t"]:.1f}, p < 0.001): the additional effect when Sales Rep = 1. **Step 4 – combined effect.** For stores with a regional rep, the endcap effect is {cf["Endcap"]["b"]:.1f} + {cf["EndRep"]["b"]:.1f} = **+{R["endcap_rep1"]["est"]:.1f} units per store-week** (SE {R["endcap_rep1"]["se"]:.1f}, 95% CI {R["endcap_rep1"]["lo"]:.0f}–{R["endcap_rep1"]["hi"]:.0f}, p < 0.001).')
rows=[['Cell (price at mean, no demo)','Predicted units','Observations','Observed mean'],['No rep, no endcap','186','607','198'],['No rep, endcap','187','17','218'],['Rep, no endcap','245','726','276'],['Rep, endcap','700','36','757']]
table(rows,[2.4,1.2,1.1,1.1],'Table 6. Interaction table: model predictions and observed means',size=9)
P('**Managerial reading.** Product placement affects sales only where GoodBelly has face-to-face regional rep coverage: in those stores an endcap is associated with a near-tripling of sales (245 → 700 predicted units), which is a far larger effect than any demo. In stores served only by the national rep, no endcap effect is detectable. The caution is that the “no effect without a rep” statement rests on just 17 endcap observations (the confidence interval, ±24 units, still rules out effects above about 24 units), and that the endcap and rep effects may be intertwined with how stores were chosen (execution quality, store enthusiasm). The case does not say why reps matter; plausible mechanisms (better display set-up, restocking, the rep competition) are not testable here.')
# ============ 8 ============
H1('8. Model Refinement (Question 5)')
P(f'**What was limited about the initial model?** Model 1 treated each promotion as acting independently and carried two irrelevant variables. Its symptoms: Durbin-Watson of {R["dw_m1"]:.2f}, a funnel-shaped residual plot (Breusch-Pagan p < 0.001), skewed heavy-tailed residuals, a standard error of {m1["se"]:.0f} units, and an Endcap coefficient (+{c1["Endcap"]["b"]:.0f}) that overstated the effect for stores without reps and understated it for stores with reps.')
rows=[['Change','Statistical evidence','Outcome'],['Dropped Natural Retailers and Fitness Centers','Partial F = 0.78, p = 0.46 (0.04, p = 0.96 with interaction)','No loss of fit; simpler model'],['Added Endcap × Sales Rep','Partial F = 944–948, p < 0.001; coefficient t = 30.8','R² 0.673 → 0.806; SE 63.7 → 49.0'],['Kept Endcap main effect','Dropping it: partial F = 0.003, p = 0.96','Hierarchy; interpretable; no cost'],['Tested other interactions','Six candidates, all p ≥ 0.23','None added'],['Checked transformation','Log model R² 0.61; no heteroscedasticity left to fix','Not needed']]
table(rows,[2.1,2.6,1.8],'Table 7. Refinements to the model',size=8.5,align_right_from=9)
P('**Result.** The refined model removes the autocorrelation (DW 1.38 → 2.09), the heteroscedasticity and the non-normality, with the same variables significant and a more accurate story for endcaps. Robustness checks (Appendix B): adding region dummies, week dummies, or 125 store dummies leaves the demo coefficients (≈ 104–107, 72–73, 73–75) and the combined endcap effect (≈ 450–460) essentially unchanged. The one coefficient that moves is Sales Rep: it falls from 59 to about 39–40 once region or store effects are controlled, which means part of the “rep effect” is a regional/store-level difference. Standard errors clustered by store do not change any conclusion.')
P('**Further suggestions.** (1) Collect cost, margin, store traffic and store-selection rules so that ROI and targeting can be modelled. (2) Estimate a store-level (fixed- or random-effects) model, which is beyond this course but would handle repeated measurement directly. (3) Add store sales history from before the program (a pre-period baseline) to measure lift against each store\'s own trend. (4) Extend the observation window to learn when the demo lift ends. (5) Run a randomised or staggered rollout of endcaps and demos.')
# ============ 9 ============
H1('9. Managerial Implications and Recommendations (Question 6)')
rec=[['Area','Recommendation','Statistical result it rests on'],
['Demo strategy','Keep the demo program and do not judge it on same-week sales; the lift lasts at least 4–5 weeks. Decide scale by comparing ≈330 extra units per demo (4 weeks) with demo cost × margin.','Demo +107, Demo1-3 +73, Demo4-5 +75 (all p<0.001); no decay (p=0.85)'],
['Endcap strategy','Direct endcap effort and the rep competition to stores with regional rep coverage; do not expect endcaps alone to lift sales elsewhere. Pilot a handful of endcaps in rep-less stores before investing.','Endcap×Rep +454 (p<0.001); Endcap without rep 0.6 (CI −23 to +24; n=17)'],
['Sales Rep strategy','Protect regional coverage; it carries its own lift (≈ +59, or ≈ +39 net of regional differences) and is a precondition for endcaps.','Rep +59 (CI 54–65); +38–40 with region/store controls'],
['Promotional targeting','Select demo and endcap stores by a documented rule, so the effect can be separated from store quality. Use the model to prioritise stores not yet promoted.','Cannot rule out targeting to strong stores (observational data)'],
['Pricing','Avoid price rises as a side effect of promotion; each $1 is associated with ≈22 fewer units.','Price −22.1 (CI −28 to −16)'],
['Data collection','Record demo and endcap costs, unit margin and store traffic; extend the window beyond 11 weeks.','ROI cannot be computed from the supplied data'],
['Future testing','Randomise demos (timing/stores) and endcaps (with vs without rep) to confirm causality.','Section 10 limitations']]
table(rec,[1.1,3.3,2.2],'Table 8. Recommendations linked to results',size=8.5,align_right_from=9)
P('We make no recommendation to spend more or less in absolute terms: the data contain units sold but no costs, margins or revenues, so a return on investment cannot be calculated, and we do not invent one.')
# ============ 10 ============
H1('10. Limitations')
B('**Observational data.** The coefficients are conditional associations, not proven causal effects. Management chose where to run demos and endcaps (initially stores with enough foot traffic; endcaps by competing reps), so promoted stores may have had higher sales potential. Store, week and region dummies reduce but cannot eliminate this concern; foot traffic, store quality, management and local demographics are not observed.')
B('**Repeated observations and store heterogeneity.** 126 stores appear 11 times. The Durbin-Watson test cannot detect store-level clustering; clustered standard errors do not change conclusions, but a store-level model would be better.')
B('**Short window and demo duration.** 11 weeks; “Demo4-5” means at least 4–5 weeks. We cannot say how long the lift lasts beyond that, and Demo/Demo1-3/Demo4-5 overlap for a few observations (17 stores-weeks have both Demo and Demo1-3).')
B('**Thin cells.** Only 17 endcap observations lack a regional rep and only 36 combine endcap and rep, so the endcap findings rely on small groups. The high leverage of those 36 points is structural.')
B('**No cost or margin information**, so ROI cannot be calculated. **Case data disclosed:** the dataset has 11 weeks (case says 10); Sales Rep changes within 10 stores; the case describes the demo program as starting in November 2009, while the data cover May–July 2010. The disguised units do not affect the relative conclusions.')
B('**Software.** JASP was not available, so JASP results are not reported. The Excel workbook was reconciled to an independent Python (statsmodels) fit.')
# ============ 11 ============
H1('11. Conclusion')
P('On the statistical evidence, GoodBelly\'s marketing programs are worth keeping, with a sharper focus. The demo program is associated with a sizeable lift (+107 units in the demo week, about +73–75 per week for at least five weeks after), with no sign that sales revert to normal soon, and the endcap is associated with a dramatic lift (≈ +454 units per store-week) only in stores that also have a regional sales rep. Management should therefore protect the demo budget while it works out cost per incremental unit, concentrate endcap effort on rep-covered stores, and start recording costs, margins and store-selection rules and running small randomised pilots so that the observed associations can be confirmed as causal returns before any budget is increased.')
H2('Summary of required questions')
q=[['Required question','Final answer'],
['Q1 Build a model; what is observed?','Final model: R² 0.806, adj. R² 0.805, SE 49 units. Price (−22/$), Sales Rep (+59), Demo (+107), Demo1-3 (+73) and Demo4-5 (+75) are significant; Natural Retailers and Fitness Centers are not; Endcap acts only through Endcap × Sales Rep (+454).'],
['Q2 Assumptions satisfied?','Yes for the final model: no pattern in residual plot, BP p=0.07, normal residuals, DW 2.09, VIF ≤ 3.2, no influential points (max Cook 0.023). Model 1 failed DW and constant variance. Additional checks: store effects, clustered SEs, week/region dummies, experiment.'],
['Q3 Demo effect and duration?','Yes: +107 (week), +73 (1–3 wks), +75 (4–5+ wks); all p<0.001; no decay between 1–3 and 4–5 wks (p=0.85). Lift lasts at least 4–5 weeks; the window cannot show the end.'],
['Q4 Does placement matter?','Yes, conditionally: +454 units/store-week with a regional rep (CI 438–471); no detectable effect without one (+0.6, CI −23 to +24; 17 obs).'],
['Q5 Improve the model?','Added Endcap × Rep and dropped Natural/Fitness (DW 1.38→2.09; R² 0.67→0.81). Next: store-level model, cost/margin data, pre-period baseline, longer window, randomised tests.'],
['Q6 Recommendations?','Keep demos; focus endcaps on rep-covered stores; protect rep coverage; document targeting; collect cost/margin data; pilot randomised tests. ROI cannot be computed from the data.']]
table(q,[1.8,4.8],None,size=8.5,align_right_from=9)
# ============ APPENDIX ============
pb()
H1('Appendix: Supplementary Material')
H2('A. Model 1 (full MLR) coefficients and stepwise log')
rows=[['Variable','Coef','SE','t','p-value']]
for c in m1['coef']: rows.append([{'const':'Intercept','D13':'Demo1-3','D45':'Demo4-5','Rep':'Sales Rep'}.get(c['var'],c['var']),f'{c["b"]:.3f}',f'{c["se"]:.3f}',f'{c["t"]:.2f}',pv(c['p'])])
table(rows,[1.8,1,1,0.8,0.9],f'Table A1. Model 1: R² {m1["r2"]:.4f}, adj R² {m1["adj"]:.4f}, SE {m1["se"]:.2f}, F {m1["F"]:.1f}, DW {m1["dw"]:.3f}',size=8.5)
rows=[['Step','Action','Variable','Partial F','p-in/out p-value','Adj R²']]
for s in R['step']['B']['log']: rows.append([s['step'],s['action'],{'D13':'Demo1-3','D45':'Demo4-5','EndRep':'Endcap×Rep','Rep':'Sales Rep'}.get(s['var'],s['var']),f'{s["F"]:.1f}','<0.001' if s['p']<.001 else f'{s["p"]:.3f}',f'{s["adj"]:.4f}'])
table(rows,[0.5,0.8,1.2,0.9,1.3,0.9],'Table A2. Forward stepwise with Endcap×Rep in the candidate pool (p-in 0.05, p-out 0.10). Backward elimination removes Endcap (p=0.97), Natural (p=0.87), Fitness (p=0.81).',size=8.5,align_right_from=3)
H2('B. Sensitivity of final-model coefficients')
sk=['Price','Rep','Endcap','Demo','D13','D45','EndRep']
rows=[['Specification','Price','Sales Rep','Endcap','Demo','Demo1-3','Demo4-5','Endcap×Rep']]
for k,v in R['sens'].items():
    rows.append([k]+[('–' if (v.get(s) is None or v.get(s)!=v.get(s)) else f'{v[s]:.1f}') for s in sk])
table(rows,[2.1,0.55,0.65,0.6,0.55,0.65,0.65,0.8],'Table B1. Coefficient stability (n = 1,386 except exclusion rows)',size=8)
H2('C. Cluster-robust standard errors (store clusters)')
rows=[['Variable','Coefficient','Cluster SE','OLS SE','p-value']]
ols={c['var']:c for c in F['coef']}
for c in R['cluster']: rows.append([nm.get(c['var'] if c['var']!='const' else 'const',c['var']),f'{c["b"]:.2f}',f'{c["se"]:.2f}',f'{ols[c["var"]]["se"]:.2f}',pv(c['p'])])
table(rows,[2,1,1,1,0.9],'Table C1. Same coefficients; standard errors robust to within-store correlation. Combined endcap effect with rep: 95% CI 444–465.',size=8.5)
H2('D. Ten largest studentized residuals')
rows=[['Store','Date','Sales','Fitted','Std. resid','Rep','Endcap','Demo']]
for r in R['top_out']: rows.append([r['Store'],r['Date'][:10],f'{r["Sales"]:.0f}',f'{r["Fitted"]:.0f}',f'{r["StdResid"]:.2f}',r['Rep'],r['Endcap'],r['Demo']])
table(rows,[1.8,0.9,0.6,0.6,0.7,0.4,0.6,0.5],'Table D1. Largest outliers (no data errors found; all retained)',size=8,align_right_from=2)
H2('E. Weekly sales and promotion exposure')
fig('F7_weekly.png',4.8,'Figure 7. Mean weekly sales and the share of stores with demo, Demo1-3 and endcap exposure. Sales rise as demo and endcap exposure rise in June; week dummies confirm the demo coefficients do not depend on this common timing (Table B1).')
H2('F. Reproducibility and software note')
P('The accompanying workbook GoodBelly_Final_Excel_Analysis.xlsx reproduces every number with formulas (LINEST regressions, partial F-tests, VIF, leverage, Cook\'s D, Durbin-Watson, Breusch-Pagan, P-P plot); its “Excel vs JASP” sheet reconciles 20 statistics to an independent Python fit (all match to six decimals). JASP was not run, and no JASP result appears in this report; a JASP-ready dataset and specification are in the supplementary folder. Derived variable: Endcap × Sales Rep = Endcap × Rep (to test whether the endcap effect depends on regional rep coverage). Dummy coding: all dummies 0/1 with reference category 0.',size=9.5)
doc.save(OUT); print('saved')

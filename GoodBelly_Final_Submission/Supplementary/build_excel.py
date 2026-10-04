"""Builds GoodBelly_Final_Excel_Analysis.xlsx (formula-driven). Usage: python3 build_excel.py <dataset.xlsx> <results_dir> <out.xlsx>"""
import sys, json, openpyxl, xlsxwriter, datetime
from xlsxwriter.utility import xl_rowcol_to_cell as rc, xl_col_to_name as cn
SRC,RES,OUT=sys.argv[1:4]; R=json.load(open(f'{RES}/results.json'))
src=openpyxl.load_workbook(SRC,data_only=True)['Real Data']; rows=list(src.iter_rows(values_only=True)); hdr=rows[0]; data=rows[1:]; N=len(data); L=N+1  # last excel row
wb=xlsxwriter.Workbook(OUT,{'use_future_functions':True})
F=lambda **k: wb.add_format({'font_name':'Calibri','font_size':10,**k})
fT=F(bold=True,font_size=14,font_color='#1f4e79'); fH=F(bold=True,bg_color='#1f4e79',font_color='white',border=1,text_wrap=True,valign='vcenter',align='center')
fS=F(bold=True,bg_color='#dbe8f5',border=1); fIn=F(font_color='#0000ff',border=1); fCalc=F(border=1); fN3=F(border=1,num_format='0.000'); fN2=F(border=1,num_format='0.00'); fN4=F(border=1,num_format='0.0000')
fP=F(border=1,num_format='0.00E+00'); fOut=F(bold=True,border=1,bg_color='#fff2cc',num_format='0.0000'); fOut2=F(bold=True,border=1,bg_color='#fff2cc',num_format='0.00'); fTxt=F(text_wrap=True,valign='top'); fB=F(bold=True); fNote=F(italic=True,font_color='#7f1d1d',text_wrap=True,valign='top')
fD=F(num_format='yyyy-mm-dd'); fI0=F(border=1,num_format='0'); fOutT=F(bold=True,border=1,bg_color='#fff2cc',text_wrap=True); fTb=F(border=1,text_wrap=True,valign='top'); fOutI=F(bold=True,border=1,bg_color='#fff2cc',num_format='0')
names=['README','Raw Data','Analysis Data','Data Audit','Descriptive Stats','Correlations','Baseline Models','Full MLR','Variable Selection','Interaction Analysis','Final Model','Demo Analysis','Endcap Analysis','Residual Diagnostics','VIF','Outliers','Influence','Model Comparison','Excel vs JASP','Final Results']
W={n:wb.add_worksheet(n) for n in names}
q=lambda s:f"'{s}'"
AD=q('Analysis Data'); RAW=q('Raw Data')
# ============ Raw Data (unchanged copy) ============
ws=W['Raw Data']
for j,h in enumerate(hdr): ws.write(0,j,h,fH)
for i,r in enumerate(data,1):
    for j,v in enumerate(r):
        if isinstance(v,datetime.datetime): ws.write_datetime(i,j,v,fD)
        elif v is None: pass
        else: ws.write(i,j,v)
ws.set_column(0,0,11); ws.set_column(1,1,8); ws.set_column(2,2,26); ws.set_column(3,11,13); ws.freeze_panes(1,0)
# ============ Analysis Data ============
ws=W['Analysis Data']
cols=['Store','Date','Sales','Price','Rep','Endcap','Demo','D13','D45','Natural','Fitness','EndRep','', 'const','Price','Rep','Endcap','Demo','D13','D45','EndRep','', 'Price','Rep','Endcap','EndRep','Demo','', 'Price','Rep','Demo','D13','D45','EndRep']
# A Store,B Date,C Sales,D Price,E Rep,F Endcap,G Demo,H D13,I D45,J Natural,K Fitness,L EndRep | N const,O..U final block | W..AA nolag block | AC..AH no-endcap-main
for j,h in enumerate(cols):
    if h: ws.write(0,j,h,fH)
srcmap={'A':'C','B':'A','C':'D','D':'E','E':'F','F':'G','G':'H','H':'I','I':'J','J':'K','K':'L'}
for i in range(2,L+1):
    for a,b in srcmap.items(): ws.write_formula(f'{a}{i}',f"={RAW}!{b}{i}",fD if a=='B' else None)
    ws.write_formula(f'L{i}',f'=F{i}*E{i}')
    ws.write_number(f'N{i}',1)
    for t,s in zip('OPQRSTU','DEFGHIL'): ws.write_formula(f'{t}{i}',f'={s}{i}')
    # block D (W..AA): Price,Rep,Endcap,EndRep,Demo
    for t,s in zip(['W','X','Y','Z','AA'],'DEFLG'): ws.write_formula(f'{t}{i}',f'={s}{i}')
    # block E (AC..AH): Price,Rep,Demo,D13,D45,EndRep
    for t,s in zip(['AC','AD','AE','AF','AG','AH'],'DEGHIL'): ws.write_formula(f'{t}{i}',f'={s}{i}')
ws.set_column(0,0,24); ws.set_column(1,40,9); ws.freeze_panes(1,0)
ws.write('AJ1','Block guide (all columns are formulas linked to Raw Data):',fB)
for i,t in enumerate(['A:K  = analysis variables (renamed). L = Endcap x Sales Rep (=Endcap*Sales Rep).','D:K = predictors of Model 1 (Full MLR); D:L adds the interaction (Model 3).','N:U = [constant + final-model predictors] used by Final Model, diagnostics, leverage.','W:AA = Price, Rep, Endcap, Endcap x Rep, Demo (restricted model for partial-F tests).','AC:AH = final model WITHOUT the Endcap main effect (restricted model).'],2): ws.write(f'AJ{i}',t)
Y=f"{AD}!$C$2:$C${L}"; X=lambda a,b: f"{AD}!${a}$2:${b}${L}"
# ============ generic model sheet ============
REF={}
def model_sheet(key,sheet,title,desc,xr,vars_,y=Y,row0=0,short=None):
    ws=W[sheet]; k=len(vars_); r=row0
    ws.write(r,0,title,fT); ws.write(r+1,0,desc,fTxt)
    ws.write(r+3,0,'INPUTS',fS); ws.write(r+4,0,'Dependent (Y) range',fCalc); ws.write(r+4,1,y.replace('$',''),fIn); ws.write(r+5,0,'Predictor (X) range',fCalc); ws.write(r+5,1,xr.replace('$',''),fIn)
    ws.write(r+7,0,'CALCULATION: LINEST(Y,X,TRUE,TRUE) raw array (coefficients appear in REVERSE variable order; last column = intercept)',fS)
    b0=r+8
    for j,vn in enumerate(list(reversed(vars_))+['Intercept']): ws.write(b0,1+j,vn,fH)
    for i,l in enumerate(['Coefficient','Std error','R² | SE(y)','F | df','SSreg | SSres']): ws.write(b0+1+i,0,l,fCalc)
    ws.write_array_formula(b0+1,1,b0+5,1+k,f'{{=IFERROR(LINEST({y},{xr},TRUE,TRUE),"")}}',fN4)
    sn=q(sheet); blk=lambda i,j: f"INDEX({sn}!${cn(1)}${b0+2}:${cn(1+k)}${b0+6},{i},{j})"
    o=b0+8; ws.write(o,0,'OUTPUT: Regression statistics',fS)
    stats=[('Multiple R',f"=SQRT({blk(3,1)})",fN4,'r'),('R²',f"={blk(3,1)}",fOut,'r2'),('Adjusted R²',None,fOut,'adj'),('Standard error',f"={blk(3,2)}",fOut2,'se'),('Observations',f"=COUNT({y})",fI0,'n'),('k (predictors)',f"={k}",fI0,'k'),('df residual',f"={blk(4,2)}",fI0,'df'),
           ('F-statistic',f"={blk(4,1)}",fOut2,'F'),('Significance F (model p-value)',None,fP,'pF'),('SS regression',f"={blk(5,1)}",fN2,'ssr'),('SS residual',f"={blk(5,2)}",fN2,'sse'),('SS total',None,fN2,'sst')]
    refs={}
    for i,(lab,fm,fmt,kk) in enumerate(stats):
        rr=o+1+i; refs[kk]=f"{sn}!$B${rr+1}"; ws.write(rr,0,lab,fCalc)
    for i,(lab,fm,fmt,kk) in enumerate(stats):
        rr=o+1+i
        if kk=='adj': fm=f"=1-(1-{refs['r2']})*({refs['n']}-1)/{refs['df']}"
        if kk=='pF': fm=f"=F.DIST.RT({refs['F']},{refs['k']},{refs['df']})"
        if kk=='sst': fm=f"={refs['ssr']}+{refs['sse']}"
        ws.write_formula(rr,1,fm,fmt)
    t0=o+15; ws.write(t0-1,0,'OUTPUT: Coefficient table (t = b/SE; p = two-tailed T.DIST.2T; 95% CI = b ± T.INV.2T(0.05,df)·SE)',fS)
    for j,h in enumerate(['Variable','Coefficient','Std error','t-stat','p-value','Lower 95%','Upper 95%']): ws.write(t0,j,h,fH)
    allv=['Intercept']+list(vars_); refs['coef']={}
    for i,vn in enumerate(allv):
        rr=t0+1+i; col=k+1 if vn=='Intercept' else k-(i-1)
        ws.write(rr,0,vn,fCalc); ws.write_formula(rr,1,f"={blk(1,col)}",fN3); ws.write_formula(rr,2,f"={blk(2,col)}",fN3)
        ws.write_formula(rr,3,f"=B{rr+1}/C{rr+1}",fN2); ws.write_formula(rr,4,f"=T.DIST.2T(ABS(D{rr+1}),{refs['df']})",fP)
        ws.write_formula(rr,5,f"=B{rr+1}-T.INV.2T(0.05,{refs['df']})*C{rr+1}",fN3); ws.write_formula(rr,6,f"=B{rr+1}+T.INV.2T(0.05,{refs['df']})*C{rr+1}",fN3)
        refs['coef'][vn]=dict(b=f"{sn}!$B${rr+1}",se=f"{sn}!$C${rr+1}",t=f"{sn}!$D${rr+1}",p=f"{sn}!$E${rr+1}",lo=f"{sn}!$F${rr+1}",hi=f"{sn}!$G${rr+1}")
    refs['next']=t0+len(allv)+3; refs['t0']=t0
    ws.set_column(0,0,34); ws.set_column(1,12,14)
    REF[key]=refs; return refs
# ---- Baseline sheet
ws=W['Baseline Models']; ws.write(0,0,'BASELINE MODELS (0A, 0B, 0C) - single-predictor OLS using LINEST',fT)
r=model_sheet('0A','Baseline Models','Model 0A: Sales ~ Price','',X('D','D'),['Price'],row0=2)
r=model_sheet('0B','Baseline Models','Model 0B: Sales ~ Demo','',X('G','G'),['Demo'],row0=REF['0A']['next']+1)
r=model_sheet('0C','Baseline Models','Model 0C: Sales ~ Endcap','',X('F','F'),['Endcap'],row0=REF['0B']['next']+1)
W['Baseline Models'].write(1,0,'Unadjusted single-variable relationships. Price alone explains ~0% of variation; Endcap alone ~35%; Demo alone ~11%.',fTxt)
# ---- Full MLR
V1=['Price','Rep','Endcap','Demo','D13','D45','Natural','Fitness']
model_sheet('1','Full MLR','Model 1: Full business-driven MLR (no interaction)','Sales = b0 + b1 Price + b2 Rep + b3 Endcap + b4 Demo + b5 Demo1-3 + b6 Demo4-5 + b7 Natural + b8 Fitness',X('D','K'),V1)
# ---- Reduced no interaction (Model 2)
V2=['Price','Rep','Endcap','Demo','D13','D45']
model_sheet('2','Variable Selection','Model 2: after variable selection (Natural, Fitness removed), no interaction','Predictors retained by forward stepwise (p-in 0.05 / p-out 0.10) and by backward elimination on the no-interaction pool.',X('D','I'),V2)
# ---- Model 3 full + interaction
V3=V1+['EndRep']
model_sheet('3','Interaction Analysis','Model 3: Full MLR + Endcap x Sales Rep','Interaction variable EndRep = Endcap x Sales Rep (Analysis Data column L).',X('D','L'),V3)
# ---- Final
VF=['Price','Rep','Endcap','Demo','D13','D45','EndRep']
model_sheet('F','Final Model','PREFERRED FINAL MODEL','Sales = b0 + b1 Price + b2 Sales Rep + b3 Endcap + b4 Demo + b5 Demo1-3 + b6 Demo4-5 + b7 (Endcap x Sales Rep)',X('O','U'),VF)
ws=W['Final Model']; rf=REF['F']; sn=q('Final Model'); t0=rf['t0']
# forward-order coefficient row, XtX and inverse
cr=rf['next']+0; ws.write(cr,0,'CALCULATION: coefficient row (constant first) used for fitted values',fS)
for j,vn in enumerate(['const']+VF): ws.write(cr+1,1+j,vn,fH); ws.write_formula(cr+2,1+j,f"={'$B$' if False else ''}{sn}!$B${t0+2+j}",fN3)
ws.write(cr+2,0,'Coefficients (forward order)',fCalc); COEFROW=f"{sn}!$B${cr+3}:$I${cr+3}"
xr0=cr+5; ws.write(xr0,0,"CALCULATION: X'X (design matrix incl. constant)",fS)
ws.write_array_formula(xr0+1,1,xr0+8,8,f"{{=MMULT(TRANSPOSE({X('N','U')}),{X('N','U')})}}",fN2)
ws.write(xr0+10,0,"CALCULATION: (X'X)^-1  (rows/cols: const, Price, Rep, Endcap, Demo, D13, D45, EndRep)",fS)
ws.write_array_formula(xr0+11,1,xr0+18,8,f"=MINVERSE(B{xr0+2}:I{xr0+9})".join(['{','}']),F(border=1,num_format='0.000000'))
INV=f"{sn}!$B${xr0+12}:$I${xr0+19}"; invcell=lambda i,j: f"{sn}!${cn(j)}${xr0+11+i}"   # i,j 1-based (1=const)
ws.write(xr0+21,0,'Final equation (Excel): see coefficient table. Interaction term is Endcap*SalesRep.',fNote)
# ---- Restricted blocks for partial F tests
model_sheet('R_nolag','Demo Analysis','Restricted model for partial F: final model WITHOUT Demo1-3 and Demo4-5','Price, Rep, Endcap, EndRep, Demo (Analysis Data W:AA)',X('W','AA'),['Price','Rep','Endcap','EndRep','Demo'],row0=40)
model_sheet('R_nodemo','Demo Analysis','Restricted model for partial F: final model WITHOUT any demo variable','Price, Rep, Endcap, EndRep (Analysis Data W:Z)',X('W','Z'),['Price','Rep','Endcap','EndRep'],row0=REF['R_nolag']['next']+1)
model_sheet('R_noend','Interaction Analysis','Restricted model: final model WITHOUT Endcap main effect','Price, Rep, Demo, Demo1-3, Demo4-5, EndRep (Analysis Data AC:AH)',X('AC','AH'),['Price','Rep','Demo','D13','D45','EndRep'],row0=REF['3']['next']+1)
# ============ Data Audit ============
ws=W['Data Audit']; ws.write(0,0,'DATA AUDIT',fT)
ws.write(2,0,'Structure checks',fS); ws.write(2,1,'Value',fS); ws.write(2,2,'Comment',fS)
chk=[('Rows (observations)',f"=COUNTA({RAW}!$C$2:$C${L})",'Matches case: 1,386 store-week observations'),
('Columns',f"=COUNTA({RAW}!$A$1:$L$1)",'12 columns in Real Data sheet'),
('Distinct stores',f"=SUMPRODUCT(1/COUNTIF({RAW}!$C$2:$C${L},{RAW}!$C$2:$C${L}))",'Matches case: 126 stores'),
('Distinct dates (weeks)',f"=SUMPRODUCT(1/COUNTIF({RAW}!$A$2:$A${L},{RAW}!$A$2:$A${L}))",'DISCREPANCY: dataset has 11 weekly dates (4 May - 13 Jul 2010); case Exhibit 1 says 10 weeks. 126 x 11 = 1,386 confirms 11 weeks. Dataset used as supplied.'),
('Observations per store (min)',f"=MIN(COUNTIF({RAW}!$C$2:$C${L},{RAW}!$C$2:$C${L}))",'Balanced panel: every store has 11 weekly records (array calc)'),
('First date',f"=MIN({RAW}!$A$2:$A${L})",''),('Last date',f"=MAX({RAW}!$A$2:$A${L})",''),
('Blank cells in numeric/dummy columns D:L',f"=COUNTBLANK({RAW}!$D$2:$L${L})",'None'),
('Blank cells in Region',f"=COUNTBLANK({RAW}!$B$2:$B${L})",'None. Region code "NA" (143 rows, 13 stores) is a genuine region code, not a missing value; software that reads "NA" as missing would silently drop these rows'),
('Rows with Region = "NA"',f'=COUNTIF({RAW}!$B$2:$B${L},"NA")','Kept in analysis (Region is not a model predictor)'),
('Exact duplicate rows',R['struct']['dups'],'Checked in Python (all 12 fields identical): none'),
('Sales <= 0',f'=COUNTIF({RAW}!$D$2:$D${L},"<=0")','None; minimum 47.6 units'),
('Stores whose Sales Rep flag changes during the window',R['struct']['rep_changes'],'Sales Rep is not constant within 10 stores (Python check). Treated as an observation-level indicator, as defined in the case.'),
('Stores whose Natural Retailers count changes',R['struct']['nat_changes'],'3 stores (Python check)')]
for i,(a,b,c) in enumerate(chk,3):
    ws.write(i,0,a,fCalc)
    if isinstance(b,str): ws.write_array_formula(i,1,i,1,'{'+b+'}',fCalc if 'date' not in a.lower() else F(border=1,num_format='yyyy-mm-dd')) if a.startswith('Observations per') else ws.write_formula(i,1,b,F(border=1,num_format='yyyy-mm-dd') if 'date' in a.lower() and 'Distinct' not in a else fCalc)
    else: ws.write(i,1,b,fIn)
    ws.write(i,2,c,fTb)
r0=len(chk)+5; ws.write(r0-1,0,'Variable summary',fS)
for j,h in enumerate(['Variable','Count','Distinct values','Mean','Median','Std dev','Min','Max','Type / coding']): ws.write(r0,j,h,fH)
vars_aud=[('Sales (Units Sold)','C','Continuous - dependent variable'),('Price (Avg Retail Price)','D','Continuous, $'),('Rep (Sales Rep)','E','Dummy 1 = regional rep, 0 = national only'),('Endcap','F','Dummy 1 = endcap promotion'),('Demo','G','Dummy: demo this week'),('D13 (Demo1-3)','H','Dummy: demo 1-3 weeks ago'),('D45 (Demo4-5)','I','Dummy: demo 4-5+ weeks ago'),('Natural','J','Count within 5 miles'),('Fitness','K','Count within 5 miles')]
for i,(lab,c,ty) in enumerate(vars_aud,1):
    rg=f"{AD}!${c}$2:${c}${L}"; rr=r0+i
    ws.write(rr,0,lab,fCalc); ws.write_formula(rr,1,f"=COUNT({rg})",fI0); ws.write_formula(rr,2,f"=SUMPRODUCT(1/COUNTIF({rg},{rg}))" if c not in 'C D'.split() else '="continuous"',fCalc)
    for j,fn in enumerate(['AVERAGE','MEDIAN','STDEV.S','MIN','MAX']): ws.write_formula(rr,3+j,f"={fn}({rg})",fN3)
    ws.write(rr,8,ty,fTb)
r1=r0+len(vars_aud)+3; ws.write(r1-1,0,'Dummy-variable counts (rows equal to 1)',fS)
for i,(lab,c) in enumerate([('Rep','E'),('Endcap','F'),('Demo','G'),('Demo1-3','H'),('Demo4-5','I'),('Endcap x Rep','L')]):
    ws.write(r1+i,0,lab,fCalc); ws.write_formula(r1+i,1,f"=SUM({AD}!${c}$2:${c}${L})",fI0)
ws.write(r1+7,0,'Outlier note: no data-entry errors found; max Sales 1,041 units (store with endcap + rep) is plausible given the Endcap x Rep effect; see Outliers sheet.',fNote)
ws.set_column(0,0,44); ws.set_column(1,1,14); ws.set_column(2,2,70); ws.set_column(3,8,12)
# ============ Descriptive stats ============
ws=W['Descriptive Stats']; ws.write(0,0,'DESCRIPTIVE STATISTICS & UNADJUSTED PROMOTION COMPARISONS',fT)
ws.write(1,0,'Unadjusted comparisons are descriptive; they do not control for other variables and are not causal estimates.',fNote)
for j,h in enumerate(['Variable','Mean','Median','Std dev','Min','Max','N']): ws.write(3,j,h,fH)
for i,(lab,c,_) in enumerate(vars_aud,4):
    rg=f"{AD}!${c}$2:${c}${L}"; ws.write(i,0,lab,fCalc)
    for j,fn in enumerate(['AVERAGE','MEDIAN','STDEV.S','MIN','MAX','COUNT']): ws.write_formula(i,1+j,f"={fn}({rg})",fN3 if j<5 else fI0)
c0=15; ws.write(c0-1,0,'Unadjusted mean Sales: promotion = 1 vs 0 (Welch two-sample t-test)',fS)
for j,h in enumerate(['Promotion','Mean (=1)','Mean (=0)','Difference','N (=1)','N (=0)','SD (=1)','SD (=0)','Welch t','Welch df','p-value']): ws.write(c0,j,h,fH)
for i,(lab,c) in enumerate([('Demo (current week)','G'),('Demo1-3','H'),('Demo4-5','I'),('Endcap','F'),('Sales Rep','E')],c0+1):
    rg=f"{AD}!${c}$2:${c}${L}"; r_=i+1
    ws.write(i,0,lab,fCalc); ws.write_formula(i,1,f"=AVERAGEIF({rg},1,{Y})",fN2); ws.write_formula(i,2,f"=AVERAGEIF({rg},0,{Y})",fN2); ws.write_formula(i,3,f"=B{r_}-C{r_}",fOut2)
    ws.write_formula(i,4,f"=COUNTIF({rg},1)",fI0); ws.write_formula(i,5,f"=COUNTIF({rg},0)",fI0)
    ws.write_array_formula(i,6,i,6,f"{{=STDEV.S(IF({rg}=1,{Y}))}}",fN2); ws.write_array_formula(i,7,i,7,f"{{=STDEV.S(IF({rg}=0,{Y}))}}",fN2)
    ws.write_formula(i,8,f"=D{r_}/SQRT(G{r_}^2/E{r_}+H{r_}^2/F{r_})",fN2)
    ws.write_formula(i,9,f"=(G{r_}^2/E{r_}+H{r_}^2/F{r_})^2/((G{r_}^2/E{r_})^2/(E{r_}-1)+(H{r_}^2/F{r_})^2/(F{r_}-1))",fN2); ws.write_formula(i,10,f"=T.DIST.2T(ABS(I{r_}),J{r_})",fP)
c1=c0+8; ws.write(c1-1,0,'Mean Sales by Sales Rep x Endcap cell',fS)
for j,h in enumerate(['Cell','Mean Sales','N']): ws.write(c1,j,h,fH)
for i,(lab,r_,e_) in enumerate([('No rep, no endcap',0,0),('No rep, endcap',0,1),('Rep, no endcap',1,0),('Rep, endcap',1,1)],c1+1):
    ws.write(i,0,lab,fCalc); ws.write_formula(i,1,f"=AVERAGEIFS({Y},{X('E','E')},{r_},{X('F','F')},{e_})",fN2); ws.write_formula(i,2,f"=COUNTIFS({X('E','E')},{r_},{X('F','F')},{e_})",fI0)
ws.set_column(0,0,34); ws.set_column(1,10,12)
# ============ Correlations ============
ws=W['Correlations']; ws.write(0,0,'PAIRWISE CORRELATION MATRIX (Pearson, CORREL formulas)',fT)
cv=[('Sales','C'),('Price','D'),('Rep','E'),('Endcap','F'),('Demo','G'),('Demo1-3','H'),('Demo4-5','I'),('Natural','J'),('Fitness','K'),('Endcap x Rep','L')]
for j,(n_,c) in enumerate(cv): ws.write(2,1+j,n_,fH); ws.write(3+j,0,n_,fS)
fCor=F(border=1,num_format='0.000')
for i,(n1,c1_) in enumerate(cv):
    for j,(n2,c2_) in enumerate(cv): ws.write_formula(3+i,1+j,f"=CORREL({X(c1_,c1_)},{X(c2_,c2_)})",fCor)
ws.write(15,0,'Reading: Sales correlates most with Endcap x Rep (0.74) and Endcap (0.59); Price has ~0 pairwise correlation with Sales, but a strongly negative partial effect once Sales Rep (r=0.33 with Price) is controlled. Predictors are only weakly correlated with each other (see VIF sheet).',fTxt)
ws.set_column(0,0,16); ws.set_column(1,10,12)
# ============ Variable selection extras ============
ws=W['Variable Selection']; r0=REF['2']['next']+1
ws.write(r0,0,'PARTIAL F-TEST: are Natural Retailers and Fitness Centers jointly needed? (Model 1 vs Model 2)',fS)
ws.write(r0+1,0,'Partial F = [(R²full - R²reduced)/q] / [(1 - R²full)/df_full]',fTxt)
a=REF['1']; b=REF['2']
ws.write(r0+2,0,'q (variables dropped)',fCalc); ws.write(r0+2,1,2,fIn); ws.write(r0+3,0,'Partial F',fCalc); ws.write_formula(r0+3,1,f"=(({a['r2']}-{b['r2']})/B{r0+3})/((1-{a['r2']})/{a['df']})",fOut2)
ws.write(r0+4,0,'p-value',fCalc); ws.write_formula(r0+4,1,f"=F.DIST.RT(B{r0+4},B{r0+3},{a['df']})",fP)
ws.write(r0+5,0,'Decision (p-out = 0.10)',fCalc); ws.write_formula(r0+5,1,f'=IF(B{r0+5}>0.1,"Remove both","Keep")',fOutT)
REF['vs_partial']=dict(F=f"{q('Variable Selection')}!$B${r0+4}",p=f"{q('Variable Selection')}!$B${r0+5}")
r1=r0+8; ws.write(r1,0,'STEPWISE / BACKWARD LOG (computed in Python/statsmodels with partial F-tests; course rule p-in 0.05, p-out 0.10). Static values.',fS)
def steplog(r,title,log,final):
    ws.write(r,0,title,fB)
    for j,h in enumerate(['Step','Action','Variable','Partial F','p-value','R²','Adj R²']): ws.write(r+1,j,h,fH)
    for i,s in enumerate(log,r+2):
        ws.write(i,0,s['step'],fI0); ws.write(i,1,s['action'],fCalc); ws.write(i,2,s['var'],fCalc); ws.write(i,3,s['F'],fN2); ws.write(i,4,s['p'],fP); ws.write(i,5,s['r2'],fN4); ws.write(i,6,s['adj'],fN4)
    ws.write(r+2+len(log),0,'Final set: '+', '.join(final),fOutT); return r+len(log)+5
rr=steplog(r1+1,'A. Forward stepwise - pool of 8 predictors (no interaction)',R['step']['A']['log'],R['step']['A']['final'])
rr=steplog(rr,'B. Forward stepwise - pool of 8 predictors + Endcap x Rep',R['step']['B']['log'],R['step']['B']['final'])
rr=steplog(rr,'C. Backward elimination (p-out 0.10) - 9 candidates incl. interaction',R['step']['back']['log'],R['step']['back']['final'])
ws.write(rr,0,'Judgement: stepwise B and backward elimination drop the Endcap MAIN effect (p=0.96) once the interaction is present. The final model keeps the main effect because (i) the course keeps main effects alongside an interaction, (ii) the Endcap coefficient is then directly interpretable as the Endcap effect where Sales Rep = 0, and (iii) dropping it changes nothing material (see Model Comparison and Interaction Analysis).',fTxt)
ws.set_row(rr,60); ws.set_column(0,0,40); ws.set_column(1,8,13)
# ============ Interaction Analysis extras ============
ws=W['Interaction Analysis']; r0=REF['R_noend']['next']+1
ws.write(r0,0,'PARTIAL F-TEST FOR Endcap x Sales Rep',fS)
for j,h in enumerate(['Comparison','R² restricted','R² full','q','df full','Partial F','p-value','Decision']): ws.write(r0+1,j,h,fH)
def pf_row(r,lab,rest,full,qq):
    ws.write(r,0,lab,fCalc); ws.write_formula(r,1,f"={rest['r2']}",fN4); ws.write_formula(r,2,f"={full['r2']}",fN4); ws.write(r,3,qq,fIn); ws.write_formula(r,4,f"={full['df']}",fI0)
    ws.write_formula(r,5,f"=((C{r+1}-B{r+1})/D{r+1})/((1-C{r+1})/E{r+1})",fOut2); ws.write_formula(r,6,f"=F.DIST.RT(F{r+1},D{r+1},E{r+1})",fP); ws.write_formula(r,7,f'=IF(G{r+1}<0.05,"Significant","Not significant")',fCalc)
pf_row(r0+2,'Model 1 -> Model 3 (add Endcap x Rep to full model)',REF['1'],REF['3'],1)
pf_row(r0+3,'Model 2 -> Final (add Endcap x Rep to reduced model)',REF['2'],REF['F'],1)
pf_row(r0+4,'Final without Endcap main -> Final (is Endcap main effect needed?)',REF['R_noend'],REF['F'],1)
pf_row(r0+5,'Final -> Model 3 (are Natural & Fitness needed given interaction?)',REF['F'],REF['3'],2)
r1=r0+8; ws.write(r1,0,'OTHER CANDIDATE INTERACTIONS (each added one at a time to the final model; Python partial F, static)',fS)
for j,h in enumerate(['Interaction','Coefficient','Partial F (1 df)','p-value','Adj R² with term']): ws.write(r1+1,j,h,fH)
for i,(k_,v) in enumerate(R['other_int'].items(),r1+2):
    ws.write(i,0,k_,fCalc); ws.write(i,1,v['b'],fN3); ws.write(i,2,v['F'],fN2); ws.write(i,3,v['p'],fP); ws.write(i,4,v['adj'],fN4)
r2=r1+10; ws.write(r2,0,'INTERPRETATION TABLE (final model; price held at sample mean, no demo)',fS)
fm_=REF['F']['coef']; mp=f"AVERAGE({X('D','D')})"
for j,h in enumerate(['Quantity','Estimate','Std error','Meaning']): ws.write(r2+1,j,h,fH)
sF=q('Final Model')
rows_=[('Endcap coefficient (Sales Rep = 0)',f"={fm_['Endcap']['b']}",f"={fm_['Endcap']['se']}",'Endcap effect in stores WITHOUT a regional rep (only 17 such observations)'),
('Interaction coefficient',f"={fm_['EndRep']['b']}",f"={fm_['EndRep']['se']}",'Additional endcap effect when Sales Rep = 1'),
('Combined Endcap effect (Sales Rep = 1)',f"={fm_['Endcap']['b']}+{fm_['EndRep']['b']}",f"=SQRT({REF['F']['se']}^2*({invcell(4,4+0).replace('$'+cn(4),'$'+cn(4))}+{invcell(8,8)}+2*{invcell(4,8)}))",'Endcap effect in stores WITH a regional rep (36 observations)')]
# invcell(i,j): i,j 1-based within INV; column letter = cn(j) -> fix mapping below
def icell(i,j): return f"{sF}!${cn(j)}${xr0+11+i}"
rows_[2]=(rows_[2][0],rows_[2][1],f"=SQRT({REF['F']['se']}^2*({icell(4,4)}+{icell(8,8)}+2*{icell(4,8)}))",rows_[2][3])
for i,(a_,b_,c_,d_) in enumerate(rows_,r2+2):
    ws.write(i,0,a_,fCalc); ws.write_formula(i,1,b_,fOut2); ws.write_formula(i,2,c_,fN2); ws.write(i,3,d_,fTb)
ws.write(r2+5,0,'Predicted weekly units (price at mean, no demo):',fB)
for j,h in enumerate(['Cell','Predicted units']): ws.write(r2+6,j,h,fH)
cf=fm_
for i,(lab,rr_,ee_) in enumerate([('No rep, no endcap',0,0),('No rep, endcap',0,1),('Rep, no endcap',1,0),('Rep, endcap',1,1)],r2+7):
    ws.write(i,0,lab,fCalc); ws.write_formula(i,1,f"={cf['Intercept']['b']}+{cf['Price']['b']}*{mp}+{cf['Rep']['b']}*{rr_}+{cf['Endcap']['b']}*{ee_}+{cf['EndRep']['b']}*{rr_*ee_}",fOut2)
ws.set_column(0,0,58); ws.set_column(1,7,15)
# ============ VIF ============
ws=W['VIF']; ws.write(0,0,'MULTICOLLINEARITY: correlation-matrix inverse method (VIF_j = j-th diagonal of inverse correlation matrix; Tolerance = 1/VIF). Course rule of thumb: VIF > 4 (some authors 10) signals concern.',fT)
def vif_block(r0,title,vars_,cols_):
    kk=len(vars_); ws.write(r0,0,title,fS)
    for j,v in enumerate(vars_): ws.write(r0+1,1+j,v,fH); ws.write(r0+2+j,0,v,fS)
    for i,ci in enumerate(cols_):
        for j,cj in enumerate(cols_): ws.write_formula(r0+2+i,1+j,f"=CORREL({X(ci,ci)},{X(cj,cj)})",fCor)
    ws.write(r0+3+kk,0,'Inverse of correlation matrix',fB)
    ws.write_array_formula(r0+4+kk,1,r0+3+kk+kk,kk,f"{{=MINVERSE({cn(1)}{r0+3}:{cn(kk)}{r0+2+kk})}}",F(border=1,num_format='0.000'))
    h0=r0+5+kk+kk; ws.write(h0,0,'Variable',fH); ws.write(h0,1,'VIF',fH); ws.write(h0,2,'Tolerance',fH); ws.write(h0,3,'Flag (VIF>4)',fH)
    for i,v in enumerate(vars_):
        ws.write(h0+1+i,0,v,fCalc); ws.write_formula(h0+1+i,1,f"={cn(1+i)}{r0+5+kk+i}",fOut2); ws.write_formula(h0+1+i,2,f"=1/B{h0+2+i}",fN3); ws.write_formula(h0+1+i,3,f'=IF(B{h0+2+i}>4,"Check","OK")',fCalc)
    return h0+kk+3
nx=vif_block(2,'Final model predictors',VF,['P','Q','R','S','T','U','V'][:0] or ['O','P','Q','R','S','T','U'])
vif_block(nx,'Model 1 (Full MLR) predictors',V1,['D','E','F','G','H','I','J','K'])
ws.write(nx+30,0,'Reading: all VIFs <1.4 except Endcap (3.1) and Endcap x Rep (3.2), whose overlap is structural (interaction with its own component) and below the course threshold of 4. No multicollinearity concern.',fTxt)
ws.set_column(0,0,18); ws.set_column(1,10,11)
# ============ Residual Diagnostics ============
ws=W['Residual Diagnostics']; RD=q('Residual Diagnostics'); IN=q('Influence')
hd=['Obs','Store','Date','Sales','Fitted','Residual','Standardized resid (e/SE)','Residual²','','Rank','Sorted std resid','Observed cum prob','Expected cum prob (Normal)']
for j,h in enumerate(hd):
    if h: ws.write(0,j,h,fH)
se_=REF['F']['se']
for i in range(2,L+1):
    ws.write_formula(f'A{i}',f"=ROW()-1"); ws.write_formula(f'B{i}',f"={AD}!A{i}"); ws.write_formula(f'C{i}',f"={AD}!B{i}",fD); ws.write_formula(f'D{i}',f"={AD}!C{i}")
    ws.write_formula(f'E{i}',f"=SUMPRODUCT({COEFROW},{AD}!N{i}:U{i})",fN2); ws.write_formula(f'F{i}',f"=D{i}-E{i}",fN2); ws.write_formula(f'G{i}',f"=F{i}/{se_}",fN3); ws.write_formula(f'H{i}',f"=F{i}^2")
    ws.write_formula(f'J{i}',f"=A{i}"); ws.write_formula(f'K{i}',f"=SMALL($G$2:$G${L},J{i})",fN3); ws.write_formula(f'L{i}',f"=(J{i}-0.5)/{N}",fN4); ws.write_formula(f'M{i}',f"=NORM.DIST(K{i},AVERAGE($G$2:$G${L}),STDEV.S($G$2:$G${L}),TRUE)",fN4)
ws.write('O1','SUMMARY (final model)',fS); 
summ=[('Mean residual (should be ~0)',f"=AVERAGE(F2:F{L})",fN4),('Std dev of residuals',f"=STDEV.S(F2:F{L})",fN3),('Skewness',f"=SKEW(F2:F{L})",fN3),('Excess kurtosis',f"=KURT(F2:F{L})",fN3),
('Durbin-Watson d',f"=SUMXMY2(F3:F{L},F2:F{L-1})/SUMSQ(F2:F{L})",fOut),('Min std resid',f"=MIN(G2:G{L})",fN3),('Max std resid',f"=MAX(G2:G{L})",fN3),
('Breusch-Pagan: R² of e² on X',None,fN4),('Breusch-Pagan LM = n·R²',None,fN3),('Breusch-Pagan p-value (chi-sq, k df)',None,fP),('Corr(Fitted, Residual) (should be ~0)',f"=CORREL(E2:E{L},F2:F{L})",fN4)]
for i,(a,b,c) in enumerate(summ,1):
    ws.write(i,14,a,fCalc)
    if b: ws.write_formula(i,15,b,c)
# BP aux regression: LINEST of e^2 on X (O..U minus const)
ws.write_array_formula('R14:Y18',f"{{=IFERROR(LINEST($H$2:$H${L},{X('O','U')},TRUE,TRUE),\"\")}}",fN3)
ws.write('R13','Aux regression LINEST (e² on predictors) - Breusch-Pagan',fB)
ws.write_formula('P9',"=INDEX(R14:Y18,3,1)",fN4); ws.write_formula('P10',f"={N}*P9",fN3); ws.write_formula('P11',f"=CHISQ.DIST.RT(P10,7)",fP)
ws.write('O14','Python reference values (statsmodels)',fB); ws.write('O15','Durbin-Watson'); ws.write('P15',R['dw_final'],fN3); ws.write('O16','BP LM / p'); ws.write('P16',R['bp']['lm'],fN3); ws.write('Q16',R['bp']['p'],fN4)
ws.write('O18','Lag-1 residual corr within store (Python)'); ws.write('P18',R['lag1_resid_corr'],fN3)
ws.write('O20','Course DW decision: d near 2 and between dU and 4-dU => no first-order autocorrelation; d well below 2 => positive autocorrelation. Note rows are ordered store, then week.',fTxt)
ch=wb.add_chart({'type':'scatter'}); ch.add_series({'categories':f"={RD}!$E$2:$E${L}",'values':f"={RD}!$G$2:$G${L}",'marker':{'type':'circle','size':3,'fill':{'color':'#1f4e79'},'border':{'none':True}}})
ch.set_title({'name':'Residuals vs fitted (final model)'}); ch.set_x_axis({'name':'Fitted weekly units'}); ch.set_y_axis({'name':'Standardized residual'}); ch.set_legend({'none':True}); ch.set_size({'width':520,'height':320}); ws.insert_chart('O23',ch)
ch2=wb.add_chart({'type':'scatter'}); ch2.add_series({'categories':f"={RD}!$L$2:$L${L}",'values':f"={RD}!$M$2:$M${L}",'marker':{'type':'circle','size':3,'fill':{'color':'#1f4e79'},'border':{'none':True}}})
ch2.set_title({'name':'Normal P-P plot of standardized residuals'}); ch2.set_x_axis({'name':'Observed cumulative probability','min':0,'max':1}); ch2.set_y_axis({'name':'Expected cumulative probability','min':0,'max':1}); ch2.set_legend({'none':True}); ch2.set_size({'width':520,'height':320}); ws.insert_chart('O41',ch2)
ws.set_column(0,0,6); ws.set_column(1,1,24); ws.set_column(2,12,12); ws.set_column(14,14,40); ws.set_column(15,25,11); ws.freeze_panes(1,0)
# ============ Influence ============
ws=W['Influence']; k_=7; n_=N; dfr=REF['F']['df']
hd=['Obs','Leverage h','Residual','Studentized resid (internal)','Studentized resid (deleted)',"Cook's D",'Mahalanobis D²','DFFITS (standardized)','|Stud. resid|','Lev > 2(k+1)/n','Cook > 4/(n-k-1)','Mahal > 10','|DFFITS| > 2√((k+1)/n)']
for j,h in enumerate(hd): ws.write(0,j,h,fH)
ws.write('O1','THRESHOLDS (course notes)',fS)
th=[('n',f"=COUNT({Y})",fI0),('k',7,fI0),('Leverage 2(k+1)/n',"=2*(Q3+1)/Q2",fN4),('Leverage 3(k+1)/n',"=3*(Q3+1)/Q2",fN4),("Cook 4/(n-k-1)","=4/(Q2-Q3-1)",F(border=1,num_format='0.00000')),("Cook 1",1,fN2),('DFFITS 2*sqrt((k+1)/n)',"=2*SQRT((Q3+1)/Q2)",fN4),('Mahalanobis',10,fI0)]
for i,(a,b,c) in enumerate(th,1):
    ws.write(i,14,a,fCalc); 
    if isinstance(b,str): ws.write_formula(i,15,b,c)
    else: ws.write(i,15,b,fIn)
# Q = col index 16? we wrote values in column P (idx15). adjust formulas to column P
for i,(a,b,c) in enumerate(th,1):
    if isinstance(b,str): ws.write_formula(i,15,b.replace('Q2','P2').replace('Q3','P3'),c)
for i in range(2,L+1):
    ws.write_formula(f'A{i}',"=ROW()-1"); ws.write_formula(f'B{i}',f"=SUMPRODUCT(MMULT({AD}!N{i}:U{i},{INV}),{AD}!N{i}:U{i})",F(num_format='0.00000'))
    ws.write_formula(f'C{i}',f"={RD}!F{i}",fN2); ws.write_formula(f'D{i}',f"=C{i}/({se_}*SQRT(1-B{i}))",fN3)
    ws.write_formula(f'E{i}',f"=D{i}*SQRT(({dfr}-1)/({dfr}-D{i}^2))",fN3); ws.write_formula(f'F{i}',f"=D{i}^2/($P$3+1)*B{i}/(1-B{i})",F(num_format='0.000000'))
    ws.write_formula(f'G{i}',f"=($P$2-1)*(B{i}-1/$P$2)",fN3); ws.write_formula(f'H{i}',f"=E{i}*SQRT(B{i}/(1-B{i}))",fN3); ws.write_formula(f'I{i}',f"=ABS(D{i})",fN3)
    ws.write_formula(f'J{i}',f"=IF(B{i}>$P$4,1,0)"); ws.write_formula(f'K{i}',f"=IF(F{i}>$P$6,1,0)"); ws.write_formula(f'L{i}',f"=IF(G{i}>$P$9,1,0)"); ws.write_formula(f'M{i}',f"=IF(ABS(H{i})>$P$8,1,0)")
ws.write('O11','FLAG COUNTS',fS)
cnts=[('Leverage > 2(k+1)/n',f"=SUM(J2:J{L})"),('Leverage > 3(k+1)/n',f'=COUNTIF(B2:B{L},">"&P5)'),("Cook's D > 4/(n-k-1)",f"=SUM(K2:K{L})"),("Cook's D > 1",f'=COUNTIF(F2:F{L},">1")'),('Mahalanobis > 10',f"=SUM(L2:L{L})"),('|DFFITS| > threshold',f"=SUM(M2:M{L})"),('Max Cook D',f"=MAX(F2:F{L})"),('Max leverage',f"=MAX(B2:B{L})")]
for i,(a,b) in enumerate(cnts,11):
    ws.write(i,14,a,fCalc); ws.write_formula(i,15,b,fOut if 'Max' in a else fOutI)
ws.write('O21','Reading: no observation has Cook D near 1 (max 0.023). The flagged leverage / Mahalanobis points are structural: all 36 Endcap-with-Rep rows (a rare cell) exceed 3(k+1)/n. They are legitimate observations that define the interaction. See Outliers sheet and report Section 5 for the sensitivity analysis.',fTxt)
ws.set_column(0,0,6); ws.set_column(1,12,13); ws.set_column(14,14,30); ws.set_column(15,15,12); ws.freeze_panes(1,0)
# ============ Outliers ============
ws=W['Outliers']; ws.write(0,0,'OUTLIER ANALYSIS: largest studentized residuals (formula-driven from Influence sheet)',fT)
ws.write(2,0,'Counts',fS)
for i,(a,b) in enumerate([('|studentized resid| > 2',f'=COUNTIF({IN}!I2:I{L},">2")'),('|studentized resid| > 3',f'=COUNTIF({IN}!I2:I{L},">3")'),('Expected beyond ±2 if normal (≈4.55% of n)',f'=0.0455*{N}'),('Expected beyond ±3 if normal (≈0.27% of n)',f'=0.0027*{N}')],3):
    ws.write(i,0,a,fCalc); ws.write_formula(i,1,b,fOut2)
hd=['Rank','|Stud resid|','Obs #','Store','Date','Sales','Fitted','Residual']
for j,h in enumerate(hd): ws.write(8,j,h,fH)
for i in range(10):
    r_=9+i; ws.write(r_,0,i+1,fI0); ws.write_formula(r_,1,f"=LARGE({IN}!$I$2:$I${L},A{r_+1})",fN3); ws.write_formula(r_,2,f"=MATCH(B{r_+1},{IN}!$I$2:$I${L},0)",fI0)
    for j,(col,fm) in enumerate([('B',None),('C',fD),('D',fN2),('E',fN2),('F',fN2)]): ws.write_formula(r_,3+j,f"=INDEX({RD}!${col}$2:${col}${L},C{r_+1})",fm)
ws.write(21,0,'Reading: the largest studentized residual is ≈3.7; only 5 of 1,386 observations exceed 3 (≈3.7 expected under normality). No pattern of data-entry error; no observation is removed. Sensitivity: dropping flagged points leaves all key coefficients essentially unchanged (Influence / Model Comparison).',fTxt)
ws.set_column(0,0,44); ws.set_column(1,7,13); ws.set_column(3,3,26)
# ============ Demo Analysis ============
ws=W['Demo Analysis']; ws.write(0,0,'DEMO ANALYSIS (Questions 3 and 6): effect of in-store demos on weekly sales, from the final model',fT)
ws.write(1,0,'Summary (rows 4-9) is formula-linked to the Final Model sheet; restricted models used for partial F-tests are further down this sheet.',fTxt)
for j,h in enumerate(['Variable','Coefficient (units)','Std error','t','p-value','Lower 95%','Upper 95%','Significant at 5%?']): ws.write(3,j,h,fH)
fm_=REF['F']['coef']
for i,(lab,v) in enumerate([('Demo (current week)','Demo'),('Demo1-3 (1-3 weeks ago)','D13'),('Demo4-5 (4-5 weeks ago)','D45')],4):
    ws.write(i,0,lab,fCalc)
    for j,kk in enumerate(['b','se','t','p','lo','hi']): ws.write_formula(i,1+j,f"={fm_[v][kk]}",fP if kk=='p' else fN3)
    ws.write_formula(i,7,f'=IF(E{i+1}<0.05,"Yes","No")',fCalc)
ws.write(8,0,'JOINT AND COMPARISON TESTS',fS)
for j,h in enumerate(['Test','Statistic','p-value','Interpretation']): ws.write(9,j,h,fH)
def pfv(full,rest,qq): return f"=(({full['r2']}-{rest['r2']})/{qq})/((1-{full['r2']})/{full['df']})"
ws.write(10,0,'Joint F: Demo1-3 = Demo4-5 = 0 (lags, q=2)',fCalc); ws.write_formula(10,1,pfv(REF['F'],REF['R_nolag'],2),fOut2); ws.write_formula(10,2,f"=F.DIST.RT(B11,2,{REF['F']['df']})",fP); ws.write(10,3,'Lagged demo effects are jointly significant',fTb)
ws.write(11,0,'Joint F: all three demo variables = 0 (q=3)',fCalc); ws.write_formula(11,1,pfv(REF['F'],REF['R_nodemo'],3),fOut2); ws.write_formula(11,2,f"=F.DIST.RT(B12,3,{REF['F']['df']})",fP); ws.write(11,3,'Demo program has a significant effect overall',fTb)
sdiff=f"{se_}*SQRT({icell(6,6)}+{icell(7,7)}-2*{icell(6,7)})"
ws.write(12,0,'Demo4-5 minus Demo1-3 (units): difference',fCalc); ws.write_formula(12,1,f"={fm_['D45']['b']}-{fm_['D13']['b']}",fOut2); ws.write(12,3,'Standard error → t → p below',fTb)
ws.write(13,0,'  Std error of difference',fCalc); ws.write_formula(13,1,f"={sdiff}",fN3)
ws.write(14,0,'  t-stat / p-value (H0: no decay between weeks 1-3 and 4-5)',fCalc); ws.write_formula(14,1,f"=B13/B14",fN3); ws.write_formula(14,2,f"=T.DIST.2T(ABS(B15),{REF['F']['df']})",fP); ws.write(14,3,'No evidence the lift decays between 1-3 and 4-5 weeks',fTb)
sdiff2=f"{se_}*SQRT({icell(5,5)}+{icell(6,6)}-2*{icell(5,6)})"
ws.write(15,0,'Current-week Demo minus Demo1-3 (units)',fCalc); ws.write_formula(15,1,f"={fm_['Demo']['b']}-{fm_['D13']['b']}",fOut2); ws.write_formula(15,2,f"=T.DIST.2T(ABS(B16/({sdiff2})),{REF['F']['df']})",fP); ws.write(15,3,'Current-week lift is larger than the later-week lift',fTb)
ws.write(17,0,'ILLUSTRATIVE CUMULATIVE UNITS PER DEMOED STORE (assumes a store stays in each flag for the full window; no cost data available)',fS)
ws.write(18,0,'Demo week + 3 weeks of Demo1-3',fCalc); ws.write_formula(18,1,f"=B5+3*B6",fOut2)
ws.write(19,0,'... + 2 further weeks of Demo4-5 (observable window)',fCalc); ws.write_formula(19,1,f"=B5+3*B6+2*B7",fOut2)
ws.write(20,0,'ROI cannot be computed: demo cost and unit margin are not in the data supplied.',fNote)
ws.write(21,0,'Duration finding: Demo4-5 is defined as "at least 4-5 weeks ago" and the data end 11 weeks in, so the dataset shows the lift persists AT LEAST 4-5 weeks after a demo with no measurable decay; it cannot show when it ends.',fNote)
ws.set_row(21,45); ws.set_column(0,0,58); ws.set_column(1,7,15)
# ============ Endcap Analysis ============
ws=W['Endcap Analysis']; ws.write(0,0,'ENDCAP ANALYSIS (Question 4)',fT)
ws.write(2,0,'Step 1 - Unadjusted comparison (see Descriptive Stats)',fS)
DS=q('Descriptive Stats')
for j,h in enumerate(['Group','Mean Sales','N']): ws.write(3,j,h,fH)
for i,(lab,r_) in enumerate([('Endcap = 0',None),('Endcap = 1',None)],4): pass
ws.write(4,0,'No endcap',fCalc); ws.write_formula(4,1,f"=AVERAGEIF({X('F','F')},0,{Y})",fN2); ws.write_formula(4,2,f"=COUNTIF({X('F','F')},0)",fI0)
ws.write(5,0,'Endcap',fCalc); ws.write_formula(5,1,f"=AVERAGEIF({X('F','F')},1,{Y})",fN2); ws.write_formula(5,2,f"=COUNTIF({X('F','F')},1)",fI0)
ws.write(6,0,'Unadjusted difference',fCalc); ws.write_formula(6,1,"=B6-B5",fOut2)
ws.write(8,0,'Step 2 - Single-predictor regression (Model 0C) coefficient',fS); ws.write_formula(8,1,f"={REF['0C']['coef']['Endcap']['b']}",fN2)
ws.write(10,0,'Step 3 - Regression-adjusted effects from final model',fS)
for j,h in enumerate(['Effect','Estimate','Std error','t','p-value','Lower 95%','Upper 95%']): ws.write(11,j,h,fH)
ws.write(12,0,'Endcap when Sales Rep = 0 (Endcap coefficient)',fCalc)
for j,kk in enumerate(['b','se','t','p','lo','hi']): ws.write_formula(12,1+j,f"={fm_['Endcap'][kk]}",fP if kk=='p' else fN3)
ws.write(13,0,'Interaction (extra effect when Sales Rep = 1)',fCalc)
for j,kk in enumerate(['b','se','t','p','lo','hi']): ws.write_formula(13,1+j,f"={fm_['EndRep'][kk]}",fP if kk=='p' else fN3)
ws.write(14,0,'Combined Endcap effect when Sales Rep = 1',fCalc); ws.write_formula(14,1,f"={fm_['Endcap']['b']}+{fm_['EndRep']['b']}",fOut2)
ws.write_formula(14,2,f"={se_}*SQRT({icell(4,4)}+{icell(8,8)}+2*{icell(4,8)})",fN3); ws.write_formula(14,3,"=B15/C15",fN2); ws.write_formula(14,4,f"=T.DIST.2T(ABS(D15),{REF['F']['df']})",fP)
ws.write_formula(14,5,f"=B15-T.INV.2T(0.05,{REF['F']['df']})*C15",fN3); ws.write_formula(14,6,f"=B15+T.INV.2T(0.05,{REF['F']['df']})*C15",fN3)
ws.write(16,0,'Step 4 - Predicted weekly units (price at mean, no demo): see Interaction Analysis sheet',fS)
ws.write(18,0,'Cell counts',fS)
for i,(lab,r_,e_) in enumerate([('No rep, no endcap',0,0),('No rep, endcap',0,1),('Rep, no endcap',1,0),('Rep, endcap',1,1)],19):
    ws.write(i,0,lab,fCalc); ws.write_formula(i,1,f"=COUNTIFS({X('E','E')},{r_},{X('F','F')},{e_})",fI0); ws.write_formula(i,2,f"=AVERAGEIFS({Y},{X('E','E')},{r_},{X('F','F')},{e_})",fN2)
ws.write(18,1,'N',fS); ws.write(18,2,'Mean Sales',fS)
ws.write(24,0,'Reading: raw endcap gap (~343 units) mixes two groups. Adjusted for the others, endcaps in stores WITHOUT a regional rep show no detectable lift (+0.6 units; CI roughly -23 to +24, based on only 17 obs); in stores WITH a regional rep the lift is ≈ +454 units per store-week. Endcap is a conditional association: targeting of endcaps to strong stores cannot be ruled out (see report Limitations).',fTxt); ws.set_row(24,75)
ws.set_column(0,0,52); ws.set_column(1,7,14)
# ============ Model Comparison ============
ws=W['Model Comparison']; ws.write(0,0,'MODEL COMPARISON (all values formula-linked to the model sheets)',fT)
hd=['Model','Variables','R²','Adj R²','Std error','F','Model p-value','DW (Python)','Key finding']
for j,h in enumerate(hd): ws.write(2,j,h,fH)
mods=[('0A','Sales ~ Price','Price alone explains nothing (R² ≈ 0)',R['models']['0A']['dw']),('0B','Sales ~ Demo','Current demo alone: R² 0.11',R['models']['0B']['dw']),('0C','Sales ~ Endcap','Endcap alone: R² 0.35 (unadjusted)',R['models']['0C']['dw']),
('1','Price, Rep, Endcap, Demo, D13, D45, Natural, Fitness','Full MLR: Natural & Fitness insignificant; DW 1.38 and strong heteroscedasticity (missing interaction)',R['models']['1']['dw']),
('2','Price, Rep, Endcap, Demo, D13, D45','Natural & Fitness dropped (partial F p=0.46); same fit as Model 1',R['models']['2']['dw']),
('3','Model 1 + Endcap x Rep','Interaction adds ~13.3 pts of R²; DW 2.09',R['models']['3full']['dw']),
('F','Price, Rep, Endcap, Demo, D13, D45, Endcap x Rep','PREFERRED FINAL MODEL: best adj R² among models that keep hierarchy; all retained terms significant except Endcap main (kept for interpretation)',R['models']['F']['dw']),
('R_noend','Price, Rep, Demo, D13, D45, Endcap x Rep','Endcap main effect dropped: identical fit; alternative parsimonious form',R['models']['F_noEndMain']['dw'])]
for i,(k_,vs,kf,dw) in enumerate(mods,3):
    ws.write(i,0,{'0A':'0A','0B':'0B','0C':'0C','1':'Model 1 (Full MLR)','2':'Model 2 (selected, no interaction)','3':'Model 3 (Full + interaction)','F':'FINAL MODEL','R_noend':'Final w/o Endcap main'}[k_],fB if k_=='F' else fCalc)
    ws.write(i,1,vs,fTb)
    for j,kk in enumerate(['r2','adj','se','F','pF']): ws.write_formula(i,2+j,f"={REF[k_][kk]}",fP if kk=='pF' else (fN4 if kk in('r2','adj') else fN2))
    ws.write(i,7,dw,fN3); ws.write(i,8,kf,fTb); ws.set_row(i,42)
ws.write(12,0,'Models are compared on adjusted R², partial F-tests, diagnostics (autocorrelation and heteroscedasticity disappear once the interaction is included), parsimony and business logic - not on R² alone.',fTxt)
ws.write(14,0,'Sensitivity of key coefficients (Python / statsmodels, static values)',fS)
sk=['Price','Rep','Endcap','Demo','D13','D45','EndRep']
for j,h in enumerate(['Specification']+['Price','Sales Rep','Endcap','Demo','Demo1-3','Demo4-5','Endcap x Rep']): ws.write(15,j,h,fH)
for i,(k_,v) in enumerate(R['sens'].items(),16):
    ws.write(i,0,k_,fCalc)
    for j,s_ in enumerate(sk):
        val=v.get(s_); 
        if val is None or val!=val: ws.write(i,1+j,'-',fCalc)
        else: ws.write(i,1+j,val,fN2)
ws.write(24,0,'Cluster-robust (by store) standard errors for the final model (Python, static): coefficients unchanged; SEs of Price, Demo4-5, Endcap, Endcap x Rep fall or stay similar; no conclusion changes.',fTxt)
for j,h in enumerate(['Variable','Coef','Cluster SE','p-value']): ws.write(25,j,h,fH)
for i,c_ in enumerate(R['cluster'],26):
    ws.write(i,0,c_['var'],fCalc); ws.write(i,1,c_['b'],fN3); ws.write(i,2,c_['se'],fN3); ws.write(i,3,c_['p'],fP)
ws.set_column(0,0,34); ws.set_column(1,1,48); ws.set_column(2,7,12); ws.set_column(8,8,70)
# ============ Excel vs JASP ============
ws=W['Excel vs JASP']; ws.write(0,0,'EXCEL vs JASP vs INDEPENDENT CHECK (final model)',fT)
ws.write(1,0,'JASP WAS NOT EXECUTED: no JASP installation or integration was available in the environment used to build this workbook, so no JASP output exists and none is claimed. A JASP-ready CSV and click-by-click specification are provided in the Supplementary folder. Fill column C after running the model in JASP. The independent check (column D) is a separate statsmodels (Python) OLS fit of the same model on the same data.',fNote); ws.set_row(1,60)
for j,h in enumerate(['Statistic','Excel (this workbook)','JASP (to be filled after running JASP)','Independent check: Python statsmodels','Difference Excel - Python','Match (|diff| < 1e-6)?','Excel - JASP (auto once C filled)']): ws.write(3,j,h,fH)
Mf=R['models']['F']; cf={c['var']:c for c in Mf['coef']}
items=[('R²',REF['F']['r2'],Mf['r2']),('Adjusted R²',REF['F']['adj'],Mf['adj']),('F-statistic',REF['F']['F'],Mf['F']),('Model p-value',REF['F']['pF'],Mf['p']),('Standard error',REF['F']['se'],Mf['se']),
('Intercept',fm_['Intercept']['b'],cf['const']['b']),('Price coefficient',fm_['Price']['b'],cf['Price']['b']),('Sales Rep coefficient',fm_['Rep']['b'],cf['Rep']['b']),('Endcap coefficient',fm_['Endcap']['b'],cf['Endcap']['b']),('Demo coefficient',fm_['Demo']['b'],cf['Demo']['b']),
('Demo1-3 coefficient',fm_['D13']['b'],cf['D13']['b']),('Demo4-5 coefficient',fm_['D45']['b'],cf['D45']['b']),('Endcap x Sales Rep coefficient',fm_['EndRep']['b'],cf['EndRep']['b']),('Price SE',fm_['Price']['se'],cf['Price']['se']),('Endcap x Rep SE',fm_['EndRep']['se'],cf['EndRep']['se']),
('Endcap x Rep p-value',fm_['EndRep']['p'],cf['EndRep']['p']),('Durbin-Watson',f"{RD}!$P$6",R['dw_final']),('Max Cook D',f"{IN}!$P$18",R['counts_flags']['maxcook']),('Max leverage',f"{IN}!$P$19",R['counts_flags']['maxh']),('VIF Endcap',f"{q('VIF')}!$B$25",R['vif']['Endcap'])]
fE=F(border=1,num_format='0.000000'); fPE=F(border=1,num_format='0.0000E+00')
for i,(lab,xref,py) in enumerate(items,4):
    ws.write(i,0,lab,fCalc); ws.write_formula(i,1,f"={xref}",fPE if 'p-value' in lab else fE); ws.write(i,2,'',fIn); ws.write(i,3,py,fPE if 'p-value' in lab else fE)
    ws.write_formula(i,4,f"=B{i+1}-D{i+1}",F(border=1,num_format='0.00E+00')); ws.write_formula(i,5,f'=IF(ABS(E{i+1})<0.000001,"Yes","CHECK")',fCalc)
    ws.write_formula(i,6,f'=IF(C{i+1}="","not run",B{i+1}-C{i+1})',fCalc)
ws.write(len(items)+5,0,'Checklist when running in JASP: same CSV (GoodBelly_JASP_Data.csv), 1,386 rows, Sales Rep/Endcap/Demo variables as scale (0/1), interaction column EndRep supplied, Method = Enter, include intercept, report R², adj R², ANOVA, coefficients with 95% CI, collinearity statistics, Durbin-Watson, residual plots, P-P plot, Cook\'s distance.',fTxt)
ws.set_row(len(items)+5,48); ws.set_column(0,0,34); ws.set_column(1,6,26)
# ============ Final Results ============
ws=W['Final Results']; ws.write(0,0,'FINAL RESULTS - PREFERRED MODEL (all linked to Final Model sheet)',fT)
ws.write(2,0,'Equation: Sales = b0 + b1·Price + b2·SalesRep + b3·Endcap + b4·Demo + b5·Demo1-3 + b6·Demo4-5 + b7·(Endcap×SalesRep) + e',fB)
for j,h in enumerate(['Variable','Coefficient','Std error','t','p-value','Lower 95%','Upper 95%']): ws.write(4,j,h,fH)
for i,vn in enumerate(['Intercept']+VF,5):
    ws.write(i,0,{'EndRep':'Endcap x Sales Rep','D13':'Demo1-3','D45':'Demo4-5','Rep':'Sales Rep'}.get(vn,vn),fCalc)
    for j,kk in enumerate(['b','se','t','p','lo','hi']): ws.write_formula(i,1+j,f"={fm_[vn][kk]}",fP if kk=='p' else fN3)
for i,(a,kk,fm) in enumerate([('R²','r2',fOut),('Adjusted R²','adj',fOut),('Standard error','se',fOut2),('F-statistic','F',fOut2),('Model p-value','pF',fP),('Observations','n',fOutI)],14):
    ws.write(i,0,a,fCalc); ws.write_formula(i,1,f"={REF['F'][kk]}",fm)
ws.write(21,0,'Key answers',fS)
ans=[('Q1','Final model explains ≈80.6% of variation in weekly sales (adj R² 0.805). Endcap works only together with a regional Sales Rep; demos, Sales Rep and lower price all lift sales.'),
('Q2','Assumptions broadly satisfied after adding the interaction (DW 2.09, no heteroscedasticity at 5%, near-normal residuals, VIF<3.2, no influential points). The initial model without the interaction violated independence and constant variance.'),
('Q3','Yes. +107 units in demo week, +73 in weeks 1-3, +75 in weeks 4-5 (all p<0.001); lift persists at least 4-5 weeks with no measurable decay.'),
('Q4','Yes, conditionally: ≈ +454 units/store-week with a regional rep; no detectable effect without one.'),
('Q5','Added Endcap x Rep, removed Natural/Fitness; further: store/time effects, clustered SEs, experimental testing, cost data.'),
('Q6','Keep the demo program and run it with an eye on cost per lift; place endcaps where regional reps support them; collect cost/margin data; test targeting experimentally. ROI cannot be computed from supplied data.')]
for i,(a,b) in enumerate(ans,22): ws.write(i,0,a,fB); ws.write(i,1,b,fTxt); ws.set_row(i,45)
ws.set_column(0,0,26); ws.set_column(1,6,16)
for i in range(22,28): ws.merge_range(i,1,i,6,ans[i-22][1],fTb)
# ============ README ============
ws=W['README']; ws.set_column(0,0,26); ws.set_column(1,1,110)
ws.write(0,0,'GoodBelly - Decision Sciences II - Excel Analysis Workbook',fT)
rd=[('Purpose','Reproducible Excel analysis supporting GoodBelly_Final_Report. Every regression is run with LINEST on the Analysis Data sheet; p-values, CIs, diagnostics, VIFs and influence measures are Excel formulas.'),
('Source data',f'"Real Data" sheet of Case_Study_Dataset.xlsx copied unchanged to Raw Data ({N} rows). The Explanation sheet (variable dictionary) is not used for numbers. No answer/solution sheets exist in the supplied workbook; none were used.'),
('Colour code','Blue font = input/typed value; black = formula/calculation; yellow fill, bold = key output.'),
('Sheet order','Raw Data -> Analysis Data (renamed variables, EndRep, model blocks) -> Data Audit -> Descriptive Stats -> Correlations -> Baseline Models -> Full MLR -> Variable Selection -> Interaction Analysis -> Final Model -> Demo Analysis -> Endcap Analysis -> Residual Diagnostics -> VIF -> Outliers -> Influence -> Model Comparison -> Excel vs JASP -> Final Results.'),
('Derived variables','Variable -> Formula -> Reason: EndRep -> Endcap × Sales Rep (=Endcap*Rep, Analysis Data col L) -> tests whether the Endcap effect depends on regional-rep presence. All other variables are the original columns renamed (Units Sold=Sales, Average Retail Price=Price, Sales Rep=Rep, Demo1-3=D13, Demo4-5=D45, Natural Retailers=Natural, Fitness Centers=Fitness).'),
('Dummy coding','Rep, Endcap, Demo, D13, D45 are 0/1 as supplied; reference category = 0 for each. Intercept = predicted sales with all dummies 0 and Price = 0.'),
('Items computed outside Excel','Stepwise logs (Variable Selection), other interaction candidates, sensitivity re-fits (region/week/store dummies, outlier exclusion), cluster-robust SEs and the Python reference column are static values from analysis.py (statsmodels), labelled "static". Everything else is formula-driven.'),
('JASP','NOT RUN. See Excel vs JASP sheet. A JASP-ready dataset and model specification are supplied separately.'),
('Data discrepancy','Case text: 10 weeks. Dataset: 11 weekly dates (4 May-13 Jul 2010) x 126 stores = 1,386 rows. The dataset was used as supplied. Region "NA" is a real code, not missing.'),
('Recalculation','Open in Excel; formulas recalculate automatically. LINEST/MMULT/MINVERSE cells are array formulas - do not edit partially.')]
for i,(a,b) in enumerate(rd,2): ws.write(i,0,a,fB); ws.write(i,1,b,fTxt); ws.set_row(i,48)
wb.close(); print('built',OUT)

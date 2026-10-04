"""GoodBelly - Decision Sciences II. Reproducible analysis (statsmodels). Run: python3 analysis.py <path-to-dataset.xlsx> <out_dir>"""
import sys, json, os
import numpy as np, pandas as pd, statsmodels.api as sm
from scipy import stats
from statsmodels.stats.outliers_influence import variance_inflation_factor as vif_f
from statsmodels.stats.stattools import durbin_watson
from statsmodels.stats.diagnostic import het_breuschpagan
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt

SRC=sys.argv[1]; OUT=sys.argv[2]; FIG=os.path.join(OUT,'fig'); os.makedirs(FIG,exist_ok=True)
# ---- load: Real Data sheet ONLY (the 'Explanation' sheet is the variable dictionary; no answer sheets exist in this file).
# keep_default_na=False because Region code 'NA' is a real region, not a missing value.
raw=pd.read_excel(SRC,sheet_name='Real Data',keep_default_na=False)
d=raw.copy(); d.columns=['Date','Region','Store','Sales','Price','Rep','Endcap','Demo','D13','D45','Natural','Fitness']
d['EndRep']=d.Endcap*d.Rep
n=len(d); R={}
LAB={'Intercept':'Intercept','Price':'Average Retail Price','Rep':'Sales Rep','Endcap':'Endcap','Demo':'Demo (current week)','D13':'Demo1-3','D45':'Demo4-5','Natural':'Natural Retailers','Fitness':'Fitness Centers','EndRep':'Endcap x Sales Rep'}
def ols(y,cols,data=d):
    X=sm.add_constant(data[cols].astype(float)); return sm.OLS(data[y].astype(float),X).fit()
def summ(m):
    return dict(r2=m.rsquared,adj=m.rsquared_adj,se=float(np.sqrt(m.mse_resid)),F=m.fvalue,p=m.f_pvalue,k=int(m.df_model),n=int(m.nobs),dfres=m.df_resid,ssr=m.ssr,sst=m.centered_tss,dw=float(durbin_watson(m.resid)),
                coef=[dict(var=v,b=m.params[v],se=m.bse[v],t=m.tvalues[v],p=m.pvalues[v],lo=m.conf_int().loc[v,0],hi=m.conf_int().loc[v,1]) for v in m.params.index])
def partialF(small,big):
    q=big.df_model-small.df_model; F=((small.ssr-big.ssr)/q)/(big.ssr/big.df_resid); return F,stats.f.sf(F,q,big.df_resid),int(q)

# ---- 1. data audit
aud=[]
for c in ['Sales','Price','Rep','Endcap','Demo','D13','D45','Natural','Fitness']:
    s=d[c]; aud.append(dict(var=c,mean=s.mean(),median=s.median(),sd=s.std(),min=s.min(),max=s.max(),n=int(s.count()),uniq=int(s.nunique())))
R['audit']=aud
R['struct']=dict(rows=n,cols=raw.shape[1],stores=int(d.Store.nunique()),weeks=int(d.Date.nunique()),first=str(d.Date.min().date()),last=str(d.Date.max().date()),missing=int(raw.isna().sum().sum()),
  dups=int(raw.duplicated().sum()),regions=int(d.Region.nunique()),per_store=sorted(d.groupby('Store').size().unique().tolist()),
  rep_changes=int((d.groupby('Store').Rep.nunique()>1).sum()),nat_changes=int((d.groupby('Store').Natural.nunique()>1).sum()),
  fit_changes=int((d.groupby('Store').Fitness.nunique()>1).sum()), na_region_rows=int((d.Region=='NA').sum()),
  neg_or_zero_sales=int((d.Sales<=0).sum()), price_min=d.Price.min(), price_max=d.Price.max())
R['counts']={c:int(d[c].sum()) for c in ['Rep','Endcap','Demo','D13','D45']}
R['endrep_ct']={f'{r}{e}':int(((d.Rep==r)&(d.Endcap==e)).sum()) for r in (0,1) for e in (0,1)}
# overlap of demo flags
R['demo_overlap']=dict(demo_and_d13=int(((d.Demo==1)&(d.D13==1)).sum()),demo_and_d45=int(((d.Demo==1)&(d.D45==1)).sum()),d13_and_d45=int(((d.D13==1)&(d.D45==1)).sum()),all3=int(((d.Demo==1)&(d.D13==1)&(d.D45==1)).sum()))
R['week_means']={str(k.date()):v for k,v in d.groupby('Date').Sales.mean().items()}
# ---- 2. unadjusted comparisons
unadj={}
for c in ['Demo','D13','D45','Endcap','Rep']:
    a=d[d[c]==1].Sales; b=d[d[c]==0].Sales; t=stats.ttest_ind(a,b,equal_var=False)
    unadj[c]=dict(m1=a.mean(),m0=b.mean(),diff=a.mean()-b.mean(),n1=len(a),n0=len(b),t=t.statistic,p=t.pvalue)
R['unadj']=unadj
R['cell_means']=d.groupby(['Rep','Endcap']).Sales.agg(['mean','median','std','count']).reset_index().to_dict('records')
corrv=['Sales','Price','Rep','Endcap','Demo','D13','D45','Natural','Fitness']
R['corr']=d[corrv].corr().round(4).to_dict(); R['corr_vars']=corrv
R['corr_endrep_sales']=float(d[['EndRep','Sales']].corr().iloc[0,1])
# ---- 3. models
ALL=['Price','Rep','Endcap','Demo','D13','D45','Natural','Fitness']
M={}
M['0A']=ols('Sales',['Price']); M['0B']=ols('Sales',['Demo']); M['0C']=ols('Sales',['Endcap'])
M['1']=ols('Sales',ALL)
M['2']=ols('Sales',['Price','Rep','Endcap','Demo','D13','D45'])        # after dropping Natural & Fitness
M['3full']=ols('Sales',ALL+['EndRep'])
FINALV=['Price','Rep','Endcap','Demo','D13','D45','EndRep']
M['F']=ols('Sales',FINALV)                                              # preferred final
M['F_noEndMain']=ols('Sales',['Price','Rep','Demo','D13','D45','EndRep'])
M['4']=ols('Sales',['Price','Rep','Endcap','Demo','D13','D45','EndRep','Natural','Fitness'])
R['models']={k:summ(v) for k,v in M.items()}
# log model (course: transformation for heteroscedasticity) for comparison
d['lnSales']=np.log(d.Sales); ML=ols('lnSales',FINALV); R['log_model']=summ(ML)
# ---- 4. stepwise (course: p-in .05, p-out .10; partial F-test)
def stepwise(pool,pin=.05,pout=.10,mode='both'):
    inc=[]; log=[]
    while True:
        changed=False
        if mode in('both','forward'):
            best=None
            cur=ols('Sales',inc) if inc else None
            for v in pool:
                if v in inc: continue
                big=ols('Sales',inc+[v])
                if cur is None: F=big.fvalue; p=big.f_pvalue
                else: F,p,_=partialF(cur,big)
                if best is None or p<best[2]: best=(v,F,p)
            if best and best[2]<pin:
                inc.append(best[0]); m=ols('Sales',inc); log.append(dict(step=len(log)+1,action='Enter',var=best[0],F=best[1],p=best[2],r2=m.rsquared,adj=m.rsquared_adj,vars=list(inc))); changed=True
        if mode in('both','backward') and inc:
            big=ols('Sales',inc); worst=None
            for v in inc:
                small=ols('Sales',[x for x in inc if x!=v]) if len(inc)>1 else None
                if small is None: F=big.tvalues[v]**2; p=big.pvalues[v]
                else: F,p,_=partialF(small,big)
                if worst is None or p>worst[2]: worst=(v,F,p)
            if worst[2]>pout:
                inc.remove(worst[0]); m=ols('Sales',inc) if inc else None
                log.append(dict(step=len(log)+1,action='Remove',var=worst[0],F=worst[1],p=worst[2],r2=m.rsquared,adj=m.rsquared_adj,vars=list(inc))); changed=True
        if not changed: break
    return log,inc
def backward(pool,pout=.10):
    inc=list(pool); log=[]
    while len(inc)>1:
        big=ols('Sales',inc); worst=None
        for v in inc:
            small=ols('Sales',[x for x in inc if x!=v]); F,p,_=partialF(small,big)
            if worst is None or p>worst[2]: worst=(v,F,p)
        if worst[2]>pout:
            inc.remove(worst[0]); m=ols('Sales',inc); log.append(dict(step=len(log)+1,action='Remove',var=worst[0],F=worst[1],p=worst[2],r2=m.rsquared,adj=m.rsquared_adj,vars=list(inc)))
        else: break
    return log,inc
sA,iA=stepwise(ALL); sB,iB=stepwise(ALL+['EndRep']); bB,ibB=backward(ALL+['EndRep'])
R['step']=dict(A=dict(log=sA,final=iA),B=dict(log=sB,final=iB),back=dict(log=bB,final=ibB))
# ---- 5. partial F tests & interaction tests
pf={}
F,p,q=partialF(M['1'],M['3full']); pf['interaction_given_full']=(F,p,q)
F,p,q=partialF(M['2'],M['F']); pf['interaction_given_reduced']=(F,p,q)
F,p,q=partialF(M['2'],M['1']); pf['natfit_drop_noint']=(F,p,q)
F,p,q=partialF(M['F'],M['4']); pf['natfit_drop_final']=(F,p,q)
F,p,q=partialF(M['F_noEndMain'],M['F']); pf['endcap_main_given_int']=(F,p,q)
Fm=M['F']
def ft(h,q):
    r=Fm.f_test(h); return (float(np.squeeze(r.fvalue)),float(np.squeeze(r.pvalue)),q)
pf['lag_joint']=ft('D13=0,D45=0',2)
pf['demo_joint']=ft('Demo=0,D13=0,D45=0',3)
pf['d13_eq_d45']=ft('D13-D45=0',1)
tt=Fm.t_test('D13-D45=0'); pf['d13_minus_d45']=dict(est=float(np.squeeze(tt.effect)),se=float(np.squeeze(tt.sd)),lo=float(tt.conf_int()[0,0]),hi=float(tt.conf_int()[0,1]))
tt=Fm.t_test('Demo-D13=0'); pf['demo_minus_d13']=dict(est=float(np.squeeze(tt.effect)),se=float(np.squeeze(tt.sd)),p=float(np.squeeze(tt.pvalue)),lo=float(tt.conf_int()[0,0]),hi=float(tt.conf_int()[0,1]))
R['partialF']=pf
# endcap effect when rep=1
tt=Fm.t_test('Endcap+EndRep=0'); R['endcap_rep1']=dict(est=float(np.squeeze(tt.effect)),se=float(np.squeeze(tt.sd)),t=float(np.squeeze(tt.tvalue)),p=float(np.squeeze(tt.pvalue)),lo=float(tt.conf_int()[0,0]),hi=float(tt.conf_int()[0,1]))
tt=Fm.t_test('Rep+EndRep=0'); R['rep_when_endcap']=dict(est=float(np.squeeze(tt.effect)),se=float(np.squeeze(tt.sd)),lo=float(tt.conf_int()[0,0]),hi=float(tt.conf_int()[0,1]))
# cumulative demo lift (illustrative)
b=Fm.params; R['cum_lift']=dict(w0=b['Demo'],w1_3=b['D13'],cum4=b['Demo']+3*b['D13'],cum_all=b['Demo']+3*b['D13']+2*b['D45'])
# other interaction candidates (given final)
oth={}
for nm,cols in {'Price x Sales Rep':('PxR',d.Price*d.Rep),'Demo x Sales Rep':('DxR',d.Demo*d.Rep),'Demo1-3 x Sales Rep':('D13xR',d.D13*d.Rep),'Demo4-5 x Sales Rep':('D45xR',d.D45*d.Rep),'Price x Endcap':('PxE',d.Price*d.Endcap),'Demo x Endcap':('DxE',d.Demo*d.Endcap)}.items():
    d2=d.copy(); d2[cols[0]]=cols[1]; big=ols('Sales',FINALV+[cols[0]],d2); F,p,q=partialF(M['F'],big); oth[nm]=dict(F=F,p=p,b=big.params[cols[0]],adj=big.rsquared_adj)
R['other_int']=oth
# ---- 6. diagnostics on final model
m=Fm; infl=m.get_influence(); k=int(m.df_model); X=m.model.exog
e=m.resid.values; fit=m.fittedvalues.values; h=infl.hat_matrix_diag; ext=infl.resid_studentized_external; internal=infl.resid_studentized_internal
cook=infl.cooks_distance[0]; dff=infl.dffits[0]; sdff=dff  # statsmodels dffits is already standardized (externally studentized)
dfb=infl.dfbetas
mah=(n-1)*(h-1/n)
vifs={v:vif_f(X,i+1) for i,v in enumerate(FINALV)}; tol={v:1/vifs[v] for v in vifs}
R['vif']=vifs; R['tol']=tol
vif1=sm.add_constant(d[ALL].astype(float)); R['vif_full']={v:vif_f(vif1.values,i+1) for i,v in enumerate(ALL)}
R['vif_int_full']={v:vif_f(sm.add_constant(d[ALL+['EndRep']].astype(float)).values,i+1) for i,v in enumerate(ALL+['EndRep'])}
bp=het_breuschpagan(e,X); R['bp']=dict(lm=bp[0],p=bp[1],F=bp[2],pF=bp[3])
# BP on model 1 for comparison; DW both
R['bp_m1']=dict(zip(['lm','p','F','pF'],het_breuschpagan(M['1'].resid,M['1'].model.exog)))
sw=stats.shapiro(e); R['norm']=dict(skew=float(stats.skew(e)),kurt=float(stats.kurtosis(e)),sw=float(sw.statistic),swp=float(sw.pvalue),jb=float(stats.jarque_bera(e).statistic),jbp=float(stats.jarque_bera(e).pvalue))
R['norm_m1']=dict(skew=float(stats.skew(M['1'].resid)),kurt=float(stats.kurtosis(M['1'].resid)))
# within-store lag-1 residual correlation (data sorted store, date)
dd=d.assign(e=e); dd['lag']=dd.groupby('Store').e.shift(1); R['lag1_resid_corr']=float(dd[['e','lag']].dropna().corr().iloc[0,1])
dd1=d.assign(e=M['1'].resid.values); dd1['lag']=dd1.groupby('Store').e.shift(1); R['lag1_resid_corr_m1']=float(dd1[['e','lag']].dropna().corr().iloc[0,1])
R['dw_final']=float(durbin_watson(e)); R['dw_m1']=float(durbin_watson(M['1'].resid))
# Price linearity check: add Price^2
d2=d.copy(); d2['P2']=d2.Price**2; mq=ols('Sales',FINALV+['P2'],d2); R['price_sq']=dict(b=mq.params['P2'],p=mq.pvalues['P2'])
# residual means by group (zero-mean check)
R['resid_by']={c:{str(g):float(v) for g,v in dd.groupby(c).e.mean().items()} for c in ['Rep','Endcap','Demo']}
thr=dict(lev2=2*(k+1)/n,lev3=3*(k+1)/n,cook4=4/(n-k-1),sdffit=2*np.sqrt((k+1)/n),sdfbeta=2/np.sqrt(n),mah=10)
R['thr']=thr
R['counts_flags']=dict(std_gt2=int((np.abs(internal)>2).sum()),std_gt3=int((np.abs(internal)>3).sum()),ext_gt3=int((np.abs(ext)>3).sum()),lev2=int((h>thr['lev2']).sum()),lev3=int((h>thr['lev3']).sum()),cook4=int((cook>thr['cook4']).sum()),cook1=int((cook>1).sum()),
  sdffit=int((np.abs(dff)>thr['sdffit']).sum()),sdfbeta_any=int((np.abs(dfb)>thr['sdfbeta']).any(axis=1).sum()),mah10=int((mah>10).sum()),maxcook=float(cook.max()),maxh=float(h.max()),maxmah=float(mah.max()),maxstd=float(np.abs(internal).max()))
diag=d[['Date','Region','Store','Sales']].copy(); diag['Fitted']=fit; diag['Resid']=e; diag['StdResid']=internal; diag['StudDel']=ext; diag['Leverage']=h; diag['Cook']=cook; diag['Mahal']=mah; diag['SDFFIT']=dff
diag['Rep']=d.Rep; diag['Endcap']=d.Endcap; diag['Demo']=d.Demo
diag.to_csv(os.path.join(OUT,'diag.csv'),index=False)
top=diag.reindex(diag.StdResid.abs().sort_values(ascending=False).index).head(10); R['top_out']=top.assign(Date=top.Date.dt.strftime('%Y-%m-%d')).to_dict('records')
topc=diag.sort_values('Cook',ascending=False).head(10); R['top_cook']=topc.assign(Date=topc.Date.dt.strftime('%Y-%m-%d')).to_dict('records')
# ---- 7. sensitivity
sens={}
def keycoef(mm): return {v:float(mm.params[v]) for v in ['Price','Rep','Endcap','Demo','D13','D45','EndRep']}
sens['Final (baseline)']=keycoef(M['F'])
keep=~((cook>thr['cook4'])|(np.abs(ext)>3)); sens['Excl. Cook>4/(n-k-1) or |t|>3']=keycoef(ols('Sales',FINALV,d[keep])); R['sens_n']=int(keep.sum())
keep2=~(np.abs(ext)>3); sens['Excl. |stud. resid|>3']=keycoef(ols('Sales',FINALV,d[keep2]))
R['lev_structure']=dict(lev3_total=int((h>thr['lev3']).sum()),lev3_endrep=int(((h>thr['lev3'])&(d.EndRep.values==1)).sum()),lev2_total=int((h>thr['lev2']).sum()),lev2_endrep=int(((h>thr['lev2'])&(d.EndRep.values==1)).sum()),lev2_endcap_or_demo=int(((h>thr['lev2'])&((d.Endcap.values==1)|(d.Demo.values==1)|(d.D45.values==1))).sum()),mah10_endrep=int(((mah>10)&(d.EndRep.values==1)).sum()),mah10_total=int((mah>10).sum()))
sens['Restricted: no Endcap main effect']={**{v:float(M['F_noEndMain'].params[v]) for v in ['Price','Rep','Demo','D13','D45','EndRep']},'Endcap':np.nan}
dr=pd.get_dummies(d.Region,prefix='R',drop_first=True).astype(float); dx=pd.concat([d,dr],axis=1)
sens['+ Region dummies']=keycoef(ols('Sales',FINALV+list(dr.columns),dx))
dw_=pd.get_dummies(d.Date.dt.strftime('%m%d'),prefix='W',drop_first=True).astype(float); dx2=pd.concat([d,dw_],axis=1)
sens['+ Week dummies']=keycoef(ols('Sales',FINALV+list(dw_.columns),dx2))
ds_=pd.get_dummies(d.Store,prefix='S',drop_first=True).astype(float); dx3=pd.concat([d,ds_],axis=1)
mfe=ols('Sales',FINALV+list(ds_.columns),dx3); sens['+ Store dummies (126)']=keycoef(mfe)
R['sens']=sens
mc=sm.OLS(d.Sales,sm.add_constant(d[FINALV].astype(float))).fit(cov_type='cluster',cov_kwds={'groups':pd.factorize(d.Store)[0]})
R['cluster']=[dict(var=v,b=mc.params[v],se=mc.bse[v],p=mc.pvalues[v],lo=mc.conf_int().loc[v,0],hi=mc.conf_int().loc[v,1]) for v in mc.params.index]
tt=mc.t_test('Endcap+EndRep=0'); R['cluster_endcap_rep1']=dict(est=float(np.squeeze(tt.effect)),se=float(np.squeeze(tt.sd)),lo=float(tt.conf_int()[0,0]),hi=float(tt.conf_int()[0,1]))
# ---- 8. Excel-vs-independent check values & store-level
R['final_equation']={c['var']:c['b'] for c in R['models']['F']['coef']}
# ---- figures
plt.rcParams.update({'font.size':10,'axes.spines.top':False,'axes.spines.right':False,'figure.dpi':200,'font.family':'DejaVu Sans'})
C=dict(blue='#1f4e79',orange='#d97706',grey='#6b7280',teal='#0f766e',red='#b91c1c')
# F1 sales by rep x endcap
fig,ax=plt.subplots(figsize=(6.2,3.6))
cells=[(0,0),(0,1),(1,0),(1,1)]; labs=['No rep,\nno endcap','No rep,\nendcap','Rep,\nno endcap','Rep,\nendcap']
data=[d[(d.Rep==r)&(d.Endcap==e)].Sales for r,e in cells]
bp_=ax.boxplot(data,tick_labels=labs,patch_artist=True,widths=.55,medianprops=dict(color='black'),flierprops=dict(markersize=2,alpha=.4))
for p_,c_ in zip(bp_['boxes'],[C['grey'],C['grey'],C['blue'],C['orange']]): p_.set_facecolor(c_); p_.set_alpha(.75)
for i,x in enumerate(data,1): ax.text(i,ax.get_ylim()[1]*.97,f'n={len(x)}\nmean {x.mean():.0f}',ha='center',va='top',fontsize=8)
ax.set_ylim(0,1150); ax.set_ylabel('Weekly units sold per store'); ax.set_title('Sales by Sales Rep and Endcap status (unadjusted)',fontsize=10)
fig.tight_layout(); fig.savefig(f'{FIG}/F1_sales_rep_endcap.png'); plt.close()
# F2 residual vs fitted
fig,ax=plt.subplots(figsize=(6.2,3.8)); ax.scatter(fit,internal,s=5,alpha=.45,color=C['blue']); ax.axhline(0,color='black',lw=.8)
for y_ in (-3,3): ax.axhline(y_,color=C['red'],lw=.8,ls='--')
ax.set_xlabel('Fitted weekly units'); ax.set_ylabel('Standardized residual'); ax.set_title('Residuals vs fitted values - final model',fontsize=10)
fig.tight_layout(); fig.savefig(f'{FIG}/F2_resid_fitted.png'); plt.close()
# F3 PP plot + histogram
fig,(a1,a2)=plt.subplots(1,2,figsize=(6.6,3.4))
srt=np.sort(internal); emp=(np.arange(1,n+1)-.5)/n; th=stats.norm.cdf((srt-srt.mean())/srt.std(ddof=1))
a1.plot([0,1],[0,1],color='black',lw=.8); a1.scatter(emp,th,s=4,color=C['blue']); a1.set_xlabel('Observed cumulative probability'); a1.set_ylabel('Expected cumulative probability'); a1.set_title('Normal P-P plot of residuals',fontsize=10)
a2.hist(internal,bins=40,density=True,color=C['blue'],alpha=.75); xx=np.linspace(-4,4,200); a2.plot(xx,stats.norm.pdf(xx),color=C['orange']); a2.set_xlabel('Standardized residual'); a2.set_ylabel('Density'); a2.set_title('Residual distribution',fontsize=10)
fig.tight_layout(); fig.savefig(f'{FIG}/F3_pp_hist.png'); plt.close()
# F4 interaction plot
fig,ax=plt.subplots(figsize=(5.2,3.6)); xs=[0,1]; mp=d.Price.mean(); b=Fm.params
for r,c_,lab in [(0,C['grey'],'No regional rep (Sales Rep = 0)'),(1,C['blue'],'Regional rep (Sales Rep = 1)')]:
    ys=[b['Const'] if 'Const' in b else b['const'] for _ in xs]
    ys=[b['const']+b['Price']*mp+b['Rep']*r+b['Endcap']*x+b['EndRep']*x*r+b['Demo']*0 for x in xs]
    ax.plot(xs,ys,marker='o',color=c_,lw=2,label=lab); [ax.text(x,y+12,f'{y:.0f}',ha='center',fontsize=9,color=c_) for x,y in zip(xs,ys)]
ax.set_xticks(xs); ax.set_xticklabels(['No endcap','Endcap']); ax.set_ylabel('Predicted weekly units per store'); ax.legend(frameon=False,fontsize=8,loc='upper left')
ax.set_title('Endcap x Sales Rep interaction (price at mean, no demo)',fontsize=10); fig.tight_layout(); fig.savefig(f'{FIG}/F4_interaction.png'); plt.close()
# F5 demo effects with CIs
fig,ax=plt.subplots(figsize=(5.6,3.3)); ci=Fm.conf_int()
nm=['Demo','D13','D45']; lb=['Demo\n(current week)','Demo1-3\n(1-3 weeks ago)','Demo4-5\n(4-5 weeks ago)']
ax.bar(range(3),[b[v] for v in nm],color=[C['orange'],C['blue'],C['blue']],alpha=.85,width=.55)
ax.errorbar(range(3),[b[v] for v in nm],yerr=[[b[v]-ci.loc[v,0] for v in nm],[ci.loc[v,1]-b[v] for v in nm]],fmt='none',ecolor='black',capsize=4)
for i,v in enumerate(nm): ax.text(i,ci.loc[v,1]+4,f'+{b[v]:.0f}',ha='center',fontsize=9)
ax.set_xticks(range(3)); ax.set_xticklabels(lb); ax.set_ylabel('Estimated lift (units / store-week)'); ax.set_title('Demo effects with 95% confidence intervals',fontsize=10)
fig.tight_layout(); fig.savefig(f'{FIG}/F5_demo.png'); plt.close()
# F6 leverage vs cook
fig,(a1,a2)=plt.subplots(1,2,figsize=(6.8,3.3))
a1.stem(np.arange(n),cook,markerfmt=' ',basefmt=' ',linefmt=C['blue']); a1.axhline(thr['cook4'],color=C['red'],ls='--',lw=.8); a1.set_xlabel('Observation index'); a1.set_ylabel("Cook's distance"); a1.set_title("Cook's distance",fontsize=10)
a2.scatter(h,internal,s=5,alpha=.45,color=C['blue']); a2.axvline(thr['lev3'],color=C['red'],ls='--',lw=.8); a2.axvline(thr['lev2'],color=C['orange'],ls='--',lw=.8); a2.set_xlabel('Leverage'); a2.set_ylabel('Standardized residual'); a2.set_title('Leverage vs residual',fontsize=10)
fig.tight_layout(); fig.savefig(f'{FIG}/F6_influence.png'); plt.close()
# F7 weekly mean sales and demo exposure
wk=d.groupby('Date').agg(s=('Sales','mean'),dm=('Demo','mean'),d13=('D13','mean'),d45=('D45','mean'),ec=('Endcap','mean'))
fig,ax=plt.subplots(figsize=(6.2,3.3)); ax.plot(range(11),wk.s,marker='o',color=C['blue'],label='Mean weekly units (left)'); ax.set_ylabel('Mean units per store'); ax.set_xticks(range(11)); ax.set_xticklabels([x.strftime('%d %b') for x in wk.index],rotation=45,fontsize=8)
a2=ax.twinx(); a2.spines['right'].set_visible(True)
a2.bar(np.arange(11)-.2,wk.dm*100,width=.2,color=C['orange'],alpha=.7,label='% stores: Demo'); a2.bar(np.arange(11),wk.d13*100,width=.2,color=C['teal'],alpha=.7,label='% stores: Demo1-3'); a2.bar(np.arange(11)+.2,wk.ec*100,width=.2,color=C['grey'],alpha=.7,label='% stores: Endcap')
a2.set_ylabel('% of stores'); h1,l1=ax.get_legend_handles_labels(); h2,l2=a2.get_legend_handles_labels(); ax.legend(h1+h2,l1+l2,frameon=False,fontsize=7,loc='upper left'); ax.set_title('Weekly mean sales and promotion exposure',fontsize=10)
fig.tight_layout(); fig.savefig(f'{FIG}/F7_weekly.png'); plt.close()
json.dump(R,open(os.path.join(OUT,'results.json'),'w'),default=lambda o: float(o) if isinstance(o,(np.floating,np.integer)) else str(o),indent=1)
d.to_pickle(os.path.join(OUT,'d.pkl'))
print('done')

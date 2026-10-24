exec(open(__import__('sys').argv[1]).read())
def pill(t,on=False): return f'<span class="pillx{" on" if on else ""}">{t}</span>'
SP=[('icon-guidance.webp','Guida','Trucchetto · Divinazione','Azione','Contatto','+1d4 prova',True),('icon-sacred-flame.webp','Fiamma sacra','Trucchetto · Evocazione','Azione','18 m','2d8 radiosi',True),('icon-bless.webp','Benedizione','1° · Ammaliamento · concentrazione','Azione','9 m','+1d4',True),('icon-cure-wounds.webp','Cura ferite','1° · Abiurazione','Azione','Contatto','2d8 PF',False),('icon-detect-magic.webp','Individuazione del magico','1° · Divinazione · rituale','Azione','Sé','—',False),('icon-healing-word.webp','Parola guaritrice','1° · Abiurazione','Bonus','18 m','2d4 PF',False),('icon-spiritual-weapon.webp','Arma spirituale','2° · Evocazione · concentrazione','Bonus','18 m','1d8 forza',False)]
# A Compendio
rows=''.join(f'<div class=rowx style="{"background:#1f2a22;border-left:3px solid #5fb38a;" if n=="Benedizione" else ""}"><img class=ico src="img/{i}"><div><b style="color:#fff">{n}</b><br><small style="color:#9a8c73">{s}</small></div><span class=r style="min-width:90px">{t}</span><span style="min-width:90px;color:#bcae93">{g}</span><span style="min-width:100px;color:#bcae93">{e}</span></div>' for i,n,s,t,g,e,_ in SP)
facets=f'''<div class=facet><span class=lbl>Cosa</span><div class=pills>{pill("Incantesimi",1)}{pill("Oggetti")}{pill("Mostri")}{pill("Talenti")}{pill("Classi")}{pill("Regole")}</div></div>
<div class=facet><span class=lbl>Livello</span><div class=pills>{"".join(pill(x, x in ("0","1")) for x in ["0","1","2","3","4","5","6","7","8","9"])}</div></div>
<div class=facet><span class=lbl>Classe</span><div class=pills>{pill("Chierico",1)}{pill("Bardo")}{pill("Mago")}{pill("Druido")}{pill("Paladino")}{pill("Ranger")}</div></div>
<div class=facet><span class=lbl>Scuola</span><div class=pills>{pill("Abiurazione")}{pill("Divinazione")}{pill("Evocazione")}{pill("Ammaliamento")}</div></div>
<div class=facet><span class=lbl>Altro</span><div class=pills>{pill("Rituale")}{pill("Concentrazione")}{pill("Azione bonus")}{pill("Reazione")}</div></div>
<span style="color:#f0c24e;font-weight:700">Azzera filtri</span>'''
det='''<div style="display:flex;gap:14px;align-items:center"><img src="img/icon-bless.webp" style="width:72px;height:72px;border-radius:8px;border:2px solid #a8834a"><div><div class=big style="font-size:28px">Benedizione</div><span style="color:#bcae93">1° livello · Ammaliamento</span></div></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0"><div><span class=lbl>Tempo di lancio</span><br><b style="color:#fff">● Azione</b></div><div><span class=lbl>Gittata</span><br><b style="color:#fff">9 m</b></div><div><span class=lbl>Componenti</span><br><b style="color:#fff">V, S, M</b></div><div><span class=lbl>Durata</span><br><b style="color:#fff">Concentrazione, 1 minuto</b></div></div>
<div style="padding:12px 14px;border:1px solid #5fb38a;border-radius:8px;background:#14231b;color:#e8f5ec"><span class=lbl style="color:#8fd4b0">In breve</span><br>Fino a tre creature aggiungono 1d4 ai tiri per colpire e ai tiri salvezza.</div>
<p style="color:#cfc2a8;line-height:1.6">Benedici fino a tre creature entro gittata. Ogni volta che un bersaglio fa un tiro per colpire o un tiro salvezza, tira 1d4 e lo aggiunge. <b>Slot superiori:</b> una creatura in più per livello.</p><span class="btnx pri"><i data-lucide=plus class="i i--sm"></i>Aggiungi a Selene</span>'''
body=f'''<div class=wrap><div style="display:flex;gap:14px;margin-bottom:18px"><div class=search style="flex:1"><i data-lucide=search class="i i--sm"></i>Cerca in tutto il compendio: incantesimi, oggetti, mostri, regole…</div></div>
<div class=grid3><section class="pn c-cmp"><h2 class=pn__h><i data-lucide=sliders-horizontal class=i></i>Filtri</h2><div class=pn__b>{facets}</div></section>
<section class="pn c-cmp"><h2 class=pn__h><i data-lucide=book-open class=i></i>Incantesimi<span class=aside>7 risultati · Chierico · livello 0–1</span></h2><div class=pn__b>{rows}</div></section>
<section class="pn c-cmp"><h2 class=pn__h>Dettaglio</h2><div class=pn__b>{det}</div></section></div></div>'''
page('m-compendio.html',3,body)
# B Aggiungi incantesimo (side panel)
ON='<span style="color:#c9a2ff;font-weight:700">Preparato</span><span class="tog on"></span>'
OFF='<span>Prepara</span><span class=tog></span>'
rows2=''.join(f'<div class=rowx><img class=ico src="img/{i}"><div><b style="color:#fff">{n}</b><br><small style="color:#9a8c73">{s}</small></div><span class=r style="display:flex;gap:10px;align-items:center">{ON if p else OFF}</span></div>' for i,n,s,t,g,e,p in SP)
body=f'''<div class=bgplay></div><div class=scrim></div><aside class=side><h2 class="pn__h c-mag" style="font-size:22px"><i data-lucide=book-open class=i></i>Incantesimi di Selene<span class=aside>✕</span></h2>
<div style="padding:12px 20px 0"><nav class=tabs style="margin:0 -20px 14px!important"><button class=tab aria-selected=true>Preparati e conosciuti</button><button class=tab aria-selected=false>Aggiungi dal compendio</button></nav>
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><span style="color:#cfc2a8">Preparati: <b style="color:#fff">3 / 8</b> · si cambiano dopo un riposo lungo</span></div>
<div class=search><i data-lucide=search class="i i--sm"></i>Cerca…</div><div style="display:flex;gap:6px;margin:10px 0">{pill("Tutti",1)}{pill("Trucchetti")}{pill("1°")}{pill("2°")}{pill("Rituali")}</div></div>
<div style="padding:0 20px;overflow:hidden">{rows2}</div></aside>'''
page('m-add-spell.html',1,body)
# C Lancia incantesimo
body='''<div class=bgplay></div><div class=scrim></div><div class=dlg><h2 class="pn__h c-mag"><img src="img/icon-bless.webp" style="width:34px;height:34px;border-radius:6px">Lancia Benedizione</h2><div class=pn__b>
<span class=lbl>Con quale slot?</span><div class=slotpick style="margin:8px 0 16px"><div class=on><b>1°</b><span class=gm>◆◆◆◇</span><br><small style="color:#cfc2a8">3 bersagli</small></div><div><b>2°</b><span class=gm>◆◆◆</span><br><small style="color:#cfc2a8">4 bersagli</small></div><div><b>3°</b><span class=gm>◆◆</span><br><small style="color:#cfc2a8">5 bersagli</small></div><div class=off><b>4°</b><span class=gm>—</span><br><small>nessuno</small></div></div>
<span class=lbl>Su chi?</span><div style="display:flex;gap:6px;margin:8px 0 16px;flex-wrap:wrap"><span class="pillx on">Selene</span><span class="pillx on">Brann</span><span class="pillx on">Kaela</span><span class=pillx>Tib</span></div>
<div style="padding:12px 14px;border-radius:8px;background:#2a1a3e;border:1px solid #b07be6;color:#efe4ff">Spendi <b>uno slot di 1°</b> · ● la tua azione · concentrazione per 1 minuto.<br><small style="color:#cdb6ec">Fine della concentrazione su Arma spirituale.</small></div></div>
<div class=dlg__f><span class=btnx>Annulla</span><span class="btnx pri">Lancia</span></div></div>
<div class=toast><span><b>Benedizione</b> lanciata · slot di 1° speso</span><span class=u>↶ Annulla</span></div>'''
page('m-cast.html',1,body)
# D Danni/cura popover + E riposo breve (two pages)
body='''<div class=bgplay></div><div class=scrim style="background:rgb(4 3 2/.45)"></div><div class=dlg style="left:auto;right:40px;top:110px;transform:none;width:400px"><h2 class="pn__h" style="--c:#46f04a">Punti ferita · 31 / 38</h2><div class=pn__b>
<div class=field>7</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:12px 0"><span class="btnx dng" style="justify-content:center">✕ Danni</span><span class=btnx style="justify-content:center;border-color:#46f04a;color:#bfffc0">♥ Cura</span><span class=btnx style="justify-content:center;border-color:#5fd4ff;color:#d6f4ff">+ Temp.</span></div>
<span class=lbl>Tipo di danno (facoltativo)</span><div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 12px"><span class=pillx>Taglienti</span><span class=pillx>Perforanti</span><span class=pillx>Fuoco</span><span class=pillx>Necrotici</span><span class=pillx>altro…</span></div>
<small style="color:#9a8c73">Prima scala la vita temporanea (5). Se sei concentrata, Folio ti chiede il tiro salvezza.</small></div></div>'''
page('m-hp.html',1,body)
body='''<div class=bgplay></div><div class=scrim></div><div class=dlg style="width:620px"><h2 class="pn__h c-abi"><i data-lucide=flame-kindling class=i></i>Riposo breve · 1 ora</h2><div class=pn__b>
<div style="display:flex;justify-content:space-between;align-items:center"><span class=lbl>Spendi i Dadi Vita (d8 + 2)</span><span style="color:#cfc2a8">3 su 5 disponibili</span></div>
<div style="display:flex;gap:8px;margin:10px 0 16px"><span class=hd>d8</span><span class=hd>d8</span><span class=hd style="box-shadow:0 0 12px #2ec4b6">d8 ✓</span><span class="hd used">d8</span><span class="hd used">d8</span></div>
<div style="display:flex;gap:18px;align-items:center;padding:12px 14px;border:1px solid #3a3022;border-radius:8px"><span class=big>31 → 38</span><span style="color:#9a8c73">tiro 5 + 2 · oppure scrivi il tuo dado</span></div>
<span class=lbl style="display:block;margin-top:16px">Recuperi anche</span><div class=rowx>◈ Incanalare Divinità: 1 uso</div><div class=rowx>✦ Arma spirituale finisce (1 minuto)</div></div>
<div class=dlg__f><span class=btnx>Annulla</span><span class="btnx pri">Completa riposo</span></div></div>'''
page('m-rest.html',1,body)
# G Sali di livello
feat=[('Chierica 6','Incanalare Divinità: 3 usi','nuovo'),('Dominio della Vita','Guaritore benedetto','nuovo'),('Incantesimi','slot di 3°: 3 (prima 2)','più forte')]
fl=''.join(f'<div class=rowx><b style="color:#fff">{a}</b>&nbsp;· {b}<span class=r style="color:#f0c24e">{c}</span></div>' for a,b,c in feat)
body=f'''<div class=bgplay></div><div class=scrim></div><div class=dlg style="width:980px"><h2 class="pn__h c-act"><i data-lucide=arrow-up-circle class=i></i>Selene sale al livello 6<span class=aside>passo 1 di 3</span></h2>
<div style="padding:16px 20px;border-bottom:1px solid #2a2219" class=steps><span class="step on"><i>1</i>Punti ferita</span><span class=step><i>2</i>Novità</span><span class=step><i>3</i>Riepilogo</span></div>
<div class=pn__b style="display:grid;grid-template-columns:1fr 320px;gap:24px"><div><span class=lbl>Quanti punti ferita guadagni?</span><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:10px 0 16px"><div class="card on"><b style="font-size:30px;margin:0">5 + 2</b><span style="color:#cfc2a8">Media (consigliata)</span></div><div class=card><b style="font-size:30px;margin:0">d8 + 2</b><span style="color:#cfc2a8">Tira il dado</span></div><div class=card><b style="font-size:30px;margin:0">✎</b><span style="color:#cfc2a8">Scrivo il mio tiro</span></div></div>
<span class=lbl>Cosa ottieni</span>{fl}</div>
<div class=pn style="--c:#f0c24e"><h3 class=pn__h style="font-size:16px">Prima → dopo</h3><div class=pn__b><div class=rowx>Punti ferita<span class=r><b style="color:#fff">38 → 45</b></span></div><div class=rowx>Bonus competenza<span class=r>+3</span></div><div class=rowx>Slot di 3°<span class=r><b style="color:#fff">2 → 3</b></span></div><div class=rowx>Incanalare<span class=r><b style="color:#fff">2 → 3</b></span></div></div></div></div>
<div class=dlg__f><span class=btnx>Annulla</span><span class="btnx pri">Avanti ▸</span></div></div>'''
page('m-levelup.html',1,body)
# H Creazione
cls=[('class-bard.webp','Bardo',0),('class-cleric.webp','Chierico',1),('class-fighter.webp','Guerriero',0),('class-rogue.webp','Ladro',0),('class-wizard.webp','Mago',0),('class-ranger.webp','Ranger',0)]
cl=''.join(f'<div class="card{" on" if o else ""}"><img src="img/{i}"><b>{n}</b></div>' for i,n,o in cls)
body=f'''<div class=wrap><div style="display:flex;align-items:center;gap:20px;margin-bottom:16px"><h1 style="font:600 30px var(--font-title);margin:0;color:#f4ead6">Nuovo personaggio</h1><span class=grow style="flex:1"></span><span class=pillx>Principiante: spiegami tutto</span><span class=pillx>Creazione rapida</span></div>
<div class=steps style="margin-bottom:20px"><span class="step on"><i>1</i>Classe</span><span class=step><i>2</i>Background</span><span class=step><i>3</i>Specie</span><span class=step><i>4</i>Caratteristiche</span><span class=step><i>5</i>Equipaggiamento</span><span class=step><i>6</i>Riepilogo</span></div>
<div class=grid2l style="grid-template-columns:300px 1fr"><section class="pn c-act"><h2 class=pn__h>Il tuo personaggio</h2><div class=pn__b style="text-align:center"><img src="img/class-cleric.webp" style="width:120px;height:120px;border-radius:50%;border:3px solid #a8834a"><div style="font:700 20px var(--font-text);color:#fff;margin-top:8px">Chierica 1</div><small style="color:#9a8c73">nome, specie e background da scegliere</small><div class=rowx style="margin-top:12px">Dado vita<span class=r>d8</span></div><div class=rowx>Principale<span class=r>Saggezza</span></div><div class=rowx>Armature<span class=r>leggere, medie, scudi</span></div></div></section>
<section class="pn c-act"><h2 class=pn__h>Scegli la classe</h2><div class=pn__b><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:12px">{cl}</div>
<div style="margin-top:18px;padding:14px 16px;border:1px solid #f0c24e;border-radius:8px;background:#241a08"><b style="font:600 24px var(--font-title);color:#fff">Chierico</b><p style="color:#e8dcc4;margin:6px 0 0">Un sacerdote che incanala il potere di una divinità: cura il gruppo, lo protegge e colpisce con la luce. <b>Buono se vuoi aiutare gli altri.</b></p></div>
<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px"><span class=btnx>◂ Indietro</span><span class="btnx pri">Avanti ▸</span></div></div></section></div></div>'''
page('m-create.html',1,body)

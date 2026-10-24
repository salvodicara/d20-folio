exec(open(__import__('sys').argv[1]).read())
G,Y,R='#46f04a','#ffd000','#e3140c'
TABS=[('users','Gruppo'),('swords','Scontro'),('scroll-text','Diario'),('gem','Tesoro'),('notebook-pen','Note')]
def hero():
    return '''<div class=wrap><section class="frame hero" style="padding:20px 24px"><div class=hero2><img class=art src="img/campaign-war-room.webp"><div><h1>La Cripta di Vetro</h1><p>4 personaggi · Master: Marco · prossima sessione giovedì 30 ottobre, 21:00</p></div><span class=grow style="flex:1"></span><span class=btnx><i data-lucide=link class="i i--sm"></i>Copia invito</span><span class=btnx><i data-lucide=settings class="i i--sm"></i></span></div></section></div>'''
PCS=[('Selene Varga','Chierica 5 · Umana','portrait-selene.webp',.82,G,'Ferita leggera','g',18,15,['<span class="chipx buff">Benedizione</span>','<span class="chipx cond">Accecata</span>']),
('Kaela','Ladra 5 · Halfling','class-rogue.webp',.45,Y,'Insanguinata','y',15,17,['<span class="chipx cond">Prona</span>']),
('Brann','Guerriero 5 · Nano','class-fighter.webp',1,G,'In forma','g',19,12,[]),
('Tib','Bardo 5 · Gnomo','class-bard.webp',.2,R,'Grave','r',13,11,['<span class="chipx buff">Ispirazione</span>'])]
def party():
    out=''
    for n,c,img,p,col,w,k,ac,pp,ch in PCS:
        out+=f'<div class=pc>{ring(img,p,col,68)}<div><h3>{n}</h3><small>{c}</small><div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"><span class="hpw {k}">● {w}</span>{"".join(ch)}</div></div><div class=nums><div><b>{ac}</b><span>CA</span></div><div><b>{pp}</b><span>PERC. PASS.</span></div></div><span class=btnx style="margin-left:12px">Scheda</span></div>'
    return out
# 1 Gruppo
body=hero()+'<div class=wrap style="padding-top:0">'+tabs(TABS,0)+'''<div class=grid2><section class="pn c-grp"><h2 class=pn__h><i data-lucide=users class=i></i>Gruppo<span class=aside>tocca un personaggio per aprire la sua scheda</span></h2><div class="pn__b stack" style="gap:10px">'''+party()+'''</div></section>
<div class=stack><section class="pn c-ini"><h2 class=pn__h><i data-lucide=swords class=i></i>Scontro</h2><div class=pn__b><p style="margin:0 0 12px;color:#cfc2a8">Nessuno scontro in corso.</p><span class="btnx pri"><i data-lucide=swords class="i i--sm"></i>Inizia combattimento</span><p style="margin:10px 0 0;color:#9a8c73;font-size:14px">Chiunque del gruppo può avviarlo.</p></div></section>
<section class="pn c-log"><h2 class=pn__h><i data-lucide=scroll-text class=i></i>Sessione 7</h2><div class=pn__b><div class=rowx>⚔ Scontro con i goblin vinto in 3 round</div><div class=rowx>✦ Selene ha lanciato 4 incantesimi</div><div class=rowx>◈ Trovate 120 mo e una pozione</div><div style="margin-top:12px"><span class=btnx>Apri il diario</span></div></div></section>
<section class="pn c-tes"><h2 class=pn__h><i data-lucide=gem class=i></i>Cassa comune</h2><div class=pn__b style="display:flex;gap:10px"><div class=coin><i style="background:radial-gradient(#fff6c8,#e0b13a 60%,#8a5f10)"></i><b>245</b><span class=lbl>mo</span></div><div class=coin><i style="background:radial-gradient(#ffffff,#c8ccd2 60%,#6b7078)"></i><b>38</b><span class=lbl>ma</span></div><div class=coin><i style="background:radial-gradient(#ffd6b0,#c06a2a 60%,#6b3410)"></i><b>12</b><span class=lbl>mr</span></div></div></section></div></div></div>'''
page('m-camp-gruppo.html',2,body)
# 2 Scontro (host view)
rows=[('18','Kaela','class-rogue.webp','Insanguinata','y',''),('15','Selene','portrait-selene.webp','Ferita leggera','g','now'),('12','Goblin ×3','','Insanguinati','y','next'),('9','Brann','class-fighter.webp','In forma','g',''),('7','Lupo','','In forma','g',''),('4','Tib','class-bard.webp','Grave','r','')]
def irow(i,n,img,w,k,st):
    av=f'<img src="img/{img}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid #6a5130">' if img else '<span style="width:44px;height:44px;border-radius:50%;border:2px solid #6a5130;display:flex;align-items:center;justify-content:center;background:#2a1a12;font-size:22px">👹</span>'
    tag={'now':'<span style="font:700 12px var(--font-label);background:#f0c24e;color:#1a1206;padding:3px 8px;border-radius:3px">ORA</span>','next':'<span style="font:700 12px var(--font-label);background:#7a8499;color:#111;padding:3px 8px;border-radius:3px">DOPO</span>'}.get(st,'')
    sty={'now':'background:linear-gradient(90deg,#5a4413,#241a08);border:1px solid #f0c24e;box-shadow:0 0 14px #f0c24e44','next':'border:1px dashed #7a8499'}.get(st,'border:1px solid transparent')
    return f'<div style="display:flex;align-items:center;gap:14px;padding:10px 14px;border-radius:8px;margin-bottom:6px;{sty}"><b style="width:34px;font:700 22px var(--font-label);color:#d4af66;text-align:center">{i}</b>{av}<b style="font:700 18px var(--font-text);color:#fff">{n}</b>{tag}<span class="hpw {k}" style="margin-left:auto">● {w}</span></div>'
body=hero()+'<div class=wrap style="padding-top:0">'+tabs(TABS,1)+'''<div class=grid2><section class="pn c-ini"><h2 class=pn__h><i data-lucide=swords class=i></i>Scontro con i goblin<span class=aside>Round 2 · tiene il tavolo: Salvo</span></h2><div class=pn__b>'''+''.join(irow(*r) for r in rows)+'''<div style="display:flex;gap:10px;margin-top:14px"><span class=btnx><i data-lucide=plus class="i i--sm"></i>Aggiungi mostri</span><span class=btnx><i data-lucide=undo-2 class="i i--sm"></i>Indietro</span><span class="btnx pri" style="margin-left:auto">Turno dopo ▸</span><span class="btnx dng">Fine combattimento</span></div></div></section>
<div class=stack><section class="pn c-ini"><h2 class=pn__h>Goblin ×3</h2><div class=pn__b><div class=rowx>Goblin 1<span class="hpw r r">● 2 / 7</span></div><div class=rowx>Goblin 2<span class="hpw y r">● 4 / 7</span></div><div class=rowx>Goblin 3<span class="hpw g r">● 7 / 7</span></div><div class=rowx><span class=lbl>CA</span> 15 <span class=lbl style="margin-left:12px">Velocità</span> 9 m</div><div class=rowx>Scimitarra: +4 · 1d6+2 taglienti<span class=r><span class=btnx>Usa</span></span></div><p style="color:#9a8c73;font-size:14px;margin:10px 0 0">I giocatori vedono la vita in parole: «Insanguinati».</p></div></section>
<section class="pn c-log"><h2 class=pn__h>Appena successo</h2><div class=pn__b><div class=rowx>Kaela colpisce il goblin 1: 5 danni</div><div class=rowx>Selene: reazione rinnovata</div><div class=rowx>Benedizione: 8 round rimasti</div></div></section></div></div></div>'''
page('m-camp-scontro.html',2,body)
# 3 Diario
sess=[('7','16 ottobre','La cripta di vetro',True),('6','9 ottobre','Il mercato di Brindol',False),('5','2 ottobre','Strada per Elturel',False),('4','25 settembre','La locanda',False)]
sl=''.join(f'<div style="padding:12px 14px;border-radius:6px;margin-bottom:6px;{"background:#1f2a3a;border:1px solid #6aa0f0" if on else "border:1px solid #2a2219"}"><b style="color:#fff">Sessione {n}</b> <span style="color:#9a8c73">· {d}</span><br><span style="color:#cfc2a8;font-size:15px">{t}</span></div>' for n,d,t,on in sess)
dot=lambda c:f'<span style="width:10px;height:10px;border-radius:50%;background:{c};flex:none"></span>'
body=hero()+'<div class=wrap style="padding-top:0">'+tabs(TABS,2)+'''<div class=grid2l><section class="pn c-log"><h2 class=pn__h>Sessioni</h2><div class=pn__b>'''+sl+'''</div></section>
<section class="pn c-log"><h2 class=pn__h><i data-lucide=scroll-text class=i></i>Sessione 7 · La cripta di vetro<span class=aside><span class="btnx pri"><i data-lucide=copy class="i i--sm"></i>Copia</span></span></h2><div class=pn__b>
<div class=lbl style="margin:4px 0 6px">Esplorazione · 21:05</div>
<div class=rowx>'''+dot('#cbb48a')+'''<i>Il gruppo entra nella cripta dal portone a est.</i><span class=r style="font-size:13px">nota di Marco</span></div>
<div class=rowx>'''+dot('#4f7dff')+'''<b>Selene</b>&nbsp;lancia Individuazione del magico come rituale</div>
<div class=rowx>'''+dot('#4ec2b8')+'''<b>Kaela</b>&nbsp;Furtività 17: passa inosservata</div>
<div class=lbl style="margin:16px 0 6px;color:#ff8a7a">Scontro con i goblin · 21:40 · 3 round</div>
<div class=rowx>'''+dot('#e3140c')+'''<b>Goblin 1</b>&nbsp;colpisce Selene: 7 danni</div>
<div class=rowx>'''+dot('#46f04a')+'''<b>Selene</b>&nbsp;Parola guaritrice su Kaela: +11 PF</div>
<div class=rowx>'''+dot('#f0c24e')+'''<b>Brann</b>&nbsp;sconfigge il goblin 3</div>
<div class=lbl style="margin:16px 0 6px">Bottino</div>
<div class=rowx>'''+dot('#d98a3a')+'''120 mo e una Pozione di guarigione nella cassa comune</div>
<div style="margin-top:14px" class=search><i data-lucide=pen-line class="i i--sm"></i>Scrivi una nota…</div></div></section></div></div>'''
page('m-camp-diario.html',2,body)
# 4 Tesoro
items=[('Pozione di guarigione','×3','Kaela, sessione 7'),('Corda di canapa (15 m)','×1','sessione 5'),('Gemma (50 mo)','×2','sessione 7'),('Pergamena: Scudo','×1','sessione 6')]
il=''.join(f'<div class=rowx><b style="color:#fff">{a}</b><span style="color:#d98a3a;font-weight:700">{q}</span><span class=r style="font-size:14px">{w}</span><span class=btnx style="margin-left:10px">Prendo io</span></div>' for a,q,w in items)
coins=[('mp','radial-gradient(#ffffff,#d8dde8 60%,#7d8697)',2),('mo','radial-gradient(#fff6c8,#e0b13a 60%,#8a5f10)',245),('me','radial-gradient(#e8f4ff,#9fb8c8 60%,#4f6070)',0),('ma','radial-gradient(#ffffff,#c8ccd2 60%,#6b7078)',38),('mr','radial-gradient(#ffd6b0,#c06a2a 60%,#6b3410)',12)]
cl=''.join(f'<div class=coin><i style="background:{g}"></i><b>{n}</b><span class=lbl>{k}</span></div>' for k,g,n in coins)
log=[('Kaela','prende','Pozione di guarigione'),('Brann','deposita','40 mo'),('Selene','divide','120 mo in 4 parti'),('Marco (master)','aggiunge','Gemma ×2')]
ll=''.join(f'<div class=rowx><b style="color:#fff">{a}</b>&nbsp;{v} {o}</div>' for a,v,o in log)
body=hero()+'<div class=wrap style="padding-top:0">'+tabs(TABS,3)+'''<div class=grid2><div class=stack><section class="pn c-tes"><h2 class=pn__h><i data-lucide=coins class=i></i>Monete<span class=aside><span class=btnx>Dividi tra tutti</span></span></h2><div class=pn__b style="display:flex;gap:12px">'''+cl+'''</div></section>
<section class="pn c-tes"><h2 class=pn__h><i data-lucide=package class=i></i>Oggetti<span class=aside><span class=btnx><i data-lucide=plus class="i i--sm"></i>Aggiungi</span></span></h2><div class=pn__b>'''+il+'''</div></section></div>
<section class="pn c-log"><h2 class=pn__h>Chi ha preso cosa</h2><div class=pn__b>'''+ll+'''</div></section></div></div>'''
page('m-camp-tesoro.html',2,body)

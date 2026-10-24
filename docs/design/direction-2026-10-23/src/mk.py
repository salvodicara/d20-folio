import sys
HEAD='''<!doctype html><html lang=it><head><meta charset=utf-8><title>m</title>
<link rel=stylesheet href=tokens.css><link rel=stylesheet href=components.css><link rel=stylesheet href=layout.css><link rel=stylesheet href=approved.css><link rel=stylesheet href=kit.css>
<script src="https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js"></script></head><body class=mode-combat>
<header class=top><a class=brand href=#><svg viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=1.4 stroke-linejoin=round><path d="M12 2l8.7 5v10L12 22l-8.7-5V7z"/><path d="M12 7l-5.2 9h10.4z"/></svg>Folio</a>
<nav class=nav><a href=# NAV1>Personaggi</a><a href=# NAV2>Campagne</a><a href=# NAV3>Compendio</a></nav><span class=grow></span><span class=lrow__img style="width:36px;height:36px"><span style="font-size:15px">M</span></span></header>'''
TAIL='<script>lucide.createIcons()</script></body></html>'
def page(name,nav,body):
    h=HEAD.replace('NAV%d'%nav,'aria-current=page')
    for i in (1,2,3): h=h.replace('NAV%d'%i,'')
    open(name,'w').write(h+body+TAIL)
def tabs(items,on):
    return '<nav class=tabs role=tablist>'+''.join(f'<button class=tab aria-selected={"true" if i==on else "false"}><i data-lucide={ic} class="i i--sm"></i>{t}</button>' for i,(ic,t) in enumerate(items))+'</nav>'
def ring(img,p,col,size=64):
    import math
    C=2*math.pi*28
    return f'<span class=mini-ring style="width:{size}px;height:{size}px"><img src="img/{img}" style="inset:{size*0.1}px;width:{size*0.8}px;height:{size*0.8}px"><svg viewBox="0 0 64 64" width={size} height={size}><circle cx=32 cy=32 r=28 fill=none stroke="#120a07" stroke-width=6 /><circle cx=32 cy=32 r=28 fill=none stroke="{col}" stroke-width=4 stroke-linecap=round stroke-dasharray="{C*p} {C}" style="filter:drop-shadow(0 0 4px {col})" /></svg></span>'

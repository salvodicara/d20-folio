import { chromium } from "@playwright/test";
const OUT = process.argv[2];
const b = await chromium.launch();
const C = [["hub","/campaigns/DEVCAMPAIGN24",{}],["hub-art","/campaigns/DEVCAMPAIGN24",{"d20-dev-banner":"1"}],["encounter","/campaigns/DEVCAMPAIGN24",{"d20-dev-encounter":"1"}],["journal","/campaigns/DEVCAMPAIGN24",{"d20.campaignWorkspace.DEVCAMPAIGN24":"journal"}],["list","/campaigns",{}]];
for (const [dev,vp,m] of [["desktop",{width:1440,height:900},false],["phone",{width:390,height:844},true]]) for (const theme of ["dark","light"]) for (const [slug,route,flags] of C) {
  const ctx = await b.newContext({viewport:vp,deviceScaleFactor:m?2:1,isMobile:m,hasTouch:m,reducedMotion:"reduce"});
  await ctx.addInitScript(({t,f})=>{ localStorage.setItem("i18nextLng","it"); localStorage.setItem("d20-folio-ui", JSON.stringify({ state: { theme: t, sheetMode: "play" }, version: 0 })); for (const [k,v] of Object.entries(f)) localStorage.setItem(k,v); }, {t:theme,f:flags});
  const p = await ctx.newPage(); await p.goto("http://localhost:5181"+route); await p.waitForTimeout(6500);
  await p.screenshot({path:`${OUT}/${slug}-${theme}-${dev}.png`}); await ctx.close();
}
await b.close();

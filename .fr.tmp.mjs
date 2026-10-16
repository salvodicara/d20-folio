import { chromium } from "@playwright/test";
const OUT = process.argv[2] || "/tmp";
const b = await chromium.launch();
for (const [dev,vp,m] of [["desktop",{width:1440,height:900},false],["phone",{width:390,height:844},true]]) for (const theme of ["dark","light"]) {
  const ctx = await b.newContext({viewport:vp,deviceScaleFactor:m?2:1,isMobile:m,hasTouch:m,reducedMotion:"reduce"});
  await ctx.route("**/__mk/lyra.png", r => r.fulfill({ path: "/tmp/mk/lyra.png", contentType: "image/png" }));
  await ctx.addInitScript((t)=>{ localStorage.setItem("i18nextLng","it"); localStorage.setItem("d20-dev-portrait","/__mk/lyra.png"); localStorage.setItem("d20-folio-ui", JSON.stringify({ state: { theme: t, sheetMode: "play" }, version: 0 })); }, theme);
  const p = await ctx.newPage(); await p.goto("http://localhost:5181/characters/mock-1"); await p.waitForTimeout(7000);
  console.log(dev, theme, await p.locator("header[data-frontispiece]").count());
  await p.screenshot({path:`${OUT}/fr-${theme}-${dev}.png`}); await ctx.close();
}
await b.close();

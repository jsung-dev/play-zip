// Focused UI regression. Route fixtures reach unchanged quiz/arrival logic;
// they are browser-only and do not add shipped debug controls or endpoints.
// Run: node --import tsx scripts/qa-delivery-campaign.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { DELIVERY_STOPS, getDrivewayDeliveryInterval } from "../data/delivery-map.ts";
import { DELIVERY_GAME_CONFIG, DELIVERY_BRANDS } from "../data/delivery-game.ts";

const url = process.env.DELIVERY_GAME_URL || "http://127.0.0.1:3010/games/delivery";
const out = resolve("test-artifacts/campaign-ui");
const home = "https://play-zip-app.vercel.app/";
const sizes = [[335, 568], [390, 844], [430, 932], [390, 640]];
const from = process.env.CAMPAIGN_QA_FROM || "start";
await mkdir(out, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "delivery-campaign-qa-"));
const browserPath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean).find(existsSync);
assert(browserPath, "Chromium browser required");
const browser = spawn(browserPath, ["--headless=new", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", "--user-data-dir=" + profile, "about:blank"], { stdio: "ignore", windowsHide: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws, id = 0;
const pending = new Map(), errors = [];
const results = from === "start" ? [] : JSON.parse(await readFile(join(out, "results.json"), "utf8"));
async function until(fn, label, limit = 30000) {
  const end = Date.now() + limit;
  while (Date.now() < end) { try { if (await fn()) return; } catch {} await delay(100); }
  throw new Error("Timed out: " + label);
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("CDP timeout: " + method)), 30000);
    pending.set(++id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
const run = (fn, ...args) => evaluate("(" + fn.toString() + ")(" + args.map(arg => JSON.stringify(arg)).join(",") + ")");
async function touch(selector) {
  const r = await run(selector => {
    const el = document.querySelector(selector);
    if (!el) throw new Error("Missing " + selector);
    el.scrollIntoView({block:"nearest",behavior:"instant"});
    const b = el.getBoundingClientRect(); return {x:b.left+b.width/2,y:b.top+b.height/2};
  }, selector);
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...r, id: 1 }] });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await delay(120);
}
async function size(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, screenWidth: width, screenHeight: height, mobile: true, deviceScaleFactor: 1 });
  await delay(100);
}
async function screenshot(name) {
  const image = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(out, name + ".png"), Buffer.from(image.data, "base64"));
}
async function load() {
  await size(390,844);
  await send("Page.navigate", { url });
  await until(() => run(() => {
    const el = document.querySelector("[data-game-status]");
    return !!document.querySelector('[data-campaign-screen="start"]') && !!document.querySelector("canvas") && Object.keys(el).some(k=>k.startsWith("__reactFiber$"));
  }), "hydrated game");
  await evaluate("document.fonts.ready"); await delay(300);
}
const state = () => run(() => {
  const e=document.querySelector("[data-game-status]");
  return { status:e.dataset.gameStatus, position:+e.dataset.position, speed:+e.dataset.speed, brand:e.dataset.deliveryBrand, passed:+e.dataset.quizPassed, stop:+e.dataset.stopIndex, disabled:document.querySelector("[data-joystick]").disabled };
});
async function fixture(values) {
  await run(values => {
    const el=document.querySelector("[data-game-status]");
    let fiber=el[Object.keys(el).find(k=>k.startsWith("__reactFiber$"))],runtime;
    for(;fiber&&!runtime;fiber=fiber.return) for(let hook=fiber.memoizedState;hook;hook=hook.next) {
      const value=hook.memoizedState?.current;
      if(value&&typeof value.position==="number"&&"quizPassedStops" in value&&"laneTarget" in value){runtime=value;break;}
    }
    if(!runtime)throw new Error("No visual fixture runtime");
    Object.assign(runtime,values);
  }, values);
}
async function start(brand) {
  await touch(`[data-brand-choice="${brand}"]`);
  await until(async()=>(await state()).status==="playing","start game");
  assert.equal((await state()).brand,brand);
}
async function arriveQuiz(index) {
  const stop=DELIVERY_STOPS[index];
  await fixture({position:stop.distance,speed:0,stopIndex:index,quizPassedStops:Array.from({length:index},(_,i)=>i),completedStops:Array.from({length:index},(_,i)=>i),stopDwell:0,driveway:{stopIndex:index,progress:getDrivewayDeliveryInterval(index).start+2,entryPosition:stop.distance,entryLaneX:stop.side==="left"?-2.5:2.5}});
  await until(async()=>(await state()).status==="quiz","quiz "+index);
}
async function finish() {
  await fixture({position:DELIVERY_GAME_CONFIG.totalDistance,speed:0,stopIndex:DELIVERY_STOPS.length,quizPassedStops:[0,1,2],completedStops:[0,1,2],driveway:null,detour:"left",closureReached:false});
  await until(async()=>(await state()).status==="completed","completed",10000);
}
async function checkLayout(screen,width,height) {
  await size(width,height);
  const report=await run(()=>{
    const card=document.querySelector("[data-campaign-screen]");
    card.scrollTop=0;
    const b=card.getBoundingClientRect(),css=getComputedStyle(card);
    const controls=[...card.querySelectorAll('button,a')].map(el=>({name:el.textContent.trim(),height:el.getBoundingClientRect().height,font:parseFloat(getComputedStyle(el).fontSize)}));
    const clipped=[...card.querySelectorAll('h1,h2,p,small,strong,legend,dt,dd,button,a,label')].filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>el.textContent);
    const broken=[...card.querySelectorAll('img')].filter(img=>!img.complete||!img.naturalWidth).map(img=>img.src);
    return {screen:card.dataset.campaignScreen,viewport:[innerWidth,innerHeight],card:[b.x,b.y,b.width,b.height],scrollHeight:card.scrollHeight,clientHeight:card.clientHeight,background:css.backgroundColor,color:css.color,overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,clipped,broken,controls};
  });
  assert.equal(report.screen,screen); assert.equal(report.background,'rgb(255, 255, 255)');
  assert(!report.overflow); assert.deepEqual(report.clipped,[]); assert.deepEqual(report.broken,[]);
  assert(report.card[1]>=0&&report.card[1]+report.card[3]<=height);
  for(const c of report.controls){assert(c.height>=52,c.name+' target');assert(c.font>=16,c.name+' font');}
  await screenshot(`${screen}-${width}x${height}`);
  // All bottom actions/notices must remain reachable inside the card.
  const scroll=await run(()=>{
    const card=document.querySelector('[data-campaign-screen]'); card.scrollTop=card.scrollHeight;
    const last=card.lastElementChild.getBoundingClientRect(),b=card.getBoundingClientRect();
    return {lastBottom:last.bottom,cardBottom:b.bottom,scrollY:window.scrollY};
  });
  assert(scroll.lastBottom<=scroll.cardBottom&&scroll.scrollY===0,'internal scroll and safe bottom');
  await screenshot(`${screen}-${width}x${height}-bottom`);
  results.push(report);
}
async function contrast(screen) {
  const measured=await run(()=>{
    const parse=s=>s.match(/[\d.]+/g)?.map(Number);
    const luminance=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const card=document.querySelector('[data-campaign-screen]');
    return [...card.querySelectorAll('*')].filter(el=>[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&el.getBoundingClientRect().height).map(el=>{
      const style=getComputedStyle(el),fg=parse(style.color);let bg=[255,255,255],ancestor=el;
      for(;ancestor;ancestor=ancestor.parentElement){const color=parse(getComputedStyle(ancestor).backgroundColor);if(color&&(color.length<4||color[3]===1)){bg=color;break;}}
      const a=luminance(fg),b=luminance(bg);return {text:el.textContent.trim().slice(0,45),font:parseFloat(style.fontSize),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
    });
  });
  for(const item of measured){assert(item.ratio>=4.5,screen+' contrast '+JSON.stringify(item));assert(item.font>=13,screen+' type '+JSON.stringify(item));}
  results.push({contrastScreen:screen,minContrast:Math.min(...measured.map(x=>x.ratio)),samples:measured});
}
try {
  let port;
  await until(async()=>{port=(await readFile(join(profile,"DevToolsActivePort"),"utf8")).split("\n")[0];return port;},"browser");
  const pages=await(await fetch("http://127.0.0.1:"+port+"/json/list")).json();
  ws=new WebSocket(pages.find(p=>p.type==="page").webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=({data})=>{
    const m=JSON.parse(data);
    if(m.id){const p=pending.get(m.id);if(!p)return;clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}
    else if(m.method==="Runtime.exceptionThrown")errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  };
  await send("Page.enable");await send("Runtime.enable");await send("Emulation.setTouchEmulationEnabled",{enabled:true,maxTouchPoints:5});
  await load();
  if (from === 'captures') {
    // One real touch-pan check in addition to the layout/scroll bounds checks.
    await size(335,568);
    await run(()=>{document.querySelector('[data-campaign-screen]').scrollTop=0;});
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:275,y:480,id:1}]});
    for(let step=1;step<=10;step++){
      await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:275,y:480-step*24,id:1}]});
      await delay(24);
    }
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(250);
    assert(await evaluate('document.querySelector("[data-campaign-screen]").scrollTop > 0'),'touch pan scrolls the modal');
    assert.equal((await state()).position,0,'touch scrolling does not drive');
    results.push({touchPan335:true});
    await size(390,844);await run(()=>{document.querySelector('[data-campaign-screen]').scrollTop=0;});
    await screenshot('start');
    await start('mongle'); await arriveQuiz(0); await screenshot('quiz');
    await touch('[data-quiz-answer="mongle"]');
    await until(async()=>(await state()).status==='playing','resume for completion capture');
    await finish(); await screenshot('complete');
    console.log('Three production UI captures saved: '+out);
  } else {
  if (from === 'start') {
  assert.equal(await evaluate('document.querySelectorAll("[data-brand-choice]").length'),3,'three milk choices');
  assert.equal((await state()).status,'ready');
  for(const [w,h] of sizes)await checkLayout('start',w,h);
  await contrast('start');
  }
  await size(390,844); await start('mongle');
  if (from === 'start') {
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38});await delay(900);
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38});await delay(650);
  assert((await state()).position>0,'existing drive input');
  }
  if (from !== 'complete') {
  for(let index=0;index<DELIVERY_STOPS.length;index++){
    await arriveQuiz(index);
    assert.equal(await evaluate('document.querySelector("[data-brand-quiz] [role=progressbar]").getAttribute("aria-valuenow")'),String(index+1));
    const initial=await run(()=>[...document.querySelectorAll('[data-quiz-answer]')].map(el=>{const c=getComputedStyle(el);return[c.backgroundColor,c.borderColor,c.color]}));
    assert(initial.every(v=>JSON.stringify(v)===JSON.stringify(initial[0])),'no correct-answer hint');
    const stopped=await state(); await delay(300);assert.deepEqual(await state(),stopped,'quiz freezes gameplay');assert(stopped.disabled);
    if(index===0){
      for(const [w,h] of sizes)await checkLayout('quiz',w,h);
      await contrast('quiz');await size(390,844);
      await touch('[data-quiz-answer="seoul"]');assert.equal((await state()).status,'quiz');assert.equal((await state()).passed,0);
      assert(await evaluate('document.querySelector("[data-brand-quiz] [role=status]").textContent.includes("다시 골라")'));
      await contrast('quiz-wrong');await screenshot('quiz-wrong-390');
    }
    await touch('[data-quiz-answer="mongle"]');
    await until(async()=>(await state()).status==='playing'&&(await state()).passed===index+1,'correct quiz resumes');
    await until(async()=>(await state()).stop===index+1,'existing delivery dwell',7000);
  }
  }
  await finish();assert((await state()).disabled);
  for(const [w,h] of sizes)await checkLayout('complete',w,h);
  await contrast('complete');await size(390,844);
  await touch('[data-purchase-cta]');assert.equal(await evaluate('document.querySelector("[data-purchase-preview]").dataset.purchasePreview'),'true');
  assert.equal(await evaluate('location.href'),url,'purchase stays a demo');
  await contrast('purchase-preview');await screenshot('purchase-preview-390');
  await touch('button[class*="textButton"]');assert.equal(await evaluate('document.querySelector("[data-purchase-preview]").dataset.purchasePreview'),'false');
  await touch('button[class*="secondaryButton"]');assert.equal((await state()).status,'ready');assert.equal((await state()).position,0);assert.equal((await state()).passed,0);
  assert.equal(await evaluate('document.querySelectorAll("[data-brand-choice]").length'),3,'restart returns to the milk choice');
  for(const brand of ['seoul','delicious']){
    await start(brand);await arriveQuiz(0);
    assert(await evaluate('document.querySelector("[data-brand-quiz] [data-quiz-answer=\\"'+brand+'\\"] img").src.includes("/'+brand+'/")'));
    await touch(`[data-quiz-answer="${brand}"]`);await until(async()=>(await state()).status==='playing','alternate brand answer');
    await finish();assert.equal(await evaluate('document.querySelector("[data-purchase-ad]").dataset.purchaseAd'),brand);
    assert(await run(name=>document.querySelector('[data-purchase-ad]').textContent.includes(name),DELIVERY_BRANDS[brand].productName));
    assert(await evaluate('document.querySelector("[data-purchase-ad] img").src.includes("/'+brand+'/")'));
    await screenshot('complete-'+brand+'-390');
    if(brand==='seoul')await touch('button[class*="secondaryButton"]');
  }
  await touch('[data-platform-return]');
  await until(()=>run(home=>location.href===home&&document.body.innerText.includes('오늘 뭐 할까?'),home),'platform return');
  results.push({initiallyUnselected:true,allBrands:true,quizSteps:3,wrongRetry:true,driving:true,purchaseDemoOnly:true,restart:true,platformReturn:true,routeFixtures:true,runtimeErrors:errors});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,checks:results.length,minContrast:Math.min(...results.filter(r=>r.minContrast).map(r=>r.minContrast)),screenshots:out},null,2));
  }
} finally {
  await writeFile(join(out,'results.json'),JSON.stringify(results,null,2));
  try{if(ws?.readyState===1)ws.send(JSON.stringify({id:++id,method:'Browser.close'}));}catch{}
  await delay(400);browser.kill();ws?.close();for(const p of pending.values())clearTimeout(p.timer);
  if(resolve(profile).startsWith(resolve(tmpdir())+sep)&&basename(profile).startsWith('delivery-campaign-qa-'))await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200}).catch(()=>{});
}

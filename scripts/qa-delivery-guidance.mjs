// Focused UI regression. Route fixtures reach unchanged quiz/arrival logic;
// they are browser-only and do not add shipped debug controls or endpoints.
// Run: node --import tsx scripts/qa-delivery-guidance.mjs
// GUIDANCE_QA_COUNTER=1 checks only completed deliveries (0 through 4).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { DELIVERY_STOPS, getDrivewayLength } from "../data/delivery-map.ts";
import { DELIVERY_GAME_CONFIG } from "../data/delivery-game.ts";

const url = process.env.DELIVERY_GAME_URL || "http://127.0.0.1:3010/games/delivery";
const out = resolve("test-artifacts/guidance-ui");
await mkdir(out, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "delivery-guidance-qa-"));
const browserPath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean).find(existsSync);
assert(browserPath, "Chromium browser required");
const browser = spawn(browserPath, ["--headless=new", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", "--user-data-dir=" + profile, "about:blank"], { stdio: "ignore", windowsHide: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws, id = 0;
const pending = new Map(), errors = [];
const results = [];
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
      if(value&&typeof value.position==="number"&&"quizPassedCount" in value&&"laneTarget" in value){runtime=value;break;}
    }
    if(!runtime)throw new Error("No visual fixture runtime");
    Object.assign(runtime,values);
  }, values);
}

async function key(key,down=true) { const codes={ArrowUp:38,ArrowDown:40,ArrowLeft:37,ArrowRight:39}; await send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',key,code:key,windowsVirtualKeyCode:codes[key]}); }
const details=()=>run(()=>{
 const e=document.querySelector('[data-game-status]'),c=document.querySelector('canvas');
 return {status:e.dataset.gameStatus,position:+e.dataset.position,speed:+e.dataset.speed,brand:e.dataset.deliveryBrand,stop:+e.dataset.stopIndex,passed:+e.dataset.quizPassed,alley:+e.dataset.drivewayIndex,progress:+e.dataset.drivewayProgress,length:+e.dataset.drivewayLength,lane:+e.dataset.lane,
 instruction:document.querySelector('[data-navigation-instruction]').textContent,remaining:parseInt(document.querySelector('[data-navigation-remaining]').textContent),guide:{...c.dataset},disabled:document.querySelector('[data-joystick]').disabled};
});
async function driveUntil(condition,label) {await key('ArrowUp');await until(async()=>condition(await details()),label,18000);await key('ArrowUp',false);await delay(550);}
async function capture(name){await delay(160);await screenshot(name);results.push({name,...await details()});}
async function checkHud(width,height) {
 await size(width,height);
 const report=await run(()=>{
  const h=document.querySelector('[data-navigation-hud]'),c=h.firstElementChild,b=c.getBoundingClientRect(),p=h.querySelector('button').getBoundingClientRect();
  return {width:innerWidth,height:innerHeight,hud:[b.x,b.y,b.width,b.height],canvas:document.querySelector('canvas').getBoundingClientRect().y,pause:[p.width,p.height],overflow:document.documentElement.scrollWidth>innerWidth,
  clipped:[...c.querySelectorAll('strong,span')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent)};
 });
 assert(!report.overflow);assert.deepEqual(report.clipped,[]);assert(report.pause.every(n=>n>=44));assert(report.hud[3]<128);assert.equal(report.canvas,75,'existing camera viewport inset');
 results.push(report);
}
try {
 let port;
 await until(async()=>{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];return port;},'browser');
 const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 ws.onmessage=({data})=>{
  const m=JSON.parse(data);
  if(m.id){const p=pending.get(m.id);if(!p)return;clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}
  else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description).join(' '));
 };
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await load();await touch('label:has(input[value="seoul"])');await touch('[data-campaign-screen="start"] button');await until(async()=>(await state()).status==='playing','start');
 if(process.env.GUIDANCE_QA_COUNTER==='1') {
  const counter=()=>run(()=>{
   const bar=document.querySelector('[data-navigation-hud] [role="progressbar"]');
   return {label:bar.previousElementSibling.textContent,total:+bar.getAttribute('aria-valuemax'),value:+bar.getAttribute('aria-valuenow'),segments:bar.children.length,filled:bar.querySelectorAll('[data-state="complete"]').length,current:bar.querySelectorAll('[data-state="current"]').length};
  });
  const checkCount=async(value)=>{
   const actual=await counter();
   assert.deepEqual(actual,{label:`배달 ${value} / 4`,total:4,value,segments:4,filled:value,current:0});
   results.push({status:(await state()).status,...actual});
  };
  await checkCount(0);
  for(const [w,h] of [[335,568],[390,844],[430,932]])await checkHud(w,h);
  await size(390,844);await screenshot('counter-start-390');
  for(let n=1;n<=DELIVERY_STOPS.length;n++) {
   await fixture({position:0,speed:0,stopIndex:n,quizPassedCount:n,driveway:null});
   await until(async()=>(await state()).stop===n,'completed stop '+n);await checkCount(n);
  }
  await fixture({position:DELIVERY_GAME_CONFIG.totalDistance,speed:0,driveway:null});
  await until(async()=>(await state()).status==='arriving','final handoff');await checkCount(3);
  await until(async()=>(await state()).status==='completed','final completion');await checkCount(4);
  await touch('[data-campaign-screen="complete"] button[class*="secondaryButton"]');
  await until(async()=>(await state()).status==='ready','restart');await checkCount(0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,counterStates:results,runtimeErrors:errors},null,2));
 } else if(process.env.GUIDANCE_QA_VISUAL==='1') {
  // A touch that begins in the new HUD must not start the floating joystick.
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:170,y:94,id:1}]});
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:170,y:180,id:1}]});await delay(250);
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal((await details()).position,0);
  // The unchanged lower scene still accepts a real joystick drag.
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:290,y:650,id:2}]});
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:290,y:540,id:2}]});await delay(500);
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(600);
  assert((await details()).position>0,'lower joystick remains usable');
  await fixture({position:185,speed:0,laneX:-2.5,laneFromX:-2.5,laneTarget:0,laneStartedAt:0});await delay(700);await capture('approach-final');
  await touch('button[aria-label="게임 일시정지"]');await capture('pause-final');await touch('[data-guidance-replay]');
  await fixture({position:190,speed:0,driveway:{stopIndex:0,progress:getDrivewayLength(0)-5.9,entryPosition:190,entryLaneX:-2.5}});await delay(900);await capture('entrance-final');
  assert.equal((await details()).guide.guidanceMode,'entrance');
  for(const [w,h] of [[335,568],[430,932]]){await size(w,h);await delay(350);await capture('entrance-final-'+w);}
  assert.deepEqual(errors,[]);console.log('Targeted guidance captures passed');
 } else {
 // Only setup uses a fixture. Alley entry, driving, stopping and arrival use real inputs.
 await fixture({position:172,speed:0,laneX:0,laneFromX:0,laneTarget:1,laneStartedAt:0});
 await delay(400);
 await key('ArrowLeft');await key('ArrowLeft',false);
 await driveUntil(s=>s.position>=183,'approach first alley');
 await capture('approach-390');
 const approach=await details();assert.equal(approach.instruction,'왼쪽 골목으로');assert.equal(approach.guide.guidanceHouse,'delivery-house-stop-01');
 assert.equal(approach.guide.guidanceMode,'house');assert.equal(approach.guide.guidanceRing,'false');assert.equal(+approach.guide.guidanceArrows,3);
 assert(approach.remaining>Math.abs(190-approach.position)+20,'HUD includes alley, not distance to turn');
 for(const [w,h] of [[335,568],[390,844],[430,932]])await checkHud(w,h);
 await size(390,844);
 await touch('button[aria-label="게임 일시정지"]');await capture('paused-390');
 const before=await details();assert(before.disabled);
 const buttons=await run(()=>[...document.querySelector('article[aria-label="게임 일시정지"]').querySelectorAll('button,a')].map(e=>e.textContent.trim()));
 assert.deepEqual(buttons,['계속 배달하기','길 안내 다시 보기','처음으로','플랫폼으로']);
 for(const [w,h] of [[335,568],[430,932]]){await size(w,h);await run(()=>document.querySelector('[data-platform-return]').scrollIntoView({block:'nearest'}));await screenshot('paused-'+w);}
 await size(390,844);
 for(let n=0;n<2;n++){
  await touch('[data-guidance-replay]');await until(async()=>(await details()).guide.guidanceHighlighted==='true','guidance emphasis');
  const replay=await details();assert.equal(replay.position,before.position);assert.equal(replay.brand,'seoul');assert.equal(replay.stop,0);assert.equal(replay.passed,0);assert.equal(replay.speed,0);
  if(n===0)await touch('button[aria-label="게임 일시정지"]');
 }
 await capture('replay-390');
 await driveUntil(s=>s.alley===0&&s.progress>8,'drive into left alley');await capture('alley-390');
 assert.equal((await details()).instruction,'골목 안으로 이동');
 await driveUntil(s=>s.progress>s.length-9,'approach actual entrance');await capture('entrance-390');
 const entry=await details();assert.equal(entry.guide.guidanceMode,'entrance');assert.equal(entry.guide.guidanceRing,'true');assert.equal(entry.instruction,'입구로 이동');
 assert(entry.progress<entry.length-DELIVERY_GAME_CONFIG.drivewayDeliveryDepth,'not arrived before the original zone');
 await driveUntil(s=>s.status==='quiz','reach original delivery zone');const arrived=await details();
 assert(arrived.progress>=arrived.length-DELIVERY_GAME_CONFIG.drivewayDeliveryDepth);assert.equal(arrived.remaining,0);assert.equal(arrived.passed,0);
 await touch('[data-quiz-answer="seoul"]');await until(async()=>(await details()).stop===1,'original quiz and dwell completion',7000);
 await capture('next-target');assert.equal((await details()).guide.guidanceTarget,'stop-02');
 await key('ArrowDown');await until(async()=>(await details()).alley===-1,'reverse from delivered alley',14000);await key('ArrowDown',false);await delay(800);
 assert.equal((await details()).stop,1);
 await fixture({position:380,speed:0,driveway:null,laneX:0,laneFromX:0,laneTarget:1,deliverySuccessRemaining:0});await delay(500);await capture('right-alley');
 assert.equal((await details()).instruction,'오른쪽 골목으로');assert.equal((await details()).guide.guidanceTarget,'stop-02');assert.equal((await details()).guide.guidanceHouse,'delivery-house-stop-02');
 await touch('button[aria-label="게임 일시정지"]');await touch('button[class*="textButton"]');
 assert.equal((await state()).status,'ready');assert.equal((await state()).position,0);
 assert.deepEqual(errors,[]);results.push({passed:true,realAlleyEntry:true,originalArrival:true,quizAndNextTarget:true,reverse:true,replayTwice:true,restart:true,runtimeErrors:errors});
 console.log(JSON.stringify({passed:true,results:results.length,out},null,2));
 }
} finally {
 await writeFile(join(out,process.env.GUIDANCE_QA_COUNTER==='1'?'counter-results.json':process.env.GUIDANCE_QA_VISUAL==='1'?'visual-results.json':'results.json'),JSON.stringify(results,null,2));
 try{if(ws?.readyState===1)ws.send(JSON.stringify({id:++id,method:'Browser.close'}));}catch{}
 await delay(400);browser.kill();ws?.close();for(const p of pending.values())clearTimeout(p.timer);
 if(resolve(profile).startsWith(resolve(tmpdir())+sep)&&basename(profile).startsWith('delivery-guidance-qa-'))await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200}).catch(()=>{});
}


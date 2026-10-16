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
import { DELIVERY_STOPS, getDrivewayLength, getDrivewayDeliveryInterval, getDrivewayExitDistance } from "../data/delivery-map.ts";
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
      if(value&&typeof value.position==="number"&&"quizPassedStops" in value&&"laneTarget" in value){runtime=value;break;}
    }
    if(!runtime)throw new Error("No visual fixture runtime");
    Object.assign(runtime,values);
  }, values);
}

async function key(key,down=true) { const codes={ArrowUp:38,ArrowDown:40,ArrowLeft:37,ArrowRight:39}; await send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',key,code:key,windowsVirtualKeyCode:codes[key]}); }
const details=()=>run(()=>{
 const e=document.querySelector('[data-game-status]'),c=document.querySelector('canvas');
 return {status:e.dataset.gameStatus,position:+e.dataset.position,speed:+e.dataset.speed,brand:e.dataset.deliveryBrand,stop:+e.dataset.stopIndex,passed:+e.dataset.quizPassed,alley:+e.dataset.drivewayIndex,progress:+e.dataset.drivewayProgress,length:+e.dataset.drivewayLength,lane:+e.dataset.lane,
 instruction:document.querySelector('[data-navigation-instruction]').textContent,remaining:parseInt(document.querySelector('[data-navigation-remaining]').textContent),guide:{...c.dataset},disabled:document.querySelector('[data-joystick]').disabled,
 completed:e.dataset.completedStops,skipped:e.dataset.skippedStops,collisions:+e.dataset.collisionCount,slowdown:e.dataset.slowdownActive,count:+document.querySelector('[aria-label="배달 완료 수"]').getAttribute('aria-valuenow'),turn:e.dataset.turnChoice,travel:+e.dataset.travelDirection,entryEnd:e.dataset.drivewayEntry,laneX:+e.dataset.laneX};
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
 if(process.env.GUIDANCE_QA_ROAD==='1') {
  const label=process.env.ROAD_QA_LABEL||'after';
  const frames=[
    ['main',{position:80,laneTarget:1,laneX:0,laneFromX:0}],
    ['entry-left',{position:184,laneTarget:-1,laneX:-5,laneFromX:-5}],
    ['alley-join',{position:190,driveway:{stopIndex:0,progress:2,entryPosition:190,entryLaneX:-5}}],
    ['alley-inner',{position:190,driveway:{stopIndex:0,progress:12,entryPosition:190,entryLaneX:-5}}],
    ['alley-exit',{position:190,driveway:{stopIndex:0,progress:getDrivewayLength(0)-3,entryPosition:190,entryLaneX:-5}}],
    ['entry-right',{position:384,laneTarget:3,laneX:5,laneFromX:5}],
    ['fork',{position:480,laneTarget:0,laneX:-2.5,laneFromX:-2.5,detour:'left'}],
    ['bypass',{position:580,laneTarget:0,laneX:-2.5,laneFromX:-2.5,detour:'left'}],
    ['merge',{position:680,laneTarget:0,laneX:-2.5,laneFromX:-2.5,detour:'left'}],
  ];
  for(const [name,values] of frames){
    if(process.env.ROAD_QA_JOINS_ONLY==='1'&&!['entry-left','alley-join','alley-exit','entry-right'].includes(name))continue;
    await fixture({speed:0,driveway:null,travelDirection:1,laneStartedAt:0,detour:'main',deliverySuccessRemaining:0,...values});
    await delay(1000);await capture(`road-${label}-${name}`);
  }
  if(process.env.ROAD_QA_JOINS_ONLY!=='1'){
  await fixture({position:181,speed:0,driveway:null,travelDirection:1,laneTarget:-1,laneX:-5,laneFromX:-5,laneStartedAt:0});
  await driveUntil(s=>s.alley===0&&s.progress>3,'road material smoke: enter alley');
  assert.equal((await details()).alley,0);assert.equal((await details()).brand,'seoul');
  }
  assert.deepEqual(errors,[]);results.push({passed:true,checks:'road junction visuals and unchanged forward entry',runtimeErrors:errors});
  console.log(JSON.stringify({passed:true,label,checks:'road surface visual QA',out}));
 } else if(process.env.GUIDANCE_QA_LANE_VISUAL==='1') {
  for(const [w,h] of [[335,568],[390,844],[430,932]]){
    await size(w,h);
    for(const [i,x,lane] of [[0,-5,-1],[1,5,3]]){
      await fixture({position:DELIVERY_STOPS[i].distance-24,speed:0,driveway:null,travelDirection:1,laneX:x,laneFromX:x,laneTarget:lane,laneStartedAt:0,stopIndex:i});
      await delay(1100);await capture(`lane-view-${i===0?'left':'right'}-${w}`);
    }
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks:'portrait extra lane framing',out}));
 } else if(process.env.GUIDANCE_QA_LANES==='1') {
  const steer=async(side)=>{await key(side<0?'ArrowLeft':'ArrowRight');await key(side<0?'ArrowLeft':'ArrowRight',false);await delay(350);};
  const answerNow=async(expected)=>{
    await touch('[data-quiz-answer="mongle"]');assert.equal((await details()).status,'quiz');assert.equal((await details()).count,expected-1);
    const started=Date.now();await touch('[data-quiz-answer="seoul"]');
    await until(async()=>(await details()).count===expected,'immediate correct-answer handoff',1200);
    const elapsed=Date.now()-started;assert(elapsed<1500,'No old 1.6 second dwell');
    const result=await details();assert.equal(result.status,'playing');assert.equal(result.instruction,'배달 완료!');assert.equal(result.speed,0);
    results.push({check:'instant handoff',elapsedMs:elapsed,count:expected});
  };
  const stopAtPad=async(i)=>{
    const zone=getDrivewayDeliveryInterval(i);
    await driveUntil(s=>s.alley===i&&s.progress+s.speed*s.speed/(2*DELIVERY_GAME_CONFIG.decelerationPerSecond)>=(zone.start+zone.end)/2-.8,'manual braking at pad');
    await until(async()=>(await details()).status==='quiz','quiz after manual stop',5000);
  };
  for(const [w,h] of [[335,568],[390,844],[430,932]])await checkHud(w,h);
  await size(390,844);
  if(process.env.GUIDANCE_QA_LANES_CONTINUE!=='1'){
  // Old outer through-lane must not become a turn command, even right at the junction.
  await fixture({position:175,speed:0,laneX:-2.5,laneFromX:-2.5,laneTarget:0,laneStartedAt:0});
  await driveUntil(s=>s.position>236,'straight past first house');
  assert.equal((await details()).alley,-1);assert.equal((await details()).count,0);assert.equal((await details()).skipped,'0');
  // Return to the missed house using the physical exit-side extra lane.
  await key('ArrowDown');await steer(-1);
  await until(async()=>(await details()).alley===0,'reverse extra-lane entrance',8000);
  const zone0=getDrivewayDeliveryInterval(0);
  await until(async()=>{const s=await details();return s.progress-s.speed*s.speed/(2*DELIVERY_GAME_CONFIG.decelerationPerSecond)<=(zone0.start+zone0.end)/2+.7;},'reverse braking',10000);
  await key('ArrowDown',false);await until(async()=>(await details()).status==='quiz','missed-house quiz',5000);
  await answerNow(1);assert.equal((await details()).skipped,'');
  await capture('lane-instant-complete-390');
  await driveUntil(s=>s.alley===-1,'forward exit after return');
  await driveUntil(s=>s.position>282,'extra exit lane merges');assert.equal((await details()).lane,0);assert(Math.abs((await details()).laneX+2.5)<.16);
  }else await fixture({completedStops:[0,1],quizPassedStops:[0,1],stopIndex:2});
  // Every through-lane remains normal; two deliberate steps from center enter the fourth lane.
  for(const i of process.env.GUIDANCE_QA_LANES_CONTINUE==='1'?[2]:[1,2]){
    const stop=DELIVERY_STOPS[i],side=stop.side==='left'?-1:1,outer=side<0?0:2,extra=side<0?-1:3;
    await fixture({position:stop.distance-28,speed:0,driveway:null,travelDirection:1,detour:i===2?'left':'main',laneX:0,laneFromX:0,laneTarget:1,laneStartedAt:0,deliverySuccessRemaining:0});
    await delay(300);
    await steer(side);assert.equal((await details()).lane,outer);assert.equal((await details()).turn,'');
    if(i===1){
      await steer(side);assert.equal((await details()).lane,extra);assert.equal((await details()).position,stop.distance-28);
      for(let n=0;n<5;n++){await key('ArrowRight');await key('ArrowRight',false);}await delay(300);assert.equal((await details()).lane,extra);
      await capture('lane-fourth-right-390');
      await touch('[aria-label="게임 일시정지"]');await delay(250);await touch('[role="dialog"] button[class*="primaryButton"]');
      await stopAtPad(i);
    }else{
      // Hold forward and make a second horizontal joystick movement without lifting the finger.
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:210,y:650,id:9}]});
      await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:138,y:580,id:9}]});
      await until(async()=>(await details()).lane===extra,'touch enters local fourth lane',2000);
      await capture('lane-fourth-left-390');
      const zone=getDrivewayDeliveryInterval(i);
      await until(async()=>{const s=await details();return s.alley===i&&s.progress+s.speed*s.speed/(2*DELIVERY_GAME_CONFIG.decelerationPerSecond)>=(zone.start+zone.end)/2-.8;},'touch forward and turn',14000);
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await until(async()=>(await details()).status==='quiz','touch release at pad',5000);
    }
    await answerNow(i+1);
    await driveUntil(s=>s.alley===-1,'forward alley exit '+i);
  }
  const repeatedZone=getDrivewayDeliveryInterval(2);
  await fixture({position:820,speed:0,driveway:{stopIndex:2,progress:(repeatedZone.start+repeatedZone.end)/2,entryPosition:820,entryLaneX:-5}});
  await delay(1800);assert.equal((await details()).status,'playing');assert.equal((await details()).count,3,'Completed house does not quiz/count again');
  await fixture({position:990,speed:0,driveway:null,travelDirection:1,detour:'left',laneTarget:1,laneX:0,laneFromX:0});
  await driveUntil(s=>s.status==='arriving'||s.status==='completed','final delivery');await until(async()=>(await details()).status==='completed','final ad');
  assert.equal((await details()).count,4);assert.equal((await details()).brand,'seoul');await capture('lane-final-ad-390');
  await touch('[data-purchase-cta]');assert.equal(await run(()=>document.querySelector('[data-purchase-preview]').dataset.purchasePreview),'true');
  await touch('[data-campaign-screen="complete"] button[class*="secondaryButton"]');assert.equal((await details()).count,0);
  await touch('label:has(input[value="seoul"])');await touch('[data-campaign-screen="start"] button');
  await fixture({position:990,speed:0,completedStops:[0],quizPassedStops:[0],skippedStops:[1,2],detour:'left'});
  await driveUntil(s=>s.status==='arriving'||s.status==='completed','partial final delivery');await until(async()=>(await details()).status==='completed','partial final ad');
  assert.equal((await details()).count,2);await capture('lane-partial-result-390');
  assert.deepEqual(errors,[]);results.push({passed:true,threeExtraLanes:true,straightDoesNotTurn:true,reverseRevisit:true,instantQuizCompletion:true,mobileTouch:true,merge:true,finalAd:true,restart:true,runtimeErrors:errors});
  console.log(JSON.stringify({passed:true,checks:'dedicated turn lanes and immediate quiz handoff',out},null,2));
 } else if(process.env.GUIDANCE_QA_TURN_VISUAL==='1') {
  await fixture({position:184,speed:0,laneX:0,laneFromX:0,laneTarget:1,laneStartedAt:0});await delay(1000);
  await capture('turn-junction-before-390');
  await key('ArrowLeft');await key('ArrowLeft',false);await delay(600);await capture('turn-junction-selected-390');
  assert.equal((await details()).turn,'0:entrance');assert.equal((await details()).position,184,'Selection does not auto-drive');
  await key('ArrowRight');await key('ArrowRight',false);assert.equal((await details()).turn,'');
  await fixture({position:365,speed:0,laneX:0,laneFromX:0,laneTarget:1,laneStartedAt:0,turnChoice:null});await delay(150);
  await key('ArrowLeft');await key('ArrowLeft',false);assert.equal((await details()).lane,0,'Opposite side keeps ordinary avoidance without a pending turn');assert.equal((await details()).turn,'');
  await key('ArrowRight');await key('ArrowRight',false);assert.equal((await details()).turn,'1:entrance');
  await run(()=>window.dispatchEvent(new Event('blur')));await delay(150);assert.equal((await details()).turn,'');
  await fixture({position:175,speed:0,laneX:0,laneFromX:0,laneTarget:1,completedStops:[0],quizPassedStops:[0],stopIndex:1});await delay(150);
  assert.equal((await details()).instruction,'직진');
  await key('ArrowLeft');await key('ArrowLeft',false);await delay(100);
  assert.equal(await run(()=>document.querySelector('[data-navigation-destination]').textContent),'포근빌라 202호');
  assert.deepEqual(errors,[]);results.push({passed:true,oppositeLaneAvoidance:true,focusClearsTurn:true,selectedDestinationAccurate:true,stationaryChoice:true,runtimeErrors:errors});
  console.log('Close junction captures, lane avoidance, focus cancellation and destination labels passed.');
 } else if(process.env.GUIDANCE_QA_TURNS==='1') {
  for(const [w,h] of [[335,568],[390,844],[430,932]])await checkHud(w,h);
  await size(390,844);
  // Occupying the alley-side lane is no longer sufficient to enter.
  await fixture({position:175,speed:0,laneX:-2.5,laneFromX:-2.5,laneTarget:0,laneStartedAt:0});await delay(200);
  await capture('turn-unselected-390');
  await driveUntil(s=>s.position>235,'straight through left-side lane');
  assert.equal((await details()).alley,-1);assert.equal((await details()).count,0);assert.equal((await details()).skipped,'0');
  await until(async()=>(await details()).speed===0,'stop after missed first house',3000);
  // Return on the actual road, choose its exit junction, and recover the job.
  await key('ArrowDown');await delay(200);await key('ArrowLeft');await key('ArrowLeft',false);
  assert.equal((await details()).turn,'0:exit');await capture('turn-return-selected-390');
  await until(async()=>(await details()).alley===0,'reverse through exit junction',9000);
  assert.equal((await details()).entryEnd,'exit');assert.equal((await details()).stop,0);
  const firstZone=getDrivewayDeliveryInterval(0);
  await until(async()=>(await details()).progress<firstZone.end+1.3,'return to missed delivery pad',10000);
  await key('ArrowDown',false);await until(async()=>(await details()).status==='quiz','recovered first quiz',4000);
  await capture('turn-revisited-quiz-390');
  await touch('[data-quiz-answer="mongle"]');assert.equal((await details()).status,'quiz');
  await touch('[data-quiz-answer="seoul"]');await until(async()=>(await details()).count===1,'revisited first handoff',5000);
  assert.equal((await details()).completed,'0');assert.equal((await details()).skipped,'');
  await driveUntil(s=>s.alley===-1,'forward exit after revisit');await until(async()=>(await details()).speed===0,'stop outside',3000);
  results.push({check:'miss and return with real keys',...await details()});
  // A completed house's road stays open, but cannot replay its quiz or reward.
  await key('ArrowDown');await delay(180);await key('ArrowLeft');await key('ArrowLeft',false);
  await until(async()=>(await details()).alley===0,'completed alley still usable',9000);
  await until(async()=>(await details()).progress<firstZone.end+1.3,'completed pad',10000);await key('ArrowDown',false);
  await until(async()=>(await details()).speed===0,'stop at completed pad',4000);await delay(1800);
  assert.equal((await details()).status,'playing');assert.equal((await details()).count,1);
  results.push({check:'no duplicate completion on repeat visit',...await details()});
  // At the second intersection, reserve from any lane, cancel, and drive
  // straight even though the bike remains in the branch-side lane.
  await fixture({position:360,speed:0,driveway:null,laneX:0,laneFromX:0,laneTarget:1,laneStartedAt:0,travelDirection:1,turnChoice:null,deliverySuccessRemaining:0});await delay(200);
  await key('ArrowRight');await key('ArrowRight',false);assert.equal((await details()).turn,'1:entrance');
  await touch('button[aria-label="게임 일시정지"]');assert.equal((await details()).turn,'');
  await touch('[data-guidance-replay]');await key('ArrowRight');await key('ArrowRight',false);
  await key('ArrowLeft');await key('ArrowLeft',false);assert.equal((await details()).turn,'');
  await driveUntil(s=>s.position>435,'cancelled turn stays on main road');assert.equal((await details()).alley,-1);assert.equal((await details()).count,1);
  await until(async()=>(await details()).speed===0,'stop after second skip',3000);
  // Touch chooses the left turn from the opposite lane well before the fork.
  const third=DELIVERY_STOPS[2],zone=getDrivewayDeliveryInterval(2);
  await fixture({position:third.distance-35,speed:0,driveway:null,laneX:2.5,laneFromX:2.5,laneTarget:2,laneStartedAt:0,travelDirection:1,turnChoice:null,detour:'left'});await delay(200);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:260,y:650,id:9}]});
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:165,y:540,id:9}]});
  await until(async()=>(await details()).turn==='2:entrance','mobile turn reservation',2000);await capture('turn-mobile-selected-390');
  await until(async()=>{const s=await details();return s.alley===2&&s.progress+s.speed*s.speed/(2*DELIVERY_GAME_CONFIG.decelerationPerSecond)>=(zone.start+zone.end)/2-.8;},'mobile selected branch',12000);
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await until(async()=>(await details()).status==='quiz','mobile manual stop',5000);
  await touch('[data-quiz-answer="seoul"]');await until(async()=>(await details()).count===2,'third actual handoff',5000);
  await driveUntil(s=>s.alley===-1,'third forward exit');
  await fixture({position:990,speed:0,driveway:null,travelDirection:1,detour:'left',turnChoice:null});
  await driveUntil(s=>s.status==='arriving'||s.status==='completed','final handoff');await until(async()=>(await details()).status==='completed','final ad');
  assert.equal((await details()).count,3);assert.equal((await details()).completed,'0,2');assert.equal((await details()).skipped,'1');
  await capture('turn-partial-result-390');
  await touch('[data-campaign-screen="complete"] button[class*="secondaryButton"]');
  assert.equal((await details()).count,0);assert.equal((await details()).turn,'');assert.equal((await details()).skipped,'');
  assert.deepEqual(errors,[]);results.push({passed:true,noAutomaticLaneEntry:true,reverseRevisit:true,noDuplicate:true,earlySelection:true,cancellation:true,pauseClearsChoice:true,mobileTouch:true,actualFinalCount:3,restart:true,runtimeErrors:errors});
  console.log(JSON.stringify({passed:true,checks:'explicit turn/revisit',out},null,2));
 } else if(process.env.GUIDANCE_QA_COUNTER==='1') {
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
   await fixture({position:0,speed:0,stopIndex:n,quizPassedStops:Array.from({length:n},(_,i)=>i),completedStops:Array.from({length:n},(_,i)=>i),driveway:null});
   await until(async()=>(await state()).stop===n,'completed stop '+n);await checkCount(n);
  }
  await fixture({position:DELIVERY_GAME_CONFIG.totalDistance,speed:0,driveway:null,detour:'left'});
  await until(async()=>(await state()).status==='arriving','final handoff');await checkCount(3);
  await until(async()=>(await state()).status==='completed','final completion');await checkCount(4);
  await touch('[data-campaign-screen="complete"] button[class*="secondaryButton"]');
  await until(async()=>(await state()).status==='ready','restart');await checkCount(0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,counterStates:results,runtimeErrors:errors},null,2));
 } else if(process.env.GUIDANCE_QA_PARTIAL==='1') {
  // Isolate the mixed case; do not rerun the already-passed full-route checks.
  await fixture({position:232,speed:0,laneX:0,laneFromX:0,laneTarget:1});
  await driveUntil(s=>s.stop===1,'pass first stop threshold');
  assert.equal((await details()).count,0);assert.equal((await details()).skipped,'0');
  const stop=DELIVERY_STOPS[1],zone=getDrivewayDeliveryInterval(1);
  // A small pad overshoot is still recoverable with the unchanged reverse key.
  await fixture({position:stop.distance,speed:0,laneX:2.5,laneFromX:2.5,laneTarget:2,driveway:{stopIndex:1,progress:zone.end+1,entryPosition:stop.distance,entryLaneX:2.5}});
  await delay(250);assert.equal((await details()).stop,1);
  await key('ArrowDown');await until(async()=>(await details()).progress<zone.end-1,'correct small pad overshoot',4000);await key('ArrowDown',false);
  await until(async()=>(await details()).status==='quiz','second quiz after first skipped',4000);
  assert.equal((await details()).passed,0);assert.equal((await details()).count,0);
  await touch('[data-quiz-answer="seoul"]');await until(async()=>(await details()).count===1,'second-only handoff',5000);
  assert.equal((await details()).completed,'1');assert.equal((await details()).passed,1);
  await fixture({position:990,speed:0,driveway:null,detour:'left'});
  await driveUntil(s=>s.status==='arriving'||s.status==='completed','partial final handoff');
  await until(async()=>(await details()).status==='completed','partial result');
  assert.equal((await details()).count,2);assert.equal((await details()).skipped,'0,2');
  assert.equal(await run(()=>document.querySelector('[data-completion-count]').textContent),'배달 2 / 4 완료');
  await capture('through-complete-2');assert.deepEqual(errors,[]);
  results.push({passed:true,missFirstVisitSecond:true,smallOvershootReverseCorrection:true,actualCount:2,runtimeErrors:errors});
  console.log('Partial deliveries: second-stop quiz after skipped first stop, reverse correction, 2/4 result passed.');
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
  await fixture({position:190,speed:0,driveway:{stopIndex:0,progress:getDrivewayDeliveryInterval(0).start-2,entryPosition:190,entryLaneX:-2.5}});await delay(900);await capture('entrance-final');
  assert.equal((await details()).guide.guidanceMode,'entrance');
  for(const [w,h] of [[335,568],[430,932]]){await size(w,h);await delay(350);await capture('entrance-final-'+w);}
  assert.deepEqual(errors,[]);console.log('Targeted guidance captures passed');
 } else {
 // Fixtures only place us BEFORE each changed block. Entry, braking, quiz,
 // handoff and forward exit use actual keys/touch and the production tick.
 for(const [w,h] of [[335,568],[390,844],[430,932]])await checkHud(w,h);
 await size(390,844);
 const resetAndStart=async()=>{
   await touch('[data-campaign-screen="complete"] button[class*="secondaryButton"]');
   assert.equal((await details()).count,0);assert.equal((await details()).completed,'');assert.equal((await details()).skipped,'');
   await touch('label:has(input[value="seoul"])');await touch('[data-campaign-screen="start"] button');
 };
 const finish=async(expected)=>{
   await fixture({position:990,speed:0,driveway:null,detour:'left'});
   await driveUntil(s=>s.status==='arriving'||s.status==='completed','final delivery');
   await until(async()=>(await details()).status==='completed','purchase ad');
   assert.equal((await details()).count,expected);
   assert.equal(await run(()=>document.querySelector('[data-completion-count]').textContent),`배달 ${expected} / 4 완료`);
   assert.equal(await run(()=>document.querySelector('[data-purchase-ad]').dataset.purchaseAd),'seoul');
   await capture('through-complete-'+expected);
 };
 for(const [i,stop] of DELIVERY_STOPS.entries()) {
   const zone=getDrivewayDeliveryInterval(i),center=(zone.start+zone.end)/2;
   await fixture({position:stop.distance-12,speed:0,driveway:null,laneX:0,laneFromX:0,laneTarget:1,laneStartedAt:0,detour:'left',deliverySuccessRemaining:0});await delay(300);
   await key(stop.side==='left'?'ArrowLeft':'ArrowRight');await key(stop.side==='left'?'ArrowLeft':'ArrowRight',false);await delay(350);
   if(i===0)await capture('through-entrance-390');
   await key('ArrowUp');
   await until(async()=>{const s=await details();return s.alley===i&&s.progress+s.speed*s.speed/(2*DELIVERY_GAME_CONFIG.decelerationPerSecond)>=center-.8;},'coast into delivery pad '+i,14000);
   const braking=await details();assert(braking.speed>12,'No former 6m/s alley cap');
   await key('ArrowUp',false);
   await until(async()=>(await details()).status==='quiz','manual stop triggers quiz '+i,6000);
   const parked=await details();assert(parked.progress>=zone.start&&parked.progress<=zone.end);assert.equal(parked.count,i);
   await touch('[data-quiz-answer="mongle"]');assert.equal((await details()).status,'quiz');
   await touch('[data-quiz-answer="seoul"]');await until(async()=>(await details()).count===i+1,'actual handoff '+i,7000);
   assert.equal((await details()).stop,i+1);
   if(i===0){
     await delay(3200);await touch('button[aria-label="게임 일시정지"]');const paused=await details();await delay(250);assert.equal((await details()).progress,paused.progress);
     await touch('[data-guidance-replay]');assert.equal((await details()).brand,'seoul');assert.equal((await details()).count,1);
     await capture('through-exit-guidance-390');assert.equal((await details()).instruction,'출구 따라 큰길로');
   }
   await key('ArrowUp');await until(async()=>(await details()).progress>35,'exit corridor '+i,10000);
   if(i===0)await capture('through-exit-390');
   await until(async()=>(await details()).alley===-1,'forward main-road merge '+i,10000);
   const merged=await details();assert(merged.position>=getDrivewayExitDistance(i));assert(merged.speed>19,'No forced stop/slowdown on merge');assert.equal(merged.count,i+1);assert.equal(merged.collisions,0,'No collision sweep across bypassed main road');
   await key('ArrowUp',false);await until(async()=>(await details()).speed===0,'coast after merge',4000);
   results.push({check:'forward visit and exit',stop:stop.id,braking,parked,merged});
 }
 await finish(4);await resetAndStart();
 // Mobile: hold forward through a delivery alley without stopping. It is
 // skipped only after passing the pad plus its explicit exit margin.
 await fixture({position:180,speed:0,laneX:0,laneFromX:0,laneTarget:1,laneStartedAt:0});await delay(200);
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:260,y:650,id:5}]});
 await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:165,y:540,id:5}]});
 await until(async()=>(await details()).alley===0,'mobile enters alley',12000);
 await until(async()=>(await details()).stop===1,'mobile passes unserved pad',12000);
 assert.equal((await details()).count,0);assert.equal((await details()).skipped,'0');assert.equal((await details()).status,'playing');
 await until(async()=>(await details()).alley===-1,'mobile forward exit',10000);
 assert((await details()).speed>19);
 await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await until(async()=>(await details()).speed===0,'touch release coasts',4000);
 // Miss the other entrances on the main road, with no forced reversal.
 for(const i of [1,2]){
   await fixture({position:DELIVERY_STOPS[i].distance-10,speed:0,laneX:0,laneFromX:0,laneTarget:1,laneStartedAt:0,detour:'left'});
   await driveUntil(s=>s.stop===i+1,'main-road skip '+i);
   assert.equal((await details()).count,0);assert.notEqual((await details()).instruction,'후진해서 골목으로');
 }
 await finish(1);
 await touch('[data-purchase-cta]');assert.equal(await run(()=>document.querySelector('[data-purchase-preview]').dataset.purchasePreview),'true');
 await resetAndStart();
 // Collision penalty still expires; forward input resumes full normal speed.
 await fixture({position:140,speed:0,laneX:-2.5,laneFromX:-2.5,laneTarget:0,laneStartedAt:0});
 await key('ArrowUp');await until(async()=>(await details()).collisions===1,'collision retained',6000);
 await until(async()=>{const s=await details();return s.slowdown==='false'&&s.speed>=19;},'collision slowdown clears',7000);
 await key('ArrowUp',false);results.push({check:'collision recovery',...await details()});
 assert.deepEqual(errors,[]);results.push({passed:true,threeForwardVisits:true,mobileAlleySkip:true,mainRoadSkips:true,counts:[0,1,2,3,4],allMissedFinalCount:1,purchasePreview:true,restart:true,runtimeErrors:errors});
 console.log(JSON.stringify({passed:true,results:results.length,out},null,2));
 }
} finally {
 await writeFile(join(out,process.env.GUIDANCE_QA_ROAD==='1'?`road-${process.env.ROAD_QA_LABEL||'after'}-results.json`:process.env.GUIDANCE_QA_LANE_VISUAL==='1'?'lane-visual-results.json':process.env.GUIDANCE_QA_LANES==='1'?process.env.GUIDANCE_QA_LANES_CONTINUE==='1'?'lane-continued-results.json':'lane-results.json':process.env.GUIDANCE_QA_TURN_VISUAL==='1'?'turn-visual-results.json':process.env.GUIDANCE_QA_TURNS==='1'?'turn-results.json':process.env.GUIDANCE_QA_COUNTER==='1'?'counter-results.json':process.env.GUIDANCE_QA_PARTIAL==='1'?'partial-results.json':process.env.GUIDANCE_QA_VISUAL==='1'?'visual-results.json':'results.json'),JSON.stringify(results,null,2));
 try{if(ws?.readyState===1)ws.send(JSON.stringify({id:++id,method:'Browser.close'}));}catch{}
 await delay(400);browser.kill();ws?.close();for(const p of pending.values())clearTimeout(p.timer);
 if(resolve(profile).startsWith(resolve(tmpdir())+sep)&&basename(profile).startsWith('delivery-guidance-qa-'))await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200}).catch(()=>{});
}


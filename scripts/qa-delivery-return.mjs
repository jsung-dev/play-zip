// Focused regression: real start/pause inputs, completion UI via a browser-only fixture.
// No test endpoint or debug controls are included in the shipped game.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";

const url = process.env.DELIVERY_GAME_URL || "http://127.0.0.1:3010/games/delivery";
const home = "https://play-zip-app.vercel.app/";
const out = resolve("test-artifacts/platform-return");
await mkdir(out, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "delivery-return-qa-"));
const browserPath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean).find(existsSync);
assert(browserPath, "Chromium browser required");
const browser = spawn(browserPath, ["--headless=new", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", "--user-data-dir=" + profile, "about:blank"], { stdio: "ignore", windowsHide: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws, id = 0, acceptExit = false;
const pending = new Map(), errors = [], dialogs = [], results = [];
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
  await delay(150);
}
async function screenshot(name) {
  const image = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(out, name + ".png"), Buffer.from(image.data, "base64"));
}
async function loadGame(width = 390, height = 844) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, screenWidth: width, screenHeight: height, mobile: true, deviceScaleFactor: 1 });
  await send("Page.navigate", { url });
  await until(() => run(() => {
    const el = document.querySelector("[data-game-status]");
    return !!el && !!document.querySelector("canvas") && Object.keys(el).some(k=>k.startsWith("__reactFiber$"));
  }), "hydrated game");
  await evaluate("document.fonts.ready"); await delay(300);
}
const state = () => run(() => {
  const e = document.querySelector("[data-game-status]");
  return {status:e.dataset.gameStatus,position:+e.dataset.position,speed:+e.dataset.speed,brand:e.dataset.deliveryBrand,joystickDisabled:document.querySelector("[data-joystick]").disabled};
});
async function start() {
  await touch('label:has(input[value="seoul"])');
  await until(() => evaluate("!document.querySelector('button[class*=\"primaryButton\"]').disabled"), "brand selected");
  await touch('button[class*="primaryButton"]');
  await until(async () => (await state()).status === "playing", "playing");
}
async function drive() {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 });
  await delay(1000);
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 });
  await delay(650);
}
async function checkReturn(label) {
  const bounds = await run(() => {
    const link = document.querySelector("[data-platform-return]");
    const r = link.getBoundingClientRect(), card = link.parentElement.getBoundingClientRect();
    return {href:link.href,count:document.querySelectorAll("[data-platform-return]").length,width:r.width,height:r.height,left:r.left,right:r.right,bottom:r.bottom,visible:r.top>=Math.max(card.top,0)&&r.bottom<=Math.min(card.bottom,innerHeight),pageOverflow:document.documentElement.scrollWidth>innerWidth,text:link.textContent.trim()};
  });
  assert.equal(bounds.href, home); assert.equal(bounds.count, 1); assert.equal(bounds.text, "플랫폼으로");
  assert(bounds.height >= 44 && bounds.width >= 44, label + " touch size");
  assert(!bounds.pageOverflow && bounds.visible, label + " visibility: " + JSON.stringify(bounds));
  results.push({ label, ...bounds });
}
async function checkPlatform() {
  await until(() => run(home => location.href === home && document.body.innerText.includes("오늘 뭐 할까?"), home), "platform home");
}
try {
  let port;
  await until(async () => { port = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; return port; }, "browser");
  const pages = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
  ws = new WebSocket(pages.find(p => p.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id) {
      const p = pending.get(m.id); if (!p) return;
      clearTimeout(p.timer); pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    } else if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    else if (m.method === "Page.javascriptDialogOpening") {
      dialogs.push({ type: m.params.type, message: m.params.message, accepted: acceptExit });
      send("Page.handleJavaScriptDialog", { accept: acceptExit }).catch(e => errors.push(e.message));
    }
  };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  for (const [width, height] of [[360, 640], [390, 844], [430, 844]]) {
    await loadGame(width, height); await checkReturn("start-" + width); await screenshot("start-" + width);
  }
  await touch("[data-platform-return]"); await checkPlatform();
  assert.equal(dialogs.length, 0, "No warning before starting a game");
  results.push({ directEntryReturn: true });

  await loadGame(); await start();
  assert.equal(await evaluate("document.querySelector('[data-platform-return]')"), null, "No added control during play");
  await drive(); assert((await state()).position > 0, "Existing driving still works");
  await touch('button[aria-label="게임 일시정지"]'); await checkReturn("paused");
  const paused = await state(); assert(paused.joystickDisabled && paused.speed === 0);
  await screenshot("paused-390");
  acceptExit = false; await touch("[data-platform-return]");
  assert.equal(dialogs.length, 1); assert(dialogs[0].message.includes("저장되지"));
  assert.equal(await evaluate("location.href"), url);
  await delay(500); assert.deepEqual(await state(), paused, "Cancel keeps paused position/brand/input");
  await touch('article[aria-label="게임 일시정지"] button[class*="primaryButton"]');
  assert(!(await state()).joystickDisabled);
  await drive(); assert((await state()).position > paused.position, "Continue after cancelling exit");
  await touch('button[aria-label="게임 일시정지"]');
  acceptExit = true; await touch("[data-platform-return]"); await checkPlatform();
  assert.equal(dialogs.length, 2);
  results.push({ pausedExitCancel: true, resumed: true, pausedExitConfirm: true });

  await loadGame(); await start();
  // Browser-only visual fixture, matching existing street QA. It does not
  // claim to replay the full route: only the changed completion UI is tested.
  await run(() => {
    const el = document.querySelector("[data-game-status]");
    let fiber = el[Object.keys(el).find(k=>k.startsWith("__reactFiber$"))], runtime;
    for (;fiber&&!runtime;fiber=fiber.return) for(let hook=fiber.memoizedState;hook;hook=hook.next) {
      const value=hook.memoizedState?.current;
      if(value&&typeof value.position==="number"&&"quizPassedStops" in value&&"laneTarget" in value) {runtime=value;break;}
    }
    if(!runtime)throw new Error("No visual fixture runtime");
    Object.assign(runtime,{position:1000,speed:0,stopIndex:3,quizPassedStops:[0,1,2],completedStops:[0,1,2],driveway:null,detour:"left",closureReached:false});
  });
  await until(async () => (await state()).status === "completed", "completion UI", 10000);
  for (const [width, height] of [[360, 640], [390, 844], [430, 844]]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, mobile: true, deviceScaleFactor: 1 });
    await delay(100);
    // On short screens, existing completion card scroll keeps actions reachable.
    await evaluate("document.querySelector('[data-platform-return]').scrollIntoView({block:'nearest',behavior:'instant'})");
    await checkReturn("completed-" + width); await screenshot("completed-" + width);
  }
  assert((await state()).joystickDisabled, "Completion input remains blocked");
  await touch("[data-purchase-cta]");
  assert.equal(await evaluate("document.querySelector('[data-purchase-preview]').dataset.purchasePreview"), "true", "Purchase preview retained");
  await evaluate("document.querySelector('[data-platform-return]').scrollIntoView({block:'nearest',behavior:'instant'})");
  await checkReturn("purchase-preview");
  // Switch input modality before checking the keyboard focus indicator.
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await evaluate("document.querySelector('[data-platform-return]').focus()");
  assert.equal(await evaluate("getComputedStyle(document.activeElement).outlineStyle"), "solid");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await checkPlatform(); assert.equal(dialogs.length, 2, "No exit warning after completion");
  assert.deepEqual(errors, []);
  results.push({ completionFixtureReturn: true, purchasePreviewPreserved: true, keyboardReturn: true, runtimeErrors: errors.length, dialogs });
  console.log(JSON.stringify(results, null, 2));
} finally {
  await writeFile(join(out, "results.json"), JSON.stringify(results, null, 2));
  try { if (ws?.readyState === 1) ws.send(JSON.stringify({id:++id,method:"Browser.close"})); } catch {}
  await delay(400); browser.kill(); ws?.close();
  for (const p of pending.values()) clearTimeout(p.timer);
  if (resolve(profile).startsWith(resolve(tmpdir()) + sep) && basename(profile).startsWith("delivery-return-qa-")) {
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(()=>{});
  }
}

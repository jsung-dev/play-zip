// Visual-only fixtures at exact route positions. No gameplay/UI test hooks are
// shipped: this script locates the existing runtime ref in the test browser.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, basename, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const phase = process.env.STREET_QA_PHASE || 'before';
const url = process.env.STREET_QA_URL || 'http://127.0.0.1:3000/games/delivery';
const root = process.env.STREET_QA_ROOT || 'test-artifacts/streetscape';
const brand = process.env.STREET_QA_BRAND || 'mongle';
await mkdir(root, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (ok, text) => { if (!ok) throw new Error(text); };
const files = ['components/delivery/DeliveryGame.tsx', 'components/delivery/DeliveryScene3D.tsx', 'components/delivery/DeliveryJoystick.tsx', 'components/delivery/DeliveryGame.module.css', 'data/delivery-map.ts', 'data/delivery-outdoor-ads.ts'];
const protectedSources = {};
for (const file of files) protectedSources[file] = createHash('sha256').update(await readFile(file)).digest('hex');
const art = await readFile('components/delivery/three/scene-art.ts', 'utf8');
const builders = await readFile('components/delivery/three/scene-builders.ts', 'utf8');
const layout = await readFile('components/delivery/three/scene-layout.ts', 'utf8');
const gameData = await readFile('data/delivery-game.ts', 'utf8');
for (const [name, source] of Object.entries({
  bicycle: art.slice(art.indexOf('  function bicycle('), art.indexOf('  function horizon(')),
  bicycleLabel: builders.slice(builders.indexOf('function makeBrandPanelTexture('), builders.indexOf('function texturedMaterial(')),
  brandsAndRules: gameData.slice(gameData.indexOf('export const DELIVERY_BRANDS'), gameData.indexOf('// 광고 브랜드')),
  busesAndScenery: gameData.slice(gameData.indexOf('export const BUS_PLACEMENTS')),
  palette: art.slice(art.indexOf('export const TOWN_COLORS'), art.indexOf('// Geometry')),
  road: builders.slice(builders.indexOf('function roadSceneryFrame('), builders.indexOf('function placeOnRoute(')),
  deliveryEntrances: builders.slice(builders.indexOf('export function createDeliveryStop('), builders.indexOf('function createRoadClosure(')),
  fov: layout.slice(layout.indexOf('export function portraitCameraFov(')),
})) protectedSources[name] = createHash('sha256').update(source).digest('hex');
if (phase !== 'before') {
  const before = JSON.parse(await readFile(`${root}/before.json`, 'utf8'));
  assert(JSON.stringify(protectedSources) === JSON.stringify(before.protectedSources), 'Protected gameplay, camera, UI, bicycle, palette or road changed');
}

const server = createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const profile = await mkdtemp(join(tmpdir(), 'delivery-street-qa-'));
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
let socket;
try {
  let endpoint;
  for (let n = 0; n < 60 && !endpoint; n++) {
    try { endpoint = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(p => p.type === 'page')?.webSocketDebuggerUrl; } catch {}
    if (!endpoint) await delay(100);
  }
  assert(endpoint, 'No test browser endpoint');
  socket = new WebSocket(endpoint);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map(), errors = [], eventHandlers = new Map();
  socket.addEventListener('message', ({ data }) => {
    const msg = JSON.parse(String(data));
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || JSON.stringify(msg.params.exceptionDetails));
    if (!msg.id) { eventHandlers.get(msg.method)?.(msg.params); return; }
    const p = pending.get(msg.id); pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  await send('Runtime.enable'); await send('Page.enable');
  const results = [];
  const cases = process.env.STREET_QA_CASES ? JSON.parse(process.env.STREET_QA_CASES) : [
    [390, 844, 42], [390, 844, 125], [390, 844, 242], [390, 844, 410],
    [390, 844, 475], [390, 844, 600, 'left'], [390, 844, 850],
    [360, 640, 242], [430, 844, 242],
  ];
  for (const [width, height, position, detour = 'main'] of cases) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true, screenWidth: width, screenHeight: height });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await send('Page.navigate', { url });
    for (let n = 0; n < 80; n++) {
      await delay(150);
      try { if (await evaluate(`(() => { const el = document.querySelector('[data-game-status]'); const c = document.querySelector('canvas'); return !!el && Object.keys(el).some(k => k.startsWith('__reactFiber$')) && !!c && c.getBoundingClientRect().height > 180 && getComputedStyle(el).display === 'grid'; })()`)) break; } catch {}
    }
    for (let n = 0; n < 30; n++) {
      await evaluate(`document.querySelector('input[value="${brand === 'seoul' ? 'mongle' : 'seoul'}"]')?.click()`);
      await delay(100);
      await evaluate(`document.querySelector('input[value="${brand}"]')?.click()`);
      await delay(150);
      await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('배달 출발'))?.click()`);
      await delay(300);
      if (await evaluate(`document.querySelector('[data-game-status]').dataset.gameStatus === 'playing'`)) break;
    }
    assert(await evaluate(`document.querySelector('[data-game-status]').dataset.gameStatus === 'playing'`), `Game did not start: ${JSON.stringify({ errors, state: await evaluate(`({ status: {...document.querySelector('[data-game-status]')?.dataset}, react: Object.keys(document.querySelector('[data-game-status]')).filter(k=>k.startsWith('__react')), buttons: [...document.querySelectorAll('button')].map(b=>({text:b.textContent,disabled:b.disabled})), text: document.body.innerText })`) })}`);
    await evaluate(`(() => {
      const el = document.querySelector('[data-game-status]');
      let fiber = el[Object.keys(el).find(k => k.startsWith('__reactFiber$'))];
      let runtime;
      for (; fiber && !runtime; fiber = fiber.return) {
        for (let hook = fiber.memoizedState; hook; hook = hook.next) {
          const value = hook.memoizedState?.current;
          if (value && typeof value.position === 'number' && 'laneTarget' in value && 'quizPassedStops' in value) { runtime = value; break; }
        }
      }
      if (!runtime) throw new Error('Visual fixture runtime ref not found');
      Object.assign(runtime, { position: ${position}, speed: 0, laneX: 0, laneFromX: 0, laneTarget: 1, detour: '${detour}', driveway: null, collisionId: null });
    })()`);
    await delay(850);
    const state = await evaluate(`(() => { const el = document.querySelector('[data-game-status]'); const canvas = document.querySelector('canvas'); return { position: +el.dataset.position, speed: +el.dataset.speed, lane: +el.dataset.lane, detour: el.dataset.detour, canvas: { width: canvas.width, height: canvas.height }, hiddenJoystick: document.querySelector('[data-joystick]').dataset.active === 'false', webglFailed: document.body.innerText.includes('3D 화면을 표시하지 못했어요') }; })()`);
    assert(state.position === position && state.speed === 0 && state.lane === 1 && !state.webglFailed, `Fixture mismatch: ${JSON.stringify(state)}`);
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const path = `${root}/${phase}-${position}-${detour}-${width}x${height}.png`;
    await writeFile(path, Buffer.from(shot.data, 'base64'));
    results.push({ width, height, ...state, path });
    console.log(`${phase}: exact ${position}m ${detour}, ${width}x${height}`);
  }
  if (process.env.STREET_QA_MODELS === '1') {
    await send('Emulation.setDeviceMetricsOverride', { width:1200, height:780, deviceScaleFactor:1, mobile:false });
    for (const name of ['types','mint']) {
      await send('Page.navigate', { url:pathToFileURL(resolve(root,'models.html')).href + (name === 'mint' ? '#mint' : '') });
      for (let n=0;n<60;n++) { await delay(100); if (await evaluate('window.__architectureReady === true')) break; }
      assert(await evaluate('window.__architectureReady === true'), `Actual model sheet render: ${errors.join('\n')}`);
      await delay(300);
      const shot = await send('Page.captureScreenshot',{format:'png',fromSurface:true});
      await writeFile(`${root}/model-${name}.png`,Buffer.from(shot.data,'base64'));
      // Hash-only navigation otherwise reuses the old document/geometry.
      await send('Page.navigate',{url:'about:blank'}); await delay(100);
    }
  }
  const supplemental = process.env.STREET_QA_OUTDOOR === '1'
    ? await (await import('./qa-delivery-outdoor.mjs')).verifyOutdoor({ send, evaluate, onEvent: (name, handler) => eventHandlers.set(name, handler), root }) : undefined;
  assert(errors.length === 0, errors.join('\n'));
  await writeFile(`${root}/${phase}.json`, JSON.stringify({ protectedSources, results, supplemental }, null, 2));
} finally {
  socket?.close(); chrome.kill(); await delay(300);
  if (resolve(profile).startsWith(resolve(tmpdir()) + sep) && basename(profile).startsWith('delivery-street-qa-')) {
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {});
  }
}

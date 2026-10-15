import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const CHROME = chromeCandidates.find((candidate) => existsSync(candidate));
const GAME_URL = process.env.DELIVERY_GAME_URL || "http://127.0.0.1:3000/games/delivery";
const SCREENSHOT_PATH = process.env.DELIVERY_QA_SCREENSHOT;
const START_SCREENSHOT_PATH = process.env.DELIVERY_QA_START_SCREENSHOT;
const MAP_SCREENSHOT_PATH = process.env.DELIVERY_QA_MAP_SCREENSHOT;
const AD_SCREENSHOT_PATH = process.env.DELIVERY_QA_AD_SCREENSHOT;
const ROUTE_SCREENSHOT_PATH = process.env.DELIVERY_QA_ROUTE_SCREENSHOT;
const DWELL_SCREENSHOT_PATH = process.env.DELIVERY_QA_DWELL_SCREENSHOT;
const SUCCESS_SCREENSHOT_PATH = process.env.DELIVERY_QA_SUCCESS_SCREENSHOT;
const DRIVEWAY_SCREENSHOT_PATH = process.env.DELIVERY_QA_DRIVEWAY_SCREENSHOT;
const QUIZ_SCREENSHOT_PATH = process.env.DELIVERY_QA_QUIZ_SCREENSHOT;
const PURCHASE_SCREENSHOT_PATH = process.env.DELIVERY_QA_PURCHASE_SCREENSHOT;
const PREVIEW_SCREENSHOT_PATH = process.env.DELIVERY_QA_PREVIEW_SCREENSHOT;
const RESULT_PATH = process.env.DELIVERY_QA_RESULT;
const SELECTED_BRAND = process.env.DELIVERY_QA_BRAND || "mongle";
const ROAD_CLOSURE_DISTANCE = 570;
const STREET_ONLY = process.env.DELIVERY_QA_STREET_ONLY === "1";
const LANDMARKS_ONLY = process.env.DELIVERY_QA_LANDMARKS_ONLY === "1";
const VISUAL_ONLY = process.env.DELIVERY_QA_VISUAL_ONLY === "1" || STREET_ONLY || LANDMARKS_ONLY;
const ZONE_ONLY = process.env.DELIVERY_QA_ZONE_ONLY === "1";
if (!CHROME) throw new Error("Chrome or Edge was not found. Set CHROME_PATH to run delivery QA.");

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function getAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForPage(port) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      const pages = await response.json();
      const page = pages.find((candidate) => candidate.type === "page");
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      // Chrome can take a moment to expose its DevTools endpoint.
    }
    await delay(100);
  }
  throw new Error("Chrome DevTools endpoint did not become ready");
}

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.errors = [];
    this.socket = new WebSocket(url);
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.method === "Runtime.exceptionThrown") this.errors.push(message.params.exceptionDetails.text);
      if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") this.errors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(" "));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }

  close() {
    this.socket.close();
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const readGameState = (cdp) => cdp.evaluate(`(() => {
  const game = document.querySelector('[data-game-status]');
  return {
    status: game?.dataset.gameStatus,
    brand: game?.dataset.deliveryBrand,
    quizPassed: Number(game?.dataset.quizPassed || 0),
    position: Number(game?.dataset.position || 0),
    speed: Number(game?.dataset.speed || 0),
    lane: Number(game?.dataset.lane || 1),
    collisionCount: Number(game?.dataset.collisionCount || 0),
    slowdownActive: game?.dataset.slowdownActive === "true",
    stopIndex: Number(game?.dataset.stopIndex || 0),
    stopDwell: Number(game?.dataset.stopDwell || 0),
    deliveryPulse: Number(game?.dataset.deliveryPulse || 0),
    successRemaining: Number(game?.dataset.deliverySuccessRemaining || 0),
    deliveryPhase: document.querySelector('[data-delivery-phase]')?.dataset.deliveryPhase || null,
    drivewayIndex: Number(game?.dataset.drivewayIndex ?? -1),
    drivewayProgress: Number(game?.dataset.drivewayProgress || 0),
    drivewayLength: Number(game?.dataset.drivewayLength || 0),
    detour: game?.dataset.detour || "main",
    closureReached: game?.dataset.closureReached === "true",
    webglFallback: document.body.innerText.includes('3D 화면을 표시하지 못했어요'),
  };
})()`);

async function waitForGame(cdp) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if (await cdp.evaluate(`(() => {
        const frame = document.querySelector('[aria-label="몽글몽글 3D 자전거 배달 게임"]');
        const canvas = document.querySelector('canvas');
        return Boolean(frame && canvas && getComputedStyle(frame).display === 'grid'
          && frame.getBoundingClientRect().height <= innerHeight + 2
          && canvas.getBoundingClientRect().height > 180);
      })()`)) return;
    } catch {
      // Ignore the short execution-context gap while a reload completes.
    }
    await delay(200);
  }
  throw new Error("Delivery game did not become ready after reload");
}

async function startDeliveryGame(cdp, brand = SELECTED_BRAND) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await cdp.evaluate(`document.querySelector('input[name="delivery-brand"][value="${brand}"]')?.click()`);
    await delay(100);
    await cdp.evaluate(`([...document.querySelectorAll('button')].find((button) => button.textContent.includes('배달 출발')))?.click()`);
    await delay(300);
    if ((await readGameState(cdp)).status === "playing") return;
  }
  throw new Error("Start button did not enter the playing state after hydration");
}

// Trusted browser touch input exercises capture, cancellation and hit testing;
// no game state injection or synthetic drive-button events.
let joystickContact = null;
const joystickBounds = cdp => cdp.evaluate(`(() => {
  const pad = document.querySelector('[data-joystick]');
  const r = pad.getBoundingClientRect();
  const visual = pad.querySelector('[data-joystick-visual]');
  const v = visual.getBoundingClientRect();
  const active = pad.dataset.active === 'true';
  return { x: active ? v.left + v.width / 2 : r.left + r.width * .72,
    y: active ? v.top + v.height / 2 : r.top + r.height * .78,
    left: r.left, top: r.top, width: r.width, height: r.height,
    travel: v.width * .30, active, disabled: pad.disabled,
    visible: getComputedStyle(visual).visibility === 'visible' };
})()`);
const touchPoint = contact => ({ id: contact.id, x: contact.bounds.x + contact.x * contact.bounds.travel, y: contact.bounds.y + contact.y * contact.bounds.travel, radiusX: 7, radiusY: 7, force: 1 });
async function joystickTouch(cdp, type, x = 0, y = 0, id = 101, origin = null) {
  if (type === "touchStart") {
    if (joystickContact) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const bounds = await joystickBounds(cdp);
    if (origin) { bounds.x = bounds.left + bounds.width * origin.x; bounds.y = bounds.top + bounds.height * origin.y; }
    joystickContact = { id, bounds, x: 0, y: 0 };
    await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: [touchPoint(joystickContact)] });
    // A floating joystick starts neutral wherever touched, then needs a drag.
    if (x || y) await joystickTouch(cdp, "touchMove", x, y);
    return;
  } else if (type === "touchMove") {
    if (!joystickContact) throw new Error("Joystick move without a touch");
    joystickContact.x = x; joystickContact.y = y;
  }
  const ending = type === "touchEnd" || type === "touchCancel";
  await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: ending ? [] : [touchPoint(joystickContact)] });
  if (ending) joystickContact = null;
}
async function pointerEvent(cdp, label, type, pointerId) {
  if (type === "pointerdown") await joystickTouch(cdp, "touchStart", 0, label.includes("후진") ? .95 : -.95, pointerId);
  else await joystickTouch(cdp, type === "pointercancel" ? "touchCancel" : "touchEnd");
}
async function laneGesture(cdp, direction) {
  const active = joystickContact && (await joystickBounds(cdp)).active;
  const y = active ? joystickContact.y : 0;
  if (!active) await joystickTouch(cdp, "touchStart", 0, 0, 990);
  await joystickTouch(cdp, "touchMove", 0, y);
  await joystickTouch(cdp, "touchMove", direction * .95, y);
  await joystickTouch(cdp, "touchMove", 0, y);
  if (!active) await joystickTouch(cdp, "touchEnd");
}

const profile = await mkdtemp(join(tmpdir(), "delivery-3d-qa-"));
const port = await getAvailablePort();
const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "--window-size=430,844",
  GAME_URL,
], { stdio: "ignore", windowsHide: true });

let cdp;
const results = { responsive: [], movement: {}, completion: {}, quizzes: [] };

try {
  const page = await waitForPage(port);
  cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  for (const [width, height] of [[360, 844], [390, 844], [430, 844], [360, 640], [1280, 900]]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600,
      screenWidth: width,
      screenHeight: height,
    });
    await cdp.send("Page.reload", { ignoreCache: true });
    await waitForGame(cdp);
    const layout = await cdp.evaluate(`(() => {
      const frame = document.querySelector('[aria-label="몽글몽글 3D 자전거 배달 게임"]')?.getBoundingClientRect();
      const start = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('배달 출발'))?.getBoundingClientRect();
      const canvas = document.querySelector('canvas')?.getBoundingClientRect();
      return {
        width: innerWidth,
        height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        frame: frame && { left: frame.left, right: frame.right, top: frame.top, bottom: frame.bottom },
        start: start && { left: start.left, right: start.right, top: start.top, bottom: start.bottom },
        canvas: canvas && { width: canvas.width, height: canvas.height },
      copy: document.body.innerText.includes('세 집에 들러 배달해요'),
      brandCount: document.querySelectorAll('input[name="delivery-brand"]').length,
      disabledBeforeSelection: [...document.querySelectorAll('button')].find(button => button.textContent.includes('배달 출발'))?.disabled,
      cardOverflow: (() => { const card = document.querySelector('fieldset')?.closest('article'); return card ? card.scrollHeight - card.clientHeight : -1; })(),
      };
    })()`);
    assert(layout.width === width, `${width}px viewport was not applied`);
    assert(layout.scrollWidth <= width, `${width}px layout has horizontal overflow`);
    assert(layout.scrollHeight <= height, `${width}x${height} layout has vertical page overflow: ${JSON.stringify(layout)}`);
    assert(layout.frame?.left >= 0 && layout.frame?.right <= width, `${width}px game frame is clipped`);
    assert(layout.start?.top >= 0 && layout.start?.bottom <= height, `${width}x${height} start button is outside viewport`);
    assert(layout.canvas?.width > 0 && layout.canvas?.height > 180, `${width}px 3D canvas is not visible`);
    assert(layout.copy, `${width}px hold-control guidance is missing`);
    assert(layout.brandCount === 3 && layout.disabledBeforeSelection, "Brand must be selected before starting");
    assert(layout.cardOverflow <= 1, `Start card requires scrolling at ${width}x${height}: ${layout.cardOverflow}`);
    results.responsive.push(layout);
  }

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
  });
  await cdp.send("Page.reload", { ignoreCache: true });
  await waitForGame(cdp);
  for (const id of ["mongle", "seoul", "delicious"]) {
    await cdp.evaluate(`document.querySelector('input[name="delivery-brand"][value="${id}"]').click()`);
    await delay(500);
    assert((await readGameState(cdp)).brand === id, `Brand selection did not propagate: ${id}`);
    const loaded = await cdp.evaluate(`([...document.querySelectorAll('fieldset img')].every(img => img.complete && img.naturalWidth > 0))`);
    assert(loaded, `Brand artwork did not load after selecting ${id}`);
  }
  await cdp.evaluate(`document.querySelector('input[name="delivery-brand"][value="${SELECTED_BRAND}"]').click()`);
  if (START_SCREENSHOT_PATH) {
    await delay(800);
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(START_SCREENSHOT_PATH, Buffer.from(screenshot.data, "base64"));
  }
  await startDeliveryGame(cdp);
  const started = await readGameState(cdp);
  assert(started.status === "playing" && !started.webglFallback, `3D game did not enter playing state: ${JSON.stringify(started)}`);
  assert(started.lane === 1, "Bicycle did not start in the center lane");
  assert(started.brand === SELECTED_BRAND, "Playing brand differs from selected brand");

  // The running HUD is only navigation; all control helper copy is gone.
  results.cleanUi = [];
  for (const [width, height] of [[360, 844], [430, 844], [360, 640], [1280, 900], [390, 844]]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600, screenWidth: width, screenHeight: height });
    await delay(200);
    const compact = await cdp.evaluate(`(() => {
      const header = document.querySelector('[data-navigation-hud]');
      const pad = document.querySelector('[data-joystick]');
      const controls = pad.parentElement;
      const scene = document.querySelector('canvas').getBoundingClientRect();
      const frame = document.querySelector('[data-game-status]').getBoundingClientRect();
      const texts = [...header.querySelectorAll('[data-navigation-instruction], [data-navigation-destination]')];
      return {
        headerHeight: header.getBoundingClientRect().height,
        controlText: pad.innerText.replace(/\\s/g, ''),
        joystickCount: controls.querySelectorAll('[data-joystick]').length,
        controlBounds: (() => { const r = pad.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; })(),
        helperCount: controls.querySelectorAll('small, p').length,
        joystickHidden: getComputedStyle(pad.querySelector('[data-joystick-visual]')).visibility === 'hidden',
        textClipped: texts.some(el => el.scrollWidth > el.clientWidth),
        sceneShare: scene.height / frame.height,
        sceneTop: scene.top,
        hudBottom: header.getBoundingClientRect().bottom,
        sceneFeedback: document.querySelector('[aria-label="3D 배달 동네"] [data-delivery-phase]') !== null,
        touchTargets: [...document.querySelectorAll('[data-joystick], [aria-label="게임 일시정지"]')].map(button => { const r = button.getBoundingClientRect(); return { width: r.width, height: r.height }; }),
      };
    })()`);
    assert(compact.controlText === "" && compact.helperCount === 0 && compact.joystickCount === 1 && compact.joystickHidden, `Idle joystick/helper copy remains visible: ${JSON.stringify(compact)}`);
    assert(compact.headerHeight <= 90 && compact.sceneShare > .85, `HUD is not compact at ${width}x${height}: ${JSON.stringify(compact)}`);
    assert(compact.controlBounds.left >= 0 && compact.controlBounds.right <= width && compact.controlBounds.bottom <= height && Math.abs(compact.controlBounds.top - compact.sceneTop) < 1, "Joystick input surface does not match the scene or overlaps the HUD");
    assert(!compact.textClipped && !compact.sceneFeedback && compact.hudBottom <= compact.sceneTop, "Navigation clips or overlays the road");
    assert(compact.touchTargets.every(rect => rect.width >= 44 && rect.height >= 44), "A touch target became too small");
    if (process.env.DELIVERY_QA_CLEAN_UI === "1") {
      const shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      await writeFile(`test-artifacts/delivery-clean-ui-${width}x${height}.png`, Buffer.from(shot.data, "base64"));
    }
    results.cleanUi.push({ width, height, ...compact });
  }

  if (!VISUAL_ONLY) {
    // A gesture must START on the scene. Dragging in from the HUD is ignored.
    const hudPoint = await cdp.evaluate(`(() => { const r = document.querySelector('[data-navigation-hud]').getBoundingClientRect(); return { x: r.left + 30, y: r.top + 28 }; })()`);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 900, ...hudPoint }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 900, x: hudPoint.x, y: hudPoint.y + 180 }] });
    await delay(250);
    assert(!(await joystickBounds(cdp)).active && (await readGameState(cdp)).position === 0, "A touch starting in the HUD activated driving");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    // Each touch chooses a new centre, including the upper scene and edges.
    for (const origin of [{ x: .18, y: .24 }, { x: .75, y: .72 }, { x: .5, y: .48 }, { x: .03, y: .95 }]) {
      await joystickTouch(cdp, "touchStart", 0, 0, 904, origin);
      const pad = await joystickBounds(cdp);
      assert(pad.active && pad.visible && Math.abs(pad.x - joystickContact.bounds.x) < 2 && Math.abs(pad.y - joystickContact.bounds.y) < 2, "Floating joystick did not appear at the initial finger position");
      await delay(150);
      assert((await readGameState(cdp)).speed === 0, "Touch-down or an edge touch caused unintended driving");
      await joystickTouch(cdp, "touchMove", 0, -5);
      await delay(400);
      assert((await readGameState(cdp)).speed > 0 && (await joystickBounds(cdp)).active, "Dragging well outside the ring cancelled forward input");
      const thumbClamped = await cdp.evaluate(`(() => { const base = document.querySelector('[data-joystick-visual]').getBoundingClientRect(); const thumb = document.querySelector('[data-joystick-visual]').lastElementChild.getBoundingClientRect(); return Math.hypot(thumb.left + thumb.width / 2 - base.left - base.width / 2, thumb.top + thumb.height / 2 - base.top - base.height / 2) <= base.width * .31; })()`);
      assert(thumbClamped, "A long drag let the visual thumb escape its ring");
      if (origin.x === .18 && process.env.DELIVERY_QA_CLEAN_UI === "1") {
        const shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
        await writeFile("test-artifacts/floating-joystick-upper-left.png", Buffer.from(shot.data, "base64"));
      }
      await joystickTouch(cdp, "touchEnd");
      await delay(900);
      assert((await readGameState(cdp)).speed === 0 && !(await joystickBounds(cdp)).visible, "Releasing did not stop and hide the floating joystick");
    }
    // A second finger can still tap the HUD pause button while driving.
    await joystickTouch(cdp, "touchStart", 0, -.95, 906);
    await delay(250);
    const pausePoint = await cdp.evaluate(`(() => { const r = document.querySelector('[aria-label="게임 일시정지"]').getBoundingClientRect(); return { id: 907, x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touchPoint(joystickContact), pausePoint] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [pausePoint] });
    await delay(250);
    assert((await joystickBounds(cdp)).disabled && !(await joystickBounds(cdp)).active && (await readGameState(cdp)).speed === 0, "A second-finger pause tap was intercepted or left driving active");
    await joystickTouch(cdp, "touchMove", 0, -.95);
    assert(!(await joystickBounds(cdp)).active, "A held finger restarted input after pausing");
    await joystickTouch(cdp, "touchEnd");
    // Paused scene touches cannot start driving or show a joystick.
    await joystickTouch(cdp, "touchStart", 0, -.95, 905, { x: .08, y: .85 });
    await delay(200);
    assert(!(await joystickBounds(cdp)).active && (await readGameState(cdp)).speed === 0, "Pause overlay allowed a new gesture");
    await joystickTouch(cdp, "touchEnd");
    await cdp.evaluate(`([...document.querySelectorAll('button')].find(button => button.textContent.includes('처음으로'))).click()`);
    await startDeliveryGame(cdp);

    await joystickTouch(cdp, "touchStart", 0, 0, 901);
    await joystickTouch(cdp, "touchMove", .12, -.12);
    await delay(300);
    assert((await readGameState(cdp)).position === 0, "Joystick centre/dead zone started driving");
    await joystickTouch(cdp, "touchMove", 0, -.95);
    await delay(600);
    const touchForward = await readGameState(cdp);
    assert(touchForward.speed > 0 && touchForward.position > 0, "Real touch drag did not start forward input");
    await joystickTouch(cdp, "touchMove", .95, -.95);
    for (let n = 0; n < 8; n++) {
      await joystickTouch(cdp, "touchMove", n % 2 ? .9 : .95, -.95);
      await delay(60);
    }
    assert((await readGameState(cdp)).lane === 2, "Diagonal gesture did not move one lane");
    await joystickTouch(cdp, "touchMove", 0, -.95);
    await joystickTouch(cdp, "touchMove", -.95, -.95);
    await delay(600);
    assert((await readGameState(cdp)).lane === 1, "Holding left repeated beyond the adjacent centre lane");
    const firstPoint = touchPoint(joystickContact);
    const bounds = await joystickBounds(cdp);
    const secondPoint = { id: 902, x: bounds.x, y: bounds.y + bounds.travel, radiusX: 7, radiusY: 7, force: 1 };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [firstPoint, secondPoint] });
    await delay(250);
    assert((await readGameState(cdp)).speed > 0, "A second finger hijacked the joystick direction");
    // CDP touchEnd names the contact being lifted, not the remaining contact.
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [secondPoint] });
    assert((await joystickBounds(cdp)).active, "Releasing another finger released the active thumb");
    await joystickTouch(cdp, "touchEnd");
    await delay(1_900);
    assert((await readGameState(cdp)).speed === 0 && !(await joystickBounds(cdp)).active, "Joystick release did not settle to neutral");

    // A still-held finger cannot resume after a reset, even if it moves back.
    for (const reason of ["blur", "capture", "resize"]) {
      await cdp.evaluate(`document.querySelector('[data-joystick]').addEventListener('pointerdown', event => { window.__deliveryQaPointerId = event.pointerId; }, { once: true })`);
      await joystickTouch(cdp, "touchStart", 0, -.95, 903);
      await delay(250);
      if (reason === "blur") await cdp.evaluate(`window.dispatchEvent(new Event('blur'))`);
      if (reason === "capture") {
        await cdp.evaluate(`document.querySelector('[data-joystick]').releasePointerCapture(window.__deliveryQaPointerId)`);
        await joystickTouch(cdp, "touchMove", 0, -.9);
      }
      if (reason === "resize") await cdp.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 360, screenHeight: 844 });
      await delay(700);
      await joystickTouch(cdp, "touchMove", 0, -.95);
      await delay(300);
      const resetBounds = await joystickBounds(cdp), resetState = await readGameState(cdp);
      assert(!resetBounds.active && resetState.speed === 0, `${reason} reset left stale joystick input: ${JSON.stringify({ resetBounds, resetState })}`);
      await joystickTouch(cdp, "touchEnd");
      if (reason === "resize") await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    }
    // Mouse dragging uses the same capture path as touch; right clicks do not.
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 1280, screenHeight: 900 });
    // A fresh desktop page avoids mixing Chrome's emulated touch pointer map
    // with mouse pointers created after switching emulation mid-document.
    await cdp.send("Page.reload", { ignoreCache: true });
    await waitForGame(cdp);
    await startDeliveryGame(cdp);
    const mousePad = await joystickBounds(cdp);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mousePad.x, y: mousePad.y, button: "none", buttons: 0 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: mousePad.x, y: mousePad.y, button: "left", buttons: 1, clickCount: 1 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mousePad.x, y: mousePad.y - mousePad.travel, button: "left", buttons: 1 });
    await delay(400);
    assert((await readGameState(cdp)).speed > 0, "Mouse drag did not drive");
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: mousePad.x, y: mousePad.y - mousePad.travel, button: "left", buttons: 0, clickCount: 1 });
    await delay(900);
    assert((await readGameState(cdp)).speed === 0, "Mouse release stuck");
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    results.joystick = { trustedTouch: true, floatingOrigins: true, hudExcluded: true, secondFingerPause: true, pausedTouchesIgnored: true, outsideRingHeld: true, visualThumbClamped: true, hiddenOnRelease: true, deadZone: true, singleLaneLatch: true, diagonalDrive: true, secondFingerIgnored: true, release: true, cancelOnBlurCaptureResize: true, mouseDrag: true };
    console.log("Floating joystick origins, HUD exclusion, long drags, diagonal steering, second-finger isolation, cancellation and mouse dragging verified");
    await cdp.evaluate(`document.querySelector('[aria-label="게임 일시정지"]').click()`);
    await cdp.evaluate(`([...document.querySelectorAll('button')].find(button => button.textContent.includes('처음으로'))).click()`);
    await startDeliveryGame(cdp);
  }

  await pointerEvent(cdp, "누르고 있는 동안 전진", "pointerdown", 601);
  await laneGesture(cdp, -1);
  await delay(500);
  const multitouchLane = await readGameState(cdp);
  assert(multitouchLane.lane === 0 && multitouchLane.position > 0, "Lane change did not work while forward was held");
  await pointerEvent(cdp, "누르고 있는 동안 전진", "pointerup", 601);
  await laneGesture(cdp, 1);
  await laneGesture(cdp, 1);
  await laneGesture(cdp, 1);
  const rightEdge = await readGameState(cdp);
  assert(rightEdge.lane === 2, "Rapid lane changes moved outside the right lane");
  if (process.env.DELIVERY_QA_CLEAN_UI === "1") {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 640, deviceScaleFactor: 1, mobile: true, screenWidth: 360, screenHeight: 640 });
    await delay(600);
    const shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile("test-artifacts/joystick-right-lane-360x640.png", Buffer.from(shot.data, "base64"));
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    await delay(200);
  }
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37, autoRepeat: true });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 });
  const keyboardLane = await readGameState(cdp);
  assert(keyboardLane.lane === 1, "ArrowLeft auto-repeat skipped more than one lane");

  await pointerEvent(cdp, "누르고 있는 동안 전진", "pointerdown", 101);
  await delay(1_500);
  const forward = await readGameState(cdp);
  assert(forward.position > 2 && forward.speed > 0, "Touch hold did not move the bicycle forward");

  if (SCREENSHOT_PATH) {
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(SCREENSHOT_PATH, Buffer.from(screenshot.data, "base64"));
  }

  if (VISUAL_ONLY && AD_SCREENSHOT_PATH) {
    await delay(2_100);
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(AD_SCREENSHOT_PATH, Buffer.from(screenshot.data, "base64"));
  }

  if (STREET_ONLY || LANDMARKS_ONLY) {
    await pointerEvent(cdp, "누르고 있는 동안 전진", "pointerup", 101);
    await delay(1_900);
    results.street = [];
    const targets = LANDMARKS_ONLY ? [42, 55, 77, 242, 258, 280, 470, 680, 698, 718, 850, 867, 890] : [42, 92, 147, 202, 247, 302, 402, 452];
    for (const target of targets) {
      if (LANDMARKS_ONLY && target === 680) {
        await laneGesture(cdp, -1);
        await delay(350);
      }
      if (LANDMARKS_ONLY && target === 698) {
        await laneGesture(cdp, 1);
        await delay(350);
      }
      await pointerEvent(cdp, "누르고 있는 동안 전진", "pointerdown", 950);
      let state = await readGameState(cdp);
      for (let step = 0; step < 600; step++) {
        state = await readGameState(cdp);
        const brakingDistance = state.speed * state.speed / 26;
        if (state.position + brakingDistance >= target) break;
        await delay(60);
      }
      await pointerEvent(cdp, "누르고 있는 동안 전진", "pointerup", 950);
      await delay(1_800);
      state = await readGameState(cdp);
      assert(state.status === "playing" && !state.webglFallback && Math.abs(state.position - target) < 4, `Could not inspect street at ${target}: ${JSON.stringify(state)}`);
      const viewports = LANDMARKS_ONLY ? [[360, 844], [390, 844], [430, 844], [360, 640]] : [[360, 844], [390, 844], [430, 844]];
      for (const [width, height] of viewports) {
        await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true, screenWidth: width, screenHeight: height });
        await delay(300);
        const shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
        const name = LANDMARKS_ONLY ? `landmark-${target}-${width}x${height}` : `street-${target}-${width}`;
        await writeFile(`test-artifacts/delivery-${name}.png`, Buffer.from(shot.data, "base64"));
      }
      console.log(`Street scene verified at ${state.position}m (360 / 390 / 430px)`);
      results.street.push(state);
    }
  }

  if (!VISUAL_ONLY) {

  if (!ZONE_ONLY) {

  await pointerEvent(cdp, "누르고 있는 동안 전진", "pointerup", 101);
  await delay(1_700);
  const stopped = await readGameState(cdp);
  assert(Math.abs(stopped.speed) < 0.08, "Bicycle did not decelerate to a stop after release");

  await pointerEvent(cdp, "누르고 있는 동안 후진", "pointerdown", 102);
  await delay(1_250);
  const reverse = await readGameState(cdp);
  assert(reverse.position < stopped.position && reverse.position >= 0, "Reverse did not reduce route progress");
  assert(reverse.speed < 0 && Math.abs(reverse.speed) <= 8.1, "Reverse speed is invalid");
  await pointerEvent(cdp, "누르고 있는 동안 후진", "pointerup", 102);
  await delay(900);

  const beforeBoth = await readGameState(cdp);
  await pointerEvent(cdp, "누르고 있는 동안 전진", "pointerdown", 201);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 });
  await delay(650);
  const both = await readGameState(cdp);
  assert(Math.abs(both.position - beforeBoth.position) < 0.35 && Math.abs(both.speed) < 0.08, "Simultaneous directions did not stop");
  await pointerEvent(cdp, "누르고 있는 동안 전진", "pointerup", 201);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 });

  await pointerEvent(cdp, "누르고 있는 동안 전진", "pointerdown", 301);
  await delay(500);
  await pointerEvent(cdp, "누르고 있는 동안 전진", "pointercancel", 301);
  await delay(1_100);
  const cancelled = await readGameState(cdp);
  assert(Math.abs(cancelled.speed) < 0.08, "Cancelled touch input kept moving");

  const beforeKeyboard = await readGameState(cdp);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 });
  await delay(850);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 });
  await delay(900);
  const afterKeyboard = await readGameState(cdp);
  assert(afterKeyboard.position > beforeKeyboard.position, "ArrowUp did not move forward");

  await pointerEvent(cdp, "누르고 있는 동안 전진", "pointerdown", 401);
  await delay(550);
  await cdp.evaluate(`document.querySelector('[aria-label="게임 일시정지"]').click()`);
  await delay(250);
  const pausedAt = await readGameState(cdp);
  await delay(1_000);
  const pausedAfter = await readGameState(cdp);
  assert(pausedAt.position === pausedAfter.position, "Position changed while paused");
  await cdp.evaluate(`([...document.querySelectorAll('button')].find((button) => button.textContent.includes('계속 배달하기'))).click()`);
  await delay(700);
  const resumed = await readGameState(cdp);
  assert(resumed.position === pausedAfter.position && Math.abs(resumed.speed) < 0.08, "Input was not cleared after pause");

  await laneGesture(cdp, -1);
  await pointerEvent(cdp, "누르고 있는 동안 전진", "pointerdown", 701);
  let collided = await readGameState(cdp);
  for (let attempt = 0; attempt < 120 && collided.collisionCount === 0; attempt += 1) {
    await delay(100);
    collided = await readGameState(cdp);
  }
  assert(collided.collisionCount === 1 && collided.position > 140, `Stationary cone obstacle did not collide in its lane: ${JSON.stringify(collided)}`);
  assert(collided.slowdownActive, "Collision did not apply the temporary slowdown");
  await delay(2_500);
  const passedObstacle = await readGameState(cdp);
  assert(passedObstacle.collisionCount === 1 && passedObstacle.position > collided.position, "Bicycle was trapped or collision repeated on one obstacle");
  await pointerEvent(cdp, "누르고 있는 동안 전진", "pointerup", 701);
  await delay(1_000);

  results.movement = { started, multitouchLane, rightEdge, keyboardLane, forward, stopped, reverse, both, cancelled, beforeKeyboard, afterKeyboard, pausedAt, pausedAfter, resumed, collided, passedObstacle };

  await cdp.evaluate(`document.querySelector('[aria-label="게임 일시정지"]').click()`);
  await cdp.evaluate(`([...document.querySelectorAll('button')].find((button) => button.textContent.includes('처음으로'))).click()`);
  await delay(200);
  await startDeliveryGame(cdp);
  await pointerEvent(cdp, "누르고 있는 동안 전진", "pointerdown", 708);
  let earlyApproach = await readGameState(cdp);
  for (let attempt = 0; attempt < 300 && earlyApproach.position < 50; attempt += 1) {
    await delay(100);
    earlyApproach = await readGameState(cdp);
  }
  if (AD_SCREENSHOT_PATH) {
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(AD_SCREENSHOT_PATH, Buffer.from(screenshot.data, "base64"));
  }
  for (let attempt = 0; attempt < 300 && earlyApproach.position < 480; attempt += 1) {
    await delay(100);
    earlyApproach = await readGameState(cdp);
  }
  assert(earlyApproach.position >= 475 && earlyApproach.position < 495 && !earlyApproach.closureReached, `Could not reach the fork approach: ${JSON.stringify(earlyApproach)}`);
  assert(earlyApproach.stopIndex === 0 && earlyApproach.deliveryPulse === 0, "Passing through a delivery zone without stopping counted as a delivery");
  const controlHeightBefore = await cdp.evaluate(`document.querySelector('[data-joystick]').getBoundingClientRect().height`);
  const extraChoiceVisible = await cdp.evaluate(`Boolean(document.querySelector('[data-route-choice-visible]'))`);
  assert(!extraChoiceVisible, "A new bottom choice panel appeared at the fork");
  if (ROUTE_SCREENSHOT_PATH) {
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(ROUTE_SCREENSHOT_PATH, Buffer.from(screenshot.data, "base64"));
  }
  await laneGesture(cdp, 1);
  await delay(350);
  const earlyChoice = await readGameState(cdp);
  assert(earlyChoice.detour === "right" && earlyChoice.speed > 0 && earlyChoice.lane === 2, `Lane button did not steer into the right fork: ${JSON.stringify(earlyChoice)}`);
  let passedClosureEarly = earlyChoice;
  for (let attempt = 0; attempt < 300 && passedClosureEarly.position < ROAD_CLOSURE_DISTANCE + 10; attempt += 1) {
    await delay(100);
    passedClosureEarly = await readGameState(cdp);
  }
  await pointerEvent(cdp, "누르고 있는 동안 전진", "pointerup", 708);
  assert(passedClosureEarly.position > ROAD_CLOSURE_DISTANCE && !passedClosureEarly.closureReached && passedClosureEarly.detour === "right", `Early choice did not bypass the blocked main road: ${JSON.stringify(passedClosureEarly)}`);
  const controlHeightAfter = await cdp.evaluate(`document.querySelector('[data-joystick]').getBoundingClientRect().height`);
  assert(Math.abs(controlHeightAfter - controlHeightBefore) < 2, `Joystick surface changed size near the fork: ${controlHeightBefore} to ${controlHeightAfter}`);
  results.movement.earlyDetour = { earlyApproach, earlyChoice, passedClosureEarly };
  }

  await cdp.evaluate(`document.querySelector('[aria-label="게임 일시정지"]').click()`);
  await cdp.evaluate(`([...document.querySelectorAll('button')].find((button) => button.textContent.includes('처음으로'))).click()`);
  await delay(200);
  await startDeliveryGame(cdp);

  let dwellVerified = false;
  const verifyCampaignLayout = async (selector) => {
    const layouts = [];
    for (const [width, height] of [[360, 640], [430, 844], [1280, 900], [390, 844]]) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600, screenWidth: width, screenHeight: height });
      await delay(150);
      const layout = await cdp.evaluate(`(() => {
        const card = document.querySelector('${selector}'); const rect = card.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, overflow: card.scrollHeight - card.clientHeight };
      })()`);
      assert(layout.left >= 0 && layout.right <= width && layout.top >= 0 && layout.bottom <= height && layout.overflow <= 1, `Campaign card clips/scrolls at ${width}x${height}: ${JSON.stringify(layout)}`);
      layouts.push({ width, height, ...layout });
    }
    return layouts;
  };
  const answerQuiz = async (houseIndex) => {
    const before = await readGameState(cdp);
    assert(before.status === "quiz" && before.stopIndex === houseIndex && before.quizPassed === houseIndex, `Quiz missing at house ${houseIndex + 1}: ${JSON.stringify(before)}`);
    await joystickTouch(cdp, "touchStart", 0, -.95, 909, { x: .04, y: .88 });
    await delay(150);
    assert((await joystickBounds(cdp)).disabled && !(await joystickBounds(cdp)).active, "Quiz overlay permitted joystick input");
    await joystickTouch(cdp, "touchEnd");
    const wrong = ["mongle", "seoul", "delicious"].find(id => id !== SELECTED_BRAND);
    await cdp.evaluate(`document.querySelector('[data-quiz-answer="${wrong}"]').click()`);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 });
    await delay(400);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 });
    const retry = await readGameState(cdp);
    assert(retry.status === "quiz" && retry.stopIndex === before.stopIndex && retry.quizPassed === before.quizPassed && retry.position === before.position && retry.drivewayProgress === before.drivewayProgress, "Wrong answer or keyboard input advanced a frozen quiz");
    const layouts = await verifyCampaignLayout('[data-brand-quiz]');
    if (houseIndex === 0 && QUIZ_SCREENSHOT_PATH) {
      const shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      await writeFile(QUIZ_SCREENSHOT_PATH, Buffer.from(shot.data, "base64"));
    }
    await cdp.evaluate(`(() => { const answer = document.querySelector('[data-quiz-answer="${SELECTED_BRAND}"]'); answer.click(); answer.click(); })()`);
    await delay(100);
    const correct = await readGameState(cdp);
    assert(correct.status === "playing" && correct.quizPassed === houseIndex + 1 && correct.stopIndex === houseIndex, `Correct answer did not resume delivery exactly once: ${JSON.stringify(correct)}`);
    results.quizzes.push({ before, retry, correct, layouts });
  };
  // Stopping on the original road next to a house must no longer deliver it.
  await pointerEvent(cdp, "누르고 있는 동안 전진", "pointerdown", 880);
  let roadside = await readGameState(cdp);
  for (let step = 0; step < 180 && roadside.position < 175; step += 1) {
    await delay(100); roadside = await readGameState(cdp);
  }
  await pointerEvent(cdp, "누르고 있는 동안 전진", "pointerup", 880);
  await delay(3_500);
  roadside = await readGameState(cdp);
  assert(Math.abs(roadside.position - 190) < 7 && roadside.stopIndex === 0 && roadside.stopDwell === 0 && roadside.drivewayIndex === -1, `Roadside stop incorrectly delivered: ${JSON.stringify(roadside)}`);
  await pointerEvent(cdp, "누르고 있는 동안 후진", "pointerdown", 881);
  for (let step = 0; step < 80 && roadside.position > 182; step += 1) {
    await delay(100); roadside = await readGameState(cdp);
  }
  await pointerEvent(cdp, "누르고 있는 동안 후진", "pointerup", 881);
  await delay(900);
  console.log("Main-road stopping does not deliver; returned to driveway entrance");
  const leaveDriveway = async () => {
    const before = await readGameState(cdp);
    if (before.drivewayIndex < 0) return;
    await pointerEvent(cdp, "누르고 있는 동안 후진", "pointerdown", 890);
    let after = before;
    for (let step = 0; step < 150 && after.drivewayIndex >= 0; step += 1) {
      await delay(100);
      after = await readGameState(cdp);
    }
    await delay(500);
    await pointerEvent(cdp, "누르고 있는 동안 후진", "pointerup", 890);
    await delay(900);
    after = await readGameState(cdp);
    assert(after.drivewayIndex === -1 && after.position < before.position && after.stopIndex === before.stopIndex, `Driveway reverse return failed: ${JSON.stringify(after)}`);
    console.log(`Returned to road after house ${before.drivewayIndex + 1}`);
  };
  const stopAt = async (distance, pointerId) => {
    await leaveDriveway();
    const houseIndex = [190, 390, 820].indexOf(distance);
    const targetLane = houseIndex === 1 ? 2 : houseIndex >= 0 ? 0 : 1;
    for (let laneStep = 0; laneStep < 3; laneStep += 1) {
      const state = await readGameState(cdp);
      if (state.lane === targetLane) break;
      await laneGesture(cdp, state.lane > targetLane ? -1 : 1);
      await delay(300);
    }
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const current = await readGameState(cdp);
      const signedDelta = distance - current.position;
      const direction = signedDelta >= 0 ? "누르고 있는 동안 전진" : "누르고 있는 동안 후진";
      const delta = Math.abs(signedDelta);
      const holdSeconds = delta < 40
        ? Math.sqrt(Math.max(0.1, delta) / 6.46)
        : direction.includes("전진") ? 2.5 + (delta - 40) / 20 : 1 + (delta - 6.46) / 8;
      if (houseIndex >= 0) {
        await pointerEvent(cdp, "누르고 있는 동안 전진", "pointerdown", pointerId);
        let reached = current, captured = false;
        for (let step = 0; step < 500; step += 1) {
          await delay(100);
          reached = await readGameState(cdp);
          if (reached.drivewayIndex === houseIndex && reached.drivewayProgress > 9 && !captured) {
            captured = true;
            assert(Math.abs(reached.position - distance) < 7, "Driveway travel changed the main-road progress");
            if (houseIndex === 0 && DRIVEWAY_SCREENSHOT_PATH) {
              const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
              await writeFile(DRIVEWAY_SCREENSHOT_PATH, Buffer.from(screenshot.data, "base64"));
            }
          }
          if (reached.status === "quiz" || reached.drivewayIndex === houseIndex && reached.drivewayProgress >= reached.drivewayLength - .03) break;
        }
        await pointerEvent(cdp, "누르고 있는 동안 전진", "pointerup", pointerId);
        assert(reached.drivewayIndex === houseIndex && reached.drivewayProgress >= reached.drivewayLength - .03, `Could not drive into house ${houseIndex + 1}: ${JSON.stringify(reached)}`);
        console.log(`Entered house ${houseIndex + 1}`);
        for (let poll = 0; poll < 20 && (await readGameState(cdp)).status !== "quiz"; poll += 1) await delay(100);
        await answerQuiz(houseIndex);
      } else {
        await pointerEvent(cdp, direction, "pointerdown", pointerId);
        await delay(Math.max(450, holdSeconds * 1_000));
        await pointerEvent(cdp, direction, "pointerup", pointerId);
      }
      for (let poll = 0; poll < 55; poll += 1) {
        await delay(100);
        let dwell = await readGameState(cdp);
        if (!dwellVerified && distance === 190 && dwell.stopDwell > .25 && dwell.stopIndex === 0) {
          dwellVerified = true;
          assert(dwell.deliveryPhase === "delivering", `Dwell indicator is missing: ${JSON.stringify(dwell)}`);
          const controlsBefore = await cdp.evaluate(`document.querySelector('[data-joystick]').getBoundingClientRect().height`);
          await cdp.evaluate(`document.querySelector('[aria-label="게임 일시정지"]').click()`);
          const pausedDwell = await readGameState(cdp);
          await delay(700);
          assert((await readGameState(cdp)).stopDwell === pausedDwell.stopDwell, "Delivery progressed while paused");
          await cdp.evaluate(`([...document.querySelectorAll('button')].find((button) => button.textContent.includes('계속 배달하기'))).click()`);
          await delay(100);
          await joystickTouch(cdp, "touchStart", 0, 0, 811);
          await delay(200);
          assert((await joystickBounds(cdp)).active, "Parking at a driveway end discarded a neutral touch before it could reverse");
          await joystickTouch(cdp, "touchMove", 0, .95);
          await delay(550);
          const interrupted = await readGameState(cdp);
          assert(interrupted.stopDwell === 0 && interrupted.stopIndex === 0, `Moving did not reset incomplete delivery progress: ${JSON.stringify(interrupted)}`);
          await pointerEvent(cdp, "누르고 있는 동안 후진", "pointerup", 811);
          for (let wait = 0; wait < 30; wait += 1) {
            await delay(100);
            dwell = await readGameState(cdp);
            if (dwell.stopDwell > .35) break;
          }
          assert(dwell.stopDwell > .35 && dwell.stopIndex === 0, `Delivery did not resume after stopping again: ${JSON.stringify(dwell)}`);
          if (DWELL_SCREENSHOT_PATH) {
            const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
            await writeFile(DWELL_SCREENSHOT_PATH, Buffer.from(screenshot.data, "base64"));
          }
          const controlsAfter = await cdp.evaluate(`document.querySelector('[data-joystick]').getBoundingClientRect().height`);
          assert(controlsBefore === controlsAfter, "Delivery feedback moved the driving controls");
          results.deliveryZone = { pausedDwell, interrupted, resumedDwell: dwell };
        }
        if (dwell.stopIndex > current.stopIndex || distance === ROAD_CLOSURE_DISTANCE && dwell.closureReached) break;
      }
      const after = await readGameState(cdp);
      if (after.stopIndex > current.stopIndex || distance === ROAD_CLOSURE_DISTANCE && after.closureReached) return after;
    }
    return readGameState(cdp);
  };

  const firstDelivery = await stopAt(190, 801);
  assert(firstDelivery.stopIndex === 1, `First house stop did not deliver: ${JSON.stringify(firstDelivery)}`);
  assert(dwellVerified && firstDelivery.deliveryPhase === "complete" && firstDelivery.deliveryPulse === 1, "First delivery did not show its one-shot success feedback");
  const successText = await cdp.evaluate(`document.querySelector('[data-delivery-phase="complete"]')?.textContent`);
  assert(successText?.includes("배달 완료!") && successText.includes("포근빌라 202호"), "Success feedback does not identify the delivered house");
  if (SUCCESS_SCREENSHOT_PATH) {
    await delay(350);
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(SUCCESS_SCREENSHOT_PATH, Buffer.from(screenshot.data, "base64"));
  }
  await cdp.evaluate(`document.querySelector('[aria-label="게임 일시정지"]').click()`);
  const pausedSuccess = await readGameState(cdp);
  await delay(700);
  assert((await readGameState(cdp)).successRemaining === pausedSuccess.successRemaining, "Success feedback expired while paused");
  const zoneLayouts = [];
  for (const [width, height] of [[360, 640], [430, 844], [1280, 900], [390, 844]]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600, screenWidth: width, screenHeight: height });
    await delay(120);
    const bounds = await cdp.evaluate(`(() => {
      const card = document.querySelector('[data-delivery-phase="complete"]').getBoundingClientRect();
      const canvas = document.querySelector('canvas').getBoundingClientRect();
      return { left: card.left, right: card.right, bottom: card.bottom, sceneLeft: canvas.left, sceneRight: canvas.right, clearRoadBelow: canvas.bottom - card.bottom, sceneHeight: canvas.height };
    })()`);
    assert(bounds.left >= bounds.sceneLeft && bounds.right <= bounds.sceneRight && bounds.clearRoadBelow > bounds.sceneHeight * .55, `Delivery feedback clips or covers the near road at ${width}x${height}: ${JSON.stringify(bounds)}`);
    zoneLayouts.push({ width, height, ...bounds });
  }
  results.deliveryZone.layouts = zoneLayouts;
  await cdp.evaluate(`([...document.querySelectorAll('button')].find((button) => button.textContent.includes('계속 배달하기'))).click()`);
  await pointerEvent(cdp, "누르고 있는 동안 후진", "pointerdown", 812);
  await delay(650);
  await pointerEvent(cdp, "누르고 있는 동안 후진", "pointerup", 812);
  await delay(3_300);
  const afterSuccess = await readGameState(cdp);
  assert(afterSuccess.stopIndex === 1 && afterSuccess.deliveryPulse === 1 && afterSuccess.successRemaining === 0, "Staying/reversing in a completed zone repeated the delivery or left its notice stuck");
  await leaveDriveway();
  if (!ZONE_ONLY) {
  const secondDelivery = await stopAt(390, 802);
  assert(secondDelivery.stopIndex === 2, `Second house stop did not deliver: ${JSON.stringify(secondDelivery)}`);
  const closure = await stopAt(ROAD_CLOSURE_DISTANCE, 803);
  assert(closure.closureReached && closure.position < ROAD_CLOSURE_DISTANCE, `Road closure did not require a reverse detour: ${JSON.stringify(closure)}`);
  await pointerEvent(cdp, "누르고 있는 동안 전진", "pointerdown", 807);
  await delay(900);
  await pointerEvent(cdp, "누르고 있는 동안 전진", "pointerup", 807);
  await delay(500);
  const blockedForward = await readGameState(cdp);
  assert(blockedForward.closureReached && blockedForward.position < ROAD_CLOSURE_DISTANCE, `Main road let the bicycle pass through the closure: ${JSON.stringify(blockedForward)}`);
  const closurePosition = blockedForward.position;
  if (MAP_SCREENSHOT_PATH) {
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(MAP_SCREENSHOT_PATH, Buffer.from(screenshot.data, "base64"));
  }
  await pointerEvent(cdp, "누르고 있는 동안 후진", "pointerdown", 804);
  await delay(11_200);
  await pointerEvent(cdp, "누르고 있는 동안 후진", "pointerup", 804);
  await delay(1_500);
  const junction = await readGameState(cdp);
  assert(junction.position <= 490 && junction.position > 0 && junction.speed > -0.55, `Could not reverse beyond the junction: ${JSON.stringify(junction)}`);
  const laneButtonEnabled = await cdp.evaluate(`!document.querySelector('[data-joystick]').disabled`);
  assert(laneButtonEnabled, "Lane change was not available after reversing past the junction");
  await laneGesture(cdp, -1);
  await delay(350);
  const detour = await readGameState(cdp);
  assert(detour.detour === "left" && !detour.closureReached, `Left lane did not select the detour: ${JSON.stringify(detour)}`);
  const thirdDelivery = await stopAt(820, 805);
  assert(thirdDelivery.stopIndex === 3, `Third house stop did not deliver: ${JSON.stringify(thirdDelivery)}`);
  await leaveDriveway();
  const beforeFinal = await readGameState(cdp);
  await pointerEvent(cdp, "누르고 있는 동안 전진", "pointerdown", 806);
  for (let step = 0; step < 250; step += 1) {
    await delay(100);
    if ((await readGameState(cdp)).status !== "playing") break;
  }
  await pointerEvent(cdp, "누르고 있는 동안 전진", "pointerup", 806);
  await delay(5_000);
  const completed = await readGameState(cdp);
  const completionCopy = await cdp.evaluate(`document.body.innerText.includes('배달 완료!')`);
  assert(completed.status === "completed" && completed.position === 1_000 && completed.stopIndex === 3 && completionCopy, `Full route with three stops and a detour did not complete: ${JSON.stringify({ completed, completionCopy, beforeFinal, thirdDelivery })}`);

  assert(completed.quizPassed === 3, "Final destination added an extra quiz");
  await joystickTouch(cdp, "touchStart", 0, -.95, 910, { x: .04, y: .88 });
  assert((await joystickBounds(cdp)).disabled && !(await joystickBounds(cdp)).active, "Purchase overlay permitted joystick input");
  await joystickTouch(cdp, "touchEnd");
  const purchaseBrand = await cdp.evaluate(`document.querySelector('[data-purchase-ad]')?.dataset.purchaseAd`);
  assert(purchaseBrand === SELECTED_BRAND, "Final purchase ad has the wrong brand");
  const purchaseLayouts = await verifyCampaignLayout('[data-purchase-ad]');
  if (PURCHASE_SCREENSHOT_PATH) {
    const shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(PURCHASE_SCREENSHOT_PATH, Buffer.from(shot.data, "base64"));
  }
  const beforeUrl = await cdp.evaluate(`location.href`);
  await cdp.evaluate(`document.querySelector('[data-purchase-cta]').click()`);
  await delay(200);
  assert(await cdp.evaluate(`document.querySelector('[data-purchase-preview="true"]') !== null && document.body.innerText.includes('실제 주문·결제·외부 이동은 없습니다.')`), "Purchase button did not show the safe demo preview");
  assert(await cdp.evaluate(`location.href`) === beforeUrl, "Demo purchase navigated externally");
  const previewLayouts = await verifyCampaignLayout('[data-purchase-ad]');
  if (PREVIEW_SCREENSHOT_PATH) {
    const shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(PREVIEW_SCREENSHOT_PATH, Buffer.from(shot.data, "base64"));
  }
  results.purchase = { brand: purchaseBrand, purchaseLayouts, previewLayouts, externalNavigation: false };

  await cdp.evaluate(`([...document.querySelectorAll('button')].find((button) => button.textContent.includes('다시 배달하기'))).click()`);
  await delay(350);
  const readyAgain = await readGameState(cdp);
  assert(readyAgain.status === "ready" && readyAgain.quizPassed === 0 && readyAgain.brand === "", "Restart did not reset quizzes and return to brand selection");
  const otherBrand = SELECTED_BRAND === "seoul" ? "mongle" : "seoul";
  await startDeliveryGame(cdp, otherBrand);
  const restarted = await readGameState(cdp);
  assert(restarted.brand === otherBrand, "Restart did not apply a different brand");
  assert(restarted.status === "playing" && restarted.position === 0 && restarted.speed === 0, "Restart did not reset movement state");
  assert(restarted.stopIndex === 0 && restarted.stopDwell === 0 && restarted.deliveryPulse === 0 && restarted.successRemaining === 0, "Restart did not reset delivery zone state");
  assert(restarted.drivewayIndex === -1 && restarted.drivewayProgress === 0, "Restart did not reset driveway state");
  results.completion = { firstDelivery, secondDelivery, closure, junction, detour, thirdDelivery, completed, restarted };
  }
  }

  assert(cdp.errors.length === 0, `Browser rendering errors: ${cdp.errors.join("; ")}`);
  if (RESULT_PATH) await writeFile(RESULT_PATH, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  cdp?.close();
  chrome.kill();
  await delay(300);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

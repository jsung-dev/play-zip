import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (ok, message) => { if (!ok) throw new Error(message); };

export async function verifyOutdoor({ send, evaluate, onEvent, root }) {
  // A short real-input smoke test, not a repeated full delivery/quiz run.
  await evaluate('document.activeElement?.blur()');
  const position = async () => evaluate(`+document.querySelector('[data-game-status]').dataset.position`);
  const initial = await position();
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
  await delay(1300);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
  await delay(1000); const forward = await position();
  assert(forward > initial, 'Forward input smoke test');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
  await delay(1200);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
  await delay(900); const reverse = await position();
  assert(reverse < forward, 'Reverse input smoke test');
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const contact = await evaluate(`(() => { const r = document.querySelector('[data-joystick]').getBoundingClientRect(); return { x: Math.round(r.left + r.width * .6), y: Math.round(r.top + r.height * .78), id: 1, radiusX: 6, radiusY: 6, force: 1 }; })()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [contact] });
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...contact, y: contact.y - 75 }] });
  await delay(900);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await delay(800); const touchForward = await position();
  assert(touchForward > reverse, 'Mobile joystick forward smoke test');
  const paused = await evaluate(`(() => { const b = document.querySelector('button[aria-label="게임 일시정지"]'); b?.click(); return !!b; })()`);
  assert(paused, 'Pause control exists'); await delay(150);
  const atPause = await position(); await delay(200); assert(await position() === atPause, 'Pause must hold position');
  assert(await evaluate(`document.querySelector('[data-game-status]').dataset.deliveryBrand === 'seoul'`), 'Seoul brand unchanged');

  // Mock image responses in the QA browser only; no fixtures or test endpoints
  // are shipped in the game. The actual production texture module is bundled.
  const request = createRequire(import.meta.url);
  const { build } = createRequire(request.resolve('tsx'))('esbuild');
  const bundle = await build({ entryPoints: ['scripts/fixtures/outdoor-ad-browser.ts'], absWorkingDir: process.cwd(), bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'OutdoorFixture', logLevel: 'silent' });
  const sizes = { square: [1080, 1080], portrait: [1080, 1920], landscape: [1920, 1080], banner: [1600, 400], wide: [800, 200], tall: [400, 800], alternate: [1080, 1080] };
  onEvent('Fetch.requestPaused', async ({ requestId, request: req }) => {
    const file = new URL(req.url).pathname.slice(1), name = file.split('.')[0];
    const [w, h] = sizes[name] || [400, 400];
    if (name === 'slow') await delay(500);
    const body = name.startsWith('missing') ? 'Not found' : name === 'corrupt' ? 'invalid-image' : `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#ed2828"/><rect x="${w * .08}" y="${h * .08}" width="${w * .84}" height="${h * .84}" fill="${name === 'alternate' ? '#f5bd24' : '#3b8fca'}"/><text x="50%" y="50%" text-anchor="middle" font-family="sans-serif" font-size="${Math.min(w, h) * .14}" fill="white">${name}</text></svg>`;
    await send('Fetch.fulfillRequest', { requestId, responseCode: name.startsWith('missing') ? 404 : 200, responseHeaders: [
      { name: 'Content-Type', value: name.startsWith('missing') ? 'text/plain' : name === 'corrupt' ? 'image/png' : 'image/svg+xml' },
      ...(name === 'no-cors' ? [] : [{ name: 'Access-Control-Allow-Origin', value: '*' }]),
    ], body: Buffer.from(body).toString('base64') }).catch(() => {});
  });
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://outdoor-qa.invalid/*' }] });
  await evaluate(bundle.outputFiles[0].text);
  const result = await evaluate('OutdoorFixture.run()');
  await send('Fetch.disable');
  await writeFile(`${root}/four-formats.png`, Buffer.from(result.montage.split(',')[1], 'base64'));
  delete result.montage;
  result.controls = { initial, forward, reverse, touchForward, paused: true, brand: 'seoul' };
  await writeFile(`${root}/materials.json`, JSON.stringify(result, null, 2));
  console.log('Outdoor QA: four formats, real image loads, 404/decode/CORS fallback, contain, shared/independent materials, disposal, driving smoke test passed.');
  return result;
}

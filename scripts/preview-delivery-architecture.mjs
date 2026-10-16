// QA-only isolated views of the SAME constructors used in the game. No route
// or debug control is added to the deployed application.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('tsx'))('esbuild');
const root = process.env.STREET_QA_ROOT || 'test-artifacts/architecture-v3';
await mkdir(root, { recursive: true });
const result = await build({ bundle: true, write: false, format: 'iife', platform: 'browser',
  stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
    import * as THREE from 'three';
    import { createSceneArt } from './components/delivery/three/scene-art';
    const mint = location.hash === '#mint';
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#F7FAF9');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(1200,780); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
    document.body.appendChild(renderer.domElement);
    const hemi = new THREE.HemisphereLight('#f1faff','#a6b6ad',1.15);
    const sun = new THREE.DirectionalLight('#fff5e4',2.25); sun.position.set(-36,65,28);
    scene.add(hemi,sun);
    const art = createSceneArt();
    const variants = mint ? [1,1,1] : [0,1,2,3,4];
    const labels = mint ? ['정면 · 4층 / 오른쪽 발코니','측면 · 층마다 창 2개','입체 · 깊이와 옥상 난간'] : ['A · 살구 상가','B · 민트 빌라','C · 크림 빌딩','D · 라벤더 주택','E · 노랑 상가'];
    const cell = 1200 / variants.length;
    renderer.setScissorTest(true);
    variants.forEach((variant,i) => {
      const model = art.building({ type:'house', variant, side:'left', distance:0, id:'sheet' },true);
      model.position.set(0,0,0); model.rotation.set(0,mint && i === 1 ? -Math.PI/2 : 0,0);
      scene.add(model);
      const span = mint ? 21 : 33, aspect = cell/720;
      const camera = new THREE.OrthographicCamera(-span*aspect/2,span*aspect/2,span/2,-span/2,.1,100);
      camera.position.set(mint && i < 2 ? 0 : 18, mint ? 17 : 22,50);
      camera.lookAt(0,mint ? 8.5 : 10.5,0);
      renderer.setViewport(i*cell,40,cell,720); renderer.setScissor(i*cell,40,cell,720);
      renderer.render(scene,camera); scene.remove(model);
      const label=document.createElement('div'); label.textContent=labels[i];
      label.style.cssText='position:absolute;bottom:10px;text-align:center;font:600 16px sans-serif;color:#243F38;width:'+cell+'px;left:'+(i*cell)+'px';
      document.body.appendChild(label);
    });
    window.__architectureReady = true;
  ` } });
await writeFile(resolve(root,'models.html'), `<!doctype html><meta charset="utf-8"><title>실제 건물 모델 검증</title><style>body{margin:0;background:#f7faf9;width:1200px;height:780px;overflow:hidden}canvas{display:block}</style><body><script>${result.outputFiles[0].text}</script></body>`);
console.log(resolve(root,'models.html'));

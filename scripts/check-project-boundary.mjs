import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const walk = path => existsSync(path) ? readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name).replaceAll('\\', '/')]) : [];
// Deliberately scan only this game's source roots, never unrelated local projects.
const files = ['app', 'components', 'data', 'lib', 'remotion', 'scripts', 'types'].flatMap(walk);
const forbidden = /^(app\/(api\/video-ad|video-ad|cut-editor-test)\/|components\/(video-ad|home)\/|lib\/video-ad\/|remotion\/)|^(data|types)\/play-content\.ts$/;
assert.deepEqual(files.filter(file => forbidden.test(file)), [], 'Unrelated application code mixed into games');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
assert.equal(pkg.name, 'play-zip-games');
assert.equal(pkg.scripts.build, 'next build');
const unrelated = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(name => /remotion|ffmpeg|ffprobe|supabase|@vercel\/(sandbox|blob)/.test(name));
assert.deepEqual(unrelated, [], 'Unrelated server/video dependencies');
for (const file of ['app/games/delivery/page.tsx', 'components/delivery/DeliveryGame.tsx', 'data/delivery-map.ts', 'public/fonts/noto-sans-kr-900.css', 'licenses/NotoSansKR-OFL.txt']) assert(existsSync(file), `Missing game dependency: ${file}`);
const protectedPaths = ['app/games', 'components/delivery', 'data/delivery-game.ts', 'data/delivery-map.ts', 'data/delivery-campaign.ts', 'data/delivery-outdoor-ads.ts', 'public/games', 'public/fonts', 'licenses', 'app/globals.css'];
if (process.argv[2]) execFileSync('git', ['diff', '--exit-code', process.argv[2], '--', ...protectedPaths], { stdio: 'pipe' });
console.log('Game boundary passed; unrelated app dependencies absent' + (process.argv[2] ? '; delivery source, assets, fonts and CSS unchanged from ' + process.argv[2] : ''));

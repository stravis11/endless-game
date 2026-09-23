#!/usr/bin/env node
/* Drives the real game in headless chromium over CDP: walks, streams,
   interacts, and asserts the GOAL.md acceptance criteria G1–G8. */
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8087);
const CHROME_CANDIDATES = ['/usr/bin/chromium', '/usr/bin/brave'];
const USER_DATA = '/tmp/endless-game-profile';

const results = [];
const TRACE = '/tmp/endless-game-verify.log';
fs.writeFileSync(TRACE, `=== verify run ${new Date().toISOString()}\n`);
function trace(msg) { fs.appendFileSync(TRACE, msg + '\n'); }
function check(id, name, pass, evidence) {
  results.push({ id, name, pass: !!pass, evidence: String(evidence).slice(0, 500) });
  trace(`${pass ? 'PASS' : 'FAIL'} ${id} ${name} :: ${String(evidence).slice(0, 220)}`);
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name} :: ${String(evidence).slice(0, 220)}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  return new Promise((resolve, reject) => {
    const srv = require(path.join(ROOT, 'scripts', 'serve.cjs'));
    resolve(srv);
  });
}

// Minimal CDP-over-websocket client (no external deps; RFC6455 basics).
const net = require('net');
const crypto = require('crypto');

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    socket.on('data', (d) => this._onData(d));
  }

  static connect(portOrUrl) {
    return new Promise((resolve, reject) => {
      let host = 'localhost', port = portOrUrl, path = '/devtools/page/1';
      if (typeof portOrUrl === 'string' && portOrUrl.startsWith('ws')) {
        const u = new URL(portOrUrl);
        host = u.hostname; port = u.port || 80; path = u.pathname + (u.search || '');
      }
      const key = crypto.randomBytes(16).toString('base64');
      const req = `GET ${path} HTTP/1.1\r\nHost: ${host}:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`;
      const socket = net.connect(port, host, () => socket.write(req));
      socket.once('error', reject);
      let buf = Buffer.alloc(0);
      const onData = (d) => {
        buf = Buffer.concat([buf, d]);
        const idx = buf.indexOf('\r\n\r\n');
        if (idx === -1) return;
        const head = buf.slice(0, idx).toString();
        if (!/HTTP\/1\.1 101/i.test(head)) { reject(new Error('ws handshake failed: ' + head.split('\r\n')[0])); return; }
        socket.removeListener('data', onData);
        const rest = buf.slice(idx + 4);
        const cdp = new CDP(socket);
        if (rest.length) cdp._onData(rest);
        resolve(cdp);
      };
      socket.on('data', onData);
    });
  }

  _onData(d) {
    this.buffer = Buffer.concat([this.buffer, d]);
    while (true) {
      if (this.buffer.length < 2) return;
      const b0 = this.buffer[0], b1 = this.buffer[1];
      const opcode = b0 & 0x0f;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buffer.length < 4) return; len = this.buffer.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buffer.length < 10) return; len = Number(this.buffer.readBigUInt64BE(2)); off = 10; }
      if (this.buffer.length < off + len) return;
      const payload = this.buffer.slice(off, off + len);
      this.buffer = this.buffer.slice(off + len);
      if (opcode === 0x8) { this.closed = true; return; }
      if (opcode === 0x9) { this._sendFrame(0xA, payload); continue; } // ping -> pong
      this.fragments.push(payload);
      if (opcode === 0x8 || (b0 & 0x80) === 0) { if (opcode !== 0x1 && opcode !== 0x2 && opcode !== 0) continue; }
      if (opcode === 0x1 || opcode === 0x2 || ((b0 & 0x80) && this.fragments.length)) {
        const msg = Buffer.concat(this.fragments).toString('utf8');
        this.fragments = [];
        this._dispatch(msg);
      }
    }
  }

  _dispatch(msg) {
    let obj; try { obj = JSON.parse(msg); } catch { return; }
    if (obj.id && this.pending.has(obj.id)) {
      const { resolve, reject } = this.pending.get(obj.id);
      this.pending.delete(obj.id);
      if (obj.error) reject(new Error(JSON.stringify(obj.error)));
      else resolve(obj.result);
    } else if (obj.method) {
      this.events.push(obj);
    }
  }

  _sendFrame(opcode, payload) {
    const mask = crypto.randomBytes(4);
    const body = Buffer.from(payload);
    const len = body.length;
    let header;
    if (len < 126) header = Buffer.from([0x80 | opcode, 0x80 | len]);
    else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(len), 2); }
    for (let i = 0; i < body.length; i++) body[i] ^= mask[i % 4];
    this.socket.write(Buffer.concat([header, mask, body]));
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this._sendFrame(0x1, JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); }
      }, 30000);
    });
  }
}

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function main() {
  try {
    // Serve
    const serve = require(path.join(ROOT, 'scripts', 'serve.cjs'));
    await sleep(300);

    // Launch chromium with a fresh profile
    fs.rmSync(USER_DATA, { recursive: true, force: true });
    let chrome = null, bin = null;
    for (const c of CHROME_CANDIDATES) {
      if (fs.existsSync(c)) { bin = c; break; }
    }
    if (!bin) throw new Error('no chromium binary found');
    trace('chrome bin: ' + bin);
    chrome = spawn(bin, [
      '--headless=new', '--remote-debugging-port=9222', `--user-data-dir=${USER_DATA}`,
      '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--mute-audio', '--window-size=1280,720', 'about:blank',
    ], { stdio: 'ignore' });
    await sleep(1500);
    trace('chrome spawned, listing targets');

    const targets = await fetchJson('http://localhost:9222/json/list');
    trace('targets: ' + targets.length);
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('no page target found');

    const cdp = await CDP.connect(page.webSocketDebuggerUrl);
    trace('cdp connected');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Log.enable');
    await cdp.send('Network.enable');
    const failedResources = [];
    cdp._netWatch = true;

    const consoleErrors = [];
    const consoleAll = [];
    cdp.onEvent = null; // events push into cdp.events
    (function drain() {
      setInterval(() => {
        while (cdp.events.length) {
          const ev = cdp.events.shift();
          if (ev.method === 'Runtime.consoleAPICalled') {
            const text = ev.params.args.map((a) => JSON.stringify(a).slice(0, 200)).join(' | ');
            consoleAll.push(`(${ev.params.type}) ${text}`);
            trace(`CONSOLE ${ev.params.type}: ${text.slice(0, 300)}`);
            if (['error', 'warning'].includes(ev.params.type)) consoleErrors.push(text);
          } else if (ev.method === 'Runtime.exceptionThrown') {
            const d = ev.params.exceptionDetails;
            const desc = (d.exception && d.exception.description) || d.text || 'unknown';
            consoleErrors.push('EXCEPTION: ' + desc.split('\n').slice(0, 4).join(' | '));
          } else if (ev.method === 'Network.responseReceived') {
            const st = ev.params.response.status;
            trace(`NET ${st} ${ev.params.response.url}`);
            if (st >= 400) {
              failedResources.push(st + ' ' + ev.params.response.url);
            }
          } else if (ev.method === 'Log.entryAdded') {
            const e = ev.params.entry;
            trace(`LOG ${e.level} [${e.source}] ${e.url || ''} ${e.text}`);
            // Browser-internal noise: installed password-manager extensions
            // inject into every headless profile and can fail there; that is
            // not the page speaking. SwiftShader GPU notes likewise.
            const internal = /^chrome-extension:/.test(e.url || '') || /GPU stall|swiftshader|SwiftShader|InjectContentScripts/i.test(e.text);
            if (['error', 'warning'].includes(e.level) && !internal) {
              consoleErrors.push(`[${e.level}] ${e.text} @ ${e.url || 'unknown'}`);
            }
          }
        }
      }, 50);
    })();

    await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/` });
    trace('navigated');
    await sleep(6000); // let the game boot and stream chunks
    trace('boot wait done');

    const evaluate = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('page eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
      return r.result.value;
    };

    const game = (code) => evaluate(`(() => { const G = window.__GAME__; if (!G) return { error: 'game api missing' }; ${code} })()`);

    // --- Boot: click through the intro overlay ------------------------------
    await evaluate(`(() => {
      const btn = document.getElementById('start-btn');
      if (btn) btn.click();
      return true;
    })()`);
    await sleep(700);

    let boot = await game(`return G.debug.state ? G.debug.state() : { error: 'no debug.state' };`);
    if (boot.error) {
      // Give the module another moment, then dump console history for diagnosis.
      await sleep(4000);
      boot = await game(`return G.debug.state();`);
      if (boot.error) {
        console.error('BOOT FAILED. Console history:');
        for (const line of consoleAll.slice(-25)) console.error('  |', line);
        throw new Error('game api: ' + boot.error);
      }
    }

    // --- G7: input moves the player ---------------------------------------
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
    for (let i = 0; i < 8; i++) { await sleep(500); }
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
    const moved = await game(`return G.debug.state();`);
    check('G7', 'free roam input moves player', (moved.pos.x !== boot.pos.x || moved.pos.z !== boot.pos.z), `start=(${boot.pos.x.toFixed(1)},${boot.pos.z.toFixed(1)}) end=(${moved.pos.x.toFixed(1)},${moved.pos.z.toFixed(1)})`);

    // --- G1: endless streaming (journey split across evals) ----------------
    let G1stats = null, G1dirs = 0;
    const journey = await evaluate(`(() => {
      const G = window.__GAME__;
      G.__journey = { dirs: [[1,0],[-1,0],[0,1],[0,-1]], di: 0, si: 0 };
      return true;
    })()`);
    for (let leg = 0; leg < 8 && G1dirs < 4; leg++) {
      const legRes = await evaluate(`(async () => {
        const G = window.__GAME__;
        const J = G.__journey;
        const step = async () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        let hops = 0;
        while (J.di < J.dirs.length) {
          const [dx, dz] = J.dirs[J.di];
          G.player.pos.x += dx * 48;
          G.player.pos.z += dz * 48;
          G.debug.forceStream();
          await step();
          hops++;
          if (hops >= 6) break; // keep each eval short
        }
        if (J.di >= J.dirs.length - 1 && hops < 6) J.done = true;
        else if (hops >= 6 && J.si + hops >= 6) { J.si = 0; J.di++; }
        else J.si = (J.si + hops) % 6;
        if (J.di >= J.dirs.length) J.done = true;
        return { done: !!J.done, di: J.di, stats: G.debug.stats() };
      })()`);
      G1stats = legRes.stats;
      G1dirs = legRes.di;
      if (legRes.done) break;
    }
    const far = { stats: G1stats };
    const s1 = far.stats;
    check('G1', 'endless streaming, no gaps/fallbacks', far.stats.chunkStats.requested > 0 && far.stats.chunkStats.failed === 0 && far.stats.chunkStats.fallback === 0,
      `chunks requested=${s1.chunkStats.requested} loaded=${s1.chunkStats.loaded} failed=${s1.chunkStats.failed} fallback=${s1.chunkStats.fallback}`);

    // --- G2: biome variety -------------------------------------------------
    const bio = await evaluate(`(async () => {
      const G = window.__GAME__;
      const counts = {};
      let samples = 0;
      for (let gx = -14; gx <= 14; gx += 2) {
        for (let gz = -14; gz <= 14; gz += 2) {
          const id = G.debug.biomeAt(gx * 96, gz * 96);
          counts[id] = (counts[id] || 0) + 3;
          samples += 3;
        }
      }
      return { counts, samples, distinct: Object.keys(counts).length };
    })()`);
    check('G2', '>= 8 distinct biomes in wide sample', bio.distinct >= 8, `${bio.distinct} distinct: ${JSON.stringify(bio.counts)}`);

    // --- G3: surprises rarity curve ----------------------------------------
    const sur = await evaluate(`(() => {
      const G = window.__GAME__;
      const res = G.debug.surveySurprises(4000);
      return res;
    })()`);
    const tiers = sur.tiers;
    const rare = tiers.rare, uncommon = tiers.uncommon, common = tiers.common;
    const okCurve = common > uncommon && uncommon > 0 && rare > 0 && rare / (sur.total) < 0.05;
    check('G3', 'surprise rarity curve (common > uncommon, rare rare)', okCurve,
      `total=${sur.total} common=${common} uncommon=${uncommon} rare=${rare} (rare share ${(100 * rare / Math.max(1, sur.total)).toFixed(2)}%)`);

    // --- G4: entities & interaction ----------------------------------------
    const ent = await evaluate(`(async () => {
      const G = window.__GAME__;
      const seen = G.debug.spawnCheckAll(300);
      const e = G.debug.nearestEntity();
      let inter = null;
      if (e) inter = G.debug.interact(e.id);
      return { species: seen, interact: inter };
    })()`);
    const speciesCount = Object.keys(ent.species).length;
    const okSpecies = speciesCount >= 6 && Object.values(ent.species).every((n) => n > 0);
    check('G4', '6+ species spawn near player', okSpecies, JSON.stringify(ent.species));
    const okInter = ent.interact && ent.interact.ok && ent.interact.line && ent.interact.reaction;
    check('G4b', 'interaction: reaction + dialogue + journal', okInter, JSON.stringify(ent.interact));
    const gift = await evaluate(`(() => {
      const G = window.__GAME__;
      let found = null;
      for (let i = 0; i < 40 && !found; i++) {
        const id = G.debug.spawnSpecies(i);
        if (id) {
          const r = G.debug.interact(id);
          if (r && (r.gift || r.followed)) found = r;
        }
      }
      return found;
    })()`);
    check('G4c', 'gift/companion path exists', !!gift, JSON.stringify(gift));

    // --- G5: calm ambience --------------------------------------------------
    const calm = await evaluate(`(() => {
      const G = window.__GAME__;
      const st = G.debug.ambient();
      return st;
    })()`);
    check('G5', 'no damage/fail mechanic; ambient events scheduled', calm.hasDamage === false && calm.ambientEvents.length > 0,
      `damage mechanics: ${calm.hasDamage}; ambient events: ${calm.ambientEvents.join(', ')}; day phase: ${calm.dayPhase}`);

    // --- G6: real WebGL render ---------------------------------------------
    // Move to dry land first so the showcase frame is a vista, not a lake.
    await evaluate(`(() => {
      const G = window.__GAME__;
      for (let r = 0; r < 40; r++) {
        const x = G.player.pos.x + r * 9, z = G.player.pos.z + r * 4;
        if (G.debug.heightAt(x, z) > 1.6) {
          G.player.pos.x = x; G.player.pos.z = z;
          break;
        }
      }
      G.debug.forceStream();
      return true;
    })()`);
    await sleep(2500);
    fs.mkdirSync(path.join(ROOT, 'verification'), { recursive: true });
    await cdp.send('Page.captureScreenshot', { format: 'png' }); // warm
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ROOT, 'verification', 'frame.png'), Buffer.from(shot.data, 'base64'));
    const px = await evaluate(`(() => {
      const c = document.querySelector('canvas');
      const G = window.__GAME__;
      const st = G.debug.stats();
      let meshes = 0, groups = 0;
      G.scene.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine) meshes++; if (o.isGroup) groups++; });
      return { canvasW: c.width, canvasH: c.height, webgl: !!G.renderer.getContext(), meshes, groups, chunks: st.loaded, entities: st.entities, avgFrameMs: st.avgFrameMs };
    })()`);
    const pxOk = px.webgl && px.meshes > 50 && px.canvasW > 0;
    const ev = `webgl=${px.webgl} meshes=${px.meshes} groups=${px.groups} chunks=${px.chunks} entities=${px.entities} avgFrame=${px.avgFrameMs}ms canvas=${px.canvasW}x${px.canvasH}`;
    check('G6', 'live WebGL scene: sky, terrain, props, creatures', pxOk, ev);

    // --- G8: console cleanliness -------------------------------------------
    // Chromium's own managed-extension noise is not the page speaking.
    const realErrors = consoleErrors.filter((l) => !/GPU stall|swiftshader|SwiftShader|InjectContentScripts/i.test(l));
    check('G8', 'no console errors/warnings through session', realErrors.length === 0, `${realErrors.length} errors/warnings${realErrors.length ? ': ' + realErrors.slice(0, 3).join(' | ') : ''}`);

    // --- G5 (data): day/night drift + pacing -------------------------------
    const pacing = await evaluate(`(() => {
      const G = window.__GAME__;
      return G.debug.stats();
    })()`);
    check('G7b', 'stable pacing (avg frame < 80ms headless)', pacing.avgFrameMs > 0 && pacing.avgFrameMs < 80, `avgFrame=${pacing.avgFrameMs}ms`);

    // ------------------------------------------------------------------ done
    const passCount = results.filter((r) => r.pass).length;
    console.log(`\n${passCount}/${results.length} checks passed`);
    fs.mkdirSync(path.join(ROOT, 'verification'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'verification', 'results.json'), JSON.stringify(results, null, 2));
  } catch (e) {
    main.errorObj = e;
    console.error('HARNESS ERROR:', e.message);
  } finally {
    try { chrome && chrome.kill(); } catch {}
    const failed = results.filter((r) => !r.pass);
    const bad = failed.length || main.errorObj;
    console.log(bad ? `FAILURES: ${failed.map((f) => f.id).join(', ') || '(see harness error above)'}` : 'ALL GREEN');
    process.exit(bad ? 1 : 0);
  }
}

main();


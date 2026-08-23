#!/usr/bin/env node
/* Pre-call oldal (/hivas) aktiválás-ellenőrző.
 *
 *   node tools/precall/check.mjs            # állapot: mi hiányzik még az aktiváláshoz
 *   node tools/precall/check.mjs --live     # + az élő oldal és a mérő-végpont próbája
 *
 * Kilépési kód 0 = minden kapu zöld, aktiválható. 1 = van piros.
 * A kapuk (mind kötelező, sorrendben):
 *   1. assets/hivas-videos.js: mind a 6 videó kitöltve, és elérhető (HEAD 200 mp4-nél)
 *   2. hivas.html: noindex, nincs em dash, nincs "TODO"/"placeholder", nincs Claims
 *      Registeren kívüli szám (csak 30+ / 11 / 59,4M Ft)
 *   3. index.html: PRECALL_PAGE flag állapota (aktiváláskor '/hivas')
 *   4. --live: https://automating.hu/hivas 200 + noindex, POST /hivas/api/esemeny 200
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('.', import.meta.url).pathname, '../..');
const read = (f) => readFileSync(resolve(root, f), 'utf8');
const live = process.argv.includes('--live');
const out = [];
const gate = (ok, msg) => out.push({ ok, msg });

/* 1. videók */
const cfgSrc = read('assets/hivas-videos.js');
const cfg = new Function(`const window = {}; ${cfgSrc}; return window.HIVAS_VIDEOS;`)();
const slots = { thankyou: cfg.thankyou, vsl: cfg.vsl, ...Object.fromEntries(Object.entries(cfg.breakouts || {}).map(([k, v]) => ['breakouts.' + k, v])) };
for (const [k, v] of Object.entries(slots)) {
  if (!v) { gate(false, `videó hiányzik: ${k}`); continue; }
  const src = v.mp4 || v.youtube || v.stream;
  if (!src) { gate(false, `videó forrás nélkül: ${k}`); continue; }
  if (v.mp4 && !v.poster) gate(false, `mp4 poszter nélkül: ${k} (az első képkocka a lejátszó arca)`);
  if (live && v.mp4) {
    const url = v.mp4.startsWith('http') ? v.mp4 : 'https://automating.hu' + v.mp4;
    const r = await fetch(url, { method: 'HEAD' }).catch(() => null);
    gate(!!r && r.ok, `mp4 elérhető: ${url} → ${r ? r.status : 'nincs válasz'}`);
  } else gate(true, `videó: ${k} (${v.mp4 ? 'mp4' : v.youtube ? 'youtube' : 'stream'}${v.minutes ? ', ' + v.minutes + ' perc' : ''})`);
}
gate(cfg.active === true, `hivas-videos.js active: ${cfg.active}`);

/* 2. oldal-szöveg */
const html = read('hivas.html');
gate(/<meta name="robots" content="noindex, nofollow">/.test(html), 'hivas.html: noindex, nofollow');
gate(!/—/.test(html), 'hivas.html: nincs em dash');
gate(!/TODO|PLACEHOLDER|placeholder|lorem/i.test(html.replace(/<!--[\s\S]*?-->/g, '')), 'hivas.html: nincs TODO / placeholder');
const numbers = [...html.matchAll(/class="num"><b>([^<]+)<\/b>/g)].map((m) => m[1]);
gate(JSON.stringify(numbers) === JSON.stringify(['30+', '11', '59,4M Ft']), `hivas.html: a számok a Claims Registerből (${numbers.join(' · ')})`);
gate(!/\b(Biotek|Kakucsi|Rutai|GreenGo|Jakab|Khloé|BGYH|ema\.hu|IPSA|Aretis)\b/.test(html), 'hivas.html: nincs ügyfélnév (proof permission 0/6)');

/* 3. modal flag */
const idx = read('index.html');
const flag = (idx.match(/const PRECALL_PAGE = ([^;]+);/) || [])[1];
gate(flag === "'/hivas'", `index.html PRECALL_PAGE = ${flag} (aktiváláskor '/hivas')`);

/* 4. élő */
if (live) {
  const r = await fetch('https://automating.hu/hivas').catch(() => null);
  const body = r ? await r.text() : '';
  gate(!!r && r.status === 200, `élő /hivas → ${r ? r.status : 'nincs válasz'}`);
  gate(/noindex/.test(body), 'élő /hivas: noindex a válaszban');
  const e = await fetch('https://automating.hu/hivas/api/esemeny', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: 'view', uid: 'check-mjs', step: 'synthetic' }) }).catch(() => null);
  gate(!!e && e.status === 200, `élő mérő-végpont → ${e ? e.status : 'nincs válasz'}`);
  const bad = await fetch('https://automating.hu/hivas/api/esemeny', { method: 'POST', body: '{"event":"x"}' }).catch(() => null);
  gate(!!bad && bad.status === 400, `élő mérő-végpont ismeretlen eseményt elutasít → ${bad ? bad.status : '-'}`);
}

for (const g of out) console.log(`${g.ok ? '✅' : '❌'} ${g.msg}`);
const red = out.filter((g) => !g.ok).length;
console.log(red ? `\n${red} piros kapu - NEM aktiválható.` : '\nMinden kapu zöld - aktiválható.');
process.exit(red ? 1 : 0);

/* SEO / AEO / GEO enhancement pass over site-deploy/.
 *
 * Runs after build-site.mjs has assembled site-deploy/. The source HTML stays
 * the design's source of truth; this step only adds machine-facing layers and
 * delivery optimisations that must not change anything a visitor sees:
 *
 *   - hreflang pairs + x-default, absolute canonicals, sitemap with alternates
 *   - pre-rendered English counterparts of the client-side bilingual pages
 *     (/en, /case-studies-en) built from the pages' own T.en dictionaries
 *   - Organization / Person / WebPage schema enrichment (sameAs, legal identity,
 *     speakable, about/mentions) — every value comes from the public imprint
 *     or a profile verified live on 2026-08-23 (see tools/seo/external.json)
 *   - markdown alternates per article, llms.txt / llms-full.txt corpus files
 *   - robots.txt with explicit AI-crawler policy, IndexNow key file
 *   - self-hosted Inter (same variable font Google serves), preloaded;
 *     consent.css inlined; inline CSS/JS minified (esbuild, if available)
 *
 * Run:  node tools/seo/enhance.mjs            (expects site-deploy/ to exist)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'site-deploy');
const BASE = 'https://automating.hu';
const TODAY = new Date().toISOString().slice(0, 10);
if (!existsSync(OUT)) throw new Error('site-deploy/ missing — run node build-site.mjs first');

const EXT = JSON.parse(readFileSync(join(ROOT, 'tools/seo/external.json'), 'utf8'));

/* ───────────────────────── helpers ───────────────────────── */
const read = (p) => readFileSync(join(OUT, p), 'utf8');
const write = (p, s) => { mkdirSync(dirname(join(OUT, p)), { recursive: true }); writeFileSync(join(OUT, p), s); };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
const stripTags = (s) => unesc(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function gitDate(file) {
  try { return execSync(`git log -1 --format=%cs -- "${file}"`, { cwd: ROOT, encoding: 'utf8' }).trim() || TODAY; }
  catch { return TODAY; }
}

function headOf(h) { const m = h.match(/<head[^>]*>([\s\S]*?)<\/head>/i); return m ? m[1] : ''; }
function metaContent(h, attr, name) {
  const m = h.match(new RegExp(`<meta[^>]+${attr}=["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'i'));
  if (!m) return null;
  const c = m[0].match(/content=["']([^"']*)["']/i);
  return c ? unesc(c[1]) : null;
}
function setMeta(h, attr, name, value) {
  const re = new RegExp(`(<meta[^>]+${attr}=["']${name}["'][^>]*content=["'])[^"']*(["'][^>]*>)`, 'i');
  if (re.test(h)) return h.replace(re, `$1${esc(value)}$2`);
  return h.replace('</head>', `<meta ${attr}="${name}" content="${esc(value)}">\n</head>`);
}

/* JSON-LD blocks: parse → mutate → reserialize (compact, but still valid) */
function mapJsonLd(h, fn) {
  let i = 0;
  return h.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (m, raw) => {
    let obj; try { obj = JSON.parse(raw); } catch { return m; }
    const out = fn(obj, i++);
    return `<script type="application/ld+json">${JSON.stringify(out ?? obj)}</script>`;
  });
}
function nodes(obj) { return Array.isArray(obj['@graph']) ? obj['@graph'] : [obj]; }
function hasType(n, ...ts) { const t = n['@type']; return ts.some((x) => Array.isArray(t) ? t.includes(x) : t === x); }

/* element with data-i18n="key": nesting-aware inner replacement */
function replaceI18n(html, dict) {
  const re = /<([a-zA-Z0-9]+)([^>]*\sdata-i18n="([^"]+)"[^>]*)>/g;
  let out = '', last = 0, m;
  while ((m = re.exec(html))) {
    const [open, tag, attrs, key] = m;
    if (dict[key] === undefined) continue;
    if (/\/>$/.test(open)) continue;
    // find matching close for this tag, counting nested same-tag opens
    let depth = 1, pos = re.lastIndex;
    const tagRe = new RegExp(`<(/?)${tag}(?=[\\s>/])[^>]*>`, 'gi');
    tagRe.lastIndex = pos;
    let close = null, t;
    while ((t = tagRe.exec(html))) {
      if (t[1] === '/') depth--; else if (!/\/>$/.test(t[0])) depth++;
      if (depth === 0) { close = t; break; }
    }
    if (!close) continue;
    out += html.slice(last, pos) + dict[key];
    last = close.index;
    re.lastIndex = close.index;
  }
  return out + html.slice(last);
}

/* the page's own T dictionary, evaluated as a literal */
function extractT(html) {
  const m = html.match(/\nconst T = (\{[\s\S]*?\n\});/);
  if (!m) return null;
  return new Function(`return ${m[1]}`)();
}

/* ───────────────────────── page registry ───────────────────────── */
const PAGES = [
  { path: '/', file: 'index.html', lang: 'hu', alt: '/en', gen: { file: 'en.html', path: '/en' } },
  { path: '/case-studies', file: 'case-studies.html', lang: 'hu', alt: '/case-studies-en', gen: { file: 'case-studies-en.html', path: '/case-studies-en' } },
  { path: '/blog', file: 'blog.html', lang: 'hu', alt: '/blog-en' },
  { path: '/blog-en', file: 'blog-en.html', lang: 'en', alt: '/blog' },
  { path: '/impresszum', file: 'impresszum.html', lang: 'hu' },
  { path: '/privacy', file: 'privacy.html', lang: 'hu' },
  { path: '/terms', file: 'terms.html', lang: 'hu' },
];
for (const f of readdirSync(join(OUT, 'blog'))) {
  if (!f.endsWith('.html')) continue;
  const h = read(`blog/${f}`);
  const lang = (h.match(/<html[^>]+lang="(\w+)"/) || [])[1] || 'hu';
  const alt = (h.match(/data-alt-lang-href="([^"]+)"/) || [])[1];
  PAGES.push({ path: `/blog/${f.replace(/\.html$/, '')}`, file: `blog/${f}`, lang, alt, article: true });
}
const byPath = Object.fromEntries(PAGES.map((p) => [p.path, p]));

/* ───────────────────────── entity facts ───────────────────────── */
const ORG_ID = `${BASE}/#org`;
const ORG_EXTRA = {
  alternateName: ['Automating.hu', 'Automating Hungary'],
  legalName: 'Hudácsek Bence EV.',
  telephone: '+36 50 108 9523',
  vatID: '91949811-1-28',
  taxID: '91949811-1-28',
  identifier: [{ '@type': 'PropertyValue', propertyID: 'Hungarian sole-trader registration number', value: '62151177' }],
  address: { '@type': 'PostalAddress', streetAddress: 'Hunyadi János utca 12.', postalCode: '9127', addressLocality: 'Csikvánd', addressRegion: 'Győr-Moson-Sopron', addressCountry: 'HU' },
  sameAs: EXT.sameas_verified,
  memberOf: { '@type': 'Organization', name: 'Budapesti Kereskedelmi és Iparkamara', url: 'https://www.bkik.hu/' },
  knowsAbout: [
    { '@type': 'Thing', name: 'Artificial intelligence', sameAs: ['https://en.wikipedia.org/wiki/Artificial_intelligence', 'https://hu.wikipedia.org/wiki/Mesterséges_intelligencia', 'https://www.wikidata.org/wiki/Q11660'] },
    { '@type': 'Thing', name: 'Business process automation', sameAs: ['https://en.wikipedia.org/wiki/Business_process_automation'] },
    { '@type': 'Thing', name: 'Robotic process automation', sameAs: ['https://en.wikipedia.org/wiki/Robotic_process_automation', 'https://hu.wikipedia.org/wiki/Robotizált_folyamatautomatizálás'] },
    { '@type': 'Thing', name: 'Virtual assistant', sameAs: ['https://en.wikipedia.org/wiki/Virtual_assistant'] },
    { '@type': 'Thing', name: 'Interactive voice response', sameAs: ['https://en.wikipedia.org/wiki/Interactive_voice_response'] },
    { '@type': 'Thing', name: 'Large language model', sameAs: ['https://en.wikipedia.org/wiki/Large_language_model', 'https://hu.wikipedia.org/wiki/Nagy_nyelvi_modell', 'https://www.wikidata.org/wiki/Q115305900'] },
    { '@type': 'Thing', name: 'Workflow automation', sameAs: ['https://en.wikipedia.org/wiki/Workflow_automation'] },
  ],
};
const PERSONS = {
  'Gábor Homoki': { '@type': 'Person', '@id': `${BASE}/#gabor-homoki`, name: 'Gábor Homoki', alternateName: 'Homoki Gábor', jobTitle: 'Co-Founder & CEO', worksFor: { '@id': ORG_ID }, url: `${BASE}/#team`, image: `${BASE}/assets/team-homoki-gabor.webp`, knowsAbout: ['AI automation', 'Voice AI', 'Business process automation'], knowsLanguage: ['hu', 'en'], sameAs: EXT.person_sameas['Gábor Homoki'] || [] },
  'Bence Hudácsek': { '@type': 'Person', '@id': `${BASE}/#bence-hudacsek`, name: 'Bence Hudácsek', alternateName: 'Hudácsek Bence', jobTitle: 'Co-Founder & CTO', worksFor: { '@id': ORG_ID }, url: `${BASE}/#team`, image: `${BASE}/assets/team-hudacsek-bence.webp`, knowsAbout: ['AI automation', 'Software engineering', 'Voice AI', 'Email automation'], knowsLanguage: ['hu', 'en'], sameAs: EXT.person_sameas['Bence Hudácsek'] || [] },
};
const TOPIC = {
  ai: ORG_EXTRA.knowsAbout[0], bpa: ORG_EXTRA.knowsAbout[1], rpa: ORG_EXTRA.knowsAbout[2],
  va: ORG_EXTRA.knowsAbout[3], ivr: ORG_EXTRA.knowsAbout[4], llm: ORG_EXTRA.knowsAbout[5], wf: ORG_EXTRA.knowsAbout[6],
  email: { '@type': 'Thing', name: 'Email', sameAs: ['https://en.wikipedia.org/wiki/Email'] },
};
function topicsFor(path) {
  if (/phone|telefon/.test(path)) return [TOPIC.va, TOPIC.ivr, TOPIC.ai, TOPIC.llm];
  if (/email/.test(path)) return [TOPIC.email, TOPIC.ai, TOPIC.llm, TOPIC.wf];
  if (/automat/.test(path)) return [TOPIC.bpa, TOPIC.rpa, TOPIC.wf, TOPIC.ai];
  return [TOPIC.ai, TOPIC.bpa, TOPIC.va];
}

/* ───────────────────────── per-page transforms ───────────────────────── */
function hreflangBlock(p) {
  const hu = p.lang === 'hu' ? p.path : p.alt;
  const en = p.lang === 'en' ? p.path : p.alt;
  const lines = [];
  if (hu) lines.push(`<link rel="alternate" hreflang="hu" href="${BASE}${hu === '/' ? '/' : hu}">`);
  if (en) lines.push(`<link rel="alternate" hreflang="en" href="${BASE}${en}">`);
  lines.push(`<link rel="alternate" hreflang="x-default" href="${BASE}${(hu || p.path) === '/' ? '/' : hu || p.path}">`);
  return lines.join('\n');
}

function fontsAndCss(h) {
  const interCss = readFileSync(join(ROOT, 'assets/fonts/inter.css'), 'utf8').trim();
  const consentCss = existsSync(join(ROOT, 'assets/consent.css')) ? readFileSync(join(ROOT, 'assets/consent.css'), 'utf8') : '';
  h = h.replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*/g, '')
       .replace(/<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\s*/g, '');
  h = h.replace(/<link href="https:\/\/fonts\.googleapis\.com\/css2\?family=Inter[^"]*" rel="stylesheet">/,
    // only the latin subset is preloaded: the hero copy needs nothing outside it,
    // and a second preload would share the bandwidth the LCP text is waiting on
    `<link rel="preload" as="font" type="font/woff2" href="/assets/fonts/inter-latin.woff2" crossorigin>\n` +
    `<style>${interCss}</style>`);
  if (consentCss) h = h.replace(/<link rel="stylesheet" href="(?:\.\.\/)?assets\/consent\.css">/, `<style>${consentCss.trim()}</style>`);
  return h;
}

function landmarks(h) {
  // class-based CSS only (verified: no element-qualified selectors on these), so
  // the nav wrapper can take its semantic name; main content gets a <main> that
  // wraps everything between the site header and the footer. No visual change.
  h = h.replace('<div class="nav-outer">', '<header class="nav-outer">');
  if (h.includes('<header class="nav-outer">')) h = h.replace(/<\/nav>\s*<\/div>/, '</nav>\n</header>');
  if (/<main[\s>]/.test(h)) return h;
  const bodyStart = h.indexOf('<body');
  const footerAt = h.indexOf('<footer', bodyStart);
  if (footerAt < 0) return h;
  let openAt = -1;
  const marker = h.indexOf('<!-- /CHROME:HEADER -->', bodyStart);
  if (marker > 0) openAt = marker + '<!-- /CHROME:HEADER -->'.length;
  else { const pg = h.indexOf('<div class="page">', bodyStart); if (pg > 0) openAt = h.indexOf('</header>', pg) + '</header>'.length; }
  if (openAt < 0 || openAt > footerAt) return h;
  return h.slice(0, openAt) + '\n<main>' + h.slice(openAt, footerAt) + '</main>\n' + h.slice(footerAt);
}

function enrichSchema(h, p, url, lang) {
  const pageType = p.article ? 'BlogPosting' : null;
  const speak = { '@type': 'SpeakableSpecification', cssSelector: p.article ? ['h1', 'p.lead'] : ['h1', '#hero .b1'] };
  let sawPageNode = false;
  h = mapJsonLd(h, (obj) => {
    for (const n of nodes(obj)) {
      if (hasType(n, 'Organization') && n['@id'] === ORG_ID) {
        Object.assign(n, ORG_EXTRA);
        n.founder = [PERSONS['Gábor Homoki'], PERSONS['Bence Hudácsek']];
        n.contactPoint = Object.assign({}, n.contactPoint, { telephone: ORG_EXTRA.telephone, areaServed: 'HU' });
        n.foundingLocation = { '@type': 'Place', address: ORG_EXTRA.address };
      }
      if (hasType(n, 'BlogPosting', 'Article')) {
        sawPageNode = true;
        n['@id'] = `${url}#article`;
        n.mainEntityOfPage = { '@type': 'WebPage', '@id': url };
        n.url = url;
        n.inLanguage = lang;
        n.isAccessibleForFree = true;
        n.speakable = speak;
        n.about = topicsFor(p.path).slice(0, 2);
        n.mentions = topicsFor(p.path).slice(2);
        n.publisher = { '@id': ORG_ID };
        const author = Array.isArray(n.author) ? n.author[0] : n.author;
        if (author && PERSONS[author.name]) n.author = PERSONS[author.name];
        n.copyrightHolder = { '@id': ORG_ID };
        if (!n.wordCount) {
          const art = h.match(/<article[\s\S]*?<\/article>/);
          if (art) n.wordCount = stripTags(art[0].replace(/<script[\s\S]*?<\/script>/g, '')).split(' ').length;
        }
        n.translationOfWork = undefined;
        if (p.alt) n.workTranslation = { '@type': 'BlogPosting', '@id': `${BASE}${p.alt}#article`, url: `${BASE}${p.alt}`, inLanguage: lang === 'hu' ? 'en' : 'hu' };
      }
      if (hasType(n, 'Blog', 'CollectionPage', 'WebPage', 'AboutPage', 'ContactPage')) {
        sawPageNode = true;
        n['@id'] = url; n.url = url; n.inLanguage = n.inLanguage || lang;
        n.isPartOf = { '@id': `${BASE}/#website` };
        n.about = n.about || [{ '@id': ORG_ID }];
        n.mentions = topicsFor(p.path);
        n.speakable = speak;
        n.publisher = { '@id': ORG_ID };
      }
      if (hasType(n, 'FAQPage')) { n.inLanguage = lang; n.isPartOf = { '@id': url }; }
      if (hasType(n, 'WebSite')) {
        n.alternateName = 'Automating.hu';
        n.description = 'AI automation for businesses: AI phone assistants, email automation and workflow systems. Hungarian B2B provider, services in Hungarian and English.';
        n.potentialAction = { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${BASE}/blog?q={search_term_string}` }, 'query-input': 'required name=search_term_string' };
      }
    }
    return obj;
  });
  if (!sawPageNode) {
    // pages without a page-level node (home, legal): add a WebPage node
    const title = (h.match(/<title>([^<]*)<\/title>/) || [])[1] || 'Automating';
    const desc = metaContent(h, 'name', 'description') || '';
    const node = {
      '@context': 'https://schema.org', '@type': p.path === '/' || p.path === '/en' ? 'WebPage' : 'WebPage',
      '@id': url, url, name: unesc(title), description: desc, inLanguage: lang,
      isPartOf: { '@id': `${BASE}/#website` }, about: { '@id': ORG_ID }, publisher: { '@id': ORG_ID },
      mentions: topicsFor(p.path), speakable: speak,
      primaryImageOfPage: { '@type': 'ImageObject', url: `${BASE}/og-image.png`, width: 1200, height: 630 },
      dateModified: p.lastmod,
    };
    if (p.path === '/' || p.path === '/en') {
      node.mainEntity = { '@id': ORG_ID };
      node.breadcrumb = { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: lang === 'hu' ? 'Főoldal' : 'Home', item: url }] };
    }
    h = h.replace('</head>', `<script type="application/ld+json">${JSON.stringify(node)}</script>\n</head>`);
  }
  return h;
}

function markdownOf(html, url, title) {
  let a = (html.match(/<article[^>]*>([\s\S]*?)<\/article>/) || [])[1] || '';
  a = a.replace(/<div class="cta-box">[\s\S]*?<\/div>\s*<\/div>/, '').replace(/<script[\s\S]*?<\/script>/g, '');
  a = a.replace(/<p class="kicker">[\s\S]*?<\/p>/, '');
  const conv = (s) => s
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/g, (m, t) => `\n# ${stripTags(t)}\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, (m, t) => `\n## ${stripTags(t)}\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, (m, t) => `\n### ${stripTags(t)}\n`)
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/g, (m, t) => { let i = 0; return '\n' + t.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (x, li) => `${++i}. ${inline(li)}\n`); })
    .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/g, (m, t) => '\n' + t.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (x, li) => `- ${inline(li)}\n`))
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/g, (m, t) => `\n${inline(t)}\n`)
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n').trim();
  const inline = (s) => unesc(s
    .replace(/<strong>([\s\S]*?)<\/strong>/g, '**$1**')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (m, href, t) => `[${stripTags(t)}](${href.startsWith('/') ? BASE + href : href})`)
    .replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  return `---\ntitle: "${title.replace(/"/g, '\\"')}"\nurl: ${url}\npublisher: Automating (${BASE})\n---\n\n${conv(a)}\n`;
}

/* ───────────────────────── main pass ───────────────────────── */
const sitemapEntries = [];
const corpus = [];
let esbuild = null;
for (const cand of [join(ROOT, 'node_modules/esbuild'), join(ROOT, '..', 'automating-commerce/node_modules/esbuild'), join(ROOT, '..', 'automating-newsletter/node_modules/esbuild')]) {
  if (existsSync(cand)) { try { esbuild = await import(cand + '/lib/main.js'); break; } catch (e) { esbuild = null; } }
}

function minifyInline(h) {
  if (!esbuild) return h;
  h = h.replace(/<style>([\s\S]*?)<\/style>/g, (m, css) => {
    try { return `<style>${esbuild.transformSync(css, { loader: 'css', minify: true }).code.trim()}</style>`; } catch { return m; }
  });
  h = h.replace(/<script>([\s\S]*?)<\/script>/g, (m, js) => {
    try { return `<script>${esbuild.transformSync(js, { loader: 'js', minify: true, target: 'es2019', charset: 'utf8' }).code.trim()}</script>`; } catch (e) { console.warn('  ! js minify skipped:', e.message.split('\n')[0]); return m; }
  });
  return h;
}

/* The page's own inline script (the last, large <script> before </body>) becomes
   an external deferred file. Execution order relative to the DOM is unchanged
   (deferred scripts run after parsing, in document order), but the HTML parser
   no longer stalls on compiling ~50 KB of JS before the first frames commit. */
function externalizePageScript(h, file) {
  const m = h.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
  if (!m || m[1].length < 8000) return h;
  const js = m[1];
  const hash = createHash('sha256').update(js).digest('hex').slice(0, 10);
  const name = `assets/page-${file.replace(/\.html$/, '').replace(/[\/]/g, '-')}.${hash}.js`;
  write(name, js);
  return h.replace(m[0], `<script src="/${name}" defer></script>\n</body>`);
}

function processPage(p, html, { lang, path, file, srcFile }) {
  const url = BASE + (path === '/' ? '/' : path);
  let h = html;
  h = h.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">\n${hreflangBlock({ ...p, lang, path })}`);
  if (!/rel="canonical"/.test(h)) h = h.replace('</head>', `<link rel="canonical" href="${url}">\n${hreflangBlock({ ...p, lang, path })}\n</head>`);
  h = setMeta(h, 'property', 'og:url', url);
  if (!metaContent(h, 'property', 'og:locale')) h = setMeta(h, 'property', 'og:locale', lang === 'hu' ? 'hu_HU' : 'en_US');
  if (!metaContent(h, 'property', 'og:locale:alternate')) h = setMeta(h, 'property', 'og:locale:alternate', lang === 'hu' ? 'en_US' : 'hu_HU');
  if (!metaContent(h, 'property', 'og:title')) h = setMeta(h, 'property', 'og:title', unesc((h.match(/<title>([^<]*)<\/title>/) || [])[1] || ''));
  if (!metaContent(h, 'property', 'og:image')) h = setMeta(h, 'property', 'og:image', `${BASE}/og-image.png`);
  if (!metaContent(h, 'property', 'og:type')) h = setMeta(h, 'property', 'og:type', 'website');
  if (!metaContent(h, 'property', 'og:site_name')) h = setMeta(h, 'property', 'og:site_name', 'Automating');
  if (!metaContent(h, 'name', 'twitter:card')) h = setMeta(h, 'name', 'twitter:card', 'summary_large_image');
  if (!metaContent(h, 'property', 'og:description')) h = setMeta(h, 'property', 'og:description', metaContent(h, 'name', 'description') || '');
  h = fontsAndCss(h);
  h = landmarks(h);
  if (p.article) {
    const mdPath = `${path}.md`;
    const title = unesc((h.match(/<title>([^<]*)<\/title>/) || [])[1] || '').replace(/ — Automating$/, '');
    const md = markdownOf(h, url, title);
    write(mdPath, md);
    corpus.push({ url, lang, md });
    h = h.replace('</head>', `<link rel="alternate" type="text/markdown" href="${BASE}${mdPath}" title="Markdown">\n</head>`);
  }
  if (!p.article && /^\/(en|case-studies(-en)?|blog(-en)?)?$/.test(path)) {
    const mdPath = (path === '/' ? '/index' : path) + '.md';
    const title = unesc((h.match(/<title>([^<]*)<\/title>/) || [])[1] || '');
    write(mdPath, `---\ntitle: "${title.replace(/"/g, '\\"')}"\nurl: ${url}\npublisher: Automating (${BASE})\n---\n\n${sectionsText(h)}\n`);
    h = h.replace('</head>', `<link rel="alternate" type="text/markdown" href="${BASE}${mdPath}" title="Markdown">\n</head>`);
  }
  h = enrichSchema(h, { ...p, path, lastmod: p.lastmod }, url, lang);
  h = minifyInline(h);
  h = externalizePageScript(h, file);
  write(file, h);
  const alt = lang === 'hu' ? p.alt : (p.lang === 'en' ? p.alt : p.path);
  sitemapEntries.push({ url, lastmod: p.lastmod, lang, hu: lang === 'hu' ? url : alt && BASE + alt, en: lang === 'en' ? url : alt && BASE + alt, priority: p.priority });
}

for (const p of PAGES) {
  const html = read(p.file);
  // lastmod: articles carry their own truth in schema; other pages use git
  const dm = html.match(/"dateModified":\s*"(\d{4}-\d{2}-\d{2})/);
  p.lastmod = p.article && dm ? dm[1] : gitDate(p.file);
  p.priority = p.path === '/' ? '1.0' : p.article ? '0.7' : /blog|case/.test(p.path) ? '0.8' : '0.3';
  processPage(p, html, { lang: p.lang, path: p.path, file: p.file });

  if (p.gen) {
    const T = extractT(html);
    if (!T || !T.en) { console.warn(`  ! no T.en in ${p.file}, skipping ${p.gen.path}`); continue; }
    let en = replaceI18n(html, T.en);
    en = en.replace(/<html lang="hu"/, 'html lang="en" data-page-lang="en"'.replace(/^/, '<'));
    const titleM = html.match(/document\.title = lang === 'hu'\s*\?\s*'([^']*)'\s*:\s*'([^']*)'/);
    const descM = html.match(/metaDesc\.content = lang === 'hu'\s*\?\s*'([^']*)'\s*:\s*'([^']*)'/);
    const enTitle = titleM ? titleM[2] : unesc((html.match(/<title>([^<]*)<\/title>/) || [])[1]);
    const enDesc = descM ? descM[2] : metaContent(html, 'name', 'description');
    en = en.replace(/<title>[^<]*<\/title>/, `<title>${esc(enTitle)}</title>`);
    en = setMeta(en, 'name', 'description', enDesc);
    en = setMeta(en, 'property', 'og:title', enTitle);
    en = setMeta(en, 'property', 'og:description', enDesc);
    en = setMeta(en, 'name', 'twitter:title', enTitle);
    en = setMeta(en, 'name', 'twitter:description', enDesc);
    en = setMeta(en, 'property', 'og:image:alt', enTitle);
    en = setMeta(en, 'property', 'og:locale', 'en_US');
    en = setMeta(en, 'property', 'og:locale:alternate', 'hu_HU');
    // static href for English visitors (JS would do the same on load)
    en = en.replace(/<a ([^>]*?)href="([^"]*)"([^>]*?)data-en-href="([^"]*)"/g, '<a $1href="$4"$3data-en-href="$4" data-hu-href="$2"');
    en = en.replace(/alt="([^"]*)"([^>]*)data-alt-hu="([^"]*)" data-alt-en="([^"]*)"/g, 'alt="$4"$2data-alt-hu="$3" data-alt-en="$4"');
    // English readers get the English counterparts of the bilingual pages
    en = en.replace(/href="\/case-studies"/g, 'href="/case-studies-en"').replace(/href="\/blog"(?![-\w])/g, 'href="/blog-en"');
    // the page's own language detection must respect the URL
    en = en.replace(/function detectLang\(\) \{/, `function detectLang() {\n  const forced = document.documentElement.dataset.pageLang;\n  if (forced) { try { localStorage.setItem('lang', forced); } catch (e) {} return forced; }`);
    // English FAQ schema from the same dictionary
    en = mapJsonLd(en, (obj) => {
      if (obj['@type'] === 'FAQPage' && Array.isArray(obj.mainEntity)) {
        obj.inLanguage = 'en';
        obj.mainEntity = obj.mainEntity.map((q, i) => {
          const qk = T.en[`faq.q${i + 1}`], ak = T.en[`faq.a${i + 1}`];
          if (!qk || !ak) return q;
          return { '@type': 'Question', name: stripTags(qk), acceptedAnswer: { '@type': 'Answer', text: stripTags(ak) } };
        });
      }
      for (const n of nodes(obj)) {
        if (hasType(n, 'Service') && T.en) { /* names stay canonical; description language-neutral enough */ }
        if (hasType(n, 'CollectionPage', 'WebPage') && n.name) n.name = enTitle;
      }
      return obj;
    });
    const gp = { ...p, lang: 'en', path: p.gen.path, alt: p.path, article: false, lastmod: p.lastmod };
    processPage(gp, en, { lang: 'en', path: p.gen.path, file: p.gen.file });
  }
}

/* ───────────────────────── site-wide files ───────────────────────── */
const xhtml = (e) => [e.hu && `    <xhtml:link rel="alternate" hreflang="hu" href="${e.hu}"/>`, e.en && `    <xhtml:link rel="alternate" hreflang="en" href="${e.en}"/>`, e.hu && `    <xhtml:link rel="alternate" hreflang="x-default" href="${e.hu}"/>`].filter(Boolean).join('\n');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
  sitemapEntries.map((e) => `  <url>\n    <loc>${e.url}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n    <priority>${e.priority}</priority>\n${xhtml(e)}\n  </url>`).join('\n') + '\n</urlset>\n';
write('sitemap.xml', sitemap);

const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Googlebot', 'bingbot', 'Applebot', 'Applebot-Extended', 'Amazonbot', 'meta-externalagent', 'DuckAssistBot', 'YouBot', 'cohere-ai', 'MistralAI-User', 'Bytespider', 'CCBot'];
const robots = `# automating.hu — crawl policy (2026-08-23)
# Search and answer engines are welcome; the site is built to be read and cited.
# Content-Signal: search=yes, ai-input=yes, ai-train=no (preference, not a block).

User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=no
Allow: /
Disallow: /cdn-cgi/
Disallow: /koszonjuk

${AI_BOTS.map((b) => `User-agent: ${b}\nAllow: /\nDisallow: /cdn-cgi/\nDisallow: /koszonjuk`).join('\n\n')}

Sitemap: ${BASE}/sitemap.xml
# Machine-readable summaries: ${BASE}/llms.txt  ·  ${BASE}/llms-full.txt
`;
write('robots.txt', robots);

/* IndexNow key file — the key itself lives in external.json so it is reviewable */
if (EXT.indexnow_key) write(`${EXT.indexnow_key}.txt`, EXT.indexnow_key);

/* llms.txt (curated) + llms-full.txt (corpus) */
const huArticles = PAGES.filter((p) => p.article && p.lang === 'hu');
const enArticles = PAGES.filter((p) => p.article && p.lang === 'en');
const titleOf = (p) => unesc((read(p.file).match(/<title>([^<]*)<\/title>/) || [])[1] || '').replace(/ — Automating$/, '');
const llms = `# Automating (automating.hu)

> Automating is a Hungarian B2B AI-automation provider founded by Gábor Homoki (CEO) and Bence Hudácsek (CTO). It builds AI infrastructure for businesses: AI phone voice assistants that answer every call 24/7 (orders, bookings, lead qualification, CRM and calendar integration), AI email automation (reads, classifies and answers mail, follow-up sequences) and back-office workflow automation (invoicing, data entry, CRM sync, reporting). Hungarian-language first, English available. Free 30-minute consultation; delivery in days, not months; modular scope starting from one fast-payback process. Legal entity: Hudácsek Bence EV., 9127 Csikvánd, Hunyadi János utca 12., Hungary (VAT 91949811-1-28). Contact: hello@automating.hu, +36 50 108 9523.

Az Automating (automating.hu) magyar B2B AI-automatizálási szolgáltató. Vállalkozásoknak épít AI-infrastruktúrát: telefonos AI-hangasszisztenst (minden hívást felvesz, rendelést, időpontot rögzít, érdeklődőt minősít, CRM- és naptárintegrációval), e-mail-automatizálást és munkafolyamat-automatizálást. Ingyenes 30 perces konzultáció; moduláris, gyorsan megtérülő ponton induló bevezetés.

## Key pages / Fő oldalak

- [Home (HU)](${BASE}/): services, live AI demos (chat, voice, email), FAQ
- [Home (EN)](${BASE}/en): same page in English
- [Case studies (HU)](${BASE}/case-studies) · [EN](${BASE}/case-studies-en): six delivered systems with measured outcomes
- [Blog (HU)](${BASE}/blog) · [Blog (EN)](${BASE}/blog-en)
- [Imprint / Impresszum](${BASE}/impresszum): legal identity and registration data

## Articles (Hungarian)

${huArticles.map((p) => `- [${titleOf(p)}](${BASE}${p.path}) — markdown: ${BASE}${p.path}.md`).join('\n')}

## Articles (English)

${enArticles.map((p) => `- [${titleOf(p)}](${BASE}${p.path}) — markdown: ${BASE}${p.path}.md`).join('\n')}

## Facts worth citing

- Services: AI phone assistant (voice AI), AI email automation, workflow / back-office automation, AI agents integrated with CRM, calendar and webshop systems
- Market: Hungary (Hungarian language), English-speaking clients served remotely
- Engagement model: free 30-minute consultation → itemised quote → modular build → monthly operation (API, telephony, hosting, maintenance itemised)
- Founders: Gábor Homoki (Co-Founder, CEO), Bence Hudácsek (Co-Founder, CTO)
- Profiles: ${EXT.sameas_verified.join(' · ')}

## Machine access

- Sitemap: ${BASE}/sitemap.xml
- Full text corpus: ${BASE}/llms-full.txt
- Crawl policy: ${BASE}/robots.txt (search and AI answer engines allowed)
- Contact: hello@automating.hu · Booking: https://www.cal.com/automating.hu/30-perces-hivas
`;
write('llms.txt', llms);

/* corpus: home + case studies (visible text by section) + all articles as markdown */
function sectionsText(html) {
  let b = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<header[\s\S]*?<\/header>/g, '').replace(/<footer[\s\S]*?<\/footer>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '');
  b = b.replace(/<(h1|h2|h3)[^>]*>([\s\S]*?)<\/\1>/g, (m, t, x) => `\n\n${'#'.repeat(+t[1])} ${stripTags(x)}\n\n`)
       .replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (m, x) => m.length > 1500 ? m : `\n- ${stripTags(x)}\n`)
       .replace(/<\/(p|div|section|details|summary|tr|article|ul|ol)>/g, '\n');
  return unesc(b.replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n /g, '\n').replace(/\n\s*\n/g, '\n\n').replace(/\n{3,}/g, '\n\n').trim();
}
const full = [`# Automating — full text corpus (generated ${TODAY})\n\n` + llms.split('## Key pages')[0].trim()];
for (const f of ['index.html', 'en.html', 'case-studies.html', 'case-studies-en.html']) {
  if (!existsSync(join(OUT, f))) continue;
  const h = read(f);
  full.push(`\n\n---\n\n# ${unesc((h.match(/<title>([^<]*)<\/title>/) || [])[1])}\nURL: ${BASE}/${f === 'index.html' ? '' : f.replace(/\.html$/, '')}\n\n${sectionsText(h)}`);
}
for (const c of corpus) full.push(`\n\n---\n\nURL: ${c.url}\nLanguage: ${c.lang}\n\n${c.md.replace(/^---[\s\S]*?---\n/, '')}`);
write('llms-full.txt', full.join('\n'));

/* minify shared assets too */
if (esbuild) {
  for (const f of ['assets/chrome.js', 'assets/consent.js']) if (existsSync(join(OUT, f))) write(f, esbuild.transformSync(read(f), { loader: 'js', minify: true, target: 'es2019', charset: 'utf8' }).code);
  for (const f of ['assets/chrome.css', 'assets/consent.css']) if (existsSync(join(OUT, f))) write(f, esbuild.transformSync(read(f), { loader: 'css', minify: true }).code);
}

console.log(`enhance: ${sitemapEntries.length} URLs in sitemap, ${corpus.length} markdown alternates, esbuild=${!!esbuild}`);

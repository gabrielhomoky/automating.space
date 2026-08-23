/* Assemble site-deploy/ - what automating.hu publishes.
 *
 * GitHub Pages got this list from Jekyll's _config.yml exclude block. Cloudflare
 * Pages has no such thing: it publishes whatever sits in the output directory.
 * So the exclusions move here, and the two lists have to stay in step.
 *
 * The store is the reason any of this matters. store.html and termek/ live
 * canonically on store.automating.hu; publishing them here as well puts the same
 * pages on two domains and Search Console reports the duplicates as "Alternate
 * page with proper canonical tag". functions/ is the store's Pages Functions -
 * on this project they would mount live API routes on automating.hu, which is
 * worse than a duplicate page.
 *
 * Excluding rather than allow-listing is deliberate: a new page added to the
 * repo should publish by default, the way it did under Jekyll.
 *
 * Deploy from inside site-deploy/, never from the repo root:
 *
 *   cd site-deploy && wrangler pages deploy .
 *
 * `wrangler pages deploy <dir>` picks up Functions from ./functions in the
 * WORKING DIRECTORY, not from the directory being deployed. Run it at the repo
 * root and the store's functions/ mount themselves on this project no matter
 * what the exclude list says.
 */
import { cpSync, rmSync, mkdirSync, readdirSync, statSync } from 'node:fs';

const EXCLUDE = new Set([
  // mirrors _config.yml exclude
  'store.html', 'termek', 'build-products.mjs', 'tools', 'node_modules',
  // the store's Pages Functions - must not mount on automating.hu
  'functions',
  // build outputs and repo plumbing
  'site-deploy', 'store-deploy', '.git', '.gitignore', '.wrangler',
  'build-site.mjs',
  // internal docs - must not become public URLs
  'HANDOFF.md',
  // GitHub Pages artefacts with no meaning on Cloudflare
  '_config.yml', 'CNAME',
]);

rmSync('site-deploy', { recursive: true, force: true });
mkdirSync('site-deploy');

const copied = [];
for (const entry of readdirSync('.')) {
  if (EXCLUDE.has(entry)) continue;
  cpSync(entry, `site-deploy/${entry}`, { recursive: true });
  copied.push(entry);
}

/* Guard: the SEO failure this script exists to prevent is silent - the pages
   deploy fine and the duplicates only surface in Search Console weeks later. */
for (const banned of ['store.html', 'termek', 'functions']) {
  try { statSync(`site-deploy/${banned}`); throw new Error(`${banned} leaked into site-deploy`); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
}

console.log(`site-deploy/ built - ${copied.length} entries: ${copied.sort().join(', ')}`);
console.log('deploy with:  cd site-deploy && wrangler pages deploy . --project-name automating-hu');

/* SEO / AEO / GEO layer: machine-facing additions and delivery optimisations on
   top of the assembled output. Source HTML stays untouched. */
await import('./tools/seo/enhance.mjs');

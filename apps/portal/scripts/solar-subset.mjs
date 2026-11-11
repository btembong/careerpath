// Packs only the Solar icons the portal uses into src/lib/solar-subset.json.
// The full set is ~8,400 icons (11.5 MB, 2.1 MB compressed) and was loaded on every page.
// Runs on every build and dev start (from next.config.mjs); `node scripts/solar-subset.mjs` runs it by hand.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sourceFiles(p);
    else if (/\.(tsx?|jsx?)$/.test(name)) yield p;
  }
}

export function writeSolarSubset() {
  const full = JSON.parse(readFileSync(createRequire(import.meta.url).resolve('@iconify-json/solar/icons.json'), 'utf8'));
  const has = n => n in full.icons || n in (full.aliases ?? {});

  // Every "solar:name" the code mentions, plus the outline (-linear) twin of each -bold icon (<Icon line>)
  const wanted = new Set();
  for (const f of sourceFiles(join(root, 'src'))) {
    for (const [, n] of readFileSync(f, 'utf8').matchAll(/solar:([a-z0-9-]+)/g)) {
      wanted.add(n);
      if (n.endsWith('-bold')) wanted.add(n.replace(/-bold$/, '-linear'));
    }
  }

  const out = { prefix: full.prefix, icons: {}, aliases: {}, ...(full.width && { width: full.width }), ...(full.height && { height: full.height }) };
  const add = n => {
    if (full.icons[n]) out.icons[n] = full.icons[n];
    else if (full.aliases?.[n]) { out.aliases[n] = full.aliases[n]; add(full.aliases[n].parent); }
  };
  const missing = [...wanted].filter(n => !has(n) && !n.endsWith('-linear'));
  [...wanted].filter(has).sort().forEach(add);
  if (!Object.keys(out.aliases).length) delete out.aliases;

  const target = join(root, 'src/lib/solar-subset.json');
  const json = JSON.stringify(out);
  let before = '';
  try { before = readFileSync(target, 'utf8'); } catch { /* first run */ }
  if (before !== json) writeFileSync(target, json);
  if (missing.length) console.warn(`[solar-subset] not in the Solar set: ${missing.join(', ')}`);
  return { icons: Object.keys(out.icons).length, bytes: json.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = writeSolarSubset();
  console.log(`solar-subset: ${r.icons} icons, ${(r.bytes / 1024).toFixed(1)} KB`);
}

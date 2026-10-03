// check-preview-sync.mjs — CI guard against silent drift between
// trackrecord/ (stable) and trackrecord/preview/ (preview build).
//
// preview/ intentionally mirrors most of the stable app's sources. The only
// legitimate differences are:
//   - relative asset paths  (../data/, ../icons/, ../favicon.svg, ../kao-banner.js)
//   - the version badge text (stable vs preview version)
//   - the cross-link paragraph (stable links to preview/, preview links back)
// Everything else must be identical after those normalizations.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stableDir = join(root, 'trackrecord');
const previewDir = join(stableDir, 'preview');

// Top-level source files that must stay mirrored (data/, icons/ and
// kao-banner.js are shared via ../ paths, not copied).
const MIRRORED = [
  'index.html',
  'style.css',
  'main.js',
  'core.js',
  'calendar.js',
  'settings.js',
  'standard-view.js',
  'render-bus.js',
];

function normalize(text, isPreview) {
  let out = text;
  if (isPreview) {
    out = out
      .replaceAll('../favicon.svg', './favicon.svg')
      .replaceAll('../kao-banner.js', 'kao-banner.js')
      .replaceAll('../data/', './data/')
      .replaceAll('../icons/', './icons/')
      .replaceAll('href="../../"', 'href="../"');
  }
  // Build tag: console.info('build v5.0.2'); vs console.info('[preview] build v5.1-beta1.5');
  out = out.replace(
    /console\.info\('.*?build .*?'\);/g,
    "console.info('BUILD_TAG');"
  );
  // Version badge: <strong>v5.0.2</strong> vs <strong>v5.1-beta1.5</strong>.
  out = out.replace(
    /<div class="version-item"><span>Version<\/span><strong>.*?<\/strong><\/div>/g,
    '<div class="version-item"><span>Version</span><strong>VERSION</strong></div>'
  );
  // Cross-link paragraph between the two builds.
  out = out.replace(
    /Want to (try the alternate|return to the stable) build\? Open the <a href="(preview\/|\.\.\/)">(Preview|Main) version <span>\(current version: .*?\)<\/span><\/a>\./g,
    'CROSS_LINK'
  );
  // Carotene "mini landing page" comment, which describes the relative
  // depth of each build.
  out = out.replace(
    /<!-- Mini landing page\. The brand links up to the Carotene hub, which is[\s\S]*?you are already there\. -->/g,
    '<!-- CAROTENE_HUB_COMMENT -->'
  );
  return out;
}

function firstDiffLine(a, b) {
  const al = a.split('\n');
  const bl = b.split('\n');
  const n = Math.max(al.length, bl.length);
  for (let i = 0; i < n; i++) {
    if (al[i] !== bl[i]) return { line: i + 1, a: al[i] ?? '<missing>', b: bl[i] ?? '<missing>' };
  }
  return null;
}

let failures = 0;

// 1. preview/ must not gain files outside the mirrored set (keeps this
//    guard honest: new sources have to be added to MIRRORED explicitly).
const previewFiles = readdirSync(previewDir, { withFileTypes: true })
  .filter((e) => e.isFile())
  .map((e) => e.name);
for (const f of previewFiles) {
  if (!MIRRORED.includes(f)) {
    console.error(`UNEXPECTED preview file (not in MIRRORED list): preview/${f}`);
    failures++;
  }
}

// 2. Every mirrored file must exist in both builds and match after
//    normalization.
for (const f of MIRRORED) {
  const stablePath = join(stableDir, f);
  const previewPath = join(previewDir, f);
  let stableText, previewText;
  try {
    stableText = readFileSync(stablePath, 'utf8');
  } catch {
    console.error(`MISSING stable file: trackrecord/${f}`);
    failures++;
    continue;
  }
  try {
    previewText = readFileSync(previewPath, 'utf8');
  } catch {
    console.error(`MISSING preview file: trackrecord/preview/${f}`);
    failures++;
    continue;
  }
  const a = normalize(stableText, false);
  const b = normalize(previewText, true);
  if (a !== b) {
    const d = firstDiffLine(a, b);
    console.error(`DRIFT in ${f} (first diff at normalized line ${d.line}):`);
    console.error(`  stable : ${d.a.slice(0, 160)}`);
    console.error(`  preview: ${d.b.slice(0, 160)}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\ncheck-preview-sync: ${failures} problem(s) found.`);
  process.exit(1);
}
console.log('check-preview-sync: preview/ is in sync with trackrecord/.');

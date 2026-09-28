#!/usr/bin/env node
/**
 * check-imports.mjs - verify every ES module import resolves to a real export.
 *
 * Why this exists: `node --check` parses each file in isolation and terser
 * does not bundle, so NEITHER catches an import naming a symbol the target
 * module does not export. That mistake passes CI green and then throws
 *
 *   SyntaxError: The requested module './core.js' does not provide an
 *   export named 'typoedName'
 *
 * in the browser - i.e. a blank page for every visitor. This closes that gap.
 *
 * Usage:
 *   node tools/check-imports.mjs [dir ...]     (default: current directory)
 *
 * Exits 0 if every import resolves, 1 otherwise. Failures are printed as
 * GitHub Actions ::error:: annotations so they surface on the commit/PR.
 *
 * Scope note - what this does and does NOT catch:
 *
 *   Catches  - an import naming a symbol the target module does not export
 *              (the blank-page SyntaxError), and an unresolvable module path.
 *   Does NOT - using an identifier that was never imported or declared. That
 *              surfaces as a runtime ReferenceError, not an unresolved
 *              import, and catching it needs real scope analysis (a linter).
 *              For example, deleting `import { renderMainView } from
 *              './render-bus.js'` leaves no broken binding - the check stays
 *              green and the app fails later with "renderMainView is not
 *              defined". Use a linter for that class of mistake.
 *   Does NOT - report "exported but never imported". That judgement is
 *              unsound to automate: a symbol may be legitimately used only
 *              inside its own file, and some references are built at runtime
 *              via string interpolation (e.g. `var(--${tier})`).
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// 'data' is NOT skipped: it holds real ES modules (DATABASE, RACES, ...) whose
// exports are imported by the view modules. 'icons' is binary, 'tools' holds
// this script, 'deploy' is build output.
const SKIP_DIRS = new Set(['node_modules', '.git', 'icons', 'deploy', 'tools', '.github']);

const dirs = process.argv.slice(2);
if (dirs.length === 0) dirs.push('.');

/** Collect every .js file in a tree, skipping non-source directories. */
function jsFiles(root) {
  const out = [];
  const walk = d => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        walk(p);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        out.push(p);
      }
    }
  };
  walk(root);
  return out;
}

/** Extract the export names a module provides. */
function exportsOf(text) {
  const names = new Set();

  // export [async] function|const|let|var|class NAME
  for (const m of text.matchAll(
    /^[ \t]*export[ \t]+(?:async[ \t]+)?(?:function\*?|const|let|var|class)[ \t]+([A-Za-z_$][\w$]*)/gm
  )) names.add(m[1]);

  // export default ...
  if (/^[ \t]*export[ \t]+default[ \t]/m.test(text)) names.add('default');

  // export { a, b as c } [from '...']
  for (const m of text.matchAll(/^[ \t]*export[ \t]*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const n = part.split(/\s+as\s+/).pop().trim();
      if (n) names.add(n);
    }
  }

  // export * from './x.js'  -> merge the target's exports (resolved by caller)
  return { names, starFrom: [...text.matchAll(/^[ \t]*export[ \t]*\*[ \t]*from[ \t]*['"]([^'"]+)['"]/gm)].map(m => m[1]) };
}

/** Extract the imports a module requests: { line, names[], source }. */
function importsOf(text) {
  const out = [];
  const re = /import\s+([\s\S]*?)\s+from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(text))) {
    const clause = m[1];
    const line = text.slice(0, m.index).split('\n').length;
    const brace = clause.match(/\{([\s\S]*)\}/);
    const names = [];
    if (brace) {
      for (const part of brace[1].split(',')) {
        const n = part.split(/\s+as\s+/)[0].trim();
        if (n) names.push(n);
      }
    }
    // bare default import: `import Foo from '...'`
    const bare = clause.replace(/\{[\s\S]*\}/, '').replace(/,/g, '').trim();
    if (bare && !bare.startsWith('*')) names.push('default');

    out.push({ line, names, source: m[2] });
  }
  return out;
}

let failures = 0;
let checked = 0;

for (const dir of dirs) {
  const root = resolve(dir);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    console.log(`::error::check-imports: not a directory: ${dir}`);
    failures++;
    continue;
  }

  const files = jsFiles(root);
  if (files.length === 0) {
    console.log(`::error::check-imports: no .js files found in ${dir}`);
    failures++;
    continue;
  }

  // Pass 1: index every module's exports, following `export * from`.
  // `ensure` also indexes files reached from outside this tree - preview/
  // imports ../data/*.js, which is not under the preview root.
  const table = new Map();
  const ensure = f => {
    if (table.has(f)) return table.get(f);
    if (!existsSync(f)) return null;
    const info = exportsOf(readFileSync(f, 'utf8'));
    table.set(f, info);
    return info;
  };
  for (const f of files) ensure(f);
  // second pass for star re-exports, so ordering does not matter
  for (const [f, info] of [...table]) {
    for (const src of info.starFrom) {
      const t = ensure(resolve(dirname(f), src));
      if (t) for (const n of t.names) info.names.add(n);
    }
  }

  // Pass 2: verify every import binding.
  const problems = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const imp of importsOf(text)) {
      if (!imp.source.startsWith('.')) continue; // bare specifier: external package
      const target = resolve(dirname(f), imp.source);
      const t = table.get(target) || ensure(target);
      if (!t) {
        problems.push({ f, line: imp.line, msg: `cannot resolve module '${imp.source}'` });
        continue;
      }
      for (const n of imp.names) {
        checked++;
        if (!t.names.has(n)) {
          problems.push({ f, line: imp.line, msg: `imports { ${n} } from '${imp.source}', which does not export it` });
        }
      }
    }
  }

  const label = relative(process.cwd(), root) || '.';
  if (problems.length === 0) {
    console.log(`OK  ${label}: ${files.length} module(s), ${checked} import binding(s) all resolve`);
  } else {
    for (const p of problems) {
      console.log(`::error file=${relative(process.cwd(), p.f).split(sep).join('/')},line=${p.line}::${p.msg}`);
    }
    console.log(`FAIL ${label}: ${problems.length} unresolved import(s) in ${files.length} module(s)`);
    failures += problems.length;
  }
}

if (failures > 0) {
  console.error(`\ncheck-imports: ${failures} problem(s) found. An unresolved import is a runtime`);
  console.error(`SyntaxError in the browser, not caught by node --check or terser.`);
  process.exit(1);
}
console.log('\ncheck-imports: all imports resolve.');

#!/usr/bin/env node
/**
 * Static "what runs before the first frame" graph for the production app.
 *
 * In production, expo-router evaluates only the `_layout` files (plus the
 * initial route) at startup; screens load when first rendered. Metro has no
 * tree shaking and `inlineRequires: false`, so every module those files import
 * statically — and everything that imports — runs at cold start.
 *
 * Seeds: every app/**\/_layout file + app/index. Followed edges:
 *   - import / export-from declarations, except type-only ones and imports whose
 *     bindings are only used in type positions (Babel elides those)
 *   - require('x') calls that are NOT inside a function body
 * Not followed (lazy): require() inside functions, dynamic import().
 *
 * Usage (from the repo root):
 *   node scripts/perf/boot-graph.js                 # summary + npm packages
 *   node scripts/perf/boot-graph.js --why lib/foo   # import chain that pulls a module in
 *   node scripts/perf/boot-graph.js --why npm:date-fns
 *   node scripts/perf/boot-graph.js --json out.json # full module list, for diffs
 *
 * It is an approximation of Metro's graph (no platform-specific package
 * resolution inside node_modules, which it does not walk). Compare before/after
 * numbers from the same script rather than reading them as exact module counts.
 */
const { Buffer } = require("buffer");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const args = process.argv.slice(2);
const flag = (name) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : null;
const whyTarget = flag("--why");
const jsonOut = flag("--json");
const ts = require(path.join(root, "node_modules/typescript"));

const EXTS = [
  ".android.tsx", ".android.ts", ".native.tsx", ".native.ts", ".tsx", ".ts",
  ".android.js", ".native.js", ".js", ".jsx", ".mjs", ".cjs", ".json",
];
const ASSET_RE = /\.(png|jpe?g|gif|webp|svg|ttf|otf|mp3|wav|m4a|mp4|html|css)$/i;

function resolveFile(base) {
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const e of EXTS) if (fs.existsSync(base + e)) return base + e;
  for (const e of EXTS) {
    const index = path.join(base, "index" + e);
    if (fs.existsSync(index)) return index;
  }
  return null;
}

function resolveSpec(spec, fromFile) {
  if (ASSET_RE.test(spec)) return { kind: "asset", id: spec };
  let base = null;
  if (spec.startsWith("@/") || spec.startsWith("~/")) base = path.join(root, spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../")) base = path.resolve(path.dirname(fromFile), spec);
  if (base) {
    const f = resolveFile(base);
    return f ? { kind: "file", id: f } : { kind: "unresolved", id: spec };
  }
  return { kind: "npm", id: spec };
}

const FUNCTION_KINDS = new Set([
  ts.SyntaxKind.FunctionDeclaration, ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction, ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.Constructor, ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor, ts.SyntaxKind.PropertyDeclaration,
]);

function inTypePosition(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.kind >= ts.SyntaxKind.FirstTypeNode && p.kind <= ts.SyntaxKind.LastTypeNode) return true;
    if (ts.isInterfaceDeclaration(p) || ts.isTypeAliasDeclaration(p)) return true;
    if (ts.isHeritageClause(p) && p.token === ts.SyntaxKind.ImplementsKeyword) return true;
    if (ts.isImportDeclaration(p) || ts.isExportSpecifier(p)) return true;
  }
  return false;
}

const parsed = new Map();
function parse(file) {
  if (parsed.has(file)) return parsed.get(file);
  const text = fs.readFileSync(file, "utf8");
  const result = { eager: [], lazy: [], bytes: Buffer.byteLength(text), loc: text.split("\n").length };
  parsed.set(file, result);
  if (file.endsWith(".json")) return result;
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JSX;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);

  // Identifiers used in value positions — an import whose bindings never
  // appear here is type-only in practice and Babel drops it.
  const valueRefs = new Set();
  (function visit(n) {
    if (ts.isIdentifier(n) && !inTypePosition(n)) valueRefs.add(n.text);
    ts.forEachChild(n, visit);
  })(sf);

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) {
      const spec = st.moduleSpecifier.text;
      const clause = st.importClause;
      if (!clause) { result.eager.push(spec); continue; } // side-effect import
      if (clause.isTypeOnly) continue;
      const locals = [];
      if (clause.name) locals.push(clause.name.text);
      if (clause.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) locals.push(clause.namedBindings.name.text);
        else for (const el of clause.namedBindings.elements) if (!el.isTypeOnly) locals.push(el.name.text);
      }
      if (locals.some((l) => valueRefs.has(l))) result.eager.push(spec);
    } else if (ts.isExportDeclaration(st) && st.moduleSpecifier) {
      if (st.isTypeOnly) continue;
      const named = st.exportClause && ts.isNamedExports(st.exportClause) ? st.exportClause.elements : null;
      if (named && named.length > 0 && named.every((e) => e.isTypeOnly)) continue;
      result.eager.push(st.moduleSpecifier.text);
    }
  }

  (function visit(n, depth) {
    if (ts.isCallExpression(n) && n.arguments.length >= 1 && ts.isStringLiteralLike(n.arguments[0])) {
      const spec = n.arguments[0].text;
      if (ts.isIdentifier(n.expression) && n.expression.text === "require") {
        (depth === 0 ? result.eager : result.lazy).push(spec);
      } else if (n.expression.kind === ts.SyntaxKind.ImportKeyword) {
        result.lazy.push(spec);
      }
    }
    const d = FUNCTION_KINDS.has(n.kind) ? depth + 1 : depth;
    ts.forEachChild(n, (c) => visit(c, d));
  })(sf, 0);
  return result;
}

function findLayouts(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findLayouts(p, out);
    else if (/^_layout\.(tsx|ts|jsx|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

const seeds = findLayouts(path.join(root, "app"), []);
const indexRoute = resolveFile(path.join(root, "app/index"));
if (indexRoute) seeds.push(indexRoute);

const parentOf = new Map(); // file -> importer (for --why)
const npm = new Map(); // specifier -> first importer
const queue = [];
for (const s of seeds) { parentOf.set(s, null); queue.push(s); }
while (queue.length) {
  const f = queue.shift();
  for (const spec of parse(f).eager) {
    const r = resolveSpec(spec, f);
    if (r.kind === "file" && !parentOf.has(r.id)) { parentOf.set(r.id, f); queue.push(r.id); }
    else if (r.kind === "npm" && !npm.has(r.id)) npm.set(r.id, f);
  }
}

const rel = (f) => path.relative(root, f);
const pkgOf = (spec) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);

if (whyTarget) {
  let target = null;
  if (whyTarget.startsWith("npm:")) {
    const want = whyTarget.slice(4);
    for (const [spec, importer] of npm) {
      if (spec === want || pkgOf(spec) === want) {
        console.log(`npm ${spec} <- ${rel(importer)}`);
        target = importer;
        break;
      }
    }
  } else {
    target = [...parentOf.keys()].find((f) => rel(f) === whyTarget || rel(f).startsWith(whyTarget + "."));
  }
  if (!target) {
    console.log(`${whyTarget}: NOT reachable at startup`);
    process.exit(0);
  }
  const chain = [];
  for (let f = target; f; f = parentOf.get(f)) chain.push(rel(f));
  console.log(chain.reverse().join("\n  -> "));
  process.exit(0);
}

let bytes = 0;
let loc = 0;
for (const f of parentOf.keys()) { bytes += parsed.get(f).bytes; loc += parsed.get(f).loc; }
const pkgs = new Set([...npm.keys()].map(pkgOf));
console.log(
  `seeds: ${seeds.length}  startup project modules: ${parentOf.size}  ` +
    `source: ${(bytes / 1024).toFixed(0)} KB, ${loc} LOC  npm packages: ${pkgs.size}`,
);
console.log("npm packages:", [...pkgs].sort().join(", "));
if (jsonOut) {
  fs.writeFileSync(
    jsonOut,
    JSON.stringify({ modules: [...parentOf.keys()].map(rel).sort(), npm: [...npm.keys()].sort() }, null, 1),
  );
  console.log(`wrote ${jsonOut}`);
}

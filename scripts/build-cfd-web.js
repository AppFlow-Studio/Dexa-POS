#!/usr/bin/env node
// scripts/build-cfd-web.js
//
// Builds the CFD WebView bundle and stages it into Android assets.
//
//   1. Run Metro to bundle web/cfd-entry.tsx -> cfd-web-build/cfd.bundle.js
//   2. Copy web/index.html -> cfd-web-build/index.html
//   3. Mirror cfd-web-build/ into android/app/src/main/assets/cfd-web/
//
// Output is loaded by the WebView via:
//   file:///android_asset/cfd-web/index.html
//
// Usage: npm run build:cfd-web

/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "cfd-web-build");
const BUNDLE_OUT = path.join(OUT_DIR, "cfd.bundle.js");
const HTML_SRC = path.join(ROOT, "web", "index.html");
const HTML_OUT = path.join(OUT_DIR, "index.html");
const ANDROID_ASSETS = path.join(
  ROOT,
  "android",
  "app",
  "src",
  "main",
  "assets",
  "cfd-web"
);

function rmDirSafe(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) copyFile(s, d);
  }
}

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: ROOT,
    env: { ...process.env, ...opts.env },
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`\n[build-cfd-web] command failed: ${cmd} ${args.join(" ")}`);
    process.exit(result.status ?? 1);
  }
}

console.log("[build-cfd-web] cleaning output dirs");
rmDirSafe(OUT_DIR);
ensureDir(OUT_DIR);

console.log("[build-cfd-web] running Metro web bundle");
// We invoke `expo export:embed` style via metro CLI directly. The project's
// metro.config.js already wires up Sentry + NativeWind + Expo's web platform
// support. We skip expo-router by pointing Metro at our standalone entry.
// `metro build <entry>` — entry is positional. -O for output, -p platform.
run("npx", [
  "metro",
  "build",
  "./web/cfd-entry.tsx",
  "-c",
  "metro.config.cfd-web.js",
  "-p",
  "web",
  "-O",
  BUNDLE_OUT,
  "-z", // minify
  "-j",
  "4",
]);

// Strip `import.meta` from the minified bundle.
//
// Some libraries (Zustand v5 devtools, etc.) reference `import.meta.env.MODE`
// for Vite-style env detection. Metro emits the bundle as a classic script
// — `import.meta` outside an ES module is a SyntaxError in V8 and the
// bundle fails to parse in the WebView. We can't load as `type="module"`
// because Metro's prelude relies on classic-script top-level `this` being
// the global. So we just rewrite `import.meta` to a benign empty object;
// downstream `import.meta.env?...` checks then short-circuit to undefined.
console.log("[build-cfd-web] sanitizing bundle (strip import.meta)");
{
  let src = fs.readFileSync(BUNDLE_OUT, "utf8");
  const before = src.length;
  // Replace whole-token `import.meta` only (avoid hitting strings that
  // happen to contain that text, though it's unlikely in a minified bundle).
  src = src.replace(/\bimport\.meta\b/g, "({})");
  const occurrences = (src.match(/\(\{\}\)\.env/g) || []).length;
  fs.writeFileSync(BUNDLE_OUT, src);
  console.log(
    `  rewrote import.meta references; bundle size ${before} -> ${src.length} (refs hit: ${occurrences})`
  );
}

console.log("[build-cfd-web] copying html shell");
copyFile(HTML_SRC, HTML_OUT);

console.log("[build-cfd-web] mirroring into android assets");
rmDirSafe(ANDROID_ASSETS);
copyDir(OUT_DIR, ANDROID_ASSETS);

console.log("\n[build-cfd-web] done.");
console.log(`  bundle: ${path.relative(ROOT, BUNDLE_OUT)}`);
console.log(`  html:   ${path.relative(ROOT, HTML_OUT)}`);
console.log(`  staged: ${path.relative(ROOT, ANDROID_ASSETS)}`);

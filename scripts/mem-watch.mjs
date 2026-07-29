#!/usr/bin/env node
/**
 * mem-watch — live Android app memory watcher (macOS/Linux), zero-dependency.
 *
 * Polls `adb shell dumpsys meminfo <package>` on a fixed interval, parses the
 * App Summary (TOTAL PSS/RSS, Native, Java, Graphics, Code, Stack, System, …),
 * renders a live terminal dashboard with a PSS sparkline + a linear-regression
 * leak detector, and appends every sample to CSV so the trace can be shared and
 * analyzed offline.
 *
 * Inspired by jefouz/mem-watch and Ali's "Jaffal Android Doctor" (both Electron
 * GUIs over the same `dumpsys meminfo` idea). This is the CLI cousin: instant,
 * scriptable, and its text output pastes straight into a bug thread.
 *
 * Usage:
 *   node scripts/mem-watch.mjs                        # default pkg, first device
 *   node scripts/mem-watch.mjs -p com.foo.bar         # explicit package
 *   node scripts/mem-watch.mjs --foreground           # auto-pick foreground app
 *   node scripts/mem-watch.mjs -s R52X... -i 2        # serial + 2s interval
 *   node scripts/mem-watch.mjs --list dexa            # list packages matching
 *   node scripts/mem-watch.mjs --parse-file dump.txt  # verify parser on a dump
 *
 * Flags:
 *   -p, --package <id>     target package (default: com.temurappflowstudios.dexapos)
 *   -s, --serial  <id>     adb device serial (default: the only/first device)
 *   -i, --interval <sec>   poll interval seconds (default: 3)
 *       --foreground       resolve the package from the foreground activity
 *       --csv <path>       CSV output path (default: ./mem-watch-<pkg>-<ts>.csv)
 *       --no-clear         append rows instead of repainting (good for piping/logs)
 *   -n, --samples <N>      stop after N samples (default: run until Ctrl-C)
 *       --adb <path>       path to the adb binary
 *       --list [filter]    list installed packages (optionally filtered), then exit
 *       --parse-file <p>   parse a saved `dumpsys meminfo` dump and exit (self-test)
 *   -h, --help             this help
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_PKG = "com.temurappflowstudios.dexapos";
const BLOCKS = "▁▂▃▄▅▆▇█";
// Leak heuristic: sustained PSS climb over the recent window.
const LEAK_SLOPE_MB_PER_MIN = 0.4; // min upward slope to suspect a leak
const LEAK_MIN_RISE_MB = 8; // and net rise across the window must exceed this
const LEAK_WINDOW = 20; // samples considered for the trend

const NO_COLOR = !!process.env.NO_COLOR;
const wrap = (code) => (s) => (NO_COLOR ? String(s) : `\x1b[${code}m${s}\x1b[0m`);
const C = { dim: wrap(2), bold: wrap(1), red: wrap(31), green: wrap(32), yellow: wrap(33), cyan: wrap(36) };

// ---------------------------------------------------------------------------
// arg parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const o = {
    package: null, serial: null, interval: 3, foreground: false,
    csv: null, clear: true, samples: Infinity, adb: null,
    list: undefined, parseFile: null, help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "-p": case "--package": o.package = next(); break;
      case "-s": case "--serial": o.serial = next(); break;
      case "-i": case "--interval": o.interval = Math.max(1, Number(next()) || 3); break;
      case "--foreground": o.foreground = true; break;
      case "--csv": o.csv = next(); break;
      case "--no-clear": o.clear = false; break;
      case "-n": case "--samples": o.samples = Math.max(1, Number(next()) || Infinity); break;
      case "--adb": o.adb = next(); break;
      case "--list": o.list = (argv[i + 1] && !argv[i + 1].startsWith("-")) ? next() : ""; break;
      case "--parse-file": o.parseFile = next(); break;
      case "-h": case "--help": o.help = true; break;
      default:
        if (a.startsWith("-")) { console.error(`Unknown flag: ${a}`); process.exit(2); }
    }
  }
  return o;
}

// ---------------------------------------------------------------------------
// adb plumbing
// ---------------------------------------------------------------------------
function resolveAdb(explicit) {
  const candidates = [
    explicit,
    process.env.ADB,
    process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, "platform-tools", "adb"),
    process.env.ANDROID_SDK_ROOT && path.join(process.env.ANDROID_SDK_ROOT, "platform-tools", "adb"),
    path.join(os.homedir(), "Library/Android/sdk/platform-tools/adb"),
    path.join(os.homedir(), "Android/Sdk/platform-tools/adb"),
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  // Fall back to PATH — execFile will resolve it, or throw a clear ENOENT.
  return "adb";
}

function adb(adbPath, args, timeoutMs = 15000) {
  return execFileSync(adbPath, args, { encoding: "utf8", timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
}
function adbShell(adbPath, serial, shellArgs, timeoutMs = 15000) {
  const base = serial ? ["-s", serial] : [];
  return adb(adbPath, [...base, "shell", ...shellArgs], timeoutMs);
}

function listDevices(adbPath) {
  let out = "";
  try { out = adb(adbPath, ["devices", "-l"]); }
  catch (e) { fail(`Could not run adb (${adbPath}).\n${e.message}`); }
  return out.split("\n").slice(1)
    .map((l) => l.trim()).filter((l) => l && !l.startsWith("*"))
    .map((l) => {
      const [serial, state] = l.split(/\s+/);
      const model = (l.match(/model:(\S+)/) || [])[1] || "";
      return { serial, state, model };
    })
    .filter((d) => d.serial);
}

function resolveSerial(adbPath, wanted) {
  const devices = listDevices(adbPath);
  const online = devices.filter((d) => d.state === "device");
  if (wanted) {
    const hit = devices.find((d) => d.serial === wanted);
    if (!hit) fail(`Device '${wanted}' not found. Connected: ${devices.map((d) => d.serial).join(", ") || "(none)"}`);
    if (hit.state !== "device") fail(`Device '${wanted}' is '${hit.state}', not ready.`);
    return hit;
  }
  if (online.length === 0) fail("No ready device. Plug in the tablet, enable USB debugging, run `adb devices`.");
  if (online.length > 1) fail(`Multiple devices — pass --serial <id>:\n  ${online.map((d) => `${d.serial}  ${d.model}`).join("\n  ")}`);
  return online[0];
}

function foregroundPackage(adbPath, serial) {
  let out = "";
  try { out = adbShell(adbPath, serial, ["dumpsys", "activity", "activities"]); } catch { return null; }
  const m =
    out.match(/(?:topResumedActivity|mResumedActivity)[^\n]*\b([a-zA-Z][\w.]+)\/[\w.$]+/) ||
    out.match(/mCurrentFocus[^\n]*\b([a-zA-Z][\w.]+)\/[\w.$]+/);
  return m ? m[1] : null;
}

function listPackages(adbPath, serial, filter) {
  const out = adbShell(adbPath, serial, ["pm", "list", "packages"]);
  return out.split("\n").map((l) => l.replace(/^package:/, "").trim())
    .filter(Boolean).filter((p) => !filter || p.toLowerCase().includes(filter.toLowerCase())).sort();
}

// ---------------------------------------------------------------------------
// dumpsys meminfo parsing
// ---------------------------------------------------------------------------
/**
 * Returns { running, pss, rss, java, native, graphics, code, stack, system,
 * privateOther, unknown } in KB, or { running:false } when the app isn't up.
 * Tolerant across Android versions: prefers the "App Summary" block, falls back
 * to legacy TOTAL lines.
 */
export function parseMeminfo(text) {
  if (/No process found for|No services match/i.test(text)) return { running: false };
  const num = (re) => { const m = text.match(re); return m ? Number(m[1]) : null; };

  const out = {
    running: true,
    java: num(/\bJava Heap:\s+(\d+)/i) ?? num(/\bDalvik Heap:\s+(\d+)/i),
    native: num(/\bNative Heap:\s+(\d+)/i),
    code: num(/\bCode:\s+(\d+)/i),
    stack: num(/\bStack:\s+(\d+)/i),
    graphics: num(/\bGraphics:\s+(\d+)/i),
    privateOther: num(/\bPrivate Other:\s+(\d+)/i),
    system: num(/\bSystem:\s+(\d+)/i),
    unknown: num(/\bUnknown:\s+(\d+)/i),
    pss: num(/\bTOTAL PSS:\s+(\d+)/i) ?? num(/\bTOTAL:\s+(\d+)/i),
    rss: num(/\bTOTAL RSS:\s+(\d+)/i),
  };
  // If Graphics wasn't in an App Summary, sum the GL/EGL mtrack detail rows.
  if (out.graphics == null) {
    const gl = num(/\bGL mtrack\s+(\d+)/i) || 0;
    const egl = num(/\bEGL mtrack\s+(\d+)/i) || 0;
    if (gl || egl) out.graphics = gl + egl;
  }
  if (out.pss == null) return { running: false, unparsed: true };
  return out;
}

// ---------------------------------------------------------------------------
// stats helpers
// ---------------------------------------------------------------------------
const mb = (kb) => (kb == null ? "  –  " : (kb / 1024).toFixed(1));

function sparkline(values, width = 44) {
  const v = values.slice(-width);
  if (v.length === 0) return "";
  const min = Math.min(...v), max = Math.max(...v), range = max - min || 1;
  return v.map((x) => BLOCKS[Math.min(7, Math.floor(((x - min) / range) * 7.999))]).join("");
}

/** Least-squares slope of y over x. points: [{x:sec, y:kb}] -> KB/sec. */
function slopeKBPerSec(points) {
  const n = points.length;
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of points) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; }
  const d = n * sxx - sx * sx;
  return d === 0 ? 0 : (n * sxy - sx * sy) / d;
}

// A cold launch ramps memory hard (bundle load, image decode, hydration) and
// always looks like a leak. Ignore samples in the first WARMUP_MS so the leak
// check only judges steady state.
const WARMUP_MS = 30_000;
function leakVerdict(history) {
  const start = history[0]?.t ?? 0;
  const steady = history.filter((s) => s.t - start >= WARMUP_MS);
  if (steady.length < Math.min(LEAK_WINDOW, 6)) {
    return { suspect: false, slopeMbMin: 0, warmup: true };
  }
  const w = steady.slice(-LEAK_WINDOW);
  const t0 = w[0].t;
  const slopeMbMin = (slopeKBPerSec(w.map((s) => ({ x: (s.t - t0) / 1000, y: s.pss }))) * 60) / 1024;
  const riseMb = (w[w.length - 1].pss - w[0].pss) / 1024;
  return { suspect: slopeMbMin >= LEAK_SLOPE_MB_PER_MIN && riseMb >= LEAK_MIN_RISE_MB, slopeMbMin, riseMb };
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------
function render(ctx) {
  const { pkg, device, interval, history, clear } = ctx;
  const last = history[history.length - 1];
  const first = history[0];
  const pssSeries = history.map((s) => s.pss);
  const peak = Math.max(...pssSeries), min = Math.min(...pssSeries);
  const avg = pssSeries.reduce((a, b) => a + b, 0) / pssSeries.length;
  const { suspect, slopeMbMin, warmup } = leakVerdict(history);
  const dStart = (last.pss - first.pss) / 1024;
  const dPrev = history.length > 1 ? (last.pss - history[history.length - 2].pss) / 1024 : 0;

  const lines = [];
  lines.push(C.bold(C.cyan("mem-watch")) + C.dim(`  ${pkg}  ·  ${device.serial}${device.model ? " " + device.model : ""}  ·  ${interval}s  ·  ${history.length} samples`));
  lines.push(C.dim("─".repeat(78)));
  const dPrevStr = `Δ ${dPrev >= 0 ? "+" : ""}${dPrev.toFixed(1)}`;
  const dPrevCol = dPrev > 0.05 ? C.yellow(dPrevStr) : dPrev < -0.05 ? C.green(dPrevStr) : C.dim(dPrevStr);
  lines.push(
    `  ${C.bold("PSS")}  ${C.bold((last.pss / 1024).toFixed(1) + " MB")}   ${dPrevCol}` +
    C.dim(`   since start ${dStart >= 0 ? "+" : ""}${dStart.toFixed(1)} MB`)
  );
  lines.push(`  ${C.dim("peak")} ${(peak / 1024).toFixed(1)}  ${C.dim("avg")} ${(avg / 1024).toFixed(1)}  ${C.dim("min")} ${(min / 1024).toFixed(1)}  ${C.dim("MB")}`);
  lines.push("");
  lines.push(
    `  ${C.dim("Native")} ${mb(last.native)}   ${C.dim("Java")} ${mb(last.java)}   ` +
    `${C.dim("Graphics")} ${mb(last.graphics)}   ${C.dim("Code")} ${mb(last.code)}   ` +
    `${C.dim("System")} ${mb(last.system)}   ${C.dim("RSS")} ${mb(last.rss)}  ${C.dim("MB")}`
  );
  lines.push("");
  lines.push("  " + C.cyan(sparkline(pssSeries)) + C.dim(`   PSS ${(min / 1024).toFixed(0)}–${(peak / 1024).toFixed(0)} MB`));
  lines.push(
    "  " + (warmup
      ? C.dim(`warming up… leak check begins after ${WARMUP_MS / 1000}s`)
      : suspect
        ? C.red(`⚠ LEAK SUSPECTED  ▲ ${slopeMbMin.toFixed(2)} MB/min sustained`)
        : C.green(`stable  (${slopeMbMin >= 0 ? "+" : ""}${slopeMbMin.toFixed(2)} MB/min)`))
  );
  lines.push("");

  // recent rows
  lines.push(C.dim("  time        PSS     Δ       Native   Java   Graphics   Code    RSS"));
  for (const s of history.slice(-10)) {
    const idx = history.indexOf(s);
    const d = idx > 0 ? (s.pss - history[idx - 1].pss) / 1024 : 0;
    lines.push(
      `  ${s.clock}  ${(s.pss / 1024).toFixed(1).padStart(7)}  ${((d >= 0 ? "+" : "") + d.toFixed(1)).padStart(6)}  ` +
      `${mb(s.native).padStart(7)} ${mb(s.java).padStart(6)} ${mb(s.graphics).padStart(9)} ${mb(s.code).padStart(7)} ${mb(s.rss).padStart(7)}`
    );
  }
  lines.push("");
  lines.push(C.dim(`  CSV → ${ctx.csvPath}    (Ctrl-C to stop)`));

  const buf = (clear ? "\x1b[2J\x1b[H" : "") + lines.join("\n") + "\n";
  process.stdout.write(buf);
}

function fail(msg) { console.error(C.red("✗ ") + msg); process.exit(1); }

function nowClock() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function help() {
  const src = readFileSync(new URL(import.meta.url), "utf8");
  const block = src.slice(src.indexOf("/**") + 3, src.indexOf("*/"));
  console.log(block.split("\n").map((l) => l.replace(/^\s?\*\s?/, "")).join("\n").trim());
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) return help();

  // Offline self-test: parse a saved dump, print structured result, exit.
  if (o.parseFile) {
    const parsed = parseMeminfo(readFileSync(o.parseFile, "utf8"));
    console.log(JSON.stringify(parsed, null, 2));
    if (!parsed.running) fail("Parser did not find a running-app App Summary in that dump.");
    console.log(C.green("\n✓ parsed OK") + C.dim(`  PSS=${(parsed.pss / 1024).toFixed(1)}MB  Native=${mb(parsed.native)}MB  Graphics=${mb(parsed.graphics)}MB`));
    return;
  }

  const adbPath = resolveAdb(o.adb);

  if (o.list !== undefined) {
    const device = resolveSerial(adbPath, o.serial);
    for (const p of listPackages(adbPath, device.serial, o.list)) console.log(p);
    return;
  }

  const device = resolveSerial(adbPath, o.serial);
  let pkg = o.package;
  if (!pkg && o.foreground) pkg = foregroundPackage(adbPath, device.serial);
  if (!pkg) pkg = DEFAULT_PKG;

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const csvPath = o.csv || path.resolve(process.cwd(), `mem-watch-${pkg}-${ts}.csv`);
  const csv = createWriteStream(csvPath, { flags: "a" });
  csv.write("iso_time,elapsed_s,pss_kb,rss_kb,java_kb,native_kb,graphics_kb,code_kb,stack_kb,system_kb,private_other_kb,leak_suspect\n");

  const history = [];
  const startedAt = Date.now();
  let count = 0, warnedNotRunning = false;

  const ctx = { pkg, device, interval: o.interval, history, clear: o.clear, csvPath };

  const shutdown = () => {
    csv.end();
    if (history.length) {
      const pss = history.map((s) => s.pss);
      const peak = Math.max(...pss), min = Math.min(...pss);
      const { suspect, slopeMbMin } = leakVerdict(history);
      process.stdout.write("\n" + C.bold("Session summary\n"));
      process.stdout.write(`  samples ${history.length} over ${((Date.now() - startedAt) / 1000).toFixed(0)}s\n`);
      process.stdout.write(`  PSS  peak ${(peak / 1024).toFixed(1)}  min ${(min / 1024).toFixed(1)}  net ${((history[history.length - 1].pss - history[0].pss) / 1024).toFixed(1)} MB\n`);
      process.stdout.write(`  trend ${slopeMbMin >= 0 ? "+" : ""}${slopeMbMin.toFixed(2)} MB/min  ${suspect ? C.red("⚠ leak suspected") : C.green("stable")}\n`);
      process.stdout.write(C.dim(`  CSV saved: ${csvPath}\n`));
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const tick = () => {
    let raw = "";
    try { raw = adbShell(adbPath, device.serial, ["dumpsys", "meminfo", pkg]); }
    catch (e) {
      process.stdout.write(C.yellow(`\n adb read failed (device asleep/unplugged?) — retrying…  ${String(e.message).split("\n")[0]}\n`));
      return schedule();
    }
    const s = parseMeminfo(raw);
    if (!s.running) {
      if (!warnedNotRunning) {
        process.stdout.write(C.yellow(`\n ${pkg} is not running — start it on the device. Waiting…\n`) +
          C.dim(` (tip: --foreground to auto-pick, or --list ${pkg.split(".").pop()} to find the exact id)\n`));
        warnedNotRunning = true;
      }
      return schedule();
    }
    warnedNotRunning = false;
    const elapsed = (Date.now() - startedAt) / 1000;
    const sample = { t: Date.now(), clock: nowClock(), ...s };
    history.push(sample);
    const leak = leakVerdict(history).suspect ? 1 : 0;
    csv.write([new Date().toISOString(), elapsed.toFixed(1), s.pss, s.rss ?? "", s.java ?? "", s.native ?? "",
      s.graphics ?? "", s.code ?? "", s.stack ?? "", s.system ?? "", s.privateOther ?? "", leak].join(",") + "\n");
    render(ctx);
    if (++count >= o.samples) return shutdown();
    schedule();
  };
  const schedule = () => setTimeout(tick, o.interval * 1000);

  process.stdout.write(C.dim(`Watching ${pkg} on ${device.serial} every ${o.interval}s… (Ctrl-C to stop)\n`));
  tick();
}

main().catch((e) => fail(e.stack || e.message));

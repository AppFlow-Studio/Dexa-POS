import { WallEdgeFlags } from "@/lib/wallCornerSnap";

/**
 * SVG-string builders for the STATIC floor-plan structures (walls, doors, pillars,
 * plants, zones, labels, functional stands). These reproduce the markup of the
 * corresponding `components/tables/svg/*.tsx` components so the structures can be
 * drawn on the shared Skia surface via Skia.SVG.MakeFromString + <ImageSVG> — no
 * geometry re-porting, guaranteed parity.
 *
 * Structures use a fixed slate palette (not the live table color), so the only
 * inputs are darkMode, size, wall edge flags, and label text.
 */

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const svg = (viewBox: string, body: string, preserve = "xMidYMid meet") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="${preserve}" fill="none">${body}</svg>`;

const wallSvg = (
  width: number,
  height: number,
  dark: boolean,
  flags: WallEdgeFlags,
) => {
  const color = "#94A3B8";
  const stroke = dark ? color : "#111827";
  const highlightY = Math.min(3, height * 0.3);
  const shadowY = Math.max(height - 2.5, height * 0.7);
  let b = `<rect x="0" y="0" width="${width}" height="${height}" fill="${dark ? "#1E2340" : "#F3F4F6"}"/>`;
  if (!flags.hideTop)
    b += `<line x1="0" y1="0.75" x2="${width}" y2="0.75" stroke="${stroke}" stroke-width="1.5"/>`;
  if (!flags.hideRight)
    b += `<line x1="${width - 0.75}" y1="0" x2="${width - 0.75}" y2="${height}" stroke="${stroke}" stroke-width="1.5"/>`;
  if (!flags.hideBottom)
    b += `<line x1="0" y1="${height - 0.75}" x2="${width}" y2="${height - 0.75}" stroke="${stroke}" stroke-width="1.5"/>`;
  if (!flags.hideLeft)
    b += `<line x1="0.75" y1="0" x2="0.75" y2="${height}" stroke="${stroke}" stroke-width="1.5"/>`;
  b += `<line x1="0" y1="${highlightY}" x2="${width}" y2="${highlightY}" stroke="${stroke}" stroke-width="0.5" stroke-opacity="${dark ? 0.35 : 0.4}"/>`;
  b += `<line x1="0" y1="${shadowY}" x2="${width}" y2="${shadowY}" stroke="${stroke}" stroke-width="0.5" stroke-opacity="${dark ? 0.15 : 0.25}"/>`;
  return svg(`0 0 ${width} ${height}`, b);
};

const doorSingleSvg = (dark: boolean) => {
  const stroke = dark ? "#94A3B8" : "#475569";
  const wedge = dark ? "rgba(148,163,184,0.2)" : "rgba(71,85,105,0.12)";
  const door = dark ? "#64748B" : "#94A3B8";
  const b =
    `<rect x="0" y="70" width="80" height="6" fill="${dark ? "#334155" : "#E2E8F0"}" stroke="${stroke}" stroke-width="1.5"/>` +
    `<rect x="6" y="70" width="68" height="6" fill="${dark ? "#1E293B" : "#F8FAFC"}"/>` +
    `<path d="M 6 70 L 6 6 A 64 64 0 0 1 70 70 Z" fill="${wedge}" stroke="${stroke}" stroke-width="1.25"/>` +
    `<line x1="6" y1="70" x2="6" y2="6" stroke="${door}" stroke-width="4" stroke-linecap="round"/>` +
    `<circle cx="6" cy="70" r="4" fill="${door}" stroke="${stroke}" stroke-width="1.5"/>` +
    `<circle cx="6" cy="70" r="1.5" fill="${dark ? "#1E293B" : "#F8FAFC"}"/>`;
  return svg("0 0 80 80", b);
};

const doorDoubleSvg = (dark: boolean) => {
  const stroke = dark ? "#94A3B8" : "#475569";
  const wedge = dark ? "rgba(148,163,184,0.2)" : "rgba(71,85,105,0.12)";
  const door = dark ? "#64748B" : "#94A3B8";
  const b =
    `<rect x="0" y="70" width="160" height="6" fill="${dark ? "#334155" : "#E2E8F0"}" stroke="${stroke}" stroke-width="1.5"/>` +
    `<rect x="6" y="70" width="148" height="6" fill="${dark ? "#1E293B" : "#F8FAFC"}"/>` +
    `<path d="M 6 70 L 6 6 A 74 74 0 0 1 80 70 Z" fill="${wedge}" stroke="${stroke}" stroke-width="1.25"/>` +
    `<path d="M 154 70 L 154 6 A 74 74 0 0 0 80 70 Z" fill="${wedge}" stroke="${stroke}" stroke-width="1.25"/>` +
    `<line x1="6" y1="70" x2="6" y2="6" stroke="${door}" stroke-width="4" stroke-linecap="round"/>` +
    `<line x1="154" y1="70" x2="154" y2="6" stroke="${door}" stroke-width="4" stroke-linecap="round"/>` +
    `<circle cx="6" cy="70" r="4" fill="${door}" stroke="${stroke}" stroke-width="1.5"/>` +
    `<circle cx="6" cy="70" r="1.5" fill="${dark ? "#1E293B" : "#F8FAFC"}"/>` +
    `<circle cx="154" cy="70" r="4" fill="${door}" stroke="${stroke}" stroke-width="1.5"/>` +
    `<circle cx="154" cy="70" r="1.5" fill="${dark ? "#1E293B" : "#F8FAFC"}"/>`;
  return svg("0 0 160 80", b);
};

const pillarSvg = (dark: boolean) => {
  const color = "#94A3B8";
  const stroke = dark ? color : "#111827";
  const b =
    `<rect x="0.75" y="0.75" width="38.5" height="38.5" rx="2" fill="${dark ? "#1E2340" : "#E5E7EB"}" stroke="${stroke}" stroke-width="1.5"/>` +
    `<rect x="6" y="6" width="28" height="28" rx="1" fill="${color}" fill-opacity="${dark ? 0.06 : 0.75}" stroke="${stroke}" stroke-width="0.75" stroke-opacity="${dark ? 0.5 : 0.9}"/>` +
    `<rect x="11" y="11" width="18" height="18" rx="1" fill="${color}" fill-opacity="${dark ? 0.1 : 0.75}"/>`;
  return svg("0 0 40 40", b);
};

const zoneSvg = (width: number, color: string) => {
  const scaleX = (width || 200) / 200;
  const b = `<rect width="200" height="200" fill="${color}" fill-opacity="0.07" stroke="${color}" stroke-width="${1.5 * scaleX}" stroke-dasharray="6,4" stroke-opacity="0.6"/>`;
  return svg("0 0 200 200", b, "none");
};

const labelSvg = (
  width: number,
  height: number,
  color: string,
  label: string,
) => {
  const defaultHeight = 50;
  const scaleY = (height || defaultHeight) / defaultHeight;
  const fontSize = Math.max(10, Math.min(28, height * 0.45 * scaleY));
  const b = `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="bold" fill="${color}" fill-opacity="0.85">${esc(label)}</text>`;
  return svg(`0 0 ${width} ${height}`, b, "xMidYMid meet");
};

const barSvg = (dark: boolean) => {
  const stroke = dark ? "#94A3B8" : "#111827";
  const bodyFill = dark ? "#1E2340" : "#E5E7EB";
  const surface = dark ? "#1E2340" : "#D1D5DB";
  const inner = dark ? "#1E2340" : "#E5E7EB";
  const ledge = dark ? "#1E2340" : "#9CA3AF";
  const stoolC = dark ? "#CBD5F5" : "#374151";
  let b =
    `<rect x="5" y="8" width="160" height="52" rx="4" fill="${bodyFill}" stroke="${stroke}" stroke-width="2"/>` +
    `<rect x="5" y="8" width="160" height="52" rx="4" fill="${surface}"/>` +
    `<rect x="12" y="15" width="146" height="16" rx="2" fill="${inner}" stroke="${stroke}" stroke-width="1"/>` +
    `<rect x="12" y="36" width="146" height="16" rx="2" fill="${inner}" stroke="${stroke}" stroke-width="1"/>` +
    `<rect x="5" y="60" width="160" height="10" rx="2" fill="${ledge}" stroke="${stroke}" stroke-width="1.5"/>`;
  for (const cx of [25, 63, 107, 145]) {
    b += `<circle cx="${cx}" cy="83" r="9" fill="${inner}" stroke="${stroke}" stroke-width="1.5"/>`;
    b += `<circle cx="${cx}" cy="83" r="3" fill="${stoolC}"/>`;
  }
  return svg("0 0 170 100", b);
};

const cashierSvg = (dark: boolean) => {
  const color = "#94A3B8";
  const stroke = dark ? color : "#111827";
  const fo = (l: number, d: number) => (dark ? d : l);
  const b =
    `<rect x="0.75" y="0.75" width="78.5" height="238.5" rx="4" fill="${dark ? "#1E2340" : "#E5E7EB"}" stroke="${stroke}" stroke-width="1.5"/>` +
    `<rect x="0.75" y="0.75" width="78.5" height="238.5" rx="4" fill="${color}" fill-opacity="${fo(0.75, 0.07)}"/>` +
    `<rect x="10" y="20" width="60" height="80" rx="4" fill="${color}" fill-opacity="${fo(0.75, 0.12)}" stroke="${stroke}" stroke-width="1.25"/>` +
    `<rect x="15" y="25" width="50" height="65" rx="2" fill="${color}" fill-opacity="${fo(0.75, 0.08)}" stroke="${stroke}" stroke-width="0.5" stroke-opacity="${fo(0.9, 0.4)}"/>` +
    `<rect x="34" y="100" width="12" height="8" rx="1" fill="${color}" fill-opacity="${fo(0.75, 0.2)}" stroke="${stroke}" stroke-width="0.75"/>` +
    `<rect x="10" y="115" width="60" height="28" rx="3" fill="${color}" fill-opacity="${fo(0.75, 0.08)}" stroke="${stroke}" stroke-width="1"/>` +
    `<rect x="14" y="119" width="52" height="5" rx="1" fill="${color}" fill-opacity="${fo(0.75, 0.08)}"/>` +
    `<rect x="14" y="127" width="52" height="5" rx="1" fill="${color}" fill-opacity="${fo(0.75, 0.08)}"/>` +
    `<rect x="14" y="135" width="52" height="5" rx="1" fill="${color}" fill-opacity="${fo(0.75, 0.08)}"/>` +
    `<rect x="10" y="155" width="60" height="30" rx="3" fill="${color}" fill-opacity="${fo(0.75, 0.06)}" stroke="${stroke}" stroke-width="0.75" stroke-opacity="${fo(0.9, 0.5)}"/>` +
    `<rect x="22" y="164" width="36" height="4" rx="2" fill="${color}" fill-opacity="${fo(0.75, 0.2)}"/>` +
    `<rect x="0.75" y="200" width="78.5" height="38.5" rx="4" fill="${color}" fill-opacity="${fo(0.75, 0.05)}" stroke="${stroke}" stroke-width="0.75" stroke-opacity="${fo(0.9, 0.4)}"/>`;
  return svg("0 0 80 240", b);
};

const hostSvg = (dark: boolean) => {
  const color = "#94A3B8";
  const stroke = dark ? color : "#111827";
  const fo = (l: number, d: number) => (dark ? d : l);
  const b =
    `<rect x="0.75" y="0.75" width="38.5" height="33.5" rx="3" fill="${dark ? "#1E2340" : "#E5E7EB"}" stroke="${stroke}" stroke-width="1.5"/>` +
    `<path d="M5 4 L35 4 L31 28 L9 28 Z" fill="${color}" fill-opacity="${fo(0.75, 0.1)}" stroke="${stroke}" stroke-width="0.75" stroke-opacity="${fo(0.9, 0.5)}" stroke-linejoin="round"/>` +
    `<rect x="12" y="9" width="16" height="13" rx="2" fill="${color}" fill-opacity="${fo(0.75, 0.18)}" stroke="${stroke}" stroke-width="0.75"/>` +
    `<rect x="19" y="9" width="1" height="13" rx="0.5" fill="${color}" fill-opacity="${fo(0.75, 0.3)}"/>`;
  return svg("0 0 40 35", b);
};

const serverSvg = (dark: boolean) => {
  const color = "#94A3B8";
  const stroke = dark ? color : "#111827";
  const fo = (l: number, d: number) => (dark ? d : l);
  const b =
    `<rect x="0.75" y="0.75" width="58.5" height="38.5" rx="4" fill="${dark ? "#1E2340" : "#E5E7EB"}" stroke="${stroke}" stroke-width="1.5"/>` +
    `<rect x="6" y="5" width="36" height="13" rx="2" fill="${color}" fill-opacity="${fo(0.75, 0.08)}" stroke="${stroke}" stroke-width="0.75" stroke-opacity="${fo(0.9, 0.5)}"/>` +
    `<rect x="6" y="22" width="36" height="13" rx="2" fill="${color}" fill-opacity="${fo(0.75, 0.08)}" stroke="${stroke}" stroke-width="0.75" stroke-opacity="${fo(0.9, 0.5)}"/>` +
    `<line x1="6" y1="20" x2="42" y2="20" stroke="${stroke}" stroke-width="0.5" stroke-opacity="${fo(0.6, 0.3)}"/>` +
    `<rect x="46" y="6" width="9" height="28" rx="2" fill="${color}" fill-opacity="${fo(0.75, 0.12)}" stroke="${stroke}" stroke-width="0.75"/>` +
    `<rect x="48" y="18" width="5" height="2" rx="1" fill="${color}" fill-opacity="${fo(0.75, 0.3)}"/>`;
  return svg("0 0 60 40", b);
};

const kitchenPassSvg = (dark: boolean) => {
  const color = "#94A3B8";
  const stroke = dark ? color : "#111827";
  let b =
    `<rect x="0.75" y="0.75" width="178.5" height="23.5" rx="2" fill="${dark ? "#1E2340" : "#F3F4F6"}" stroke="${stroke}" stroke-width="1.5"/>` +
    `<rect x="6" y="4" width="168" height="17" rx="1" fill="${dark ? color : "#E5E7EB"}" fill-opacity="${dark ? 0.1 : 1}" stroke="${stroke}" stroke-width="0.75" stroke-opacity="${dark ? 0.4 : 0.8}"/>` +
    `<line x1="6" y1="12.5" x2="174" y2="12.5" stroke="${stroke}" stroke-width="0.75" stroke-opacity="${dark ? 0.5 : 0.7}" stroke-dasharray="8 5"/>`;
  for (const x of [36, 66, 96, 126, 156]) {
    b += `<line x1="${x}" y1="4" x2="${x}" y2="21" stroke="${stroke}" stroke-width="0.75" stroke-opacity="${dark ? 0.3 : 0.4}"/>`;
  }
  return svg("0 0 180 25", b);
};

const NO_WALL_FLAGS: WallEdgeFlags = {
  hideTop: false,
  hideRight: false,
  hideBottom: false,
  hideLeft: false,
};

/** Fallback slate for decor/structure that used a default color. */
const STRUCTURE_COLOR = "#94A3B8";
const ZONE_LABEL_COLOR = "#94A3B8";

export const buildStructureSvg = (
  shapeId: string,
  width: number,
  height: number,
  dark: boolean,
  flags: WallEdgeFlags = NO_WALL_FLAGS,
  label = "",
): string | null => {
  switch (shapeId) {
    case "wall-section":
      return wallSvg(width, height, dark, flags);
    case "door-single":
      return doorSingleSvg(dark);
    case "door-double":
      return doorDoubleSvg(dark);
    case "pillar":
      return pillarSvg(dark);
    case "plant":
      return DECORATIVE_PLANT_SVG(dark);
    case "bar-section":
      return barSvg(dark);
    case "cashier-stand":
      return cashierSvg(dark);
    case "host-stand":
      return hostSvg(dark);
    case "server-station":
      return serverSvg(dark);
    case "kitchen-pass":
      return kitchenPassSvg(dark);
    case "zone-rectangle":
      return zoneSvg(width, ZONE_LABEL_COLOR);
    case "label-text":
      return labelSvg(width, height, ZONE_LABEL_COLOR, label || "Label");
    default:
      return null;
  }
};

// Plant is large; kept as its own builder for readability.
function DECORATIVE_PLANT_SVG(dark: boolean): string {
  const leafPrimary = dark ? "#4ADE80" : "#22C55E";
  const leafSecondary = dark ? "#22C55E" : "#16A34A";
  const leafHighlight = dark ? "#86EFAC" : "#4ADE80";
  const stem = dark ? "#22C55E" : "#15803D";
  const potBody = dark ? "#334155" : "#D4A574";
  const potRim = dark ? "#475569" : "#C4956A";
  const potShadow = dark ? "#1E293B" : "#A67C52";
  const soil = dark ? "#292524" : "#78350F";
  const shadowOpacity = dark ? 0.25 : 0.12;
  const el = (
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    fill: string,
    opacity: number,
    rot: number,
  ) =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${opacity < 1 ? ` opacity="${opacity}"` : ""} transform="rotate(${rot} ${cx} ${cy})"/>`;
  const b =
    `<ellipse cx="25" cy="57" rx="12" ry="2.5" fill="${dark ? "#0F172A" : "#000"}" opacity="${shadowOpacity}"/>` +
    `<path d="M14 42 L36 42 L33 55 Q25 56 17 55 Z" fill="${potBody}"/>` +
    `<path d="M14 42 L17 55 Q25 56 25 55 L25 42 Z" fill="${potShadow}" opacity="0.3"/>` +
    `<rect x="12" y="38" width="26" height="5" rx="1" fill="${potRim}"/>` +
    `<rect x="12" y="38" width="26" height="2" rx="1" fill="${dark ? "#64748B" : "#E8C4A0"}" opacity="0.5"/>` +
    `<ellipse cx="25" cy="42" rx="11" ry="3" fill="${soil}"/>` +
    `<path d="M25 40 C25 35, 25 28, 25 22" stroke="${stem}" stroke-width="2" stroke-linecap="round"/>` +
    `<path d="M25 32 C22 30, 18 28, 14 26" stroke="${stem}" stroke-width="1.5" stroke-linecap="round"/>` +
    `<path d="M25 30 C28 28, 32 26, 36 24" stroke="${stem}" stroke-width="1.5" stroke-linecap="round"/>` +
    `<path d="M25 36 C21 35, 17 34, 13 33" stroke="${stem}" stroke-width="1.2" stroke-linecap="round"/>` +
    `<path d="M25 35 C29 34, 33 33, 37 32" stroke="${stem}" stroke-width="1.2" stroke-linecap="round"/>` +
    el(25, 16, 4, 7, leafPrimary, 1, -5) +
    el(24, 16, 2, 5, leafHighlight, 0.4, -5) +
    el(14, 22, 3.5, 6, leafPrimary, 1, -35) +
    el(13, 22, 1.5, 4, leafHighlight, 0.4, -35) +
    el(36, 20, 3.5, 6, leafSecondary, 1, 35) +
    el(37, 20, 1.5, 4, leafHighlight, 0.3, 35) +
    el(11, 31, 3, 5, leafSecondary, 1, -45) +
    el(39, 30, 3, 5, leafPrimary, 1, 45) +
    el(20, 18, 2.5, 4.5, leafSecondary, 1, -20) +
    el(30, 17, 2.5, 4.5, leafHighlight, 0.7, 20) +
    el(17, 26, 2, 3.5, leafPrimary, 0.8, -25) +
    el(33, 25, 2, 3.5, leafSecondary, 0.8, 25);
  return svg("0 0 50 60", b);
}

export { STRUCTURE_COLOR };

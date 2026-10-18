// Builds the animated favicon's frames from the loader's instrument icons (public/icons/loader → public/icons/favicon).
// Each frame is the loader in miniature: a cream instrument on an ink tile. Run: npm run favicons
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SOURCE = "public/icons/loader";
const OUT = "public/icons/favicon";
/** Loader order (src/ui/prologue/Loader.tsx ICONS). */
const FRAMES = ["trumpet", "guitar", "shaker", "djembe", "conga"];
const INK = "#0d0c0b";
const CREAM = "#efe7da";
const TILE = 64;
const RADIUS = 14;
const BOX = 46; // the icon fits this square, centred

fs.mkdirSync(OUT, { recursive: true });

function frameSvg(name) {
  const source = fs.readFileSync(path.join(SOURCE, `${name}.svg`), "utf8");
  const [, width, height] = source.match(/<svg[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/) ?? [];
  if (!width || !height) throw new Error(`${name}.svg: no width/height`);
  const inner = source
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replaceAll('fill="black"', `fill="${CREAM}"`)
    .trim();
  const scale = BOX / Math.max(+width, +height);
  const w = +width * scale;
  const h = +height * scale;
  const x = (TILE - w) / 2;
  const y = (TILE - h) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}">
<rect width="${TILE}" height="${TILE}" rx="${RADIUS}" fill="${INK}"/>
<svg x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" viewBox="0 0 ${width} ${height}" fill="none">
${inner}
</svg>
</svg>
`;
}

for (const name of FRAMES) {
  const svg = frameSvg(name);
  fs.writeFileSync(path.join(OUT, `${name}.svg`), svg);
  await sharp(Buffer.from(svg), { density: 288 }).resize(TILE, TILE).png({ compressionLevel: 9 }).toFile(path.join(OUT, `${name}.png`));
}

// iOS home-screen icon: the first frame, square (iOS rounds the corners itself).
const apple = frameSvg(FRAMES[0]).replace(`rx="${RADIUS}"`, 'rx="0"');
await sharp(Buffer.from(apple), { density: 1024 }).resize(180, 180).png({ compressionLevel: 9 }).toFile(path.join(OUT, "apple-touch-icon.png"));

console.log(`favicons: ${FRAMES.length} frames (svg + png ${TILE}px) and apple-touch-icon.png → ${OUT}`);

// Minifies js/db.js and js/lang.js into js/db.min.js and js/lang.min.js.
// These two files are plain (non-module) scripts whose top-level functions
// are called from inline onclick="..." handlers in the HTML, so top-level
// names must never be mangled — only whitespace/comments/dead-code are
// stripped. Run with `npm run build:minify` after editing either source file.
import { minify } from "terser";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const targets = [
  { src: "js/db.js", out: "js/db.min.js" },
  { src: "js/lang.js", out: "js/lang.min.js" },
];

for (const { src, out } of targets) {
  const code = readFileSync(path.join(root, src), "utf8");
  const result = await minify(code, {
    compress: true,
    mangle: { toplevel: false },
    format: { comments: false },
  });
  if (!result.code) {
    throw new Error(`terser produced no output for ${src}`);
  }
  writeFileSync(path.join(root, out), result.code, "utf8");
  const before = Buffer.byteLength(code, "utf8");
  const after = Buffer.byteLength(result.code, "utf8");
  console.log(
    `${src} -> ${out}: ${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB (${(100 - (100 * after) / before).toFixed(1)}% smaller)`,
  );
}

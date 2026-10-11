// GitHub Pages has no SPA rewrites: a deep link such as `/tenderbuddy/bandi/<id>`
// arrives as a 404. Serving the app shell as 404.html makes Pages fall back to
// it for any unknown path; the router then reads the real URL. Harmless locally.
import { copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const index = resolve(dist, "index.html");

if (existsSync(index)) {
  copyFileSync(index, resolve(dist, "404.html"));
}

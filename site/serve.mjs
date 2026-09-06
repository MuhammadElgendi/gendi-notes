#!/usr/bin/env node
/* Static file server for site/dist — `node site/serve.mjs [port]`.
   Zero dependencies. Exists because file:// URLs break relative asset paths
   and block webfonts; browse the notes at http://localhost:8080 instead. */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");
const PORT = Number(process.argv[2]) || 8080;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".woff2":"font/woff2",
};

if (!fs.existsSync(DIST)) {
  console.error("site/dist not found — run `node site/build.mjs` first.");
  process.exit(1);
}

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  let file = path.join(DIST, url);

  /* Contain the path inside DIST: reject ../ traversal outright. */
  if (!path.resolve(file).startsWith(path.resolve(DIST))) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");

  if (!fs.existsSync(file)) {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" })
       .end(`<p style="font:16px system-ui">Not found: ${url}</p><p><a href="/">index</a></p>`);
    return;
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Gendi Notes → http://localhost:${PORT}`));

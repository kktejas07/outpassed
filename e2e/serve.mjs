// Serves the landing page at / and the exported web app at /app, like nginx does in production.
//   node e2e/serve.mjs <web-export-dir> [port]
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const appDir = path.resolve(process.argv[2] ?? "dist-web");
const port = Number(process.argv[3] ?? 8082);
const siteDir = path.resolve("apps/web");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".ttf": "font/ttf", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".svg": "image/svg+xml" };
const isFile = (p) => fs.existsSync(p) && fs.statSync(p).isFile();

http
  .createServer((req, res) => {
    const u = decodeURIComponent(req.url.split("?")[0]);
    if (u === "/app") {
      res.writeHead(301, { location: "/app/" });
      return res.end();
    }
    let f;
    if (u.startsWith("/app/")) {
      f = path.join(appDir, u.slice(4));
      if (!isFile(f)) f = path.join(f, "index.html");
      if (!isFile(f)) f = path.join(appDir, "index.html");
    } else {
      f = path.join(siteDir, u === "/" ? "index.html" : u === "/privacy" ? "privacy.html" : u);
      if (!isFile(f)) f = path.join(siteDir, "index.html");
    }
    res.writeHead(200, { "content-type": types[path.extname(f)] ?? "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  })
  .listen(port, () => console.log(`serving on http://localhost:${port}`));

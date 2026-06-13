import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.PORT || 5173);
const root = process.cwd();

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".png", "image/png"],
  [".glb", "model/gltf-binary"],
  [".json", "application/json; charset=utf-8"]
]);

function sendFile(response, filePath) {
  response.writeHead(200, {
    "content-type": mimeTypes.get(extname(filePath).toLowerCase()) || "application/octet-stream",
    "cache-control": "no-store",
    "permissions-policy": "camera=(self), geolocation=(self), accelerometer=(self), gyroscope=(self), magnetometer=(self), xr-spatial-tracking=(self)"
  });
  createReadStream(filePath).pipe(response);
}

createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const decodedPath = decodeURIComponent(url.pathname);
  const safePath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(root, safePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  if (!existsSync(filePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  if (statSync(filePath).isDirectory()) {
    filePath = join(filePath, "index.html");
  }

  if (!existsSync(filePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  sendFile(response, filePath);
}).listen(port, "0.0.0.0", () => {
  console.log(`Serving ${root} at http://0.0.0.0:${port}/`);
});

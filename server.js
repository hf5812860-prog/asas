const express = require("express");
const path = require("path");
const http = require("http");
const { createProxyMiddleware } = require("http-proxy-middleware");
const httpProxy = require("http-proxy");

const PORT = process.env.PORT || 10000;
const BACKEND = process.env.BACKEND_URL || "https://api.example.com";

const app = express();

// 1) /api → الباكند (HTTP)
app.use(
  "/api",
  createProxyMiddleware({
    target: BACKEND,
    changeOrigin: true,
    secure: false,
    ws: false,
    timeout: 3_600_000,
    proxyTimeout: 3_600_000,
    logLevel: "warn",
  })
);

// 2) الملفات الثابتة (index.html في الجذر)
app.use(express.static(__dirname, { extensions: ["html"] }));

// 3) fallback → index.html
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// 4) /ws → WebSocket proxy يدوياً
const server = http.createServer(app);
const wsProxy = httpProxy.createProxyServer({
  target: BACKEND.replace(/^http/, "ws"),
  changeOrigin: true,
  secure: false,
  ws: true,
});

server.on("upgrade", (req, socket, head) => {
  if (req.url.startsWith("/ws")) wsProxy.ws(req, socket, head);
  else socket.destroy();
});

wsProxy.on("error", (err, _req, socket) => {
  console.error("[ws]", err.message);
  try { socket.destroy(); } catch {}
});

server.listen(PORT, () => console.log(`▶ :${PORT} → ${BACKEND}`));

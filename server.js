/**
 * Render Web Service: يخدم index.html + يمرر /api و /ws إلى الباكند على VPS.
 * يعتمد على express + http-proxy-middleware + ws.
 */
const express = require("express");
const path = require("path");
const { createProxyMiddleware } = require("http-proxy-middleware");
const http = require("http");
const httpProxy = require("http-proxy");

const PORT = process.env.PORT || 10000;
const BACKEND = process.env.BACKEND_URL || "https://api.example.com";

const app = express();

// --- proxy لطلبات /api (HTTP) ---
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

// --- خدمة الملفات الثابتة ---
app.use(express.static(__dirname, {
  extensions: ["html"],
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-cache");
  },
}));

// --- fallback: أي مسار غير معروف → index.html ---
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// --- proxy لـ WebSocket /ws ---
const server = http.createServer(app);
const wsProxy = httpProxy.createProxyServer({
  target: BACKEND,
  changeOrigin: true,
  secure: false,
  ws: true,
});

server.on("upgrade", (req, socket, head) => {
  if (req.url.startsWith("/ws")) {
    wsProxy.ws(req, socket, head);
  } else {
    socket.destroy();
  }
});

wsProxy.on("error", (err, _req, socket) => {
  console.error("[ws proxy]", err.message);
  try { socket.destroy(); } catch {}
});

server.listen(PORT, () => {
  console.log(`▶ listening on :${PORT}  → backend: ${BACKEND}`);
});

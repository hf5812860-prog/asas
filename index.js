const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"], allowedHeaders: ["Content-Type", "x-api-key"] }));
app.use(express.json({ limit: "1mb" }));

const API_KEY = process.env.API_KEY || "JXZXCV";
const startedAt = Date.now();

const db = {
  users: new Map(),      // robloxId -> { username, jobId, lastSeen }
  trades: [],            // public offers
  requests: [],          // trade requests
  messages: [],          // public chat
  dms: [],               // private messages
  logs: [],
};

function auth(req, res, next) {
  const key = req.headers["x-api-key"];
  if (key !== API_KEY) return res.status(401).json({ error: "Unauthorized" });
  next();
}

function log(text) {
  db.logs.unshift({ text, time: Date.now() });
  if (db.logs.length > 80) db.logs.pop();
}

function uid(prefix) {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function prune() {
  const now = Date.now();
  db.trades = db.trades.filter((t) => now - t.createdAt < 30 * 1000);
  db.requests = db.requests.filter((r) => r.status === "pending" || now - r.createdAt < 10 * 60 * 1000);
  if (db.messages.length > 200) db.messages = db.messages.slice(-200);
  if (db.dms.length > 500) db.dms = db.dms.slice(-500);
}

function onlineCount() {
  const cut = Date.now() - 45 * 1000;
  let n = 0;
  for (const u of db.users.values()) if (u.lastSeen >= cut) n++;
  return n;
}

app.get("/", (_req, res) => {
  res.type("html").send(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>Trade API</title></head>
<body style="font-family:sans-serif;background:#111;color:#eee;padding:24px">
<h1>Roblox Trade API</h1>
<p>المفتاح: <b>${API_KEY}</b></p>
<p>متصلين: ${onlineCount()} | عروض: ${db.trades.length} | طلبات: ${db.requests.length}</p>
</body></html>`);
});

app.get("/dashboard/stats", auth, (_req, res) => {
  prune();
  res.json({
    online: onlineCount(),
    users: db.users.size,
    trades: db.trades.length,
    totalTrades: db.trades.length,
    requests: db.requests.length,
    uptime: Date.now() - startedAt,
  });
});

app.get("/dashboard/online", auth, (_req, res) => {
  const cut = Date.now() - 45 * 1000;
  const list = [];
  for (const [id, u] of db.users) {
    if (u.lastSeen >= cut) list.push({ robloxId: Number(id), username: u.username, jobId: u.jobId });
  }
  res.json(list);
});

app.get("/dashboard/logs", auth, (_req, res) => res.json(db.logs));

app.post("/api/register", auth, (req, res) => {
  const { robloxId, username, jobId } = req.body || {};
  if (!robloxId) return res.status(400).json({ success: false, error: "robloxId required" });
  db.users.set(String(robloxId), { username: username || "?", jobId: jobId || "", lastSeen: Date.now() });
  log("register " + username);
  res.json({ success: true });
});

app.post("/api/heartbeat", auth, (req, res) => {
  const { robloxId } = req.body || {};
  const u = db.users.get(String(robloxId));
  if (u) u.lastSeen = Date.now();
  res.json({ success: true });
});

app.post("/api/trade/create", auth, (req, res) => {
  prune();
  const b = req.body || {};
  const trade = {
    id: uid("tr"),
    fromId: b.fromId,
    fromName: b.fromName,
    myItems: b.myItems || [],
    theirItems: b.theirItems || [],
    note: b.note || "",
    jobId: b.jobId || "",
    status: "pending",
    createdAt: Date.now(),
  };
  db.trades.unshift(trade);
  log("trade " + trade.fromName);
  res.json({ success: true, tradeId: trade.id });
});

app.get("/api/trades/all", auth, (_req, res) => {
  prune();
  res.json(db.trades);
});

app.post("/api/trade/:id/delete", auth, (req, res) => {
  const id = req.params.id;
  const before = db.trades.length;
  db.trades = db.trades.filter((t) => t.id !== id);
  db.requests = db.requests.filter((r) => r.id !== id && r.offerId !== id);
  res.json({ success: db.trades.length < before || true });
});

// طلب مقايضة
app.post("/api/trade/request", auth, (req, res) => {
  const b = req.body || {};
  const rec = {
    id: uid("req"),
    offerId: b.offerId || "",
    fromId: b.fromId,
    fromName: b.fromName,
    toId: b.toId,
    toName: b.toName,
    cars: b.cars || b.myItems || [],
    jobId: b.jobId || "",
    status: "pending",
    createdAt: Date.now(),
  };
  db.requests.unshift(rec);
  log("request " + rec.fromName + " -> " + rec.toName);
  res.json({ success: true, requestId: rec.id, tradeId: rec.id });
});

app.get("/api/trade/requests/:userId", auth, (req, res) => {
  const id = String(req.params.userId);
  const list = db.requests.filter((r) => String(r.toId) === id || String(r.fromId) === id);
  res.json(list);
});

app.post("/api/trade/confirm", auth, (req, res) => {
  const { tradeId, userId } = req.body || {};
  const rec = db.requests.find((r) => r.id === tradeId);
  if (!rec) return res.json({ success: false, error: "not found" });
  rec.status = "accepted";
  rec.acceptedBy = userId;
  rec.acceptedAt = Date.now();
  res.json({ success: true });
});

app.post("/api/trade/cancel", auth, (req, res) => {
  const { tradeId } = req.body || {};
  db.requests = db.requests.filter((r) => r.id !== tradeId);
  res.json({ success: true });
});

// شات عام
app.get("/chat/messages", auth, (_req, res) => {
  res.json({ messages: db.messages, online: onlineCount() });
});

app.post("/chat/send", auth, (req, res) => {
  const b = req.body || {};
  db.messages.push({
    id: uid("msg"),
    userId: b.userId,
    username: b.username,
    message: b.message,
    time: Date.now(),
  });
  res.json({ success: true });
});

// شات خاص
app.post("/api/dm/send", auth, (req, res) => {
  const b = req.body || {};
  const msg = {
    id: uid("dm"),
    fromId: Number(b.fromId),
    fromName: b.fromName,
    toId: Number(b.toId),
    toName: b.toName,
    message: b.message,
    time: Date.now(),
  };
  db.dms.push(msg);
  res.json({ success: true, id: msg.id });
});

app.get("/api/dm/:userId", auth, (req, res) => {
  const id = Number(req.params.userId);
  const list = db.dms.filter((m) => m.fromId === id || m.toId === id);
  res.json({ messages: list });
});

app.get("/api/dm/thread/:a/:b", auth, (req, res) => {
  const a = Number(req.params.a);
  const b = Number(req.params.b);
  const list = db.dms.filter(
    (m) => (m.fromId === a && m.toId === b) || (m.fromId === b && m.toId === a)
  );
  res.json({ messages: list });
});

app.options("*", (_req, res) => res.sendStatus(204));

module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log("API on " + port));
}

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const API_KEY = process.env.API_KEY || "JXZXCV";
const TRADE_LIFETIME_SEC = 30;

const db = global.__tradeDb || {
  users: new Map(),
  trades: new Map(),
  requests: new Map(),
  messages: [],
};
global.__tradeDb = db;

let seq = Date.now();
const uid = (p) => `${p}_${++seq}`;

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function auth(req, res, next) {
  const key = req.headers["x-api-key"];
  if (key && key !== API_KEY) {
    return res.status(401).json({ success: false, error: "invalid api key" });
  }
  next();
}

app.use(auth);

function publicTrade(t) {
  return {
    id: t.id,
    fromId: t.fromId,
    fromName: t.fromName,
    myItems: t.myItems || [],
    theirItems: t.theirItems || [],
    note: t.note || "",
    jobId: t.jobId || "",
    createdAt: t.createdAt,
  };
}

function publicRequest(r) {
  return {
    id: r.id,
    tradeId: r.tradeId,
    fromId: r.fromId,
    fromName: r.fromName,
    toId: r.toId,
    toName: r.toName,
    myItems: r.myItems || [],
    status: r.status,
    createdAt: r.createdAt,
  };
}

function purgeOldTrades() {
  const cut = nowSec() - TRADE_LIFETIME_SEC;
  for (const [id, t] of db.trades) {
    if ((t.createdAt || 0) < cut) db.trades.delete(id);
  }
}

app.get("/", (_req, res) => {
  res.json({ ok: true, name: "asas-soma-trade-api", version: "9.1.0" });
});

app.get("/dashboard/stats", (_req, res) => {
  purgeOldTrades();
  res.json({
    success: true,
    trades: db.trades.size,
    requests: db.requests.size,
    users: db.users.size,
    messages: db.messages.length,
  });
});

app.post("/api/register", (req, res) => {
  const { robloxId, username, jobId } = req.body || {};
  if (!robloxId) return res.json({ success: false, error: "robloxId required" });
  const id = String(robloxId);
  db.users.set(id, {
    robloxId: id,
    username: username || ("Player" + id),
    jobId: jobId || "",
    lastSeen: nowSec(),
  });
  res.json({ success: true });
});

app.post("/api/heartbeat", (req, res) => {
  const { robloxId } = req.body || {};
  if (robloxId && db.users.has(String(robloxId))) {
    db.users.get(String(robloxId)).lastSeen = nowSec();
  }
  res.json({ success: true });
});

app.post("/api/trade/create", (req, res) => {
  const b = req.body || {};
  if (!b.fromId || !Array.isArray(b.myItems) || b.myItems.length === 0) {
    return res.json({ success: false, error: "invalid trade" });
  }
  const id = uid("tr");
  const trade = {
    id,
    fromId: Number(b.fromId),
    fromName: b.fromName || ("Player" + b.fromId),
    myItems: b.myItems,
    theirItems: Array.isArray(b.theirItems) ? b.theirItems : [],
    note: b.note || "",
    jobId: b.jobId || "",
    createdAt: nowSec(),
  };
  db.trades.set(id, trade);
  res.json({ success: true, tradeId: id, id });
});

app.get("/api/trades/all", (_req, res) => {
  purgeOldTrades();
  const trades = [...db.trades.values()].sort((a, b) => b.createdAt - a.createdAt);
  res.json({ success: true, trades: trades.map(publicTrade) });
});

app.post("/api/trade/:id/delete", (req, res) => {
  const id = req.params.id;
  const fromId = Number((req.body || {}).fromId);
  const t = db.trades.get(id);
  if (!t) return res.json({ success: true });
  if (fromId && t.fromId !== fromId) {
    return res.json({ success: false, error: "not owner" });
  }
  db.trades.delete(id);
  res.json({ success: true });
});

app.post("/api/trade/request", (req, res) => {
  const b = req.body || {};
  if (!b.tradeId || !b.fromId || !b.toId || !Array.isArray(b.myItems) || b.myItems.length === 0) {
    return res.json({ success: false, error: "invalid request" });
  }
  const id = uid("rq");
  const request = {
    id,
    tradeId: b.tradeId,
    fromId: Number(b.fromId),
    fromName: b.fromName || ("Player" + b.fromId),
    toId: Number(b.toId),
    toName: b.toName || ("Player" + b.toId),
    myItems: b.myItems,
    status: "pending",
    createdAt: nowSec(),
  };
  db.requests.set(id, request);
  res.json({ success: true, requestId: id, id });
});

app.get("/api/trade/requests/list/:userId", (req, res) => {
  const userId = Number(req.params.userId);
  const list = [...db.requests.values()]
    .filter((r) => r.fromId === userId || r.toId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(publicRequest);
  res.json(list);
});

app.post("/api/trade/request/accept", (req, res) => {
  const { requestId, userId } = req.body || {};
  const r = db.requests.get(String(requestId));
  if (!r) return res.json({ success: false, error: "not found" });
  if (userId && Number(userId) !== r.toId) {
    return res.json({ success: false, error: "not owner" });
  }
  r.status = "accepted";
  res.json({ success: true });
});

app.post("/api/trade/request/reject", (req, res) => {
  const { requestId, userId } = req.body || {};
  const r = db.requests.get(String(requestId));
  if (!r) return res.json({ success: false, error: "not found" });
  if (userId && Number(userId) !== r.toId) {
    return res.json({ success: false, error: "not owner" });
  }
  r.status = "rejected";
  res.json({ success: true });
});

app.post("/api/dm/send", (req, res) => {
  const b = req.body || {};
  if (!b.fromId || !b.toId || !b.message) {
    return res.json({ success: false, error: "invalid message" });
  }
  db.messages.push({
    id: uid("dm"),
    fromId: Number(b.fromId),
    fromName: b.fromName || ("Player" + b.fromId),
    toId: Number(b.toId),
    toName: b.toName || ("Player" + b.toId),
    message: String(b.message),
    createdAt: nowSec(),
  });
  if (db.messages.length > 5000) db.messages.splice(0, db.messages.length - 5000);
  res.json({ success: true });
});

app.get("/api/dm/messages/:a/:b", (req, res) => {
  const a = Number(req.params.a);
  const b = Number(req.params.b);
  const messages = db.messages.filter(
    (m) => (m.fromId === a && m.toId === b) || (m.fromId === b && m.toId === a)
  );
  res.json({ success: true, messages });
});

app.get("/api/dm/conversations/:userId", (req, res) => {
  const userId = Number(req.params.userId);
  const map = new Map();
  for (const m of db.messages) {
    if (m.fromId !== userId && m.toId !== userId) continue;
    const otherId = m.fromId === userId ? m.toId : m.fromId;
    const otherName = m.fromId === userId ? m.toName : m.fromName;
    const prev = map.get(otherId);
    if (!prev || m.createdAt >= prev.createdAt) {
      map.set(otherId, {
        userId: otherId,
        name: otherName,
        lastMsg: m.message,
        createdAt: m.createdAt,
      });
    }
  }
  const list = [...map.values()].sort((a, b) => b.createdAt - a.createdAt);
  res.json(list);
});

app.use((_req, res) => {
  res.status(404).json({ success: false, error: "not found" });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log("trade api on " + port));
}

module.exports = app;

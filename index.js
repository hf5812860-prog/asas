const express = require("express");
const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.text({ type: ["text/*", "text/plain"], limit: "50mb" }));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use((req, res, next) => {
  if (typeof req.body === "string" && req.body.trim()) {
    try { req.body = JSON.parse(req.body); } catch (e) {}
  }
  if (!req.body || typeof req.body !== "object") req.body = {};
  next();
});

app.use((req, res, next) => {
  req.cookies = {};
  const cookie = req.headers.cookie;
  if (cookie) {
    cookie.split(";").forEach((c) => {
      const [k, v] = c.trim().split("=");
      if (k && v) req.cookies[k] = decodeURIComponent(v);
    });
  }
  next();
});

const API_KEY = process.env.API_KEY || "JXZXCV";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SESSION_SECRET = process.env.SESSION_SECRET || "rejoin-admin-token";
const PUBLIC_HOST = process.env.PUBLIC_HOST || "https://asas-soma.onrender.com";

const fs = require("fs");
const STORE = "/tmp/rejoin-store.json";
const scripts = {};
const players = {};
const commandQueue = {};
function loadStore() {
  try {
    const raw = JSON.parse(fs.readFileSync(STORE, "utf8"));
    if (raw.scripts) Object.assign(scripts, raw.scripts);
    if (raw.players) Object.assign(players, raw.players);
    if (raw.commandQueue) Object.assign(commandQueue, raw.commandQueue);
  } catch (e) {}
}
function saveStore() {
  try {
    fs.writeFileSync(STORE, JSON.stringify({ scripts, players, commandQueue }));
  } catch (e) {}
}
loadStore();

function validName(n) {
  return /^[a-zA-Z0-9_\-]{1,64}$/.test(n);
}
function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function adminAuth(req, res, next) {
  const token = req.cookies.admin_token || req.headers["x-admin-token"] || req.query.token;
  if (token !== SESSION_SECRET) return res.redirect("/login");
  next();
}
function apiAuth(req, res, next) {
  const key = req.headers["x-api-key"] || req.query.key;
  if (key !== API_KEY) return res.status(401).json({ error: "Unauthorized" });
  next();
}
function getClientIp(req) {
  return (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
}
function fmtMoney(n) {
  const v = Number(n) || 0;
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
  return "$" + v.toLocaleString("en-US");
}
function timeAgo(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return s + " ث";
  const m = Math.floor(s / 60);
  if (m < 60) return m + " د";
  return Math.floor(m / 60) + " س";
}
function getHost(req) {
  if (PUBLIC_HOST) return PUBLIC_HOST.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0];
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return proto + "://" + host;
}
function loadSnippet(host, name) {
  return `loadstring(game:HttpGet("${host}/load/${name}"))()`;
}
function queueCmd(userId, command) {
  const uid = String(userId);
  if (!commandQueue[uid]) commandQueue[uid] = [];
  commandQueue[uid].push({ command, timestamp: Date.now() });
}

function layout({ title, page, content }) {
  const nav = [
    { href: "/dashboard", icon: "📊", label: "لوحة التحكم", id: "dashboard" },
    { href: "/players", icon: "👥", label: "اللاعبون", id: "players" },
    { href: "/scripts", icon: "📜", label: "السكربتات", id: "scripts" },
  ]
    .map((item) => {
      const on = page === item.id;
      return `<a href="${item.href}" class="flex items-center gap-3 px-4 py-3 rounded-xl ${
        on ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white" : "text-gray-400 hover:bg-gray-800/50"
      }"><span class="text-xl">${item.icon}</span><span class="font-semibold">${item.label}</span></a>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — Rejoin Host</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=JetBrains+Mono&display=swap" rel="stylesheet">
<style>
*{font-family:'Cairo',sans-serif} code,pre,textarea,.font-mono{font-family:'JetBrains Mono',monospace}
body{background:#0a0a12;margin:0}
::-webkit-scrollbar{width:8px} ::-webkit-scrollbar-thumb{background:#3b82f6;border-radius:4px}
.pulse-green{animation:pg 2s infinite}
@keyframes pg{0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,.7)}50%{box-shadow:0 0 0 8px rgba(16,185,129,0)}}
</style></head>
<body class="min-h-screen text-gray-200">
<div class="flex min-h-screen">
<aside class="w-64 bg-gray-900/80 border-l border-gray-800 flex-shrink-0 hidden md:flex md:flex-col">
  <div class="p-6 border-b border-gray-800">
    <div class="font-bold text-white text-lg">🔄 Rejoin Host</div>
    <div class="text-xs text-gray-500">v2.2 Control</div>
  </div>
  <nav class="flex-1 p-4 space-y-2">${nav}</nav>
  <div class="p-4 border-t border-gray-800">
    <a href="/logout" class="flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10">🚪 خروج</a>
  </div>
</aside>
<main class="flex-1 overflow-auto">${content}</main>
</div></body></html>`;
}

app.get("/login", (req, res) => {
  const err = req.query.error
    ? `<div class="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm text-center">كلمة المرور غلط</div>`
    : "";
  res.send(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>دخول</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet">
<style>*{font-family:Cairo,sans-serif}body{background:#0f0f16}</style></head>
<body class="min-h-screen flex items-center justify-center p-4">
<div class="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-8">
<h1 class="text-3xl font-bold text-center text-white mb-6">🔄 Rejoin Host</h1>
${err}
<form method="POST" action="/login" class="space-y-4">
<input type="password" name="password" required placeholder="كلمة المرور" autofocus
 class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white">
<button class="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold rounded-xl">دخول</button>
</form></div></body></html>`);
});

app.post("/login", (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    res.cookie("admin_token", SESSION_SECRET, { httpOnly: true, maxAge: 86400000 });
    return res.redirect("/dashboard");
  }
  res.redirect("/login?error=1");
});
app.get("/logout", (req, res) => {
  res.clearCookie("admin_token");
  res.redirect("/login");
});
app.get("/", (req, res) => res.redirect("/dashboard"));

app.get("/dashboard", adminAuth, (req, res) => {
  const now = Date.now();
  const list = Object.values(players);
  const online = list.filter((p) => now - p.lastSeen < 30000);
  const loads = Object.values(scripts).reduce((a, s) => a + (s.loads || 0), 0);
  const cards = [
    ["🟢", online.length, "متصل الآن"],
    ["📜", Object.keys(scripts).length, "سكربتات"],
    ["⚡", loads, "تحميلات"],
    ["👥", list.length, "جلسات"],
  ]
    .map(
      ([i, n, l]) =>
        `<div class="bg-gray-900 border border-gray-800 rounded-2xl p-6"><div class="text-3xl">${i}</div>
         <div class="text-3xl font-bold text-blue-400">${n}</div><div class="text-gray-400 text-sm">${l}</div></div>`
    )
    .join("");

  const onlineHTML = online.length
    ? online
        .map(
          (p) => `<div class="flex items-center justify-between p-3 bg-gray-800/40 rounded-xl mb-2">
      <div><div class="font-bold">${esc(p.username)}</div>
      <div class="text-xs text-gray-500">${esc(p.farmMode || "None")} • ${fmtMoney(p.money)} يد / ${fmtMoney(p.bank)} بنك • Lvl ${p.level || 0}</div></div>
      <a href="/players" class="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs">تحكم</a></div>`
        )
        .join("")
    : `<div class="text-center py-8 text-gray-500">ما في أحد متصل</div>`;

  res.send(
    layout({
      title: "لوحة التحكم",
      page: "dashboard",
      content: `<header class="bg-gray-900/60 border-b border-gray-800 p-6"><h1 class="text-2xl font-bold">📊 لوحة التحكم</h1></header>
      <div class="p-6 space-y-6">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">${cards}</div>
        <div class="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div class="flex justify-between mb-4"><h2 class="font-bold">المتصلون</h2><a class="text-blue-400 text-sm" href="/players">الكل</a></div>
          ${onlineHTML}
        </div>
        <div class="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-5 text-sm text-gray-300 space-y-1">
          <div>1) ارفع السكربت من <a class="text-blue-400" href="/scripts/new">/scripts/new</a></div>
          <div>2) بعد الحفظ انسخ أمر loadstring الكامل من صفحة السكربتات (فيه رابط موقعك)</div>
          <div>3) يظهر هنا خلال ثواني — تتحكم فيه من تبويب اللاعبين</div>
        </div>
      </div>
      <script>setTimeout(()=>location.reload(),8000)</script>`,
    })
  );
});

app.post("/api/heartbeat", (req, res) => {
  const key = req.query.key || req.headers["x-api-key"];
  if (key !== API_KEY) return res.status(401).json({ error: "Unauthorized" });
  const data = req.body || {};
  if (!data.userId) return res.status(400).json({ error: "Missing userId" });
  const scriptName = String(req.query.script || "default");
  const userId = String(data.userId);
  players[userId + ":" + scriptName] = {
    ...data,
    userId,
    scriptName,
    lastSeen: Date.now(),
    ip: getClientIp(req),
  };
  const cmds = commandQueue[userId] || [];
  commandQueue[userId] = [];
  saveStore();
  res.json({ ok: true, commands: cmds.map((c) => c.command) });
});

app.get("/api/heartbeat", (req, res) => {
  const key = req.query.key || req.headers["x-api-key"];
  if (key !== API_KEY) return res.status(401).json({ error: "Unauthorized" });
  const userId = String(req.query.userId || "");
  if (!userId) return res.status(400).json({ error: "Missing userId" });
  const scriptName = String(req.query.script || "default");
  players[userId + ":" + scriptName] = {
    userId,
    username: req.query.username || "Unknown",
    scriptName,
    money: Number(req.query.money || 0),
    bank: Number(req.query.bank || 0),
    level: Number(req.query.level || 0),
    lastSeen: Date.now(),
    ip: getClientIp(req),
  };
  saveStore();
  res.json({ ok: true, commands: [] });
});

setInterval(() => {
  const now = Date.now();
  for (const k in players) if (now - players[k].lastSeen > 90000) delete players[k];
  for (const uid in commandQueue) {
    commandQueue[uid] = (commandQueue[uid] || []).filter((c) => now - c.timestamp < 60000);
    if (!commandQueue[uid].length) delete commandQueue[uid];
  }
}, 30000);

app.post("/admin/command", adminAuth, (req, res) => {
  const { userId, command } = req.body;
  if (!userId || !command) return res.status(400).send("missing");
  queueCmd(userId, command);
  res.redirect("/players");
});

app.get("/players", adminAuth, (req, res) => {
  const now = Date.now();
  const list = Object.values(players)
    .map((p) => ({ ...p, online: now - p.lastSeen < 30000, lastSeenAgo: timeAgo(now - p.lastSeen) }))
    .sort((a, b) => b.lastSeen - a.lastSeen);

  const cards = list.length
    ? list
        .map((p) => {
          const farm = [];
          if (p.autoFarmATM) farm.push("ATM");
          if (p.autoFarmJob) farm.push("JOB " + (p.selectedJob || ""));
          if (p.autoFarmFishing) farm.push("FISH");
          const farmTxt = farm.length ? farm.join(" + ") : "واقف";
          const btn = (cmd, label, color) =>
            `<form method="POST" action="/admin/command" class="inline">
              <input type="hidden" name="userId" value="${esc(p.userId)}">
              <input type="hidden" name="command" value="${cmd}">
              <button class="px-3 py-1.5 ${color} rounded-lg text-xs font-bold">${label}</button>
            </form>`;
          return `<div class="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4">
            <div class="flex items-start justify-between gap-3 flex-wrap mb-4">
              <div class="flex items-center gap-3">
                <img src="https://www.roblox.com/headshot-thumbnail/image?userId=${p.userId}&width=150&height=150&format=png" class="w-14 h-14 rounded-xl bg-gray-800">
                <div>
                  <div class="font-bold text-white text-lg">${esc(p.username || "?")}</div>
                  <div class="text-xs text-gray-500">ID ${p.userId} • ${esc(p.scriptName || "")}</div>
                  <div class="text-xs ${p.online ? "text-emerald-400" : "text-gray-500"}">${p.online ? "🟢 متصل" : "⚫ " + p.lastSeenAgo} • ${Math.floor((p.uptime || 0) / 60)} د</div>
                </div>
              </div>
              <div class="text-xs px-3 py-1 rounded-lg bg-gray-800 text-blue-300">${esc(farmTxt)}</div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <div class="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3"><div class="text-xs text-gray-500">بيده</div><div class="font-bold text-emerald-400 text-xl">${fmtMoney(p.money)}</div></div>
              <div class="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3"><div class="text-xs text-gray-500">البنك</div><div class="font-bold text-blue-400 text-xl">${fmtMoney(p.bank)}</div></div>
              <div class="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3"><div class="text-xs text-gray-500">المستوى</div><div class="font-bold text-purple-400 text-xl">${p.level || 0}</div></div>
              <div class="bg-red-500/10 border border-red-500/20 rounded-lg p-3"><div class="text-xs text-gray-500">الصحة</div><div class="font-bold text-red-400 text-xl">${Math.round(p.health || 0)}/${Math.round(p.maxHealth || 100)}</div></div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 text-sm">
              <div class="bg-gray-800/40 rounded-lg p-2"><div class="text-xs text-gray-500">فارم</div><div>${esc(p.farmMode || "None")}</div></div>
              <div class="bg-gray-800/40 rounded-lg p-2"><div class="text-xs text-gray-500">وظيفة اللعبة</div><div>${esc(p.currentJob || "None")}</div></div>
              <div class="bg-gray-800/40 rounded-lg p-2"><div class="text-xs text-gray-500">Swiper</div><div>${p.swiper || 0}</div></div>
              <div class="bg-gray-800/40 rounded-lg p-2"><div class="text-xs text-gray-500">Cook</div><div>${p.cook || 0}</div></div>
            </div>
            <div class="flex flex-wrap gap-2">
              ${btn("job_atm", "ATM", "bg-emerald-600 text-white")}
              ${btn("job_janitor", "Janitor", "bg-blue-600 text-white")}
              ${btn("job_quick11", "Quick-11", "bg-indigo-600 text-white")}
              ${btn("job_fishing", "Fishing", "bg-cyan-600 text-white")}
              ${btn("job_none", "إيقاف", "bg-gray-700 text-white")}
              ${btn("deposit_all", "إيداع الكل", "bg-yellow-700 text-white")}
              ${btn("withdraw_1000", "سحب 1000", "bg-yellow-800 text-white")}
              ${btn("rejoin", "ريjoin", "bg-orange-600 text-white")}
              ${btn("hop_low", "هوب فاضي", "bg-pink-600 text-white")}
              ${btn("hop_random", "هوب عشوائي", "bg-fuchsia-700 text-white")}
            </div>
          </div>`;
        })
        .join("")
    : `<div class="text-center py-16 text-gray-500">لا يوجد لاعبون — شغّل السكربت من /load/الاسم</div>`;

  res.send(
    layout({
      title: "اللاعبون",
      page: "players",
      content: `<header class="bg-gray-900/60 border-b border-gray-800 p-6 sticky top-0"><h1 class="text-2xl font-bold">👥 اللاعبون</h1></header>
      <div class="p-6">${cards}</div>
      <script>setTimeout(()=>location.reload(),6000)</script>`,
    })
  );
});

app.get("/scripts", adminAuth, (req, res) => {
  const host = getHost(req);
  const saved = req.query.saved;
  const items = Object.values(scripts);
  const savedBox = saved && scripts[saved]
    ? `<div class="mb-6 p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
        <div class="font-bold text-emerald-400 mb-2">السكربت جاهز — انسخ هذا كامل في الإكسكيوتر</div>
        <textarea readonly class="w-full px-3 py-3 bg-gray-950 border border-gray-700 rounded-xl text-emerald-300 text-sm font-mono" id="copybox">${esc(loadSnippet(host, saved))}</textarea>
        <button onclick="navigator.clipboard.writeText(document.getElementById('copybox').value)" class="mt-3 px-4 py-2 bg-emerald-600 rounded-lg text-sm">نسخ</button>
      </div>`
    : "";
  const html = items.length
    ? items
        .map((s) => {
          const snip = loadSnippet(host, s.name);
          return `<div class="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-3">
        <div class="flex justify-between items-center flex-wrap gap-3 mb-3">
          <div><div class="font-bold text-white">${esc(s.name)}</div>
          <div class="text-xs text-gray-500">${esc(s.description || "")} • ${s.loads || 0} تحميل</div></div>
          <div class="flex gap-2">
            <a class="px-3 py-2 bg-blue-600 rounded-lg text-sm" href="/scripts/edit/${encodeURIComponent(s.name)}">تعديل</a>
            <form method="POST" action="/admin/scripts/delete"><input type="hidden" name="name" value="${esc(s.name)}">
            <button class="px-3 py-2 bg-red-700 rounded-lg text-sm">حذف</button></form>
          </div>
        </div>
        <div class="text-xs text-gray-400 mb-1">شغّل هذا كامل في اللعبة:</div>
        <input readonly class="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-xl text-emerald-300 text-xs font-mono" value="${esc(snip)}" onclick="this.select()">
      </div>`;
        })
        .join("")
    : `<div class="text-gray-500">ما في سكربتات</div>`;

  res.send(
    layout({
      title: "السكربتات",
      page: "scripts",
      content: `<header class="bg-gray-900/60 border-b border-gray-800 p-6 flex justify-between">
        <h1 class="text-2xl font-bold">📜 السكربتات</h1>
        <a href="/scripts/new" class="px-5 py-2.5 bg-emerald-600 rounded-xl font-bold">+ ارفع سكربت</a>
      </header><div class="p-6">${savedBox}${html}</div>`,
    })
  );
});

function scriptForm({ name, description, content, originalName }) {
  return `<form method="POST" action="/admin/scripts/save" class="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
    ${originalName ? `<input type="hidden" name="originalName" value="${esc(originalName)}">` : ""}
    <input name="name" required pattern="[a-zA-Z0-9_\\-]{1,64}" value="${esc(name || "")}" placeholder="farm1"
      class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white">
    <input name="description" value="${esc(description || "")}" placeholder="وصف"
      class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white">
    <textarea name="content" required rows="22" placeholder="الصق السكربت هنا"
      class="w-full px-4 py-3 bg-gray-950 border border-gray-700 rounded-xl text-emerald-400 text-sm">${esc(content || "")}</textarea>
    <div class="flex gap-3">
      <button class="flex-1 py-3 bg-emerald-600 rounded-xl font-bold">حفظ + حقن تلقائي</button>
      <a href="/scripts" class="flex-1 py-3 bg-gray-800 rounded-xl text-center font-bold">إلغاء</a>
    </div>
  </form>`;
}

app.get("/scripts/new", adminAuth, (req, res) => {
  res.send(layout({ title: "سكربت جديد", page: "scripts", content: `<div class="p-6">${scriptForm({})}</div>` }));
});
app.get("/scripts/edit/:name", adminAuth, (req, res) => {
  const s = scripts[req.params.name];
  if (!s) return res.redirect("/scripts");
  res.send(
    layout({
      title: "تعديل",
      page: "scripts",
      content: `<div class="p-6">${scriptForm({ ...s, originalName: s.name })}</div>`,
    })
  );
});
app.post("/admin/scripts/save", adminAuth, (req, res) => {
  const { name, description, content, originalName } = req.body;
  if (!name || !content || !validName(name)) return res.status(400).send("invalid");
  if (originalName && originalName !== name && scripts[originalName]) delete scripts[originalName];
  scripts[name] = {
    name,
    description: description || "",
    content: String(content),
    updatedAt: Date.now(),
    createdAt: (scripts[name] && scripts[name].createdAt) || Date.now(),
    loads: (scripts[name] && scripts[name].loads) || 0,
  };
  res.redirect("/scripts?saved=" + encodeURIComponent(name));
});
app.post("/admin/scripts/delete", adminAuth, (req, res) => {
  if (scripts[req.body.name]) delete scripts[req.body.name];
  res.redirect("/scripts");
});

function injectorFooter(hostUrl, apiKey, scriptName, scriptUrl) {
  return `

-- ═══ AUTO CONTROL / HEARTBEAT ═══
pcall(function()
    _G.Config = Config
    _G.func = func
    _G.Sf = Sf
    _G.StateController = StateController
    _G.Net = Net
end)
do
    local HOST = "${hostUrl}"
    local KEY = "${apiKey}"
    local SCRIPT = "${scriptName}"
    local HTTP = game:GetService("HttpService")
    local LP = game:GetService("Players").LocalPlayer
    if getgenv and not getgenv().__START_TIME then getgenv().__START_TIME = tick() end

    local function find(name)
        if _G[name] then return _G[name] end
        if getgenv and getgenv()[name] then return getgenv()[name] end
        return nil
    end

    local function handle(cmd)
        print("[HOST CMD]", cmd)
        local TS = game:GetService("TeleportService")
        if cmd == "rejoin" then
            TS:TeleportToPlaceInstance(game.PlaceId, game.JobId, LP)
        elseif cmd == "hop_low" or cmd == "hop_random" then
            task.spawn(function()
                local ok, raw = pcall(function()
                    return game:HttpGet("https://games.roblox.com/v1/games/"..game.PlaceId.."/servers/Public?sortOrder=Asc&limit=100")
                end)
                if not ok then return end
                local data = HTTP:JSONDecode(raw)
                local ids = {}
                if data and data.data then
                    for _, v in ipairs(data.data) do
                        if v.playing < v.maxPlayers then table.insert(ids, {id=v.id, n=v.playing}) end
                    end
                end
                if #ids == 0 then return end
                table.sort(ids, function(a,b) return a.n < b.n end)
                local pick = cmd == "hop_low" and ids[1].id or ids[math.random(1,#ids)].id
                TS:TeleportToPlaceInstance(game.PlaceId, pick, LP)
            end)
        elseif cmd == "job_atm" or cmd == "job_janitor" or cmd == "job_quick11" or cmd == "job_fishing" or cmd == "job_none" then
            task.spawn(function()
                local Config = find("Config")
                local func = find("func")
                local StateController = find("StateController")
                local Sf = find("Sf")
                if not Config then return end
                Config.AutoFarmATM = false
                Config.StartFarmJob = false
                Config.AutoFarmFishing = false
                if StateController and StateController.StopJob then pcall(function() StateController:StopJob() end) end
                if Sf and Sf.ForceStop then pcall(function() Sf:ForceStop() end) end
                task.wait(0.4)
                if cmd == "job_atm" then
                    Config.AutoFarmATM = true
                    Config.EnabledVechine = true
                    Config.EnabledDespoit = true
                    Config.SelectedFarmMode = "ATM"
                    if func and func.AutoFarmATM then task.spawn(func.AutoFarmATM) end
                elseif cmd == "job_janitor" then
                    Config.StartFarmJob = true
                    Config.SelectedJob = "Janitor"
                    Config.SelectedFarmMode = "Janitor"
                    if StateController and StateController.StartJob then StateController:StartJob() end
                elseif cmd == "job_quick11" then
                    Config.StartFarmJob = true
                    Config.SelectedJob = "Quick-11"
                    Config.SelectedFarmMode = "Quick-11"
                    if StateController and StateController.StartJob then StateController:StartJob() end
                elseif cmd == "job_fishing" then
                    Config.AutoFarmFishing = true
                    Config.SelectedFarmMode = "Fishing"
                    if func and func.AutoFarmFishing then task.spawn(func.AutoFarmFishing) end
                else
                    Config.SelectedFarmMode = "None"
                    Config.SelectedJob = "None"
                end
            end)
        elseif cmd == "deposit_all" then
            pcall(function()
                local Sf, Net = find("Sf"), find("Net")
                if Sf and Net and Sf.GetMoney then
                    local m = Sf:GetMoney() or 0
                    if m > 0 then Net.get("transfer_funds", "hand", "bank", m) end
                end
            end)
        elseif cmd == "withdraw_1000" then
            pcall(function()
                local Net = find("Net")
                if Net then Net.get("transfer_funds", "bank", "hand", 1000) end
            end)
        end
    end

    local function readMoney()
        local Sf = find("Sf")
        if Sf and Sf.GetMoney then
            local ok, v = pcall(function() return Sf:GetMoney() end)
            if ok then return v or 0 end
        end
        return 0
    end
    local function readBank()
        local Sf = find("Sf")
        if Sf and Sf.ATMMoney then
            local ok, v = pcall(function() return Sf:ATMMoney() end)
            if ok then return v or 0 end
        end
        return 0
    end
    local function readLevel()
        local Sf = find("Sf")
        if Sf and Sf.GetLevel then
            local ok, v = pcall(function() return Sf:GetLevel() end)
            if ok then return v or 0 end
        end
        return 0
    end
    local function readSkill(name)
        local Sf = find("Sf")
        if Sf and Sf.GetSkill then
            local ok, v = pcall(function() return Sf:GetSkill(name) end)
            if ok then return v or 0 end
        end
        return 0
    end

    if queue_on_teleport then
        pcall(function()
            queue_on_teleport(([[task.wait(3) loadstring(game:HttpGet("%s"))()]]):format("${scriptUrl}"))
        end)
    end

    task.spawn(function()
        while task.wait(3) do
            pcall(function()
                local char = LP.Character
                local hum = char and char:FindFirstChildOfClass("Humanoid")
                local Config = find("Config")
                local body = HTTP:JSONEncode({
                    userId = LP.UserId,
                    username = LP.Name,
                    jobId = game.JobId,
                    placeId = game.PlaceId,
                    health = hum and hum.Health or 0,
                    maxHealth = hum and hum.MaxHealth or 100,
                    money = readMoney(),
                    bank = readBank(),
                    level = readLevel(),
                    swiper = readSkill("Swiper"),
                    cook = readSkill("Cook"),
                    currentJob = LP:GetAttribute("Job") or "None",
                    farmMode = Config and Config.SelectedFarmMode or "None",
                    autoFarmATM = Config and Config.AutoFarmATM or false,
                    autoFarmJob = Config and Config.StartFarmJob or false,
                    autoFarmFishing = Config and Config.AutoFarmFishing or false,
                    selectedJob = Config and Config.SelectedJob or "None",
                    uptime = math.floor(tick() - ((getgenv and getgenv().__START_TIME) or tick())),
                })
                local resp
                if syn and syn.request then
                    local r = syn.request({
                        Url = HOST .. "/api/heartbeat?key=" .. KEY .. "&script=" .. SCRIPT,
                        Method = "POST",
                        Headers = { ["Content-Type"] = "application/json", ["x-api-key"] = KEY },
                        Body = body,
                    })
                    resp = r.Body or r.body
                else
                    resp = HTTP:PostAsync(HOST .. "/api/heartbeat?key=" .. KEY .. "&script=" .. SCRIPT, body, Enum.HttpContentType.ApplicationJson)
                end
                local data = HTTP:JSONDecode(resp)
                if data and data.commands then
                    for _, c in ipairs(data.commands) do pcall(handle, c) end
                end
            end)
        end
    end)
    print("[HOST] connected", HOST)
end
`;
}

app.get("/load/:name", (req, res) => {
  const s = scripts[req.params.name];
  if (!s) return res.status(404).type("text/plain").send('warn("[HOST] script not found")');
  s.loads = (s.loads || 0) + 1;
  const hostUrl = getHost(req);
  const scriptUrl = hostUrl + "/load/" + s.name;
  const header = `-- ${s.name}\n_G.HOST_URL="${hostUrl}"\n_G.HOST_KEY="${API_KEY}"\n_G.SCRIPT_NAME="${s.name}"\n\n`;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.send(header + s.content + injectorFooter(hostUrl, API_KEY, s.name, scriptUrl));
});

app.get("/api/status", apiAuth, (req, res) => {
  res.json({ ok: true, scripts: Object.keys(scripts).length, players: Object.keys(players).length, uptime: process.uptime() });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log("Rejoin Host on " + PORT));
}
module.exports = app;

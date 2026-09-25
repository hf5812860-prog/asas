const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.text({ type: ['text/plain', 'text/lua'], limit: '5mb' }));

app.use((req, res, next) => {
  if (typeof req.body === 'string' && req.body.trim().startsWith('{')) {
    try { req.body = JSON.parse(req.body); } catch (e) {}
  }
  if (!req.body || typeof req.body !== 'object') req.body = {};
  next();
});

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const ADMIN_KEY = process.env.API_KEY || 'JXZXCV';
const START = Date.now();
const STORE_FILE = path.join('/tmp', 'script-host.json');

const g = global.__host || {
  scripts: {
    trade: {
      name: 'trade',
      title: 'سوق السيارات',
      code: '-- الصق سكربتك من لوحة التحكم',
      updatedAt: Date.now(),
    },
  },
  users: {},
  logs: [],
  trades: {},
  tradeRequests: {},
  dmMessages: {},
  totalTrades: 0,
};
global.__host = g;

function loadStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
      if (raw.scripts) g.scripts = raw.scripts;
      if (raw.users) g.users = raw.users;
      if (raw.logs) g.logs = raw.logs;
    }
  } catch (e) {}
}
function saveStore() {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify({
      scripts: g.scripts,
      users: g.users,
      logs: g.logs.slice(0, 80),
    }));
  } catch (e) {}
}
loadStore();

function slugify(s) {
  return String(s || 'trade').toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'trade';
}
function addLog(type, message) {
  g.logs.unshift({ type, message, time: Date.now() });
  if (g.logs.length > 100) g.logs.length = 100;
  saveStore();
}
function admin(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.key || (req.body && req.body.adminKey);
  if (key !== ADMIN_KEY) return res.status(401).json({ success: false, error: 'Unauthorized' });
  next();
}
function isOnline(u) { return u && Date.now() - u.lastSeen < 2 * 60 * 1000; }
function toInt(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; }
function convKey(a, b) { a = String(a); b = String(b); return a < b ? a + '_' + b : b + '_' + a; }
function activeTrades() {
  const now = Date.now();
  return Object.values(g.trades || {}).filter(t => t.status === 'pending' && now - t.createdAt < 30000).sort((a,b)=>b.createdAt-a.createdAt);
}

function dashboardHtml(req) {
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'your-project.vercel.app').split(',')[0];
  const proto = (req.headers['x-forwarded-proto'] || 'https');
  const base = proto + '://' + host;
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>لوحة التحكم</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Segoe UI,Tahoma,sans-serif;background:#0f0f16;color:#e8e8f0;padding:20px}
.wrap{max-width:1200px;margin:0 auto}
.top{background:linear-gradient(135deg,#1b1b28,#26263a);border:1px solid #32324a;border-radius:16px;padding:20px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}
h1{background:linear-gradient(90deg,#7db4ff,#b79bff);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px}
.card{background:#161622;border:1px solid #2d2d44;border-radius:14px;padding:16px;margin-bottom:16px}
.num{font-size:30px;font-weight:700;color:#7db4ff}
.lbl{color:#8b8ba4;font-size:13px}
textarea,input{width:100%;background:#101018;border:1px solid #33334d;color:#fff;border-radius:10px;padding:10px;font-family:Consolas,monospace}
textarea{min-height:280px}
button{background:linear-gradient(135deg,#5b8cff,#8a6bff);border:none;color:#fff;padding:10px 16px;border-radius:10px;font-weight:700;cursor:pointer}
.item{background:#1c1c2b;border:1px solid #333;border-radius:10px;padding:10px;margin-top:8px}
.code{background:#000;color:#7CFFB2;padding:10px;border-radius:8px;word-break:break-all;font-family:monospace;font-size:13px}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div>
      <h1>لوحة التحكم</h1>
      <div class="lbl">رفع السكربت + رابط loadstring + الإحصائيات</div>
    </div>
    <div class="lbl">المضيف: ${base}</div>
  </div>
  <div class="grid">
    <div class="card"><div class="num" id="s-online">0</div><div class="lbl">متصل الآن</div></div>
    <div class="card"><div class="num" id="s-users">0</div><div class="lbl">إجمالي اللاعبين</div></div>
    <div class="card"><div class="num" id="s-trades">0</div><div class="lbl">عروض نشطة</div></div>
    <div class="card"><div class="num" id="s-logs">0</div><div class="lbl">سجلات</div></div>
  </div>
  <div class="card">
    <h3>لصق سكربتك</h3>
    <p class="lbl" style="margin:8px 0">الاسم يظهر في الرابط: /load/الاسم</p>
    <input id="name" value="trade" placeholder="trade">
    <input id="title" value="سوق السيارات" placeholder="عنوان" style="margin-top:8px">
    <textarea id="code" style="margin-top:8px" placeholder="الصق كود اللوا هنا"></textarea>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
      <button id="save">حفظ السكربت</button>
      <input id="admin" placeholder="مفتاح الأدمن JXZXCV" style="max-width:220px">
    </div>
    <div id="loadline" class="code" style="margin-top:12px">loadstring(game:HttpGet("${base}/load/trade"))()</div>
  </div>
  <div class="card">
    <h3>السكربتات المحفوظة</h3>
    <div id="scripts"></div>
  </div>
  <div class="card">
    <h3>اللاعبين</h3>
    <div id="users"></div>
  </div>
  <div class="card">
    <h3>السجلات</h3>
    <div id="logs"></div>
  </div>
</div>
<script>
const BASE = ${JSON.stringify(base)};
function esc(s){return String(s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
async function j(url){const r=await fetch(url);return r.ok?r.json():null;}
async function refresh(){
  const s=await j('/dashboard/stats');
  if(s){
    document.getElementById('s-online').textContent=s.online||0;
    document.getElementById('s-users').textContent=s.users||0;
    document.getElementById('s-trades').textContent=s.trades||0;
    document.getElementById('s-logs').textContent=s.logs||0;
  }
  const list=await j('/api/scripts')||[];
  document.getElementById('scripts').innerHTML=list.length?list.map(x=>'<div class="item"><b>'+esc(x.name)+'</b> — '+esc(x.title||'')+'<div class="code">loadstring(game:HttpGet("'+BASE+'/load/'+esc(x.name)+'"))()</div></div>').join(''):'لا يوجد';
  const users=await j('/dashboard/online')||[];
  document.getElementById('users').innerHTML=users.length?users.map(u=>'<div class="item"><b>'+esc(u.username)+'</b> — '+esc(u.robloxId)+'</div>').join(''):'لا أحد متصل';
  const logs=await j('/dashboard/logs')||[];
  document.getElementById('logs').innerHTML=logs.length?logs.map(x=>'<div class="item">'+esc(x.message)+'</div>').join(''):'لا توجد سجلات';
}
document.getElementById('save').onclick=async()=>{
  const admin=document.getElementById('admin').value||'JXZXCV';
  const name=document.getElementById('name').value||'trade';
  const r=await fetch('/api/scripts/save',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':admin},body:JSON.stringify({name,title:document.getElementById('title').value,code:document.getElementById('code').value})});
  const d=await r.json();
  document.getElementById('loadline').textContent=d.loadstring||'فشل الحفظ';
  refresh();
};
document.getElementById('name').oninput=()=>{
  const n=(document.getElementById('name').value||'trade').toLowerCase();
  document.getElementById('loadline').textContent='loadstring(game:HttpGet("'+BASE+'/load/'+n+'"))()';
};
refresh();
setInterval(refresh,2000);
</script>
</body></html>`;
}

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(dashboardHtml(req));
});
app.get('/dashboard', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(dashboardHtml(req));
});

app.get('/dashboard/stats', (_req, res) => {
  res.json({
    success: true,
    online: Object.values(g.users).filter(isOnline).length,
    users: Object.keys(g.users).length,
    trades: activeTrades().length,
    logs: g.logs.length,
    scripts: Object.keys(g.scripts).length,
    uptime: Date.now() - START,
  });
});
app.get('/dashboard/online', (_req, res) => res.json(Object.values(g.users).filter(isOnline)));
app.get('/dashboard/logs', (_req, res) => res.json(g.logs));

app.get('/api/scripts', (_req, res) => {
  res.json(Object.values(g.scripts).map(s => ({ name: s.name, title: s.title, updatedAt: s.updatedAt, length: (s.code || '').length })));
});

app.post('/api/scripts/save', admin, (req, res) => {
  const name = slugify(req.body.name || 'trade');
  const code = String(req.body.code || '');
  if (!code.trim()) return res.status(400).json({ success: false, error: 'empty script' });
  g.scripts[name] = { name, title: req.body.title || name, code, updatedAt: Date.now() };
  saveStore();
  addLog('script', 'تم حفظ السكربت ' + name);
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'your-project.vercel.app').split(',')[0];
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const url = proto + '://' + host + '/load/' + name;
  res.json({ success: true, name, url, loadstring: 'loadstring(game:HttpGet("' + url + '"))()' });
});

app.get('/load/:name', (req, res) => {
  const name = slugify(req.params.name);
  const s = g.scripts[name];
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (!s || !s.code) return res.status(404).send('-- script not found: ' + name);
  addLog('load', 'تم سحب السكربت ' + name);
  res.send(s.code);
});

app.post('/api/register', (req, res) => {
  const robloxId = req.body.robloxId || req.body.userId;
  if (!robloxId) return res.status(400).json({ success: false, error: 'Missing robloxId' });
  const id = String(robloxId);
  const isNew = !g.users[id];
  g.users[id] = {
    robloxId: toInt(robloxId),
    username: req.body.username || req.body.fromName || 'Unknown',
    jobId: req.body.jobId || '',
    lastSeen: Date.now(),
  };
  if (isNew) addLog('register', (g.users[id].username) + ' دخل');
  saveStore();
  res.json({ success: true });
});
app.post('/api/heartbeat', (req, res) => {
  const id = String(req.body.robloxId || '');
  if (!id) return res.status(400).json({ success: false });
  if (!g.users[id]) g.users[id] = { robloxId: toInt(id), username: 'Unknown', jobId: '', lastSeen: Date.now() };
  else g.users[id].lastSeen = Date.now();
  res.json({ success: true });
});
app.post('/api/log', (req, res) => {
  addLog('client', (req.body.username || 'Player') + ': ' + (req.body.message || JSON.stringify(req.body)));
  res.json({ success: true });
});

app.post('/api/trade/create', (req, res) => {
  const fromId = req.body.fromId || req.body.userId;
  const fromName = req.body.fromName || 'Unknown';
  let myItems = req.body.myItems || [];
  let theirItems = req.body.theirItems || [];
  if (!Array.isArray(myItems)) myItems = [];
  if (!Array.isArray(theirItems)) theirItems = [];
  if (!fromId || !myItems.length) return res.status(400).json({ success: false, error: 'Missing data' });
  const id = 'tr_' + Date.now().toString(36);
  g.trades[id] = { id, fromId: toInt(fromId), fromName, myItems, theirItems, note: req.body.note || '', jobId: req.body.jobId || '', status: 'pending', createdAt: Date.now() };
  g.totalTrades++;
  addLog('create', fromName + ' نشر عرضاً');
  res.json({ success: true, tradeId: id, id });
});
app.get('/api/trades/all', (_req, res) => res.json({ success: true, trades: activeTrades() }));
app.post('/api/trade/:id/delete', (req, res) => {
  delete g.trades[req.params.id];
  res.json({ success: true });
});
app.post('/api/trade/request', (req, res) => {
  const { tradeId, fromId, fromName, toId, toName, myItems } = req.body;
  if (!fromId || !toId) return res.status(400).json({ success: false });
  const id = 'req_' + Date.now().toString(36);
  g.tradeRequests[id] = { id, tradeId, fromId: toInt(fromId), fromName, toId: toInt(toId), toName, myItems: myItems || [], status: 'pending', createdAt: Date.now() };
  addLog('trade_request', fromName + ' أرسل طلب إلى ' + toName);
  res.json({ success: true, requestId: id, id });
});
app.get('/api/trade/requests/list/:userId', (req, res) => {
  const uid = toInt(req.params.userId);
  res.json(Object.values(g.tradeRequests).filter(r => r.fromId === uid || r.toId === uid));
});
app.post('/api/trade/request/accept', (req, res) => {
  const r = g.tradeRequests[req.body.requestId];
  if (!r) return res.status(404).json({ success: false });
  r.status = 'accepted';
  addLog('accept', r.toName + ' قبل طلب ' + r.fromName);
  res.json({ success: true });
});
app.post('/api/trade/request/reject', (req, res) => {
  const r = g.tradeRequests[req.body.requestId];
  if (r) r.status = 'rejected';
  res.json({ success: true });
});
app.get('/api/dm/conversations/:userId', (req, res) => {
  const uid = toInt(req.params.userId);
  const out = [];
  for (const key in g.dmMessages) {
    const [a,b] = key.split('_').map(Number);
    if (a !== uid && b !== uid) continue;
    const other = a === uid ? b : a;
    const msgs = g.dmMessages[key] || [];
    const last = msgs[msgs.length-1];
    out.push({ userId: other, name: last ? (last.fromId === other ? last.fromName : last.toName) : ('Player'+other), lastMsg: last ? last.message : '' });
  }
  res.json(out);
});
app.get('/api/dm/messages/:a/:b', (req, res) => {
  res.json({ success: true, messages: g.dmMessages[convKey(req.params.a, req.params.b)] || [] });
});
app.post('/api/dm/send', (req, res) => {
  const { fromId, fromName, toId, toName, message } = req.body;
  if (!fromId || !toId || !message) return res.status(400).json({ success: false });
  const key = convKey(fromId, toId);
  if (!g.dmMessages[key]) g.dmMessages[key] = [];
  g.dmMessages[key].push({ fromId: toInt(fromId), fromName, toId: toInt(toId), toName, message: String(message), time: Date.now() });
  addLog('dm', fromName + ' → ' + toName);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) app.listen(PORT, () => console.log('host on', PORT));
module.exports = app;

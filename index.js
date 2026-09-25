const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '6mb' }));
app.use(express.urlencoded({ extended: true, limit: '6mb' }));
app.use(express.text({ type: ['text/plain', 'text/lua'], limit: '6mb' }));

app.use((req, res, next) => {
  if (typeof req.body === 'string' && req.body.trim().startsWith('{')) {
    try { req.body = JSON.parse(req.body); } catch (e) {}
  }
  if (!req.body || typeof req.body !== 'object') req.body = {};
  next();
});

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const FILE = path.join('/tmp', 'dashboard-store.json');
const g = global.__dash || { scripts: {}, users: {}, logs: [], hits: 0 };
global.__dash = g;

function load() {
  try {
    if (fs.existsSync(FILE)) Object.assign(g, JSON.parse(fs.readFileSync(FILE, 'utf8')));
  } catch (e) {}
}
function save() {
  try { fs.writeFileSync(FILE, JSON.stringify(g)); } catch (e) {}
}
load();

function slug(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9\u0600-\u06ff-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}
function originOf(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return proto + '://' + host;
}
function loadUrl(req, name) {
  return originOf(req) + '/script/' + encodeURIComponent(name);
}
function addLog(type, message, extra) {
  g.logs.unshift({ type, message, extra: extra || {}, time: Date.now() });
  if (g.logs.length > 150) g.logs.length = 150;
  save();
}
function isOnline(u) { return u && Date.now() - (u.lastSeen || 0) < 120000; }

function page() {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Script Hub Dashboard</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = { darkMode: 'class', theme: { extend: {
  colors: { ink:'#07070d', panel:'#101018', line:'#242436', accent:'#7c5cff' },
  fontFamily: { sans:['IBM Plex Sans Arabic','Segoe UI','Tahoma','sans-serif'] }
}}}
</script>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body class="bg-ink text-zinc-100 font-sans min-h-screen">
<div class="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(124,92,255,.18),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(56,189,248,.08),transparent_30%)]"></div>
<div class="relative max-w-7xl mx-auto px-5 py-8">
  <header class="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
    <div>
      <p class="text-xs tracking-[.3em] text-violet-300/80 mb-2">SCRIPT CONTROL CENTER</p>
      <h1 class="text-4xl font-bold bg-gradient-to-l from-violet-300 via-fuchsia-200 to-sky-300 bg-clip-text text-transparent">لوحة إدارة السكربتات</h1>
      <p class="text-zinc-400 mt-2">حفظ، تعديل، حذف، وتوليد رابط loadstring من السيرفر مباشرة</p>
    </div>
    <div class="text-sm text-zinc-400 bg-panel/80 border border-line rounded-2xl px-4 py-3" id="originBox">جاري قراءة عنوان السيرفر...</div>
  </header>

  <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
    <article class="bg-panel/90 border border-line rounded-3xl p-5 shadow-2xl shadow-violet-950/20">
      <p class="text-zinc-400 text-sm">السكربتات</p>
      <p class="text-3xl font-bold mt-2" id="cScripts">0</p>
    </article>
    <article class="bg-panel/90 border border-line rounded-3xl p-5">
      <p class="text-zinc-400 text-sm">متصل الآن</p>
      <p class="text-3xl font-bold mt-2 text-emerald-300" id="cOnline">0</p>
    </article>
    <article class="bg-panel/90 border border-line rounded-3xl p-5">
      <p class="text-zinc-400 text-sm">إجمالي اللاعبين</p>
      <p class="text-3xl font-bold mt-2 text-sky-300" id="cUsers">0</p>
    </article>
    <article class="bg-panel/90 border border-line rounded-3xl p-5">
      <p class="text-zinc-400 text-sm">عمليات التحميل</p>
      <p class="text-3xl font-bold mt-2 text-fuchsia-300" id="cHits">0</p>
    </article>
  </section>

  <section class="grid lg:grid-cols-5 gap-6">
    <div class="lg:col-span-3 bg-panel/90 border border-line rounded-3xl p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-semibold" id="formTitle">إضافة سكربت جديد</h2>
        <button id="resetBtn" class="text-sm text-zinc-400 hover:text-white">تفريغ</button>
      </div>
      <input type="hidden" id="editOld">
      <label class="block text-sm text-zinc-400 mb-2">اسم السكربت</label>
      <input id="name" class="w-full mb-4 bg-black/40 border border-line rounded-2xl px-4 py-3 outline-none focus:border-violet-400" placeholder="مثلا trade">
      <label class="block text-sm text-zinc-400 mb-2">سورس الكود</label>
      <textarea id="code" class="w-full h-72 bg-black/40 border border-line rounded-2xl px-4 py-3 font-mono text-sm outline-none focus:border-violet-400" placeholder="الصق كود Luau هنا"></textarea>
      <button id="saveBtn" class="mt-4 w-full rounded-2xl py-3 font-semibold bg-gradient-to-l from-violet-600 to-fuchsia-500 hover:opacity-95 transition">حفظ السكربت وإنشاء الرابط</button>
      <p id="saveMsg" class="text-sm mt-3 text-zinc-400"></p>
    </div>

    <div class="lg:col-span-2 space-y-6">
      <div class="bg-panel/90 border border-line rounded-3xl p-6">
        <h2 class="text-xl font-semibold mb-4">السكربتات المحفوظة</h2>
        <div id="list" class="space-y-3 max-h-[28rem] overflow-auto"></div>
      </div>
      <div class="bg-panel/90 border border-line rounded-3xl p-6">
        <h2 class="text-xl font-semibold mb-4">سجلات اللعبة</h2>
        <div id="logs" class="space-y-2 max-h-72 overflow-auto text-sm"></div>
      </div>
    </div>
  </section>
</div>
<script>
const api = location.origin;
document.getElementById('originBox').textContent = api;

function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));}
function loadLine(name){return 'loadstring(game:HttpGet("' + api + '/script/' + name + '"))()';}

async function getJSON(url){
  const r = await fetch(url);
  return r.ok ? r.json() : null;
}

async function refresh(){
  const s = await getJSON('/api/stats');
  if(s){
    document.getElementById('cScripts').textContent = s.scripts||0;
    document.getElementById('cOnline').textContent = s.online||0;
    document.getElementById('cUsers').textContent = s.users||0;
    document.getElementById('cHits').textContent = s.hits||0;
  }
  const scripts = await getJSON('/api/scripts') || [];
  const list = document.getElementById('list');
  if(!scripts.length){ list.innerHTML = '<p class="text-zinc-500">لا توجد سكربتات بعد</p>'; }
  else {
    list.innerHTML = scripts.map(function(x){
      return '<div class="rounded-2xl border border-line bg-black/30 p-4">'
        + '<div class="flex items-center justify-between gap-2"><div>'
        + '<p class="font-semibold">'+esc(x.name)+'</p>'
        + '<p class="text-xs text-zinc-500 mt-1">'+(x.length||0)+' حرف</p></div>'
        + '<div class="flex gap-2">'
        + '<button data-edit="'+esc(x.name)+'" class="text-xs px-3 py-1 rounded-lg bg-violet-600/30 hover:bg-violet-600/50">تعديل</button>'
        + '<button data-del="'+esc(x.name)+'" class="text-xs px-3 py-1 rounded-lg bg-rose-600/30 hover:bg-rose-600/50">حذف</button>'
        + '</div></div>'
        + '<code class="block mt-3 text-[11px] leading-5 text-emerald-300 break-all">'+esc(loadLine(x.name))+'</code>'
        + '<button data-copy="'+esc(loadLine(x.name))+'" class="mt-2 text-xs text-zinc-400 hover:text-white">نسخ loadstring</button></div>';
    }).join('');
  const logs = await getJSON('/api/logs') || [];
  document.getElementById('logs').innerHTML = logs.length ? logs.map(function(x){return '<div class="rounded-xl border border-line px-3 py-2"><span class="text-zinc-300">'+esc(x.message)+'</span></div>';}).join('') : '<p class="text-zinc-500">لا توجد سجلات</p>';
}

document.getElementById('saveBtn').onclick = async () => {
  const name = document.getElementById('name').value.trim();
  const code = document.getElementById('code').value;
  const old = document.getElementById('editOld').value;
  const msg = document.getElementById('saveMsg');
  if(!name || !code.trim()){ msg.textContent = 'اكتب الاسم والسورس'; return; }
  const r = await fetch('/api/scripts', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ name, code, oldName: old })
  });
  const d = await r.json();
  msg.textContent = d.success ? ('تم الحفظ: ' + d.loadstring) : (d.error || 'فشل الحفظ');
  document.getElementById('editOld').value = '';
  document.getElementById('formTitle').textContent = 'إضافة سكربت جديد';
  refresh();
};

document.getElementById('resetBtn').onclick = () => {
  document.getElementById('name').value = '';
  document.getElementById('code').value = '';
  document.getElementById('editOld').value = '';
  document.getElementById('formTitle').textContent = 'إضافة سكربت جديد';
};

document.getElementById('list').onclick = async (e) => {
  const edit = e.target.getAttribute('data-edit');
  const del = e.target.getAttribute('data-del');
  const copy = e.target.getAttribute('data-copy');
  if(copy){ navigator.clipboard.writeText(copy); return; }
  if(edit){
    const d = await getJSON('/api/scripts/' + encodeURIComponent(edit));
    if(!d) return;
    document.getElementById('name').value = d.name;
    document.getElementById('code').value = d.code || '';
    document.getElementById('editOld').value = d.name;
    document.getElementById('formTitle').textContent = 'تعديل السكربت';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if(del && confirm('حذف ' + del + '؟')){
    await fetch('/api/scripts/' + encodeURIComponent(del), { method:'DELETE' });
    refresh();
  }
};

refresh();
setInterval(refresh, 2500);
</script>
</body>
</html>`;
}

app.get('/', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(page());
});

app.get('/api/stats', (_req, res) => {
  res.json({
    scripts: Object.keys(g.scripts).length,
    users: Object.keys(g.users).length,
    online: Object.values(g.users).filter(isOnline).length,
    hits: g.hits || 0,
    logs: (g.logs || []).length
  });
});

app.get('/api/scripts', (req, res) => {
  const list = Object.values(g.scripts).map(s => ({
    name: s.name,
    length: (s.code || '').length,
    updatedAt: s.updatedAt,
    url: loadUrl(req, s.name),
    loadstring: 'loadstring(game:HttpGet("' + loadUrl(req, s.name) + '"))()'
  })).sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));
  res.json(list);
});

app.get('/api/scripts/:name', (req, res) => {
  const s = g.scripts[slug(req.params.name)] || g.scripts[req.params.name];
  if (!s) return res.status(404).json({ success: false, error: 'not found' });
  res.json(s);
});

app.post('/api/scripts', (req, res) => {
  const name = slug(req.body.name);
  if (!name) return res.status(400).json({ success: false, error: 'الاسم مطلوب' });
  const code = String(req.body.code || '');
  if (!code.trim()) return res.status(400).json({ success: false, error: 'السورس فارغ' });
  const oldName = slug(req.body.oldName || '');
  if (oldName && oldName !== name) delete g.scripts[oldName];
  g.scripts[name] = { name, code, updatedAt: Date.now() };
  save();
  addLog('script', 'تم حفظ السكربت ' + name);
  const url = loadUrl(req, name);
  res.json({
    success: true,
    name,
    url,
    loadstring: 'loadstring(game:HttpGet("' + url + '"))()'
  });
});

app.delete('/api/scripts/:name', (req, res) => {
  const name = slug(req.params.name);
  if (!g.scripts[name]) return res.status(404).json({ success: false, error: 'not found' });
  delete g.scripts[name];
  save();
  addLog('script', 'تم حذف السكربت ' + name);
  res.json({ success: true });
});

app.get('/script/:name', (req, res) => {
  const name = slug(req.params.name);
  const s = g.scripts[name];
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (!s) return res.status(404).send('-- script not found');
  g.hits = (g.hits || 0) + 1;
  addLog('load', 'تم تحميل ' + name);
  res.send(s.code);
});

app.get('/load/:name', (req, res) => {
  req.url = '/script/' + req.params.name;
  app._router.handle(req, res);
});

app.get('/api/logs', (_req, res) => res.json(g.logs || []));

app.post('/api/register', (req, res) => {
  const id = String(req.body.robloxId || req.body.userId || '');
  if (!id) return res.status(400).json({ success: false, error: 'Missing robloxId' });
  const username = req.body.username || req.body.fromName || 'Unknown';
  const isNew = !g.users[id];
  g.users[id] = { robloxId: id, username, jobId: req.body.jobId || '', lastSeen: Date.now() };
  if (isNew) addLog('register', username + ' دخل من اللعبة');
  save();
  res.json({ success: true });
});

app.post('/api/heartbeat', (req, res) => {
  const id = String(req.body.robloxId || '');
  if (!id) return res.status(400).json({ success: false });
  if (!g.users[id]) g.users[id] = { robloxId: id, username: req.body.username || 'Unknown', lastSeen: Date.now() };
  else g.users[id].lastSeen = Date.now();
  save();
  res.json({ success: true });
});

app.post('/api/log', (req, res) => {
  const username = req.body.username || 'Player';
  const message = req.body.message || JSON.stringify(req.body);
  addLog('game', username + ': ' + message);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) app.listen(PORT, () => console.log('dashboard on', PORT));
module.exports = app;

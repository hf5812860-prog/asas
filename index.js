// ═══════════════════════════════════════════════════════
// Roblox System v14.0 — Key Auth + Dashboard + Auto-Update
// ═══════════════════════════════════════════════════════
const express = require('express');
const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.text({ type: ['text/*', 'application/json'], limit: '2mb' }));

app.use((req, res, next) => {
    if (typeof req.body === 'string' && req.body.trim()) {
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

// ═══════════════════════════════════════════════════════
// ⚙️ الإعدادات
// ═══════════════════════════════════════════════════════
const API_KEY = process.env.API_KEY || "JXZXCV";
const ADMIN_KEY = process.env.ADMIN_KEY || "ADMIN2024";
const START_TIME = Date.now();
const ONLINE_TIMEOUT = 2 * 60 * 1000;
const TRADE_EXPIRE_MS = 30 * 1000;
const SCRIPT_VERSION = "14.0";

// ═══════════════════════════════════════════════════════
// 🗄️ قاعدة البيانات (in-memory)
// ═══════════════════════════════════════════════════════
const users         = {};   // اللاعبين
const keys          = {};   // المفاتيح المتاحة
const trades        = {};   // العروض
const tradeRequests = {};   // طلبات المقايضة
const dmMessages    = {};   // الرسائل الخاصة
const chats         = [];   // الشات العام
const logs          = [];   // السجلات
const stats_history = [];   // تاريخ الإحصائيات
const blacklist     = {};   // قائمة الحجب

// مفتاح افتراضي للاختبار
keys["TEST-1234-ABCD"] = { created: Date.now(), expires: Date.now() + 365*24*60*60*1000, maxUses: 1000, uses: 0, hwid: null };

let totalTrades = 0;
let totalJoins = 0;

// ═══════════════════════════════════════════════════════
// 🛠️ Helper Functions
// ═══════════════════════════════════════════════════════
function isOnline(u){ return u && (Date.now() - u.lastSeen < ONLINE_TIMEOUT); }
function getOnlineUsers(){ return Object.values(users).filter(isOnline); }

function addLog(type, message) {
    logs.unshift({ type, message, time: Date.now() });
    if (logs.length > 100) logs.length = 100;
    console.log(`[${type.toUpperCase()}] ${message}`);
}

function auth(req, res, next) {
    const key = req.headers['x-api-key'] || req.headers['X-API-KEY'] || req.query.key;
    if (key !== API_KEY) {
        console.log('[AUTH] ❌ rejected', req.method, req.path);
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

function adminAuth(req, res, next) {
    const key = req.headers['x-admin-key'] || req.query.admin;
    if (key !== ADMIN_KEY) {
        return res.status(401).json({ error: 'Admin Unauthorized' });
    }
    next();
}

function convKey(a, b) {
    a = String(a); b = String(b);
    return a < b ? a + "_" + b : b + "_" + a;
}

function activeTrades() {
    const now = Date.now();
    return Object.values(trades).filter(t =>
        t.status === 'pending' && now - t.createdAt < TRADE_EXPIRE_MS
    ).sort((a, b) => b.createdAt - a.createdAt);
}

function generateKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) key += chars[Math.floor(Math.random() * chars.length)];
        if (i < 3) key += '-';
    }
    return key;
}

// ═══════════════════════════════════════════════════════
// 🏠 DASHBOARD (Admin)
// ═══════════════════════════════════════════════════════
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>Roblox System v14.0 — Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0f0f16;--bg-2:#16161f;--bg-3:#1e1e2b;--border:#2a2a3e;--text:#e4e4ed;--dim:#8888a0;--blue:#6ba8ff;--green:#4dc47e;--orange:#ffb84d;--red:#ff6b6b;--purple:#a78bfa;--cyan:#4dd4dd}
body{font-family:'Segoe UI',Tahoma,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;padding:20px}
.container{max-width:1400px;margin:0 auto}
.header{background:linear-gradient(135deg,#1e1e2b,#252535);border:1px solid var(--border);border-radius:16px;padding:20px 25px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:15px}
.header h1{font-size:24px;background:linear-gradient(90deg,#6ba8ff,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.nav{display:flex;gap:10px;flex-wrap:wrap}
.nav a{padding:8px 16px;background:var(--bg-3);border:1px solid var(--border);border-radius:8px;color:var(--text);text-decoration:none;font-size:13px;font-weight:600;cursor:pointer}
.nav a:hover,.nav a.active{background:linear-gradient(135deg,#6ba8ff,#a78bfa);border-color:transparent;color:#fff}
.status-badge{display:flex;align-items:center;gap:8px;background:rgba(77,196,126,.1);padding:6px 14px;border-radius:20px;border:1px solid rgba(77,196,126,.3);color:var(--green);font-weight:600;font-size:13px}
.pulse{width:8px;height:8px;background:var(--green);border-radius:50%;animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5;transform:scale(1.3)}}
.auth-box{background:linear-gradient(135deg,#2a1e3e,#1e1e2b);border:1px solid #4a3a6e;border-radius:16px;padding:20px 25px;margin-bottom:20px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.auth-box input{flex:1;min-width:200px;padding:12px 16px;background:rgba(0,0,0,.4);border:1px solid #3a3a5e;border-radius:10px;color:var(--text);font-size:14px;font-family:inherit}
.auth-box button{background:linear-gradient(135deg,#6ba8ff,#a78bfa);color:#fff;border:none;padding:12px 22px;border-radius:10px;font-weight:bold;cursor:pointer;font-size:13px;font-family:inherit}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:15px;margin-bottom:20px}
.stat-card{background:linear-gradient(135deg,var(--bg-2),var(--bg-3));border:1px solid var(--border);border-radius:14px;padding:20px}
.stat-icon{font-size:28px;margin-bottom:10px}
.stat-num{font-size:32px;font-weight:bold;color:var(--blue);margin-bottom:4px}
.stat-card.green .stat-num{color:var(--green)}
.stat-card.orange .stat-num{color:var(--orange)}
.stat-card.purple .stat-num{color:var(--purple)}
.stat-card.cyan .stat-num{color:var(--cyan)}
.stat-card.red .stat-num{color:var(--red)}
.stat-lbl{font-size:13px;color:var(--dim)}
.panel{background:var(--bg-2);border:1px solid var(--border);border-radius:16px;overflow:hidden;margin-bottom:20px}
.panel-header{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;background:var(--bg-3)}
.panel-header h2{font-size:16px}
.panel-body{padding:15px;max-height:500px;overflow-y:auto}
.log-item{padding:12px;border-radius:10px;background:var(--bg-3);margin-bottom:8px;border-right:3px solid var(--blue);display:flex;gap:12px}
.log-item.create{border-color:var(--green)}
.log-item.delete{border-color:var(--red)}
.log-item.register{border-color:var(--purple)}
.log-item.key_auth{border-color:var(--cyan)}
.log-item.dm{border-color:#4dd4dd}
.log-item.chat{border-color:var(--purple)}
.log-msg{font-size:13px;margin-bottom:3px;word-break:break-word}
.log-time{font-size:11px;color:var(--dim)}
.empty{text-align:center;padding:40px 20px;color:var(--dim)}
.user-card{display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--bg-3);border:1px solid var(--border);border-radius:10px;margin-bottom:8px}
.user-avatar{width:40px;height:40px;border-radius:50%;border:2px solid var(--green)}
.user-name{font-weight:600;font-size:14px}
.user-status{font-size:11px;color:var(--green)}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:10px;text-align:right;border-bottom:1px solid var(--border)}
th{color:var(--dim);font-weight:600;background:var(--bg-3)}
.key-row{font-family:monospace;color:var(--green);font-weight:bold}
.btn{padding:6px 12px;border-radius:6px;border:none;cursor:pointer;font-size:12px;font-weight:bold;font-family:inherit;color:#fff}
.btn-red{background:#c73e3e}
.btn-green{background:#3ea065}
.btn-blue{background:#3e7ac7}
.btn-purple{background:#8b5cf6}
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>🎮 Roblox System v14.0</h1>
        <div style="display:flex;align-items:center;gap:15px;font-size:13px;color:var(--dim)">
            <div class="status-badge"><div class="pulse"></div><span>متصل</span></div>
            <span>⏱️ <span id="uptime">0s</span></span>
        </div>
    </div>

    <div class="auth-box">
        <input id="admin-key" type="password" placeholder="ادخل مفتاح الأدمن..." value="">
        <button onclick="saveAdmin()">🔓 دخول</button>
        <span id="auth-status" style="color:var(--dim);font-size:13px"></span>
    </div>

    <div class="stats">
        <div class="stat-card green"><div class="stat-icon">🟢</div><div class="stat-num" id="s-online">0</div><div class="stat-lbl">متصل الآن</div></div>
        <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-num" id="s-users">0</div><div class="stat-lbl">إجمالي اللاعبين</div></div>
        <div class="stat-card orange"><div class="stat-icon">🔄</div><div class="stat-num" id="s-trades">0</div><div class="stat-lbl">عروض نشطة</div></div>
        <div class="stat-card purple"><div class="stat-icon">📨</div><div class="stat-num" id="s-requests">0</div><div class="stat-lbl">طلبات مقايضة</div></div>
        <div class="stat-card cyan"><div class="stat-icon">🔑</div><div class="stat-num" id="s-keys">0</div><div class="stat-lbl">مفاتيح نشطة</div></div>
        <div class="stat-card red"><div class="stat-icon">🚫</div><div class="stat-num" id="s-blocks">0</div><div class="stat-lbl">محجوبين</div></div>
    </div>

    <div class="panel">
        <div class="panel-header">
            <h2>🔑 إدارة المفاتيح</h2>
            <div style="display:flex;gap:8px">
                <button class="btn btn-green" onclick="genKey()">+ توليد مفتاح</button>
                <button class="btn btn-blue" onclick="loadKeys()">🔄 تحديث</button>
            </div>
        </div>
        <div class="panel-body">
            <table>
                <thead><tr><th>المفتاح</th><th>الاستخدامات</th><th>ينتهي</th><th>HWID</th><th>إجراء</th></tr></thead>
                <tbody id="keys-tbody"><tr><td colspan="5" class="empty">لا توجد مفاتيح</td></tr></tbody>
            </table>
        </div>
    </div>

    <div class="panel">
        <div class="panel-header"><h2>🟢 المتصلين الآن</h2><span id="online-count" style="font-size:12px;color:var(--dim)"></span></div>
        <div class="panel-body" id="online-list"><div class="empty">لا أحد متصل</div></div>
    </div>

    <div class="panel">
        <div class="panel-header"><h2>📊 إحصائيات اللاعبين</h2></div>
        <div class="panel-body">
            <table>
                <thead><tr><th>الاسم</th><th>المفتاح</th><th>HWID</th><th>آخر ظهور</th><th>إجراء</th></tr></thead>
                <tbody id="users-tbody"><tr><td colspan="5" class="empty">لا يوجد لاعبين</td></tr></tbody>
            </table>
        </div>
    </div>

    <div class="panel">
        <div class="panel-header"><h2>📜 آخر الأحداث</h2></div>
        <div class="panel-body" id="logs-list" style="max-height:300px"><div class="empty">لا توجد أحداث</div></div>
    </div>
</div>

<script>
let ADMIN_KEY = localStorage.getItem('admin_key') || '';
document.getElementById('admin-key').value = ADMIN_KEY;
if (ADMIN_KEY) {
    document.getElementById('auth-status').textContent = '✅ مسجل دخول';
    document.getElementById('auth-status').style.color = '#4dc47e';
}

function saveAdmin() {
    ADMIN_KEY = document.getElementById('admin-key').value.trim();
    localStorage.setItem('admin_key', ADMIN_KEY);
    location.reload();
}

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function fmt(ms){const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60);if(h>0)return h+'h '+m+'m';if(m>0)return m+'m';return s+'s'}

async function fetchAdmin(path) {
    const r = await fetch(path + '?admin=' + encodeURIComponent(ADMIN_KEY));
    if (!r.ok) return null;
    return await r.json();
}

async function loadStats() {
    const d = await fetchAdmin('/admin/stats');
    if (!d) return;
    document.getElementById('s-online').textContent = d.online;
    document.getElementById('s-users').textContent = d.users;
    document.getElementById('s-trades').textContent = d.trades;
    document.getElementById('s-requests').textContent = d.requests;
    document.getElementById('s-keys').textContent = d.activeKeys;
    document.getElementById('s-blocks').textContent = d.blocked;
    document.getElementById('uptime').textContent = fmt(d.uptime);
}

async function loadKeys() {
    const list = await fetchAdmin('/admin/keys');
    if (!list) return;
    const tbody = document.getElementById('keys-tbody');
    const keys = Object.keys(list);
    if (!keys.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty">لا توجد مفاتيح</td></tr>';
        return;
    }
    tbody.innerHTML = keys.map(k => {
        const x = list[k];
        const expires = x.expires ? new Date(x.expires).toLocaleDateString('ar-EG') : '∞';
        const hwid = x.hwid ? x.hwid.slice(0,8) + '...' : '—';
        return '<tr><td class="key-row">' + esc(k) + '</td><td>' + (x.uses||0) + ' / ' + (x.maxUses || '∞') + '</td><td>' + expires + '</td><td>' + hwid + '</td><td><button class="btn btn-red" onclick="delKey(\\'' + k + '\\')">حذف</button></td></tr>';
    }).join('');
}

async function genKey() {
    const maxUses = prompt('كم استخدام مسموح؟', '1');
    const days = prompt('كم يوم صلاحية؟', '30');
    const r = await fetch('/admin/keys/generate?admin=' + encodeURIComponent(ADMIN_KEY), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxUses: parseInt(maxUses) || 1, days: parseInt(days) || 30 })
    });
    if (r.ok) {
        const d = await r.json();
        alert('✅ تم توليد المفتاح:\\n\\n' + d.key);
        loadKeys();
    }
}

async function delKey(key) {
    if (!confirm('حذف المفتاح ' + key + '؟')) return;
    await fetch('/admin/keys/' + key + '?admin=' + encodeURIComponent(ADMIN_KEY), { method: 'DELETE' });
    loadKeys();
}

async function loadOnline() {
    const list = await fetchAdmin('/admin/online');
    if (!list) return;
    const el = document.getElementById('online-list');
    document.getElementById('online-count').textContent = list.length + ' لاعب';
    if (!list.length) { el.innerHTML = '<div class="empty">لا أحد متصل</div>'; return; }
    el.innerHTML = list.map(u => {
        const av = 'https://www.roblox.com/headshot-thumbnail/image?userId=' + (u.robloxId || 1) + '&width=150&height=150&format=png';
        const age = Math.floor((Date.now() - u.lastSeen) / 1000);
        return '<div class="user-card"><img class="user-avatar" src="' + av + '"><div><div class="user-name">' + esc(u.username) + '</div><div class="user-status">منذ ' + age + ' ث</div></div></div>';
    }).join('');
}

async function loadUsers() {
    const list = await fetchAdmin('/admin/users');
    if (!list) return;
    const tbody = document.getElementById('users-tbody');
    const ids = Object.keys(list);
    if (!ids.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty">لا يوجد لاعبين</td></tr>'; return; }
    tbody.innerHTML = ids.map(id => {
        const u = list[id];
        const age = Math.floor((Date.now() - u.lastSeen) / 1000);
        return '<tr><td>' + esc(u.username) + '</td><td class="key-row">' + esc(u.key || '—') + '</td><td>' + (u.hwid ? esc(u.hwid.slice(0,10)) + '...' : '—') + '</td><td>منذ ' + age + ' ث</td><td><button class="btn btn-red" onclick="blockUser(' + id + ')">حجب</button></td></tr>';
    }).join('');
}

async function blockUser(id) {
    if (!confirm('حجب اللاعب؟')) return;
    await fetch('/admin/users/' + id + '/block?admin=' + encodeURIComponent(ADMIN_KEY), { method: 'POST' });
    loadUsers();
}

async function loadLogs() {
    const list = await fetchAdmin('/admin/logs');
    if (!list) return;
    const el = document.getElementById('logs-list');
    if (!list.length) { el.innerHTML = '<div class="empty">لا توجد أحداث</div>'; return; }
    const ic = { register:'👤', create:'📤', delete:'🗑️', trade_request:'📨', accept:'✅', reject:'❌', dm:'💬', chat:'💭', key_auth:'🔑' };
    el.innerHTML = list.map(x => '<div class="log-item ' + x.type + '"><div>' + (ic[x.type] || '📌') + '</div><div><div class="log-msg">' + esc(x.message) + '</div><div class="log-time">منذ ' + Math.floor((Date.now() - x.time)/1000) + ' ث</div></div></div>').join('');
}

function refreshAll() { loadStats(); loadKeys(); loadOnline(); loadUsers(); loadLogs(); }
refreshAll();
setInterval(refreshAll, 3000);
</script>
</body>
</html>`);
});

// ═══════════════════════════════════════════════════════
// 🔑 KEY SYSTEM — التحقق من المفتاح
// ═══════════════════════════════════════════════════════
app.post('/api/auth/verify', (req, res) => {
    const { key, hwid, username, robloxId } = req.body;

    if (!key) return res.status(400).json({ success: false, error: 'Missing key' });

    // فحص الحجب
    if (blacklist[robloxId]) {
        return res.status(403).json({ success: false, error: 'You are blocked' });
    }

    const k = keys[key];
    if (!k) {
        addLog('key_auth', `❌ مفتاح غير صالح: ${key.slice(0,8)}...`);
        return res.status(401).json({ success: false, error: 'Invalid key' });
    }

    // فحص الانتهاء
    if (k.expires && Date.now() > k.expires) {
        return res.status(401).json({ success: false, error: 'Key expired' });
    }

    // فحص HWID
    if (k.hwid && hwid && k.hwid !== hwid) {
        return res.status(403).json({ success: false, error: 'Key locked to another device' });
    }

    // فحص الاستخدامات
    if (k.maxUses && k.uses >= k.maxUses) {
        return res.status(403).json({ success: false, error: 'Key max uses reached' });
    }

    // ربط HWID
    if (!k.hwid && hwid) k.hwid = hwid;
    k.uses = (k.uses || 0) + 1;
    k.lastUsed = Date.now();

    addLog('key_auth', `✅ ${username || 'Unknown'} تحقق بنجاح`);
    res.json({
        success: true,
        version: SCRIPT_VERSION,
        message: 'Welcome!',
        expires: k.expires,
        uses: k.uses,
    });
});

// ═══════════════════════════════════════════════════════
// 🔄 AUTO-UPDATE — السكربت يسحب نسخته
// ═══════════════════════════════════════════════════════
app.get('/api/script/version', (req, res) => {
    res.json({
        version: SCRIPT_VERSION,
        url: '/api/script/download',
        updated: new Date().toISOString(),
    });
});

app.get('/api/script/download', (req, res) => {
    // ⚠️ هنا الصق السكربت الكامل كـ string
    const scriptContent = `--[[
    Cross-Server Trade Feed v${SCRIPT_VERSION}
    تم التحميل تلقائياً من: ${req.headers.host || 'server'}
]]

print("[AUTO-UPDATE] ✅ Script v${SCRIPT_VERSION} loaded from server")
-- ↓↓↓ الصق هنا باقي السكربت ↓↓↓
`;
    res.type('text/plain').send(scriptContent);
});

// ═══════════════════════════════════════════════════════
// 📊 DASHBOARD APIs (Admin)
// ═══════════════════════════════════════════════════════
app.get('/admin/stats', adminAuth, (req, res) => {
    res.json({
        online: getOnlineUsers().length,
        users: Object.keys(users).length,
        trades: activeTrades().length,
        requests: Object.values(tradeRequests).filter(r => r.status === 'pending').length,
        conversations: Object.keys(dmMessages).length,
        activeKeys: Object.values(keys).filter(k => !k.expires || k.expires > Date.now()).length,
        blocked: Object.keys(blacklist).length,
        totalTrades,
        totalJoins,
        uptime: Date.now() - START_TIME,
    });
});

app.get('/admin/keys', adminAuth, (req, res) => {
    res.json(keys);
});

app.post('/admin/keys/generate', adminAuth, (req, res) => {
    const { maxUses, days } = req.body;
    const key = generateKey();
    keys[key] = {
        created: Date.now(),
        expires: days ? Date.now() + days * 24 * 60 * 60 * 1000 : null,
        maxUses: maxUses || 1,
        uses: 0,
        hwid: null,
    };
    addLog('key_auth', `🔑 مفتاح جديد: ${key}`);
    res.json({ success: true, key });
});

app.delete('/admin/keys/:key', adminAuth, (req, res) => {
    delete keys[req.params.key];
    addLog('key_auth', `🗑️ حذف مفتاح: ${req.params.key}`);
    res.json({ success: true });
});

app.get('/admin/online', adminAuth, (req, res) => {
    res.json(getOnlineUsers().sort((a,b) => b.lastSeen - a.lastSeen));
});

app.get('/admin/users', adminAuth, (req, res) => {
    res.json(users);
});

app.post('/admin/users/:id/block', adminAuth, (req, res) => {
    blacklist[req.params.id] = Date.now();
    if (users[req.params.id]) delete users[req.params.id];
    addLog('key_auth', `🚫 حجب: ${req.params.id}`);
    res.json({ success: true });
});

app.post('/admin/users/:id/unblock', adminAuth, (req, res) => {
    delete blacklist[req.params.id];
    addLog('key_auth', `✅ فك حجب: ${req.params.id}`);
    res.json({ success: true });
});

app.get('/admin/logs', adminAuth, (req, res) => res.json(logs));

// ═══════════════════════════════════════════════════════
// 📝 REGISTER (Client APIs - يحتاج API_KEY)
// ═══════════════════════════════════════════════════════
app.get('/dashboard/stats', auth, (req, res) => {
    res.json({
        online: getOnlineUsers().length,
        users: Object.keys(users).length,
        trades: activeTrades().length,
        version: SCRIPT_VERSION,
        uptime: Date.now() - START_TIME,
    });
});

app.post('/api/register', auth, (req, res) => {
    const { robloxId, username, jobId, key, hwid } = req.body;
    if (!robloxId) return res.status(400).json({ error: 'Missing robloxId' });

    if (blacklist[robloxId]) return res.status(403).json({ error: 'Blocked' });

    const isNew = !users[robloxId];
    users[robloxId] = {
        robloxId: parseInt(robloxId),
        username: username || 'Unknown',
        jobId: jobId || '',
        key: key || '',
        hwid: hwid || '',
        lastSeen: Date.now(),
        joinedAt: users[robloxId]?.joinedAt || Date.now(),
    };
    if (isNew) {
        totalJoins++;
        addLog('register', `${username} سجّل دخول`);
    }
    res.json({ success: true });
});

app.post('/api/heartbeat', auth, (req, res) => {
    const { robloxId } = req.body;
    if (!robloxId) return res.status(400).json({ error: 'Missing robloxId' });
    if (blacklist[robloxId]) return res.status(403).json({ error: 'Blocked' });

    if (!users[robloxId]) {
        users[robloxId] = { robloxId: parseInt(robloxId), username: 'Unknown', jobId: '', lastSeen: Date.now() };
    } else {
        users[robloxId].lastSeen = Date.now();
    }
    res.json({ success: true });
});

// ═══════════════════════════════════════════════════════
// 📤 TRADE APIs
// ═══════════════════════════════════════════════════════
app.post('/api/trade/create', auth, (req, res) => {
    console.log('[CREATE] body:', JSON.stringify(req.body).slice(0, 400));

    const fromId   = req.body.fromId   || req.body.FromId;
    const fromName = req.body.fromName || req.body.username || 'Unknown';
    let myItems     = req.body.myItems     || req.body.items || [];
    let theirItems  = req.body.theirItems  || req.body.want  || [];
    const note  = req.body.note  || '';
    const jobId = req.body.jobId || '';

    if (typeof myItems === 'string') { try { myItems = JSON.parse(myItems); } catch (e) { myItems = [myItems]; } }
    if (typeof theirItems === 'string') { try { theirItems = JSON.parse(theirItems); } catch (e) { theirItems = [theirItems]; } }
    if (!Array.isArray(myItems))    myItems = [];
    if (!Array.isArray(theirItems)) theirItems = [];

    if (!fromId) return res.status(400).json({ error: 'Missing fromId' });
    if (blacklist[fromId]) return res.status(403).json({ error: 'Blocked' });

    const id = 'tr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const now = Date.now();

    trades[id] = {
        id, fromId: parseInt(fromId), fromName, myItems, theirItems,
        note, jobId, status: 'pending', createdAt: now, expiresAt: now + TRADE_EXPIRE_MS,
    };
    totalTrades++;
    addLog('create', `${fromName} نشر عرضاً`);
    console.log('[CREATE] ✅ محفوظ:', id);

    res.json({ success: true, tradeId: id, trade: trades[id] });
});

app.get('/api/trades/all', auth, (req, res) => res.json(activeTrades()));

app.post('/api/trade/:id/delete', auth, (req, res) => {
    const trade = trades[req.params.id];
    if (!trade) return res.status(404).json({ error: 'Not found' });
    if (req.body.fromId && trade.fromId !== parseInt(req.body.fromId)) {
        return res.status(403).json({ error: 'Not yours' });
    }
    addLog('delete', `${trade.fromName} حذف عرضه`);
    delete trades[req.params.id];
    res.json({ success: true });
});

// ═══════════════════════════════════════════════════════
// 📨 TRADE REQUESTS
// ═══════════════════════════════════════════════════════
app.post('/api/trade/request', auth, (req, res) => {
    const { tradeId, fromId, fromName, toId, toName, myItems } = req.body;
    if (!fromId || !toId) return res.status(400).json({ error: 'Missing data' });

    const id = 'req_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    tradeRequests[id] = {
        id, tradeId, fromId: parseInt(fromId), fromName,
        toId: parseInt(toId), toName,
        myItems: Array.isArray(myItems) ? myItems : [],
        status: 'pending', createdAt: Date.now(),
    };
    addLog('trade_request', `${fromName} أرسل طلب مقايضة إلى ${toName}`);
    res.json({ success: true, requestId: id });
});

app.get('/api/trade/requests/list/:userId', auth, (req, res) => {
    const uid = parseInt(req.params.userId);
    const list = Object.values(tradeRequests).filter(r =>
        (r.fromId === uid || r.toId === uid) && r.status !== 'rejected' && r.status !== 'cancelled'
    );
    list.sort((a, b) => b.createdAt - a.createdAt);
    res.json(list);
});

app.get('/api/trade/requests/:userId', auth, (req, res) => {
    const uid = parseInt(req.params.userId);
    const list = Object.values(tradeRequests).filter(r =>
        (r.fromId === uid || r.toId === uid) && r.status !== 'rejected' && r.status !== 'cancelled'
    );
    res.json(list);
});

app.post('/api/trade/request/accept', auth, (req, res) => {
    const { requestId, userId } = req.body;
    const r = tradeRequests[requestId];
    if (!r) return res.status(404).json({ error: 'Not found' });
    if (r.toId !== parseInt(userId)) return res.status(403).json({ error: 'Not yours' });
    r.status = 'accepted';
    r.acceptedAt = Date.now();
    const key = convKey(r.fromId, r.toId);
    if (!dmMessages[key]) dmMessages[key] = [];
    addLog('accept', `✅ ${r.toName} قبل عرض ${r.fromName}`);
    res.json({ success: true, requestId: r.id, otherId: r.fromId, otherName: r.fromName });
});

app.post('/api/trade/request/reject', auth, (req, res) => {
    const { requestId, userId } = req.body;
    const r = tradeRequests[requestId];
    if (!r) return res.status(404).json({ error: 'Not found' });
    r.status = 'rejected';
    r.rejectedAt = Date.now();
    addLog('reject', `${r.toName} رفض طلب ${r.fromName}`);
    res.json({ success: true });
});

app.post('/api/trade/confirm', auth, (req, res) => {
    const { tradeId } = req.body;
    const r = tradeRequests[tradeId];
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, trade: r });
});

app.post('/api/trade/cancel', auth, (req, res) => {
    const { tradeId } = req.body;
    const r = tradeRequests[tradeId];
    if (r) { r.status = 'cancelled'; r.cancelledAt = Date.now(); }
    res.json({ success: true });
});

// ═══════════════════════════════════════════════════════
// 💬 DM APIs
// ═══════════════════════════════════════════════════════
app.get('/api/dm/conversations/:userId', auth, (req, res) => {
    const uid = parseInt(req.params.userId);
    const result = [];
    const seen = new Set();
    for (const key in dmMessages) {
        const [a, b] = key.split('_').map(Number);
        if (a === uid || b === uid) {
            const otherId = a === uid ? b : a;
            if (seen.has(otherId)) continue;
            seen.add(otherId);
            const otherUser = users[otherId];
            const msgs = dmMessages[key];
            result.push({
                userId: otherId,
                name: otherUser ? otherUser.username : ('Player' + otherId),
                lastMsg: msgs.length ? msgs[msgs.length - 1].message : '',
                lastTime: msgs.length ? msgs[msgs.length - 1].time : 0,
            });
        }
    }
    for (const id in tradeRequests) {
        const r = tradeRequests[id];
        if (r.status !== 'accepted') continue;
        let otherId, otherName;
        if (r.fromId === uid) { otherId = r.toId; otherName = r.toName; }
        else if (r.toId === uid) { otherId = r.fromId; otherName = r.fromName; }
        else continue;
        if (seen.has(otherId)) continue;
        seen.add(otherId);
        result.push({
            userId: otherId, name: otherName,
            lastMsg: '— محادثة جديدة —',
            lastTime: r.acceptedAt || r.createdAt,
        });
    }
    result.sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));
    res.json(result);
});

app.get('/api/dm/messages/:fromId/:toId', auth, (req, res) => {
    const key = convKey(req.params.fromId, req.params.toId);
    res.json({ messages: dmMessages[key] || [] });
});

app.post('/api/dm/send', auth, (req, res) => {
    const { fromId, fromName, toId, toName, message } = req.body;
    if (!fromId || !toId || !message) return res.status(400).json({ error: 'Missing data' });
    if (String(message).length > 500) return res.status(400).json({ error: 'Too long' });
    const key = convKey(fromId, toId);
    if (!dmMessages[key]) dmMessages[key] = [];
    dmMessages[key].push({
        fromId: parseInt(fromId), fromName,
        toId: parseInt(toId), toName,
        message: String(message).trim(),
        time: Date.now(),
    });
    if (dmMessages[key].length > 300) dmMessages[key].splice(0, dmMessages[key].length - 300);
    addLog('dm', `${fromName} → ${toName}: ${String(message).slice(0, 40)}`);
    res.json({ success: true });
});

// ═══════════════════════════════════════════════════════
// 💭 CHAT عام
// ═══════════════════════════════════════════════════════
app.get('/chat/messages', (req, res) => {
    res.json({ messages: chats.slice(-100), online: getOnlineUsers().length });
});

app.post('/chat/send', (req, res) => {
    const { username, message, userId } = req.body;
    if (!username || !message) return res.status(400).json({ error: 'Missing data' });
    if (message.length > 200) return res.status(400).json({ error: 'Too long' });
    chats.push({
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
        userId: userId || 1, username,
        message: message.trim(), time: Date.now(),
    });
    if (chats.length > 200) chats.splice(0, chats.length - 200);
    addLog('chat', `${username}: ${message.substring(0, 50)}`);
    res.json({ success: true });
});

// ═══════════════════════════════════════════════════════
// 🧹 تنظيف
// ═══════════════════════════════════════════════════════
setInterval(() => {
    const now = Date.now();
    for (const id in trades) {
        if (now - trades[id].createdAt > TRADE_EXPIRE_MS) delete trades[id];
    }
    for (const id in tradeRequests) {
        if (now - tradeRequests[id].createdAt > 10 * 60 * 1000) delete tradeRequests[id];
    }
    for (const k in keys) {
        if (keys[k].expires && keys[k].expires < now) delete keys[k];
    }
}, 5000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║  🚀 Roblox System v' + SCRIPT_VERSION + '                   ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log('║  🌐 Port: ' + PORT + '                              ║');
    console.log('║  🔑 API Key: ' + API_KEY + '                     ║');
    console.log('║  👑 Admin Key: ' + ADMIN_KEY + '               ║');
    console.log('║  🎁 Test Key: TEST-1234-ABCD                  ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');
});

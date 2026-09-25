// ═══════════════════════════════════════════════════════
// Roblox Backend v1.0 — Vercel Serverless
// Key System + Data Logging + Admin Dashboard
// ═══════════════════════════════════════════════════════
const express = require('express');
const crypto  = require('crypto');
const app     = express();

// ═══════════════════════════════════════════════════════
// ⚙️ Middleware
// ═══════════════════════════════════════════════════════
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.text({ type: ['text/*', 'application/json'], limit: '2mb' }));

// تحويل أي body نصي إلى JSON
app.use((req, res, next) => {
    if (typeof req.body === 'string' && req.body.trim()) {
        try { req.body = JSON.parse(req.body); } catch (e) {}
    }
    if (!req.body || typeof req.body !== 'object') req.body = {};
    next();
});

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-admin-key');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ═══════════════════════════════════════════════════════
// 🔐 الإعدادات — غيّرها قبل النشر
// ═══════════════════════════════════════════════════════
const API_KEY   = process.env.API_KEY   || "JXZXCV";
const ADMIN_KEY = process.env.ADMIN_KEY || "ADMIN-2024-SECRET";

const START_TIME = Date.now();
const ONLINE_TIMEOUT = 2 * 60 * 1000; // دقيقتين
const KEY_SESSION_HOURS = 24;

// ═══════════════════════════════════════════════════════
// 🗄️ قاعدة البيانات (in-memory)
// ⚠️ على Vercel: الذاكرة مؤقتة — كل cold-start تمسح البيانات
// للحل الدائم استخدم Upstash Redis (شرح في النهاية)
// ═══════════════════════════════════════════════════════
const users      = {}; // { robloxId: { username, hwid, key, lastSeen, joinedAt, stats } }
const keys       = {}; // { key: { created, expires, maxUses, uses, hwid, note } }
const logs       = []; // آخر 200 حدث
const authLog    = []; // سجل التحقق
const blacklist  = {}; // { robloxId: reason }

// مفتاح افتراضي للاختبار
keys["TEST-1234-ABCD-EFGH"] = {
    created: Date.now(),
    expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
    maxUses: 1000,
    uses: 0,
    hwid: null,
    note: "Test Key"
};

// ═══════════════════════════════════════════════════════
// 🛠️ Helpers
// ═══════════════════════════════════════════════════════
function isOnline(u) { return u && (Date.now() - u.lastSeen < ONLINE_TIMEOUT); }
function getOnlineUsers() { return Object.values(users).filter(isOnline); }

function addLog(type, message, data) {
    logs.unshift({
        type,
        message,
        data: data || null,
        time: Date.now()
    });
    if (logs.length > 200) logs.length = 200;
    console.log(`[${type.toUpperCase()}] ${message}`);
}

function apiAuth(req, res, next) {
    const key = req.headers['x-api-key'] || req.query.key;
    if (key !== API_KEY) {
        console.log('[AUTH] ❌ invalid API key', req.path);
        return res.status(401).json({ success: false, error: 'Invalid API key' });
    }
    next();
}

function adminAuth(req, res, next) {
    const key = req.headers['x-admin-key'] || req.query.admin;
    if (key !== ADMIN_KEY) {
        return res.status(401).json({ success: false, error: 'Admin unauthorized' });
    }
    next();
}

function generateKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${seg()}-${seg()}-${seg()}-${seg()}`;
}

// ═══════════════════════════════════════════════════════
// 🏠 صفحة الترحيب
// ═══════════════════════════════════════════════════════
app.get('/', (req, res) => {
    res.json({
        name: "Roblox Backend",
        version: "1.0.0",
        status: "online",
        uptime: Math.floor((Date.now() - START_TIME) / 1000) + "s",
        endpoints: {
            "POST /api/auth/verify": "التحقق من المفتاح",
            "POST /api/register": "تسجيل لاعب",
            "POST /api/heartbeat": "نبضة دورية",
            "POST /api/log": "إرسال بيانات",
            "GET /api/stats": "إحصائيات عامة",
            "GET /api/script/version": "فحص التحديث",
            "GET /admin/dashboard?admin=KEY": "لوحة التحكم (HTML)",
            "GET /admin/stats?admin=KEY": "إحصائيات الأدمن (JSON)",
            "GET /admin/keys?admin=KEY": "قائمة المفاتيح",
            "POST /admin/keys/generate?admin=KEY": "توليد مفتاح",
            "DELETE /admin/keys/:key?admin=KEY": "حذف مفتاح",
            "GET /admin/users?admin=KEY": "قائمة اللاعبين",
            "GET /admin/logs?admin=KEY": "السجلات",
            "POST /admin/users/:id/block?admin=KEY": "حجب لاعب"
        }
    });
});

// ═══════════════════════════════════════════════════════
// 🔐 Key System API
// ═══════════════════════════════════════════════════════

// التحقق من المفتاح (السكربت يرسل: key, hwid, username, robloxId)
app.post('/api/auth/verify', (req, res) => {
    const { key, hwid, username, robloxId } = req.body;

    console.log('[VERIFY] محاولة تحقق:', { key: key?.slice(0, 8), hwid: hwid?.slice(0, 12), username });

    // فحص الحجب
    if (robloxId && blacklist[robloxId]) {
        authLog.unshift({ key, hwid, username, robloxId, result: 'blocked', time: Date.now() });
        return res.status(403).json({ success: false, error: 'You are blocked' });
    }

    // فحص وجود المفتاح
    if (!key || !keys[key]) {
        authLog.unshift({ key, hwid, username, robloxId, result: 'invalid', time: Date.now() });
        addLog('auth', `❌ مفتاح غير صالح: ${key?.slice(0, 8) || 'empty'}...`);
        return res.status(401).json({ success: false, error: 'Invalid key' });
    }

    const k = keys[key];

    // فحص الانتهاء
    if (k.expires && Date.now() > k.expires) {
        authLog.unshift({ key, hwid, username, robloxId, result: 'expired', time: Date.now() });
        return res.status(401).json({ success: false, error: 'Key expired' });
    }

    // فحص HWID (المفتاح مربوط بجهاز واحد)
    if (k.hwid && hwid && k.hwid !== hwid) {
        authLog.unshift({ key, hwid, username, robloxId, result: 'hwid_mismatch', time: Date.now() });
        return res.status(403).json({ success: false, error: 'Key locked to another device' });
    }

    // فحص عدد الاستخدامات
    if (k.maxUses && k.uses >= k.maxUses) {
        authLog.unshift({ key, hwid, username, robloxId, result: 'max_uses', time: Date.now() });
        return res.status(403).json({ success: false, error: 'Key max uses reached' });
    }

    // نجاح: اربط HWID وزد العداد
    if (!k.hwid && hwid) k.hwid = hwid;
    k.uses = (k.uses || 0) + 1;
    k.lastUsed = Date.now();

    // أنشئ/حدّث المستخدم
    if (robloxId) {
        users[robloxId] = {
            robloxId: parseInt(robloxId),
            username: username || 'Unknown',
            key,
            hwid: hwid || '',
            lastSeen: Date.now(),
            joinedAt: users[robloxId]?.joinedAt || Date.now(),
            stats: users[robloxId]?.stats || {},
        };
    }

    authLog.unshift({ key, hwid, username, robloxId, result: 'success', time: Date.now() });
    if (authLog.length > 200) authLog.length = 200;

    addLog('auth', `✅ ${username || 'Unknown'} تحقق بنجاح`);

    res.json({
        success: true,
        message: 'Welcome!',
        expires: k.expires,
        uses: k.uses,
        maxUses: k.maxUses
    });
});

// ═══════════════════════════════════════════════════════
// 📊 Data Logging API
// ═══════════════════════════════════════════════════════

// تسجيل لاعب
app.post('/api/register', apiAuth, (req, res) => {
    const { robloxId, username, jobId, key, hwid, stats } = req.body;

    if (!robloxId) {
        return res.status(400).json({ success: false, error: 'Missing robloxId' });
    }

    if (blacklist[robloxId]) {
        return res.status(403).json({ success: false, error: 'You are blocked' });
    }

    const isNew = !users[robloxId];
    users[robloxId] = {
        robloxId: parseInt(robloxId),
        username: username || 'Unknown',
        jobId: jobId || '',
        key: key || users[robloxId]?.key || '',
        hwid: hwid || users[robloxId]?.hwid || '',
        lastSeen: Date.now(),
        joinedAt: users[robloxId]?.joinedAt || Date.now(),
        stats: stats || users[robloxId]?.stats || {},
    };

    if (isNew) addLog('register', `👤 ${username} سجل دخول`);

    res.json({ success: true, isNew });
});

// نبضة (heartbeat)
app.post('/api/heartbeat', apiAuth, (req, res) => {
    const { robloxId, stats } = req.body;

    if (!robloxId) {
        return res.status(400).json({ success: false, error: 'Missing robloxId' });
    }

    if (blacklist[robloxId]) {
        return res.status(403).json({ success: false, error: 'You are blocked' });
    }

    if (!users[robloxId]) {
        users[robloxId] = {
            robloxId: parseInt(robloxId),
            username: 'Unknown',
            lastSeen: Date.now(),
            joinedAt: Date.now(),
            stats: {},
        };
    } else {
        users[robloxId].lastSeen = Date.now();
        if (stats) users[robloxId].stats = { ...users[robloxId].stats, ...stats };
    }

    res.json({ success: true, serverTime: Date.now() });
});

// إرسال بيانات/إحصائيات مخصصة
app.post('/api/log', apiAuth, (req, res) => {
    const { robloxId, username, type, data } = req.body;

    if (!type) {
        return res.status(400).json({ success: false, error: 'Missing log type' });
    }

    // حدّث إحصائيات المستخدم
    if (robloxId && users[robloxId] && data) {
        users[robloxId].stats = { ...users[robloxId].stats, ...data };
        users[robloxId].lastSeen = Date.now();
    }

    addLog(type, `${username || robloxId || '?'} → ${JSON.stringify(data || {}).slice(0, 100)}`, data);

    res.json({ success: true, received: type });
});

// إحصائيات عامة
app.get('/api/stats', apiAuth, (req, res) => {
    res.json({
        online: getOnlineUsers().length,
        totalUsers: Object.keys(users).length,
        totalKeys: Object.keys(keys).length,
        activeKeys: Object.values(keys).filter(k => !k.expires || k.expires > Date.now()).length,
        blocked: Object.keys(blacklist).length,
        uptime: Date.now() - START_TIME,
        version: "1.0.0",
    });
});

// ═══════════════════════════════════════════════════════
// 🔄 Auto-Update API
// ═══════════════════════════════════════════════════════
const SCRIPT_VERSION = "1.0.0";

app.get('/api/script/version', (req, res) => {
    res.json({
        version: SCRIPT_VERSION,
        download: '/api/script/download',
        updated: new Date().toISOString(),
    });
});

app.get('/api/script/download', (req, res) => {
    // يمكنك لاحقاً استبدال هذا السكربت بنسخة كاملة مخزنة
    const script = `-- Roblox Script v${SCRIPT_VERSION}
-- تم التحميل من: ${req.headers.host || 'server'}

print("[AUTO-UPDATE] ✅ Script v${SCRIPT_VERSION} loaded")

-- ↓↓↓ ضع هنا باقي السكربت ↓↓↓
`;
    res.type('text/plain').send(script);
});

// ═══════════════════════════════════════════════════════
// 👑 Admin APIs (JSON)
// ═══════════════════════════════════════════════════════

// كل الإحصائيات
app.get('/admin/stats', adminAuth, (req, res) => {
    res.json({
        online: getOnlineUsers().length,
        totalUsers: Object.keys(users).length,
        totalKeys: Object.keys(keys).length,
        activeKeys: Object.values(keys).filter(k => !k.expires || k.expires > Date.now()).length,
        blocked: Object.keys(blacklist).length,
        uptime: Date.now() - START_TIME,
    });
});

// قائمة المفاتيح
app.get('/admin/keys', adminAuth, (req, res) => {
    res.json(keys);
});

// توليد مفتاح جديد
app.post('/admin/keys/generate', adminAuth, (req, res) => {
    const { maxUses, days, note } = req.body;
    const key = generateKey();

    keys[key] = {
        created: Date.now(),
        expires: days ? Date.now() + days * 24 * 60 * 60 * 1000 : null,
        maxUses: parseInt(maxUses) || 1,
        uses: 0,
        hwid: null,
        note: note || '',
    };

    addLog('admin', `🔑 مفتاح جديد: ${key} (${maxUses || 1} استخدام، ${days || '∞'} يوم)`);
    res.json({ success: true, key, data: keys[key] });
});

// حذف مفتاح
app.delete('/admin/keys/:key', adminAuth, (req, res) => {
    if (!keys[req.params.key]) {
        return res.status(404).json({ success: false, error: 'Key not found' });
    }
    delete keys[req.params.key];
    addLog('admin', `🗑️ حذف مفتاح: ${req.params.key}`);
    res.json({ success: true });
});

// قائمة اللاعبين
app.get('/admin/users', adminAuth, (req, res) => {
    res.json(users);
});

// حجب لاعب
app.post('/admin/users/:id/block', adminAuth, (req, res) => {
    const id = req.params.id;
    blacklist[id] = Date.now();
    if (users[id]) delete users[id];
    addLog('admin', `🚫 حجب: ${id}`);
    res.json({ success: true });
});

// فك الحجب
app.post('/admin/users/:id/unblock', adminAuth, (req, res) => {
    delete blacklist[req.params.id];
    addLog('admin', `✅ فك حجب: ${req.params.id}`);
    res.json({ success: true });
});

// السجلات
app.get('/admin/logs', adminAuth, (req, res) => {
    res.json(logs);
});

// سجل التحقق
app.get('/admin/authlog', adminAuth, (req, res) => {
    res.json(authLog);
});

// ═══════════════════════════════════════════════════════
// 📊 لوحة التحكم HTML
// ═══════════════════════════════════════════════════════
app.get('/admin/dashboard', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>Admin Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0f0f16;--bg2:#16161f;--bg3:#1e1e2b;--border:#2a2a3e;--text:#e4e4ed;--dim:#8888a0;--blue:#6ba8ff;--green:#4dc47e;--red:#ff6b6b;--purple:#a78bfa;--cyan:#4dd4dd;--orange:#ffb84d}
body{font-family:'Segoe UI',Tahoma,sans-serif;background:var(--bg);color:var(--text);padding:20px;min-height:100vh}
.container{max-width:1400px;margin:0 auto}
h1{font-size:22px;margin-bottom:20px;background:linear-gradient(90deg,#6ba8ff,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.login{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:20px;margin-bottom:20px;display:flex;gap:10px;flex-wrap:wrap}
.login input{flex:1;min-width:240px;padding:12px;background:#0a0a12;border:1px solid #3a3a5e;border-radius:10px;color:var(--text);font-family:inherit;font-size:14px}
.login button{padding:12px 24px;background:linear-gradient(135deg,#6ba8ff,#a78bfa);color:#fff;border:none;border-radius:10px;font-weight:bold;cursor:pointer;font-family:inherit;font-size:14px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:15px;margin-bottom:20px}
.card{background:linear-gradient(135deg,var(--bg2),var(--bg3));border:1px solid var(--border);border-radius:14px;padding:18px}
.card .icon{font-size:24px;margin-bottom:8px}
.card .num{font-size:28px;font-weight:bold;color:var(--blue);margin-bottom:4px}
.card.green .num{color:var(--green)}
.card.red .num{color:var(--red)}
.card.purple .num{color:var(--purple)}
.card.cyan .num{color:var(--cyan)}
.card.orange .num{color:var(--orange)}
.card .lbl{font-size:12px;color:var(--dim)}
.panel{background:var(--bg2);border:1px solid var(--border);border-radius:14px;margin-bottom:20px;overflow:hidden}
.panel h2{padding:14px 18px;background:var(--bg3);border-bottom:1px solid var(--border);font-size:15px;display:flex;justify-content:space-between;align-items:center}
.panel .body{padding:15px;max-height:500px;overflow-y:auto}
.panel .body.no-pad{padding:0}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:10px;text-align:right;border-bottom:1px solid var(--border)}
th{color:var(--dim);background:var(--bg3);font-weight:600;position:sticky;top:0}
.mono{font-family:monospace;color:var(--green)}
.btn{padding:6px 12px;border-radius:6px;border:none;cursor:pointer;font-size:12px;font-weight:bold;font-family:inherit;color:#fff}
.btn.red{background:#c73e3e}
.btn.green{background:#3ea065}
.btn.blue{background:#3e7ac7}
.empty{text-align:center;padding:30px;color:var(--dim);font-size:13px}
.log{padding:10px 14px;border-bottom:1px solid var(--border);font-size:13px;display:flex;gap:10px}
.log.auth{border-right:3px solid var(--cyan)}
.log.register{border-right:3px solid var(--green)}
.log.admin{border-right:3px solid var(--purple)}
.log .time{color:var(--dim);font-size:11px;min-width:60px}
</style>
</head>
<body>
<div class="container">
    <h1>👑 Admin Dashboard — Roblox Backend</h1>

    <div class="login">
        <input id="admin-key" type="password" placeholder="Admin Key..." value="">
        <button onclick="saveKey()">🔓 دخول</button>
        <span id="status" style="align-self:center;color:var(--dim);font-size:13px"></span>
    </div>

    <div class="stats">
        <div class="card green"><div class="icon">🟢</div><div class="num" id="s-online">0</div><div class="lbl">متصل الآن</div></div>
        <div class="card"><div class="icon">👥</div><div class="num" id="s-users">0</div><div class="lbl">إجمالي اللاعبين</div></div>
        <div class="card cyan"><div class="icon">🔑</div><div class="num" id="s-keys">0</div><div class="lbl">مفاتيح نشطة</div></div>
        <div class="card red"><div class="icon">🚫</div><div class="num" id="s-blocked">0</div><div class="lbl">محجوبين</div></div>
        <div class="card orange"><div class="icon">⏱️</div><div class="num" id="s-uptime">0s</div><div class="lbl">مدة التشغيل</div></div>
    </div>

    <div class="panel">
        <h2>
            <span>🔑 المفاتيح</span>
            <span>
                <button class="btn green" onclick="genKey()">+ جديد</button>
                <button class="btn blue" onclick="refresh()">🔄</button>
            </span>
        </h2>
        <div class="body no-pad">
            <table>
                <thead><tr><th>المفتاح</th><th>الاستخدامات</th><th>ينتهي</th><th>HWID</th><th>ملاحظة</th><th>إجراء</th></tr></thead>
                <tbody id="keys-tbody"><tr><td colspan="6" class="empty">لا توجد مفاتيح</td></tr></tbody>
            </table>
        </div>
    </div>

    <div class="panel">
        <h2><span>👥 اللاعبين</span><button class="btn blue" onclick="refresh()">🔄</button></h2>
        <div class="body no-pad">
            <table>
                <thead><tr><th>الاسم</th><th>ID</th><th>المفتاح</th><th>HWID</th><th>آخر ظهور</th><th>إجراء</th></tr></thead>
                <tbody id="users-tbody"><tr><td colspan="6" class="empty">لا يوجد لاعبين</td></tr></tbody>
            </table>
        </div>
    </div>

    <div class="panel">
        <h2><span>📜 السجلات</span><button class="btn blue" onclick="refresh()">🔄</button></h2>
        <div class="body no-pad" id="logs-list"><div class="empty">لا توجد أحداث</div></div>
    </div>
</div>

<script>
let ADMIN_KEY = localStorage.getItem('admin_key') || '';
document.getElementById('admin-key').value = ADMIN_KEY;

if (ADMIN_KEY) {
    document.getElementById('status').textContent = '✅ محفوظ';
    document.getElementById('status').style.color = '#4dc47e';
}

function saveKey() {
    ADMIN_KEY = document.getElementById('admin-key').value.trim();
    localStorage.setItem('admin_key', ADMIN_KEY);
    location.reload();
}

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function fmtUptime(ms){const s=Math.floor(ms/1000);if(s<60)return s+'s';if(s<3600)return Math.floor(s/60)+'m';return Math.floor(s/3600)+'h '+Math.floor((s%3600)/60)+'m'}
function timeAgo(ms){const s=Math.floor((Date.now()-ms)/1000);if(s<60)return s+' ث';if(s<3600)return Math.floor(s/60)+' د';return Math.floor(s/3600)+' س'}

async function api(path) {
    try {
        const r = await fetch(path + (path.includes('?') ? '&' : '?') + 'admin=' + encodeURIComponent(ADMIN_KEY));
        if (!r.ok) return null;
        return await r.json();
    } catch (e) { return null; }
}

async function loadStats() {
    const d = await api('/admin/stats');
    if (!d) return;
    document.getElementById('s-online').textContent = d.online;
    document.getElementById('s-users').textContent = d.totalUsers;
    document.getElementById('s-keys').textContent = d.activeKeys;
    document.getElementById('s-blocked').textContent = d.blocked;
    document.getElementById('s-uptime').textContent = fmtUptime(d.uptime);
}

async function loadKeys() {
    const d = await api('/admin/keys');
    if (!d) return;
    const keys = Object.keys(d);
    const tb = document.getElementById('keys-tbody');
    if (!keys.length) { tb.innerHTML = '<tr><td colspan="6" class="empty">لا توجد مفاتيح</td></tr>'; return; }
    tb.innerHTML = keys.map(k => {
        const x = d[k];
        const exp = x.expires ? new Date(x.expires).toLocaleDateString('ar-EG') : '∞';
        const hwid = x.hwid ? esc(x.hwid.slice(0, 12)) + '...' : '—';
        return '<tr><td class="mono">' + esc(k) + '</td><td>' + (x.uses || 0) + ' / ' + (x.maxUses || '∞') + '</td><td>' + exp + '</td><td>' + hwid + '</td><td>' + esc(x.note || '—') + '</td><td><button class="btn red" onclick="delKey(\\'' + k + '\\')">حذف</button></td></tr>';
    }).join('');
}

async function loadUsers() {
    const d = await api('/admin/users');
    if (!d) return;
    const ids = Object.keys(d);
    const tb = document.getElementById('users-tbody');
    if (!ids.length) { tb.innerHTML = '<tr><td colspan="6" class="empty">لا يوجد لاعبين</td></tr>'; return; }
    tb.innerHTML = ids.map(id => {
        const u = d[id];
        return '<tr><td>' + esc(u.username) + '</td><td>' + id + '</td><td class="mono">' + esc((u.key || '—').slice(0, 16)) + '</td><td>' + esc((u.hwid || '—').slice(0, 12)) + '</td><td>' + timeAgo(u.lastSeen) + '</td><td><button class="btn red" onclick="blockUser(' + id + ')">حجب</button></td></tr>';
    }).join('');
}

async function loadLogs() {
    const d = await api('/admin/logs');
    if (!d) return;
    const el = document.getElementById('logs-list');
    if (!d.length) { el.innerHTML = '<div class="empty">لا توجد أحداث</div>'; return; }
    el.innerHTML = d.slice(0, 50).map(x => '<div class="log ' + x.type + '"><span class="time">' + timeAgo(x.time) + '</span><span>' + esc(x.message) + '</span></div>').join('');
}

async function genKey() {
    const maxUses = prompt('كم استخدام مسموح؟', '1');
    if (maxUses === null) return;
    const days = prompt('كم يوم صلاحية؟', '30');
    if (days === null) return;

    const r = await fetch('/admin/keys/generate?admin=' + encodeURIComponent(ADMIN_KEY), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxUses: parseInt(maxUses), days: parseInt(days) })
    });
    if (r.ok) {
        const d = await r.json();
        alert('✅ تم توليد المفتاح:\\n\\n' + d.key);
        refresh();
    } else {
        alert('❌ فشل التوليد');
    }
}

async function delKey(key) {
    if (!confirm('حذف المفتاح: ' + key + '؟')) return;
    await fetch('/admin/keys/' + key + '?admin=' + encodeURIComponent(ADMIN_KEY), { method: 'DELETE' });
    refresh();
}

async function blockUser(id) {
    if (!confirm('حجب اللاعب ' + id + '؟')) return;
    await fetch('/admin/users/' + id + '/block?admin=' + encodeURIComponent(ADMIN_KEY), { method: 'POST' });
    refresh();
}

function refresh() { loadStats(); loadKeys(); loadUsers(); loadLogs(); }
refresh();
setInterval(refresh, 3000);
</script>
</body>
</html>`);
});

// ═══════════════════════════════════════════════════════
// 🚀 تشغيل السيرفر
// ═══════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;

// Vercel يستخدم module.exports
if (require.main === module) {
    app.listen(PORT, () => {
        console.log('');
        console.log('╔══════════════════════════════════════════════╗');
        console.log('║  🚀 Roblox Backend v1.0                      ║');
        console.log('╠══════════════════════════════════════════════╣');
        console.log(`║  🌐 Port: ${PORT}`);
        console.log(`║  🔑 API Key:   ${API_KEY}`);
        console.log(`║  👑 Admin Key: ${ADMIN_KEY}`);
        console.log(`║  🎁 Test Key:  TEST-1234-ABCD-EFGH`);
        console.log('╚══════════════════════════════════════════════╝');
        console.log('');
    });
}

module.exports = app;

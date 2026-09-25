// ═══════════════════════════════════════════════════════
// Roblox Dashboard Server v1.0 — Vercel + EJS + Key System
// ═══════════════════════════════════════════════════════
const express      = require('express');
const cookieParser = require('cookie-parser');
const path         = require('path');
const app          = express();

// ═══════════════════════════════════════════════════════
// ⚙️ Middleware
// ═══════════════════════════════════════════════════════
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.text({ type: ['text/*', 'application/json'], limit: '2mb' }));
app.use(cookieParser());
app.use('/public', express.static(path.join(__dirname, 'public')));

// تحويل body نصي إلى JSON
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

// EJS setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ═══════════════════════════════════════════════════════
// 🔐 الإعدادات — غيّرها
// ═══════════════════════════════════════════════════════
const API_KEY       = process.env.API_KEY       || "JXZXCV";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SESSION_SECRET = process.env.SESSION_SECRET || "super-secret-key-change-me";

const START_TIME     = Date.now();
const ONLINE_TIMEOUT = 2 * 60 * 1000;

// ═══════════════════════════════════════════════════════
// 🗄️ قاعدة البيانات (in-memory)
// ═══════════════════════════════════════════════════════
const users     = {}; // { robloxId: {...} }
const keys      = {}; // { key: {...} }
const logs      = []; // آخر 500 حدث
const authLog   = []; // سجل التحقق
const blacklist = {};

// مفتاح افتراضي
keys["TEST-1234-ABCD-EFGH"] = {
    created: Date.now(),
    expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
    maxUses: 1000,
    uses: 0,
    hwid: null,
    note: "Test Key",
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
        time: Date.now(),
    });
    if (logs.length > 500) logs.length = 500;
    console.log(`[${type.toUpperCase()}] ${message}`);
}

function apiAuth(req, res, next) {
    const key = req.headers['x-api-key'] || req.query.key;
    if (key !== API_KEY) {
        return res.status(401).json({ success: false, error: 'Invalid API key' });
    }
    next();
}

function adminAuth(req, res, next) {
    const token = req.cookies.admin_token;
    if (!token || token !== SESSION_SECRET) {
        return res.redirect('/login');
    }
    next();
}

function generateKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${seg()}-${seg()}-${seg()}-${seg()}`;
}

function formatDate(ts) {
    if (!ts) return '∞';
    return new Date(ts).toLocaleDateString('ar-EG', {
        year: 'numeric', month: 'short', day: 'numeric',
    });
}

function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s} ثانية`;
    if (s < 3600) return `${Math.floor(s / 60)} دقيقة`;
    if (s < 86400) return `${Math.floor(s / 3600)} ساعة`;
    return `${Math.floor(s / 86400)} يوم`;
}

// تمرير helpers للـ EJS
app.locals.formatDate = formatDate;
app.locals.timeAgo = timeAgo;

// ═══════════════════════════════════════════════════════
// 🏠 صفحة تسجيل الدخول
// ═══════════════════════════════════════════════════════
app.get('/login', (req, res) => {
    res.render('login', { error: req.query.error });
});

app.post('/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.cookie('admin_token', SESSION_SECRET, {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000,
        });
        res.redirect('/dashboard');
    } else {
        res.redirect('/login?error=1');
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('admin_token');
    res.redirect('/login');
});

// ═══════════════════════════════════════════════════════
// 🏠 Dashboard الرئيسية
// ═══════════════════════════════════════════════════════
app.get('/', (req, res) => res.redirect('/dashboard'));

app.get('/dashboard', adminAuth, (req, res) => {
    const online = getOnlineUsers();
    const activeKeys = Object.values(keys).filter(k => !k.expires || k.expires > Date.now()).length;

    res.render('dashboard', {
        page: 'dashboard',
        stats: {
            online: online.length,
            totalUsers: Object.keys(users).length,
            totalKeys: Object.keys(keys).length,
            activeKeys,
            blocked: Object.keys(blacklist).length,
            totalLogs: logs.length,
            uptime: Date.now() - START_TIME,
        },
        recentLogs: logs.slice(0, 10),
        onlineUsers: online.sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 5),
        recentUsers: Object.values(users).sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 5),
    });
});

// ═══════════════════════════════════════════════════════
// 🔑 صفحة المفاتيح
// ═══════════════════════════════════════════════════════
app.get('/keys', adminAuth, (req, res) => {
    res.render('keys', {
        page: 'keys',
        keys: Object.entries(keys).map(([k, v]) => ({ key: k, ...v })),
    });
});

// ═══════════════════════════════════════════════════════
// 📊 صفحة اللاعبين
// ═══════════════════════════════════════════════════════
app.get('/users', adminAuth, (req, res) => {
    res.render('users', {
        page: 'users',
        users: Object.values(users).sort((a, b) => b.lastSeen - a.lastSeen),
        blacklist,
    });
});

// ═══════════════════════════════════════════════════════
// 📜 صفحة السجلات
// ═══════════════════════════════════════════════════════
app.get('/logs', adminAuth, (req, res) => {
    res.render('logs', {
        page: 'logs',
        logs: logs.slice(0, 200),
        authLog: authLog.slice(0, 50),
    });
});

// ═══════════════════════════════════════════════════════
// 🔐 Key System API
// ═══════════════════════════════════════════════════════
app.post('/api/auth/verify', (req, res) => {
    const { key, hwid, username, robloxId } = req.body;

    if (robloxId && blacklist[robloxId]) {
        authLog.unshift({ key, hwid, username, robloxId, result: 'blocked', time: Date.now() });
        return res.status(403).json({ success: false, error: 'You are blocked' });
    }

    if (!key || !keys[key]) {
        authLog.unshift({ key, hwid, username, robloxId, result: 'invalid', time: Date.now() });
        if (authLog.length > 500) authLog.length = 500;
        return res.status(401).json({ success: false, error: 'Invalid key' });
    }

    const k = keys[key];

    if (k.expires && Date.now() > k.expires) {
        authLog.unshift({ key, hwid, username, robloxId, result: 'expired', time: Date.now() });
        return res.status(401).json({ success: false, error: 'Key expired' });
    }

    if (k.hwid && hwid && k.hwid !== hwid) {
        authLog.unshift({ key, hwid, username, robloxId, result: 'hwid_mismatch', time: Date.now() });
        return res.status(403).json({ success: false, error: 'Key locked to another device' });
    }

    if (k.maxUses && k.uses >= k.maxUses) {
        authLog.unshift({ key, hwid, username, robloxId, result: 'max_uses', time: Date.now() });
        return res.status(403).json({ success: false, error: 'Key max uses reached' });
    }

    if (!k.hwid && hwid) k.hwid = hwid;
    k.uses = (k.uses || 0) + 1;
    k.lastUsed = Date.now();

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
    if (authLog.length > 500) authLog.length = 500;

    addLog('auth', `✅ ${username || 'Unknown'} تحقق بنجاح`);

    res.json({
        success: true,
        message: 'Welcome!',
        expires: k.expires,
        uses: k.uses,
        maxUses: k.maxUses,
    });
});

// ═══════════════════════════════════════════════════════
// 📊 Data Logging API
// ═══════════════════════════════════════════════════════
app.post('/api/register', apiAuth, (req, res) => {
    const { robloxId, username, jobId, key, hwid, stats } = req.body;

    if (!robloxId) return res.status(400).json({ success: false, error: 'Missing robloxId' });
    if (blacklist[robloxId]) return res.status(403).json({ success: false, error: 'Blocked' });

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

app.post('/api/heartbeat', apiAuth, (req, res) => {
    const { robloxId, stats } = req.body;

    if (!robloxId) return res.status(400).json({ success: false, error: 'Missing robloxId' });
    if (blacklist[robloxId]) return res.status(403).json({ success: false, error: 'Blocked' });

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

app.post('/api/log', apiAuth, (req, res) => {
    const { robloxId, username, type, data } = req.body;

    if (!type) return res.status(400).json({ success: false, error: 'Missing type' });

    if (robloxId && users[robloxId] && data) {
        users[robloxId].stats = { ...users[robloxId].stats, ...data };
        users[robloxId].lastSeen = Date.now();
    }

    addLog(type, `${username || robloxId || '?'} → ${JSON.stringify(data || {}).slice(0, 100)}`, data);

    res.json({ success: true, received: type });
});

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
// 🎛️ Admin Actions (POST/DELETE) — بدون صفحة
// ═══════════════════════════════════════════════════════

// توليد مفتاح
app.post('/admin/keys/generate', adminAuth, (req, res) => {
    const { maxUses, days, note } = req.body;
    const key = generateKey();

    keys[key] = {
        created: Date.now(),
        expires: days ? Date.now() + parseInt(days) * 24 * 60 * 60 * 1000 : null,
        maxUses: parseInt(maxUses) || 1,
        uses: 0,
        hwid: null,
        note: note || '',
    };

    addLog('admin', `🔑 مفتاح جديد: ${key}`);
    res.redirect('/keys');
});

// توليد سريع (JSON - للمستخدم عبر fetch)
app.post('/admin/keys/generate-json', adminAuth, (req, res) => {
    const { maxUses, days, note } = req.body;
    const key = generateKey();

    keys[key] = {
        created: Date.now(),
        expires: days ? Date.now() + parseInt(days) * 24 * 60 * 60 * 1000 : null,
        maxUses: parseInt(maxUses) || 1,
        uses: 0,
        hwid: null,
        note: note || '',
    };

    addLog('admin', `🔑 مفتاح جديد: ${key}`);
    res.json({ success: true, key, data: keys[key] });
});

// حذف مفتاح
app.post('/admin/keys/delete', adminAuth, (req, res) => {
    const { key } = req.body;
    if (keys[key]) {
        delete keys[key];
        addLog('admin', `🗑️ حذف مفتاح: ${key}`);
    }
    res.redirect('/keys');
});

// حجب لاعب
app.post('/admin/users/block', adminAuth, (req, res) => {
    const { robloxId } = req.body;
    blacklist[robloxId] = Date.now();
    if (users[robloxId]) delete users[robloxId];
    addLog('admin', `🚫 حجب: ${robloxId}`);
    res.redirect('/users');
});

// فك حجب
app.post('/admin/users/unblock', adminAuth, (req, res) => {
    const { robloxId } = req.body;
    delete blacklist[robloxId];
    addLog('admin', `✅ فك حجب: ${robloxId}`);
    res.redirect('/users');
});

// مسح السجلات
app.post('/admin/logs/clear', adminAuth, (req, res) => {
    logs.length = 0;
    addLog('admin', '🧹 تم مسح السجلات');
    res.redirect('/logs');
});

// ═══════════════════════════════════════════════════════
// 🚀 تشغيل السيرفر
// ═══════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log('');
        console.log('╔══════════════════════════════════════════════╗');
        console.log('║  🎨 Roblox Dashboard Server v1.0             ║');
        console.log('╠══════════════════════════════════════════════╣');
        console.log(`║  🌐 URL: http://localhost:${PORT}/dashboard`);
        console.log(`║  🔑 API Key:      ${API_KEY}`);
        console.log(`║  👑 Admin Pass:   ${ADMIN_PASSWORD}`);
        console.log(`║  🎁 Test Key:     TEST-1234-ABCD-EFGH`);
        console.log('╚══════════════════════════════════════════════╝');
        console.log('');
    });
}

module.exports = app;

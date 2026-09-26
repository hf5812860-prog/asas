// ═══════════════════════════════════════════════════════
// 🚀 Rejoin Host + Control Panel v2.1
// ═══════════════════════════════════════════════════════
const express = require('express');
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.text({ type: ['text/*', 'text/plain'], limit: '50mb' }));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use((req, res, next) => {
    if (typeof req.body === 'string' && req.body.trim()) {
        try { req.body = JSON.parse(req.body); } catch (e) {}
    }
    if (!req.body || typeof req.body !== 'object') req.body = {};
    next();
});

app.use((req, res, next) => {
    req.cookies = {};
    const cookie = req.headers.cookie;
    if (cookie) {
        cookie.split(';').forEach(c => {
            const [k, v] = c.trim().split('=');
            if (k && v) req.cookies[k] = decodeURIComponent(v);
        });
    }
    next();
});

// ═══════════════════════════════════════════════════════
// ⚙️ Config
// ═══════════════════════════════════════════════════════
const API_KEY        = process.env.API_KEY        || "JXZXCV";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SESSION_SECRET = process.env.SESSION_SECRET || "secret-" + Math.random().toString(36).slice(2);

// ═══════════════════════════════════════════════════════
// 🗄️ Storage
// ═══════════════════════════════════════════════════════
const scripts = {};
const players = {};
const commandQueue = {};

// ═══════════════════════════════════════════════════════
// 🛠️ Helpers
// ═══════════════════════════════════════════════════════
function validName(n) { return /^[a-zA-Z0-9_\-]{1,64}$/.test(n); }

function esc(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function adminAuth(req, res, next) {
    const token = req.cookies?.admin_token || req.headers['x-admin-token'] || req.query.token;
    if (token !== SESSION_SECRET) return res.redirect('/login');
    next();
}

function apiAuth(req, res, next) {
    const key = req.headers['x-api-key'] || req.query.key;
    if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
    next();
}

function getClientIp(req) {
    return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
        .split(',')[0].trim();
}

function fmtMoney(n) {
    const v = Number(n) || 0;
    if (v >= 1e9) return '$' + (v/1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$' + (v/1e6).toFixed(2) + 'M';
    if (v >= 1e3) return '$' + (v/1e3).toFixed(1) + 'K';
    return '$' + v.toLocaleString('en-US');
}

function timeAgo(ms) {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s} ث`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} د`;
    return `${Math.floor(m / 60)} س`;
}

// ═══════════════════════════════════════════════════════
// 🎨 Layout
// ═══════════════════════════════════════════════════════
function layout({ title, page, content }) {
    const navItems = [
        { href: '/dashboard', icon: '📊', label: 'لوحة التحكم', id: 'dashboard' },
        { href: '/players',   icon: '👥', label: 'اللاعبون المتصلون', id: 'players' },
        { href: '/scripts',   icon: '📜', label: 'السكربتات',   id: 'scripts' },
    ];

    const navHTML = navItems.map(item => {
        const active = page === item.id;
        const cls = active
            ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white'
            : 'text-gray-400 hover:bg-gray-800/50';
        return `<a href="${item.href}" class="flex items-center gap-3 px-4 py-3 rounded-xl ${cls} transition">
            <span class="text-xl">${item.icon}</span>
            <span class="font-semibold">${item.label}</span>
        </a>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — Rejoin Host</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=JetBrains+Mono&display=swap" rel="stylesheet">
<style>
    * { font-family: 'Cairo', sans-serif; }
    code, pre, textarea, .font-mono { font-family: 'JetBrains Mono', monospace; }
    body { background: #0a0a12; margin: 0; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #1a1a2e; }
    ::-webkit-scrollbar-thumb { background: #3b82f6; border-radius: 4px; }
    .glow { box-shadow: 0 0 30px rgba(59,130,246,0.15); }
    .pulse-green { animation: pulse-green 2s infinite; }
    @keyframes pulse-green {
        0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.7); }
        50% { box-shadow: 0 0 0 8px rgba(16,185,129,0); }
    }
</style>
</head>
<body class="min-h-screen text-gray-200">
<div class="flex min-h-screen">
    <aside class="w-64 bg-gray-900/80 border-l border-gray-800 flex-shrink-0 hidden md:flex md:flex-col">
        <div class="p-6 border-b border-gray-800">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <span class="text-2xl">🔄</span>
                </div>
                <div>
                    <div class="font-bold text-white">Rejoin Host</div>
                    <div class="text-xs text-gray-500">v2.1</div>
                </div>
            </div>
        </div>
        <nav class="flex-1 p-4 space-y-2">${navHTML}</nav>
        <div class="p-4 border-t border-gray-800">
            <a href="/logout" class="flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10">
                <span class="text-xl">🚪</span>
                <span class="font-semibold">خروج</span>
            </a>
        </div>
    </aside>
    <main class="flex-1 overflow-auto">${content}</main>
</div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════
// 🔐 Login
// ═══════════════════════════════════════════════════════
app.get('/login', (req, res) => {
    const err = req.query.error
        ? `<div class="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm text-center">❌ كلمة المرور غير صحيحة</div>`
        : '';
    res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"><title>دخول</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
<style>* { font-family: 'Cairo', sans-serif; } body { background: linear-gradient(135deg, #0f0f16 0%, #1a1a2e 50%, #0f0f16 100%); }</style>
</head>
<body class="min-h-screen flex items-center justify-center p-4">
<div class="w-full max-w-md">
<div class="bg-gray-900/60 backdrop-blur border border-gray-800 rounded-2xl shadow-2xl p-8">
    <div class="text-center mb-8">
        <div class="inline-block p-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mb-4">
            <span class="text-5xl">🔄</span>
        </div>
        <h1 class="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Rejoin Host</h1>
    </div>
    ${err}
    <form method="POST" action="/login" class="space-y-4">
        <input type="password" name="password" required placeholder="••••••••" autofocus
            class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white focus:border-blue-500 focus:outline-none">
        <button type="submit" class="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold rounded-xl">🔓 دخول</button>
    </form>
</div>
</div>
</body>
</html>`);
});

app.post('/login', (req, res) => {
    if (req.body.password === ADMIN_PASSWORD) {
        res.cookie('admin_token', SESSION_SECRET, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
        res.redirect('/dashboard');
    } else {
        res.redirect('/login?error=1');
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('admin_token');
    res.redirect('/login');
});

app.get('/', (req, res) => res.redirect('/dashboard'));

// ═══════════════════════════════════════════════════════
// 📊 Dashboard
// ═══════════════════════════════════════════════════════
app.get('/dashboard', adminAuth, (req, res) => {
    const scriptList = Object.values(scripts);
    const playerList = Object.values(players);
    const now = Date.now();
    const onlinePlayers = playerList.filter(p => (now - p.lastSeen) < 30 * 1000);
    const totalLoads = scriptList.reduce((a, s) => a + (s.loads || 0), 0);

    const stats = [
        { icon: '🟢', num: onlinePlayers.length, lbl: 'متصل الآن', color: 'emerald' },
        { icon: '📜', num: scriptList.length, lbl: 'سكربتات', color: 'blue' },
        { icon: '⚡', num: totalLoads, lbl: 'تحميلات', color: 'purple' },
        { icon: '👥', num: playerList.length, lbl: 'إجمالي الجلسات', color: 'cyan' },
    ];

    const statsHTML = stats.map(s => `
        <div class="bg-gradient-to-br from-${s.color}-500/10 to-${s.color}-500/5 border border-${s.color}-500/20 rounded-2xl p-6 glow">
            <div class="text-3xl mb-2">${s.icon}</div>
            <div class="text-3xl font-bold text-${s.color}-400 truncate">${s.num}</div>
            <div class="text-gray-400 text-sm mt-2">${s.lbl}</div>
        </div>
    `).join('');

    const onlineHTML = onlinePlayers.length === 0
        ? `<div class="text-center py-8 text-gray-500">
             <div class="text-4xl mb-2">😴</div>
             <div>لا يوجد لاعبون متصلون الآن</div>
             <div class="text-xs mt-2">اللاعب يظهر هنا خلال 3 ثواني من تشغيل السكربت</div>
           </div>`
        : onlinePlayers.map(p => `
            <div class="flex items-center justify-between p-3 bg-gray-800/40 rounded-xl border border-gray-800 mb-2">
                <div class="flex items-center gap-3">
                    <div class="w-2 h-2 rounded-full bg-emerald-500 pulse-green"></div>
                    <div>
                        <div class="font-bold text-white text-sm">${esc(p.username)}</div>
                        <div class="text-xs text-gray-500">${esc(p.farmMode || 'None')} • ${fmtMoney(p.money)} • ${esc(p.currentJob || 'None')}</div>
                    </div>
                </div>
                <a href="/players" class="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs">تحكم</a>
            </div>
        `).join('');

    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <div class="flex items-center justify-between">
                <div>
                    <h1 class="text-2xl font-bold text-white">📊 لوحة التحكم</h1>
                    <p class="text-gray-500 text-sm mt-1">نظرة عامة على النظام</p>
                </div>
                <a href="/scripts/new" class="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold rounded-xl">
                    + ارفع سكربت
                </a>
            </div>
        </header>
        <div class="p-6 space-y-6">
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">${statsHTML}</div>

            <div class="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="font-bold text-white flex items-center gap-2">
                        <span class="text-xl">🟢</span> اللاعبون المتصلون
                    </h2>
                    <a href="/players" class="text-blue-400 text-sm hover:underline">عرض الكل ←</a>
                </div>
                ${onlineHTML}
            </div>

            <div class="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-5">
                <div class="flex items-start gap-3">
                    <span class="text-2xl">💡</span>
                    <div>
                        <div class="font-bold text-blue-400 mb-1">كيف يعمل النظام؟</div>
                        <div class="text-sm text-gray-300 space-y-1">
                            <div>1. ترفع السكربت من <code class="text-blue-400">/scripts/new</code> (أي سكربت)</div>
                            <div>2. السيرفر يحقن كود Heartbeat + Control تلقائياً</div>
                            <div>3. اللاعب يشغّل <code class="text-blue-400">loadstring(game:HttpGet("..."))()</code></div>
                            <div>4. يظهر في <a href="/players" class="text-blue-400 underline">/players</a> خلال 3 ثواني مع كل البيانات</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <script>setTimeout(() => location.reload(), 8000);</script>
    `;
    res.send(layout({ title: 'لوحة التحكم', page: 'dashboard', content }));
});

// ═══════════════════════════════════════════════════════
// 💓 Heartbeat
// ═══════════════════════════════════════════════════════
app.post('/api/heartbeat', (req, res) => {
    const key = req.query.key || req.headers['x-api-key'];
    if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });

    const data = req.body || {};
    if (!data.userId) return res.status(400).json({ error: 'Missing userId' });

    const scriptName = String(req.query.script || 'default');
    const userId = String(data.userId);
    const playerKey = `${userId}:${scriptName}`;

    players[playerKey] = {
        ...data,
        userId,
        scriptName,
        lastSeen: Date.now(),
        ip: getClientIp(req),
    };

    const cmds = commandQueue[userId] || [];
    commandQueue[userId] = [];

    res.json({ ok: true, commands: cmds.map(c => c.command) });
});

setInterval(() => {
    const now = Date.now();
    for (const k in players) {
        if (now - players[k].lastSeen > 60 * 1000) delete players[k];
    }
    for (const uid in commandQueue) {
        commandQueue[uid] = commandQueue[uid].filter(c => now - c.timestamp < 60 * 1000);
        if (commandQueue[uid].length === 0) delete commandQueue[uid];
    }
}, 30 * 1000);

// ═══════════════════════════════════════════════════════
// 👥 Players Page
// ═══════════════════════════════════════════════════════
app.get('/players', adminAuth, (req, res) => {
    const now = Date.now();
    const list = Object.values(players).map(p => ({
        ...p,
        online: (now - p.lastSeen) < 30 * 1000,
        lastSeenAgo: timeAgo(now - p.lastSeen),
    })).sort((a, b) => b.lastSeen - a.lastSeen);

    const playersHTML = list.length === 0
        ? `<div class="text-center py-16 text-gray-500">
             <div class="text-6xl mb-4">👥</div>
             <div class="text-lg mb-2">لا يوجد لاعبون</div>
             <div class="text-sm">شغّل السكربت في اللعبة ليظهروا هنا</div>
             <a href="/scripts" class="inline-block mt-4 px-5 py-2.5 bg-blue-500/20 text-blue-400 rounded-xl">اذهب للسكربتات</a>
           </div>`
        : list.map(p => {
            const online = p.online;
            const statusColor = online ? 'emerald' : 'gray';
            const farmBadges = [];
            if (p.autoFarmATM) farmBadges.push('<span class="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-xs font-bold">ATM ▶</span>');
            if (p.autoFarmJob) farmBadges.push('<span class="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-bold">JOB ▶</span>');
            if (p.autoFarmFishing) farmBadges.push('<span class="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-xs font-bold">FISH ▶</span>');
            if (farmBadges.length === 0) farmBadges.push('<span class="text-xs text-gray-600">لا يوجد فارم شغّال</span>');

            const selectedJob = p.selectedJob || 'None';

            return `
            <div class="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 mb-4 hover:border-blue-500/30 transition">
                <div class="flex items-start justify-between mb-4 flex-wrap gap-3">
                    <div class="flex items-center gap-3">
                        <div class="relative">
                            <img src="https://www.roblox.com/headshot-thumbnail/image?userId=${p.userId}&width=150&height=150&format=png"
                                 class="w-14 h-14 rounded-xl bg-gray-800"
                                 onerror="this.src='https://www.roblox.com/headshot-thumbnail/image?userId=1&width=150&height=150&format=png'">
                            <div class="absolute -bottom-1 -left-1 w-4 h-4 rounded-full bg-${statusColor}-500 border-2 border-gray-900 ${online ? 'pulse-green' : ''}"></div>
                        </div>
                        <div>
                            <div class="font-bold text-white text-lg">${esc(p.username || 'Unknown')}</div>
                            <div class="text-xs text-gray-500">ID: ${p.userId}</div>
                            <div class="text-xs ${online ? 'text-emerald-400' : 'text-gray-500'} mt-1">
                                ${online ? '🟢 متصل الآن' : '⚫ منذ ' + p.lastSeenAgo} • وقت التشغيل: ${Math.floor((p.uptime || 0) / 60)} د
                            </div>
                        </div>
                    </div>
                    <div class="flex flex-wrap gap-1">${farmBadges.join(' ')}</div>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                    <div class="bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20 rounded-lg p-3">
                        <div class="text-xs text-gray-500 mb-1">💰 بيده</div>
                        <div class="font-bold text-emerald-400 text-xl">${fmtMoney(p.money)}</div>
                    </div>
                    <div class="bg-gradient-to-br from-blue-500/10 to-transparent border border-blue-500/20 rounded-lg p-3">
                        <div class="text-xs text-gray-500 mb-1">🏦 البنك</div>
                        <div class="font-bold text-blue-400 text-xl">${fmtMoney(p.bank)}</div>
                    </div>
                    <div class="bg-gradient-to-br from-purple-500/10 to-transparent border border-purple-500/20 rounded-lg p-3">
                        <div class="text-xs text-gray-500 mb-1">⭐ المستوى</div>
                        <div class="font-bold text-purple-400 text-xl">${p.level || 0}</div>
                    </div>
                    <div class="bg-gradient-to-br from-red-500/10 to-transparent border border-red-500/20 rounded-lg p-3">
                        <div class="text-xs text-gray-500 mb-1">❤️ الصحة</div>
                        <div class="font-bold text-red-400 text-xl">${Math.round(p.health || 0)}/${Math.round(p.maxHealth || 100)}</div>
                    </div>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 text-sm">
                    <div class="bg-gray-800/40 rounded-lg p-2">
                        <div class="text-xs text-gray-500 mb-1">🎯 فارم مختار</div>
                        <div class="font-bold text-white">${esc(p.farmMode || 'None')}</div>
                    </div>
                    <div class="bg-gray-800/40 rounded-lg p-2">
                        <div class="text-xs text-gray-500 mb-1">💼 وظيفة حالية (لعبة)</div>
                        <div class="font-bold text-white">${esc(p.currentJob || 'None')}</div>
                    </div>
                    <div class="bg-gray-800/40 rounded-lg p-2">
                        <div class="text-xs text-gray-500 mb-1">📋 وظيفة مختارة (سكربت)</div>
                        <div class="font-bold text-white">${esc(selectedJob)}</div>
                    </div>
                    <div class="bg-gray-800/40 rounded-lg p-2">
                        <div class="text-xs text-gray-500 mb-1">🎮 السيرفر</div>
                        <div class="font-mono text-xs text-gray-300 truncate" title="${esc(p.jobId || '')}">${esc((p.jobId || 'Unknown').slice(0, 12))}...</div>
                    </div>
                </div>

                <div class="border-t border-gray-800 pt-3 space-y-3">
                    <div>
                        <div class="text-xs text-gray-500 mb-2">🎮 تحكم السيرفر:</div>
                        <div class="flex gap-2 flex-wrap">
                            <button onclick="sendCmd('${p.userId}', 'rejoin', this)" class="px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-xs font-semibold">🔄 Rejoin</button>
                            <button onclick="sendCmd('${p.userId}', 'hop_low', this)" class="px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-xs font-semibold">🎲 Hop أقل لاعبين</button>
                            <button onclick="sendCmd('${p.userId}', 'hop_random', this)" class="px-3 py-2 bg-pink-500/20 hover:bg-pink-500/30 text-pink-400 rounded-lg text-xs font-semibold">🎯 Hop عشوائي</button>
                        </div>
                    </div>

                    <div>
                        <div class="text-xs text-gray-500 mb-2">💼 تغيير الوظيفة:</div>
                        <div class="flex gap-2 flex-wrap">
                            <button onclick="sendCmd('${p.userId}', 'job_janitor', this)" class="px-3 py-2 ${selectedJob === 'Janitor' ? 'bg-emerald-500/40 text-emerald-300' : 'bg-gray-700/50 text-gray-300'} hover:bg-emerald-500/30 hover:text-emerald-400 rounded-lg text-xs font-semibold">🧹 Janitor</button>
                            <button onclick="sendCmd('${p.userId}', 'job_quick11', this)" class="px-3 py-2 ${selectedJob === 'Quick-11' ? 'bg-emerald-500/40 text-emerald-300' : 'bg-gray-700/50 text-gray-300'} hover:bg-emerald-500/30 hover:text-emerald-400 rounded-lg text-xs font-semibold">🛒 Quick-11</button>
                            <button onclick="sendCmd('${p.userId}', 'job_fishing', this)" class="px-3 py-2 ${selectedJob === 'Fishing' ? 'bg-emerald-500/40 text-emerald-300' : 'bg-gray-700/50 text-gray-300'} hover:bg-emerald-500/30 hover:text-emerald-400 rounded-lg text-xs font-semibold">🎣 Fishing</button>
                            <button onclick="sendCmd('${p.userId}', 'job_atm', this)" class="px-3 py-2 ${selectedJob === 'ATM' ? 'bg-emerald-500/40 text-emerald-300' : 'bg-gray-700/50 text-gray-300'} hover:bg-emerald-500/30 hover:text-emerald-400 rounded-lg text-xs font-semibold">🏧 ATM</button>
                            <button onclick="sendCmd('${p.userId}', 'job_none', this)" class="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs font-semibold">⏹️ إيقاف</button>
                        </div>
                    </div>

                    <div>
                        <div class="text-xs text-gray-500 mb-2">💸 البنك:</div>
                        <div class="flex gap-2 flex-wrap">
                            <button onclick="sendCmd('${p.userId}', 'deposit_all', this)" class="px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-xs font-semibold">🏦 أودع الكل</button>
                            <button onclick="sendCmd('${p.userId}', 'withdraw_1000', this)" class="px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-xs font-semibold">💵 اسحب $1000</button>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');

    const onlineCount = list.filter(p => p.online).length;

    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <div class="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 class="text-2xl font-bold text-white">👥 اللاعبون</h1>
                    <p class="text-gray-500 text-sm mt-1">
                        <span class="text-emerald-400 font-bold">${onlineCount}</span> متصل
                        من <span class="font-bold">${list.length}</span> جلسة
                    </p>
                </div>
                <div class="flex gap-2">
                    <button onclick="location.reload()" class="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-xl">🔄 تحديث</button>
                    <label class="px-5 py-2.5 bg-gray-800 text-white font-bold rounded-xl flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" id="autoRefresh" checked class="w-4 h-4">
                        <span class="text-sm">تحديث تلقائي</span>
                    </label>
                </div>
            </div>
        </header>
        <div class="p-6">${playersHTML}</div>
        <script>
            async function sendCmd(userId, cmd, btn) {
                const oldText = btn.innerHTML;
                btn.innerHTML = '⏳...';
                btn.disabled = true;
                try {
                    const res = await fetch('/admin/command', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId, command: cmd })
                    });
                    const data = await res.json();
                    if (data.ok) {
                        btn.innerHTML = '✅ تم';
                        btn.classList.add('ring-2', 'ring-emerald-500');
                        setTimeout(() => { btn.innerHTML = oldText; btn.disabled = false; btn.classList.remove('ring-2','ring-emerald-500'); }, 1500);
                    } else {
                        btn.innerHTML = '❌ فشل';
                        setTimeout(() => { btn.innerHTML = oldText; btn.disabled = false; }, 1500);
                    }
                } catch (e) {
                    btn.innerHTML = '❌ خطأ';
                    setTimeout(() => { btn.innerHTML = oldText; btn.disabled = false; }, 1500);
                }
            }
            let refreshTimer = setInterval(() => location.reload(), 5000);
            document.getElementById('autoRefresh').addEventListener('change', (e) => {
                clearInterval(refreshTimer);
                if (e.target.checked) refreshTimer = setInterval(() => location.reload(), 5000);
            });
        </script>
    `;
    res.send(layout({ title: 'اللاعبون', page: 'players', content }));
});

// ═══════════════════════════════════════════════════════
// 📤 Command API
// ═══════════════════════════════════════════════════════
app.post('/admin/command', adminAuth, (req, res) => {
    const { userId, command } = req.body;
    if (!userId || !command) return res.status(400).json({ ok: false, error: 'missing params' });
    const key = String(userId);
    if (!commandQueue[key]) commandQueue[key] = [];
    commandQueue[key].push({ command, timestamp: Date.now() });
    console.log(`[CMD] → ${userId}: ${command}`);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// 📜 Scripts
// ═══════════════════════════════════════════════════════
app.get('/scripts', adminAuth, (req, res) => {
    const list = Object.values(scripts).sort((a, b) => b.updatedAt - a.updatedAt);
    const host = req.protocol + '://' + req.get('host');

    const html = list.length === 0
        ? `<div class="text-center py-16">
             <div class="text-6xl mb-4">📜</div>
             <div class="text-gray-400 mb-6">لا توجد سكربتات</div>
             <a href="/scripts/new" class="inline-block px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold rounded-xl">+ ارفع أول سكربت</a>
           </div>`
        : list.map(s => {
            const url = host + '/load/' + s.name;
            const loadCmd = `loadstring(game:HttpGet("${url}"))()`;
            return `
            <div class="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 hover:border-blue-500/50 transition">
                <div class="flex items-start justify-between mb-4">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-2xl">📜</span>
                            <h3 class="text-xl font-bold text-white">${esc(s.name)}</h3>
                            <span class="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded font-bold">✅ Auto Heartbeat</span>
                        </div>
                        <p class="text-gray-400 text-sm">${esc(s.description || 'بدون وصف')}</p>
                    </div>
                    <div class="text-right">
                        <div class="text-2xl font-bold text-emerald-400">${s.loads || 0}</div>
                        <div class="text-xs text-gray-500">تحميل</div>
                    </div>
                </div>
                <div class="bg-gray-950 border border-gray-800 rounded-xl p-3 mb-3">
                    <div class="text-xs text-gray-500 mb-2">🔗 loadstring:</div>
                    <div class="flex items-center gap-2">
                        <code class="flex-1 text-emerald-400 text-xs overflow-x-auto whitespace-nowrap">${esc(loadCmd)}</code>
                        <button onclick="copyCmd('${esc(loadCmd).replace(/'/g, "\\'")}')" class="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs font-semibold">📋 نسخ</button>
                    </div>
                </div>
                <div class="flex gap-2">
                    <a href="/scripts/edit/${esc(s.name)}" class="flex-1 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm font-semibold text-center">✏️ تعديل</a>
                    <a href="/load/${esc(s.name)}" target="_blank" class="flex-1 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-sm font-semibold text-center">👁️ معاينة</a>
                    <form method="POST" action="/admin/scripts/delete" onsubmit="return confirm('حذف؟')" class="flex-1">
                        <input type="hidden" name="name" value="${esc(s.name)}">
                        <button type="submit" class="w-full py-2 bg-red-500/20 text-red-400 rounded-lg text-sm font-semibold">🗑️ حذف</button>
                    </form>
                </div>
            </div>`;
        }).join('');

    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <div class="flex items-center justify-between">
                <div>
                    <h1 class="text-2xl font-bold text-white">📜 السكربتات</h1>
                    <p class="text-gray-500 text-sm mt-1">ارفع أي سكربت — التحكم يُحقن تلقائياً</p>
                </div>
                <a href="/scripts/new" class="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold rounded-xl">+ ارفع</a>
            </div>
        </header>
        <div class="p-6">
            <div class="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 mb-6">
                <div class="flex items-start gap-3">
                    <span class="text-2xl">✨</span>
                    <div>
                        <div class="font-bold text-emerald-400 mb-1">حقن تلقائي كامل</div>
                        <div class="text-sm text-gray-300">
                            عند رفع أي سكربت، السيرفر يضيف كود <code class="text-emerald-400">Heartbeat</code> و<code class="text-emerald-400">Command Receiver</code> و<code class="text-emerald-400">Force Load</code> في نهاية السكربت تلقائياً. لا تحتاج تعدل السكربت الأصلي.
                        </div>
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">${html}</div>
        </div>
        <script>
            function copyCmd(cmd) {
                navigator.clipboard.writeText(cmd).then(() => alert('✅ تم النسخ!'));
            }
        </script>
    `;
    res.send(layout({ title: 'السكربتات', page: 'scripts', content }));
});

app.get('/scripts/new', adminAuth, (req, res) => {
    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <div class="flex items-center justify-between">
                <h1 class="text-2xl font-bold text-white">➕ رفع سكربت</h1>
                <a href="/scripts" class="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-xl">← رجوع</a>
            </div>
        </header>
        <div class="p-6">
            <div class="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 mb-6">
                <div class="flex items-start gap-3">
                    <span class="text-2xl">🚀</span>
                    <div>
                        <div class="font-bold text-blue-400 mb-1">ماذا يحدث بعد الرفع؟</div>
                        <ul class="text-sm text-gray-300 space-y-1 list-disc list-inside">
                            <li>يُحفظ السكربت في السيرفر</li>
                            <li>يُضاف كود Heartbeat كامل تلقائياً</li>
                            <li>يُضاف نظام استقبال الأوامر من الموقع</li>
                            <li>يُضاف نظام Force Load في حال الرفض الأولي</li>
                            <li>اللاعب يشغّل السكربت → يظهر في /players خلال 3 ثواني</li>
                        </ul>
                    </div>
                </div>
            </div>
            <form method="POST" action="/admin/scripts/save" class="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-5">
                <div>
                    <label class="block text-gray-300 text-sm font-semibold mb-2">اسم السكربت</label>
                    <input type="text" name="name" required pattern="[a-zA-Z0-9_\\-]{1,64}" placeholder="mercy-hub"
                        class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white focus:border-blue-500 focus:outline-none">
                    <div class="text-xs text-gray-500 mt-1">أحرف إنجليزية وأرقام و _ - فقط</div>
                </div>
                <div>
                    <label class="block text-gray-300 text-sm font-semibold mb-2">الوصف (اختياري)</label>
                    <input type="text" name="description" placeholder="Mercy Hub - Multi Farm"
                        class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white focus:border-blue-500 focus:outline-none">
                </div>
                <div>
                    <label class="block text-gray-300 text-sm font-semibold mb-2">كود السكربت (Lua/Luau) — الصقه كما هو</label>
                    <textarea name="content" required rows="25" placeholder="-- الصق كود السكربت هنا"
                        class="w-full px-4 py-3 bg-gray-950 border border-gray-700 rounded-xl text-emerald-400 text-sm resize-y focus:border-blue-500 focus:outline-none"></textarea>
                </div>
                <div class="flex gap-3 pt-2">
                    <button type="submit" class="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold rounded-xl hover:opacity-90">💾 حفظ + حقن تلقائي</button>
                    <a href="/scripts" class="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-xl text-center">إلغاء</a>
                </div>
            </form>
        </div>
    `;
    res.send(layout({ title: 'سكربت جديد', page: 'scripts', content }));
});

app.get('/scripts/edit/:name', adminAuth, (req, res) => {
    const s = scripts[req.params.name];
    if (!s) return res.redirect('/scripts');

    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <div class="flex items-center justify-between">
                <h1 class="text-2xl font-bold text-white">✏️ ${esc(s.name)}</h1>
                <a href="/scripts" class="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-xl">← رجوع</a>
            </div>
        </header>
        <div class="p-6">
            <form method="POST" action="/admin/scripts/save" class="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-5">
                <input type="hidden" name="originalName" value="${esc(s.name)}">
                <div>
                    <label class="block text-gray-300 text-sm font-semibold mb-2">الاسم</label>
                    <input type="text" name="name" required pattern="[a-zA-Z0-9_\\-]{1,64}" value="${esc(s.name)}"
                        class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white focus:border-blue-500 focus:outline-none">
                </div>
                <div>
                    <label class="block text-gray-300 text-sm font-semibold mb-2">الوصف</label>
                    <input type="text" name="description" value="${esc(s.description || '')}"
                        class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white focus:border-blue-500 focus:outline-none">
                </div>
                <div>
                    <label class="block text-gray-300 text-sm font-semibold mb-2">الكود (بدون إضافات — تُحقن تلقائياً)</label>
                    <textarea name="content" required rows="25"
                        class="w-full px-4 py-3 bg-gray-950 border border-gray-700 rounded-xl text-emerald-400 text-sm focus:border-blue-500 focus:outline-none">${esc(s.content)}</textarea>
                </div>
                <div class="flex gap-3">
                    <button type="submit" class="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold rounded-xl hover:opacity-90">💾 حفظ</button>
                    <a href="/scripts" class="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-xl text-center">إلغاء</a>
                </div>
            </form>
        </div>
    `;
    res.send(layout({ title: 'تعديل', page: 'scripts', content }));
});

app.post('/admin/scripts/save', adminAuth, (req, res) => {
    const { name, description, content, originalName } = req.body;
    if (!name || !content) return res.status(400).send('Missing data');
    if (!validName(name)) return res.status(400).send('Invalid name');

    if (originalName && originalName !== name && scripts[originalName]) delete scripts[originalName];

    scripts[name] = {
        name,
        description: description || '',
        content: String(content),
        updatedAt: Date.now(),
        createdAt: scripts[name]?.createdAt || Date.now(),
        loads: scripts[name]?.loads || 0,
    };
    res.redirect('/scripts');
});

app.post('/admin/scripts/delete', adminAuth, (req, res) => {
    const { name } = req.body;
    if (scripts[name]) delete scripts[name];
    res.redirect('/scripts');
});

// ═══════════════════════════════════════════════════════
// 🚀 Load — يحقن Heartbeat + Control تلقائياً
// ═══════════════════════════════════════════════════════
app.get('/load/:name', (req, res) => {
    const s = scripts[req.params.name];
    if (!s) {
        return res.status(404).type('text/plain').send(
            `warn("[HOST] ❌ Script '${req.params.name}' not found")`
        );
    }

    s.loads = (s.loads || 0) + 1;
    s.lastLoaded = Date.now();

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const hostUrl = req.protocol + '://' + req.get('host');
    const scriptUrl = hostUrl + '/load/' + s.name;

    // ═══ HEADER — إعداد المتغيرات العامة قبل السكربت ═══
    const header = `-- ═══════════════════════════════════════════
-- ${s.name}
-- Server: ${hostUrl}
-- ═══════════════════════════════════════════
_G = _G or {}
_G.HOST_URL = "${hostUrl}"
_G.HOST_KEY = "${API_KEY}"
_G.SCRIPT_URL = "${scriptUrl}"
_G.SCRIPT_NAME = "${s.name}"

-- 🔗 Rejoin على Teleport فقط
if queue_on_teleport and not _G.__REJOIN_REGISTERED then
    _G.__REJOIN_REGISTERED = true
    pcall(function()
        queue_on_teleport(([[
            task.wait(3)
            loadstring(game:HttpGet("%s"))()
        ]]):format("${scriptUrl}"))
    end)
end
-- ═══════════════════════════════════════════\n\n`;

    // ═══ FOOTER — Heartbeat + Control (يُحقن تلقائياً) ═══
    const footer = `

-- ═══════════════════════════════════════════════════════════
-- 🔗 AUTO-INJECTED: Control System v2.1
-- ═══════════════════════════════════════════════════════════
do
    local _HOST = _G.HOST_URL or "${hostUrl}"
    local _KEY = _G.HOST_KEY or "${API_KEY}"
    local _SCRIPT = _G.SCRIPT_NAME or "${s.name}"
    local _HTTP = game:GetService("HttpService")
    local _PLRS = game:GetService("Players")
    local _LP = _PLRS.LocalPlayer

    if not getgenv().__START_TIME then getgenv().__START_TIME = tick() end

    -- 🔍 البحث عن المتغيرات العامة بأي طريقة ممكنة
    local function _findGlobal(name)
        if _G[name] then return _G[name] end
        if getgenv and getgenv()[name] then return getgenv()[name] end
        return nil
    end

    -- 🎯 معالج الأوامر
    local function _HandleCommand(cmd)
        print("[CMD] ← " .. tostring(cmd))

        -- ═══ Rejoin / Hop ═══
        if cmd == "rejoin" then
            game:GetService("TeleportService"):TeleportToPlaceInstance(game.PlaceId, game.JobId, _LP)

        elseif cmd == "hop_low" then
            task.spawn(function()
                local ok, req = pcall(function()
                    return game:HttpGet(string.format(
                        "https://games.roblox.com/v1/games/%d/servers/Public?sortOrder=Asc&limit=100",
                        game.PlaceId))
                end)
                if ok then
                    local data = _HTTP:JSONDecode(req)
                    local best, bestCount = nil, math.huge
                    if data and data.data then
                        for _, v in ipairs(data.data) do
                            if v.playing < v.maxPlayers and v.playing < bestCount then
                                best, bestCount = v.id, v.playing
                            end
                        end
                    end
                    if best then
                        game:GetService("TeleportService"):TeleportToPlaceInstance(game.PlaceId, best, _LP)
                    end
                end
            end)

        elseif cmd == "hop_random" then
            task.spawn(function()
                local ok, req = pcall(function()
                    return game:HttpGet(string.format(
                        "https://games.roblox.com/v1/games/%d/servers/Public?sortOrder=Asc&limit=100",
                        game.PlaceId))
                end)
                if ok then
                    local data = _HTTP:JSONDecode(req)
                    local list = {}
                    if data and data.data then
                        for _, v in ipairs(data.data) do
                            if v.playing < v.maxPlayers then table.insert(list, v.id) end
                        end
                    end
                    if #list > 0 then
                        game:GetService("TeleportService"):TeleportToPlaceInstance(game.PlaceId, list[math.random(1, #list)], _LP)
                    end
                end
            end)

        -- ═══ تغيير الوظيفة ═══
        elseif cmd == "job_janitor" then
            task.spawn(function()
                pcall(function()
                    local Config = _findGlobal("Config")
                    local StateController = _findGlobal("StateController")
                    if Config then
                        Config.AutoFarmATM = false
                        Config.AutoFarmFishing = false
                        Config.StartFarmJob = true
                        Config.SelectedJob = "Janitor"
                        Config.SelectedFarmMode = "Janitor"
                    end
                    if StateController then
                        if StateController.StopJob then StateController:StopJob() end
                        task.wait(0.5)
                        Config.StartFarmJob = true
                        Config.SelectedJob = "Janitor"
                        if StateController.StartJob then StateController:StartJob() end
                    end
                    print("[CMD] ✅ Janitor started")
                end)
            end)

        elseif cmd == "job_quick11" then
            task.spawn(function()
                pcall(function()
                    local Config = _findGlobal("Config")
                    local StateController = _findGlobal("StateController")
                    if Config then
                        Config.AutoFarmATM = false
                        Config.AutoFarmFishing = false
                        Config.StartFarmJob = true
                        Config.SelectedJob = "Quick-11"
                        Config.SelectedFarmMode = "Quick-11"
                    end
                    if StateController then
                        if StateController.StopJob then StateController:StopJob() end
                        task.wait(0.5)
                        Config.StartFarmJob = true
                        Config.SelectedJob = "Quick-11"
                        if StateController.StartJob then StateController:StartJob() end
                    end
                    print("[CMD] ✅ Quick-11 started")
                end)
            end)

        elseif cmd == "job_fishing" then
            task.spawn(function()
                pcall(function()
                    local Config = _findGlobal("Config")
                    local func = _findGlobal("func")
                    local StateController = _findGlobal("StateController")
                    if Config then
                        Config.AutoFarmATM = false
                        Config.StartFarmJob = false
                        Config.AutoFarmFishing = true
                        Config.SelectedFarmMode = "Fishing"
                    end
                    if StateController and StateController.StopJob then StateController:StopJob() end
                    task.wait(0.5)
                    if Config then Config.AutoFarmFishing = true end
                    if func and func["AutoFarmFishing"] then task.spawn(func["AutoFarmFishing"]) end
                    print("[CMD] ✅ Fishing started")
                end)
            end)

        elseif cmd == "job_atm" then
            task.spawn(function()
                pcall(function()
                    local Config = _findGlobal("Config")
                    local func = _findGlobal("func")
                    local StateController = _findGlobal("StateController")
                    if Config then
                        Config.StartFarmJob = false
                        Config.AutoFarmFishing = false
                        Config.AutoFarmATM = true
                        Config.EnabledVechine = true
                        Config.EnabledDespoit = true
                        Config.SelectedFarmMode = "ATM"
                    end
                    if StateController and StateController.StopJob then StateController:StopJob() end
                    task.wait(0.5)
                    if Config then Config.AutoFarmATM = true end
                    if func and func["AutoFarmATM"] then task.spawn(func["AutoFarmATM"]) end
                    print("[CMD] ✅ ATM started")
                end)
            end)

        elseif cmd == "job_none" then
            task.spawn(function()
                pcall(function()
                    local Config = _findGlobal("Config")
                    local StateController = _findGlobal("StateController")
                    local Sf = _findGlobal("Sf")
                    if Config then
                        Config.AutoFarmATM = false
                        Config.StartFarmJob = false
                        Config.AutoFarmFishing = false
                        Config.SelectedJob = "None"
                        Config.SelectedFarmMode = "None"
                    end
                    if StateController and StateController.StopJob then StateController:StopJob() end
                    if Sf and Sf.ForceStop then Sf:ForceStop() end
                    print("[CMD] ⏹️ All farms stopped")
                end)
            end)

        -- ═══ البنك ═══
        elseif cmd == "deposit_all" then
            task.spawn(function()
                pcall(function()
                    local Sf = _findGlobal("Sf")
                    local Net = _findGlobal("Net")
                    if Sf and Sf.GetMoney and Net then
                        local m = Sf:GetMoney() or 0
                        if m > 0 then Net.get("transfer_funds", "hand", "bank", m) end
                    end
                end)
            end)

        elseif cmd == "withdraw_1000" then
            task.spawn(function()
                pcall(function()
                    local Net = _findGlobal("Net")
                    if Net then Net.get("transfer_funds", "bank", "hand", 1000) end
                end)
            end)
        end
    end

    -- 📊 دوال قراءة البيانات
    local function _readMoney()
        local Sf = _findGlobal("Sf")
        if Sf and Sf.GetMoney then
            local ok, v = pcall(function() return Sf:GetMoney() end)
            if ok and v then return v end
        end
        -- طريقة احتياطية: قراءة مباشرة من HUD
        local ok, v = pcall(function()
            local pg = _LP:FindFirstChild("PlayerGui")
            local hud = pg and pg:FindFirstChild("TopRightHud")
            local holder = hud and hud:FindFirstChild("Holder")
            local frame = holder and holder:FindFirstChild("Frame")
            local lbl = frame and frame:FindFirstChild("MoneyTextLabel")
            if lbl then
                local clean = lbl.Text:gsub(",", "")
                return tonumber(clean:match("%$(%d+)")) or 0
            end
            return 0
        end)
        return ok and v or 0
    end

    local function _readBank()
        local Sf = _findGlobal("Sf")
        if Sf and Sf.ATMMoney then
            local ok, v = pcall(function() return Sf:ATMMoney() end)
            if ok and v then return v end
        end
        return 0
    end

    local function _readLevel()
        local Sf = _findGlobal("Sf")
        if Sf and Sf.GetLevel then
            local ok, v = pcall(function() return Sf:GetLevel() end)
            if ok and v then return v end
        end
        return 0
    end

    local function _readJob()
        local ok, v = pcall(function() return _LP:GetAttribute("Job") end)
        return (ok and v) or "None"
    end

    -- 💓 Heartbeat Loop
    task.spawn(function()
        while task.wait(3) do
            pcall(function()
                local char = _LP.Character
                local hum = char and char:FindFirstChildOfClass("Humanoid")
                local Config = _findGlobal("Config")

                local state = {
                    userId = _LP.UserId,
                    username = _LP.Name,
                    displayName = _LP.DisplayName,
                    jobId = game.JobId,
                    placeId = game.PlaceId,
                    health = hum and hum.Health or 0,
                    maxHealth = hum and hum.MaxHealth or 100,
                    money = _readMoney(),
                    bank = _readBank(),
                    level = _readLevel(),
                    currentJob = _readJob(),
                    farmMode = Config and Config.SelectedFarmMode or "None",
                    autoFarmATM = Config and Config.AutoFarmATM or false,
                    autoFarmJob = Config and Config.StartFarmJob or false,
                    autoFarmFishing = Config and Config.AutoFarmFishing or false,
                    selectedJob = Config and Config.SelectedJob or "None",
                    uptime = math.floor(tick() - (getgenv().__START_TIME or tick())),
                }

                local body = _HTTP:JSONEncode(state)
                local resp = _HTTP:PostAsync(
                    _HOST .. "/api/heartbeat?key=" .. _KEY .. "&script=" .. _SCRIPT,
                    body,
                    Enum.HttpContentType.ApplicationJson
                )

                local data = _HTTP:JSONDecode(resp)
                if data and data.commands then
                    for _, c in ipairs(data.commands) do
                        pcall(_HandleCommand, c)
                    end
                end
            end)
        end
    end)

    print("[Control] ✅ متصل بـ " .. _HOST)
end
-- ═══════════════════════════════════════════════════════════
-- END AUTO-INJECTED
-- ═══════════════════════════════════════════════════════════
`;

    res.send(header + s.content + footer);
});

// ═══════════════════════════════════════════════════════
// 🔌 API
// ═══════════════════════════════════════════════════════
app.get('/api/status', apiAuth, (req, res) => {
    res.json({
        ok: true,
        scripts: Object.keys(scripts).length,
        players: Object.keys(players).length,
        uptime: process.uptime(),
    });
});

// ═══════════════════════════════════════════════════════
// 🚀 Start
// ═══════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log('');
        console.log('╔══════════════════════════════════════════════╗');
        console.log('║  🔄 Rejoin Host + Control Panel v2.1         ║');
        console.log('╠══════════════════════════════════════════════╣');
        console.log(`║  🌐 Dashboard: http://localhost:${PORT}/dashboard`);
        console.log(`║  👥 Players:   http://localhost:${PORT}/players`);
        console.log(`║  📜 Scripts:   http://localhost:${PORT}/scripts`);
        console.log(`║  🔑 API Key:   ${API_KEY}`);
        console.log(`║  👑 Admin:     ${ADMIN_PASSWORD}`);
        console.log('╚══════════════════════════════════════════════╝');
    });
}

module.exports = app;

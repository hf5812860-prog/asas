// ═══════════════════════════════════════════════════════
// Roblox Trade Host v7.0 — Per-Player Controls
// ═══════════════════════════════════════════════════════
const express      = require('express');
const cookieParser = require('cookie-parser');
const app          = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ type: ['text/*'], limit: '10mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
    if (typeof req.body === 'string' && req.body.trim() && !req.path.includes('/admin/scripts/save')) {
        try { req.body = JSON.parse(req.body); } catch (e) {}
    }
    if (!req.body || typeof req.body !== 'object') req.body = {};
    next();
});

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ═══════════════════════════════════════════════════════
// ⚙️ الإعدادات
// ═══════════════════════════════════════════════════════
const API_KEY        = process.env.API_KEY        || "JXZXCV";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SESSION_SECRET = process.env.SESSION_SECRET || "secret-change-me";
const START_TIME     = Date.now();
const ONLINE_TIMEOUT = 60 * 1000;

// ═══════════════════════════════════════════════════════
// 🗄️ Database
// ═══════════════════════════════════════════════════════
const scripts  = {};
const users    = {};
const commands = {};
const logs     = [];
const timeline = [];

// ═══════════════════════════════════════════════════════
// 🛠️ Helpers
// ═══════════════════════════════════════════════════════
function isOnline(u) { return u && (Date.now() - u.lastSeen < ONLINE_TIMEOUT); }
function getOnlineUsers() { return Object.values(users).filter(isOnline); }

function addLog(type, message) {
    logs.unshift({ type, message, time: Date.now() });
    if (logs.length > 200) logs.length = 200;
}

function addTimeline() {
    timeline.push({
        time: Date.now(),
        online: getOnlineUsers().length,
    });
    if (timeline.length > 60) timeline.shift();
}

function adminAuth(req, res, next) {
    const token = req.cookies.admin_token || req.headers['x-admin-token'];
    if (!token || token !== SESSION_SECRET) return res.redirect('/login');
    next();
}

function apiAuth(req, res, next) {
    if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
    next();
}

function getHostUrl(req) {
    const host = req.get('host') || 'localhost';
    return 'https://' + host;
}

function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s} ث`;
    if (s < 3600) return `${Math.floor(s / 60)} د`;
    if (s < 86400) return `${Math.floor(s / 3600)} س`;
    return `${Math.floor(s / 86400)} ي`;
}

function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function validName(n) {
    return /^[a-zA-Z0-9_\-]{1,64}$/.test(n);
}

function fmtNum(n) {
    const num = parseInt(n) || 0;
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

setInterval(addTimeline, 10000);

// ═══════════════════════════════════════════════════════
// 🎨 Layout
// ═══════════════════════════════════════════════════════
function layout({ title, page, content }) {
    const navItems = [
        { href: '/dashboard', icon: '📊', label: 'لوحة التحكم', id: 'dashboard' },
        { href: '/players',   icon: '🟢', label: 'المتصلين',     id: 'players' },
        { href: '/scripts',   icon: '📜', label: 'السكربتات',   id: 'scripts' },
    ];

    const navHTML = navItems.map(item => {
        const active = page === item.id;
        const cls = active ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white' : 'text-gray-400 hover:bg-gray-800/50';
        return `<a href="${item.href}" class="flex items-center gap-3 px-4 py-3 rounded-xl ${cls}">
            <span class="text-xl">${item.icon}</span>
            <span class="font-semibold">${item.label}</span>
        </a>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — Trade Host</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=JetBrains+Mono&display=swap" rel="stylesheet">
<style>
    * { font-family: 'Cairo', sans-serif; }
    code, pre, textarea { font-family: 'JetBrains Mono', monospace; }
    body { background: #0a0a12; margin: 0; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #1a1a2e; }
    ::-webkit-scrollbar-thumb { background: #3b82f6; border-radius: 4px; }
    .pulse-dot { width: 8px; height: 8px; background: #10b981; border-radius: 50%; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.3)} }
    .glow { box-shadow: 0 0 30px rgba(59,130,246,0.15); }
</style>
</head>
<body class="min-h-screen text-gray-200">

<div class="flex min-h-screen">
    <aside class="w-64 bg-gray-900/80 border-l border-gray-800 flex-shrink-0 hidden md:flex md:flex-col">
        <div class="p-6 border-b border-gray-800">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <span class="text-2xl">🚀</span>
                </div>
                <div>
                    <div class="font-bold text-white">Trade Host</div>
                    <div class="text-xs text-gray-500">v7.0</div>
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
// 🏠 Login
// ═══════════════════════════════════════════════════════
app.get('/login', (req, res) => {
    const err = req.query.error ? `<div class="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm text-center">❌ كلمة المرور غير صحيحة</div>` : '';
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
            <span class="text-5xl">🚀</span>
        </div>
        <h1 class="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Trade Host</h1>
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

// ═══════════════════════════════════════════════════════
// 📊 Dashboard
// ═══════════════════════════════════════════════════════
app.get('/', (req, res) => res.redirect('/dashboard'));

app.get('/dashboard', adminAuth, (req, res) => {
    const online = getOnlineUsers();

    const stats = [
        { icon: '🟢', num: online.length, lbl: 'متصل الآن', color: 'emerald' },
        { icon: '👥', num: Object.keys(users).length, lbl: 'إجمالي اللاعبين', color: 'blue' },
        { icon: '📜', num: Object.keys(scripts).length, lbl: 'السكربتات', color: 'purple' },
        { icon: '⚡', num: Object.values(scripts).reduce((s, sc) => s + (sc.loads || 0), 0), lbl: 'إجمالي التحميلات', color: 'orange' },
    ];

    const statsHTML = stats.map(s => `
        <div class="bg-gradient-to-br from-${s.color}-500/10 to-${s.color}-500/5 border border-${s.color}-500/20 rounded-2xl p-5 glow">
            <div class="text-3xl mb-2">${s.icon}</div>
            <div class="text-3xl font-bold text-${s.color}-400">${s.num}</div>
            <div class="text-gray-400 text-sm mt-1">${s.lbl}</div>
        </div>
    `).join('');

    const onlineHTML = online.length === 0
        ? '<div class="text-center py-8 text-gray-500 text-sm">لا أحد متصل</div>'
        : online.sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 10).map(u => `
            <div class="flex items-center gap-3 p-3 bg-gray-800/40 rounded-xl border border-gray-800 mb-2">
                <img src="https://www.roblox.com/headshot-thumbnail/image?userId=${u.robloxId}&width=150&height=150&format=png"
                     class="w-10 h-10 rounded-full border-2 border-emerald-500" onerror="this.style.display='none'">
                <div class="flex-1 min-w-0">
                    <div class="font-semibold text-white text-sm truncate">${esc(u.username)}</div>
                    <div class="text-xs text-emerald-400">منذ ${timeAgo(u.lastSeen)}</div>
                </div>
            </div>
        `).join('');

    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <div class="flex items-center justify-between">
                <div>
                    <h1 class="text-2xl font-bold text-white">📊 لوحة التحكم</h1>
                    <p class="text-gray-500 text-sm mt-1">مراقبة مباشرة</p>
                </div>
                <div class="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                    <div class="pulse-dot"></div>
                    <span class="text-emerald-400 text-sm font-semibold">مباشر</span>
                </div>
            </div>
        </header>
        <div class="p-6 space-y-6">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">${statsHTML}</div>
            <div class="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
                <h2 class="font-bold text-white mb-4 flex items-center gap-2"><span class="text-xl">📈</span> النشاط المباشر</h2>
                <div style="height: 250px;"><canvas id="activityChart"></canvas></div>
            </div>
            <div class="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
                <div class="p-5 border-b border-gray-800 flex items-center justify-between">
                    <h2 class="font-bold text-white flex items-center gap-2"><span class="text-xl">🟢</span> المتصلين</h2>
                    <span class="text-xs text-gray-500">${online.length}</span>
                </div>
                <div class="p-4 max-h-80 overflow-auto">${onlineHTML}</div>
            </div>
        </div>
        <script>
            const timeline = ${JSON.stringify(timeline)};
            const labels = timeline.map(t => {
                const d = new Date(t.time);
                return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
            });
            const ctx = document.getElementById('activityChart').getContext('2d');
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        { label: 'متصلين', data: timeline.map(t => t.online), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', tension: 0.4, fill: true },
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: '#e4e4ed' } } },
                    scales: {
                        x: { ticks: { color: '#8888a0', maxTicksLimit: 10 }, grid: { color: '#2a2a3e' } },
                        y: { ticks: { color: '#8888a0' }, grid: { color: '#2a2a3e' }, beginAtZero: true }
                    }
                }
            });
        </script>
    `;
    res.send(layout({ title: 'لوحة التحكم', page: 'dashboard', content }));
});

// ═══════════════════════════════════════════════════════
// 🟢 صفحة المتصلين — v7.0 — تحكم تحت كل لاعب
// ═══════════════════════════════════════════════════════
app.get('/players', adminAuth, (req, res) => {
    const list = Object.values(users).sort((a, b) => b.lastSeen - a.lastSeen);

    const rowsHTML = list.length === 0
        ? '<tr><td colspan="3" class="text-center py-12 text-gray-500">لا يوجد لاعبين مسجلين</td></tr>'
        : list.map(u => {
            const online = isOnline(u);
            const hasMoney = (u.money && u.money > 0) || (u.bank && u.bank > 0);
            
            return `
            <tr class="border-t border-gray-800 hover:bg-gray-800/30 ${online ? '' : 'opacity-60'}">
                <!-- العمود الأول: معلومات اللاعب -->
                <td class="p-4 align-top" style="width: 250px;">
                    <div class="flex items-center gap-3">
                        <img src="https://www.roblox.com/headshot-thumbnail/image?userId=${u.robloxId}&width=150&height=150&format=png"
                             class="w-12 h-12 rounded-full border-2 ${online ? 'border-emerald-500' : 'border-gray-700'}"
                             onerror="this.style.display='none'">
                        <div class="flex-1">
                            <div class="text-white font-bold">${esc(u.username)}</div>
                            <div class="text-xs ${online ? 'text-emerald-400' : 'text-gray-500'}">
                                ${online ? '🟢 متصل' : '⚫ غير متصل'} • منذ ${timeAgo(u.lastSeen)}
                            </div>
                        </div>
                    </div>
                </td>

                <!-- العمود الثاني: الفلوس والإحصائيات -->
                <td class="p-4 align-top" style="width: 300px;">
                    <div class="grid grid-cols-2 gap-3">
                        <div class="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                            <div class="text-xs text-gray-400 mb-1">💵 الفلوس باليد</div>
                            <div class="text-lg font-bold text-emerald-400">$${fmtNum(u.money || 0)}</div>
                        </div>
                        <div class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                            <div class="text-xs text-gray-400 mb-1">🏦 البنك</div>
                            <div class="text-lg font-bold text-yellow-400">$${fmtNum(u.bank || 0)}</div>
                        </div>
                        <div class="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                            <div class="text-xs text-gray-400 mb-1">⭐ Level</div>
                            <div class="text-lg font-bold text-blue-400">${u.level || 0}</div>
                        </div>
                        <div class="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                            <div class="text-xs text-gray-400 mb-1">🔄 Farm Mode</div>
                            <div class="text-sm font-bold text-purple-400">${esc(u.farmMode || 'None')}</div>
                        </div>
                    </div>
                    <div class="mt-2 text-xs text-gray-500">
                        الوظيفة الحالية: <span class="text-white">${esc(u.currentJob || 'None')}</span>
                    </div>
                </td>

                <!-- العمود الثالث: التحكم -->
                <td class="p-4 align-top" style="width: 350px;">
                    <div class="space-y-2">
                        <!-- الصف الأول: Rejoin + Hop -->
                        <div class="grid grid-cols-2 gap-2">
                            <form method="POST" action="/admin/player/command" class="contents">
                                <input type="hidden" name="userId" value="${u.robloxId}">
                                <input type="hidden" name="cmd" value="rejoin">
                                <button type="submit" class="py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-400 rounded-lg font-semibold text-xs">
                                    🔄 Rejoin
                                </button>
                            </form>
                            <form method="POST" action="/admin/player/command" class="contents">
                                <input type="hidden" name="userId" value="${u.robloxId}">
                                <input type="hidden" name="cmd" value="hop">
                                <button type="submit" class="py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-400 rounded-lg font-semibold text-xs">
                                    🚀 Hop Server
                                </button>
                            </form>
                        </div>

                        <!-- الصف الثاني: الوظائف -->
                        <div class="bg-gray-800/50 rounded-lg p-2">
                            <div class="text-xs text-gray-400 mb-2">⚙️ تغيير الوظيفة:</div>
                            <div class="grid grid-cols-5 gap-1">
                                <form method="POST" action="/admin/player/command" class="contents">
                                    <input type="hidden" name="userId" value="${u.robloxId}">
                                    <input type="hidden" name="cmd" value="job_atm">
                                    <button type="submit" class="py-1.5 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded text-xs font-bold" title="ATM">🏧</button>
                                </form>
                                <form method="POST" action="/admin/player/command" class="contents">
                                    <input type="hidden" name="userId" value="${u.robloxId}">
                                    <input type="hidden" name="cmd" value="job_janitor">
                                    <button type="submit" class="py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded text-xs font-bold" title="Janitor">🧹</button>
                                </form>
                                <form method="POST" action="/admin/player/command" class="contents">
                                    <input type="hidden" name="userId" value="${u.robloxId}">
                                    <input type="hidden" name="cmd" value="job_quick11">
                                    <button type="submit" class="py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded text-xs font-bold" title="Quick-11">📦</button>
                                </form>
                                <form method="POST" action="/admin/player/command" class="contents">
                                    <input type="hidden" name="userId" value="${u.robloxId}">
                                    <input type="hidden" name="cmd" value="job_fishing">
                                    <button type="submit" class="py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded text-xs font-bold" title="Fishing">🎣</button>
                                </form>
                                <form method="POST" action="/admin/player/command" class="contents">
                                    <input type="hidden" name="userId" value="${u.robloxId}">
                                    <input type="hidden" name="cmd" value="job_none">
                                    <button type="submit" class="py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-xs font-bold" title="Stop">⏹️</button>
                                </form>
                            </div>
                        </div>
                    </div>
                </td>
            </tr>`;
        }).join('');

    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <div class="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-white">🟢 المتصلين</h1>
                    <p class="text-gray-500 text-sm mt-1">تحكم كامل بكل لاعب</p>
                </div>
                <div class="flex gap-3 text-sm">
                    <span class="px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
                        ${getOnlineUsers().length} متصل
                    </span>
                    <span class="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300">
                        ${list.length} إجمالي
                    </span>
                </div>
            </div>
        </header>

        <div class="p-6">
            <div class="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-gray-800/50">
                            <tr>
                                <th class="text-right p-4 text-gray-400 font-semibold">اللاعب</th>
                                <th class="text-right p-4 text-gray-400 font-semibold">الإحصائيات</th>
                                <th class="text-right p-4 text-gray-400 font-semibold">التحكم</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHTML}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    res.send(layout({ title: 'المتصلين', page: 'players', content }));
});

// ═══════════════════════════════════════════════════════
// 📜 Scripts Management
// ═══════════════════════════════════════════════════════
app.get('/scripts', adminAuth, (req, res) => {
    const list = Object.values(scripts).sort((a, b) => b.updatedAt - a.updatedAt);
    const host = getHostUrl(req);

    const html = list.length === 0
        ? `<div class="text-center py-16 col-span-full">
             <div class="text-6xl mb-4">📜</div>
             <div class="text-gray-400 mb-2">لا توجد سكربتات</div>
             <div class="text-gray-500 text-sm mb-6">ارفع السكربت</div>
             <a href="/scripts/new" class="inline-block px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold rounded-xl">+ ارفع أول سكربت</a>
           </div>`
        : list.map(s => {
            const url = host + '/load/' + s.name;
            const loadCmd = `loadstring(game:HttpGet("${url}"))()`;
            return `
            <div class="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 hover:border-blue-500/50 transition">
                <div class="flex items-start justify-between mb-4">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="text-2xl">📜</span>
                            <h3 class="text-xl font-bold text-white">${esc(s.name)}</h3>
                        </div>
                        <p class="text-gray-400 text-sm mt-1">${esc(s.description || 'بدون وصف')}</p>
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
                        <button onclick="copyCmd('${esc(loadCmd).replace(/'/g, "\\'")}')" 
                                class="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs font-semibold whitespace-nowrap">📋 نسخ</button>
                    </div>
                </div>
                <div class="flex gap-2 text-xs text-gray-500 mb-3">
                    <span>آخر تحديث: ${timeAgo(s.updatedAt)}</span>
                    <span>•</span>
                    <span>${s.content.length} حرف</span>
                </div>
                <div class="flex gap-2">
                    <a href="/scripts/edit/${s.name}" class="flex-1 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm font-semibold text-center">✏️ تعديل</a>
                    <form method="POST" action="/admin/scripts/delete" onsubmit="return confirm('حذف؟')" class="flex-1">
                        <input type="hidden" name="name" value="${esc(s.name)}">
                        <button type="submit" class="w-full py-2 bg-red-500/20 text-red-400 rounded-lg text-sm font-semibold">🗑️ حذف</button>
                    </form>
                    <a href="/load/${s.name}" target="_blank" class="flex-1 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-sm font-semibold text-center">👁️ معاينة</a>
                </div>
            </div>`;
        }).join('');

    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <div class="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-white">📜 السكربتات</h1>
                    <p class="text-gray-500 text-sm mt-1">ارفع كود Luau كما هو</p>
                </div>
                <a href="/scripts/new" class="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold rounded-xl">+ ارفع سكربت</a>
            </div>
        </header>
        <div class="p-6">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">${html}</div>
        </div>
        <script>
            function copyCmd(cmd) {
                navigator.clipboard.writeText(cmd).then(() => alert('✅ تم النسخ!\\n\\n' + cmd));
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
                <a href="/scripts" class="px-5 py-2.5 bg-gray-800 text-white font-bold rounded-xl">← رجوع</a>
            </div>
        </header>
        <div class="p-6">
            <form method="POST" action="/admin/scripts/save" class="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-5">
                <div>
                    <label class="block text-gray-300 text-sm font-semibold mb-2">اسم السكربت</label>
                    <input type="text" name="name" required pattern="[a-zA-Z0-9_\\-]{1,64}" placeholder="mercy-hub"
                        class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white">
                </div>
                <div>
                    <label class="block text-gray-300 text-sm font-semibold mb-2">الوصف</label>
                    <input type="text" name="description" placeholder="Mercy Hub Multi-Farm"
                        class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white">
                </div>
                <div>
                    <label class="block text-gray-300 text-sm font-semibold mb-2">كود السكربت (Luau)</label>
                    <textarea name="content" required rows="30" placeholder="-- الصق كود السكربت هنا"
                        class="w-full px-4 py-3 bg-gray-950 border border-gray-700 rounded-xl text-emerald-400 text-sm resize-y"></textarea>
                </div>
                <div class="flex gap-3 pt-2">
                    <button type="submit" class="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold rounded-xl">💾 حفظ</button>
                    <a href="/scripts" class="flex-1 py-3 bg-gray-800 text-white font-bold rounded-xl text-center">إلغاء</a>
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
                <a href="/scripts" class="px-5 py-2.5 bg-gray-800 text-white font-bold rounded-xl">← رجوع</a>
            </div>
        </header>
        <div class="p-6">
            <form method="POST" action="/admin/scripts/save" class="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-5">
                <input type="hidden" name="originalName" value="${esc(s.name)}">
                <div>
                    <label class="block text-gray-300 text-sm font-semibold mb-2">الاسم</label>
                    <input type="text" name="name" required pattern="[a-zA-Z0-9_\\-]{1,64}" value="${esc(s.name)}"
                        class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white">
                </div>
                <div>
                    <label class="block text-gray-300 text-sm font-semibold mb-2">الوصف</label>
                    <input type="text" name="description" value="${esc(s.description || '')}"
                        class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white">
                </div>
                <div>
                    <label class="block text-gray-300 text-sm font-semibold mb-2">الكود</label>
                    <textarea name="content" required rows="30"
                        class="w-full px-4 py-3 bg-gray-950 border border-gray-700 rounded-xl text-emerald-400 text-sm">${esc(s.content)}</textarea>
                </div>
                <div class="flex gap-3">
                    <button type="submit" class="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold rounded-xl">💾 حفظ</button>
                    <a href="/scripts" class="flex-1 py-3 bg-gray-800 text-white font-bold rounded-xl text-center">إلغاء</a>
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

    const isNew = !scripts[name];
    scripts[name] = {
        name,
        description: description || '',
        content: String(content),
        updatedAt: Date.now(),
        createdAt: scripts[name]?.createdAt || Date.now(),
        loads: scripts[name]?.loads || 0,
    };
    addLog('script_save', `${isNew ? '➕' : '✏️'} ${name}`);
    res.redirect('/scripts');
});

app.post('/admin/scripts/delete', adminAuth, (req, res) => {
    const { name } = req.body;
    if (scripts[name]) {
        delete scripts[name];
        addLog('script_delete', `🗑️ ${name}`);
    }
    res.redirect('/scripts');
});

// ═══════════════════════════════════════════════════════
// 🚀 Loadstring — بدون حقن
// ═══════════════════════════════════════════════════════
app.get('/load/:name', (req, res) => {
    const s = scripts[req.params.name];
    if (!s) {
        return res.status(404).type('text/plain').send(`warn("[HOST] ❌ السكربت '${req.params.name}' غير موجود")`);
    }

    s.loads = (s.loads || 0) + 1;
    s.lastLoaded = Date.now();

    addLog('load', `⚡ تحميل "${s.name}" (${s.loads})`);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');

    res.send(s.content);
});

// ═══════════════════════════════════════════════════════
// 🔌 APIs
// ═══════════════════════════════════════════════════════

app.post('/api/register', apiAuth, (req, res) => {
    const { robloxId, username, jobId } = req.body;
    if (!robloxId) return res.status(400).json({ error: 'Missing robloxId' });

    const isNew = !users[robloxId];
    users[robloxId] = {
        robloxId: parseInt(robloxId),
        username: username || 'Unknown',
        jobId: jobId || '',
        lastSeen: Date.now(),
        joinedAt: users[robloxId]?.joinedAt || Date.now(),
        money: users[robloxId]?.money || 0,
        bank: users[robloxId]?.bank || 0,
        level: users[robloxId]?.level || 0,
        currentJob: users[robloxId]?.currentJob || 'None',
        farmMode: users[robloxId]?.farmMode || 'None',
    };
    if (isNew) addLog('register', `${username} سجل دخول`);
    res.json({ success: true });
});

// نبضة + استقبال الإحصائيات + إرسال الأوامر
app.post('/api/heartbeat', apiAuth, (req, res) => {
    const { robloxId, username, jobId, money, bank, level, currentJob, farmMode,
            autoFarmATM, autoFarmJob, autoFarmFishing, selectedJob, uptime } = req.body;

    if (!robloxId) return res.status(400).json({ error: 'Missing robloxId' });

    if (!users[robloxId]) {
        users[robloxId] = {
            robloxId: parseInt(robloxId),
            username: username || 'Unknown',
            jobId: jobId || '',
            lastSeen: Date.now(),
            joinedAt: Date.now(),
            money: 0, bank: 0, level: 0,
            currentJob: 'None', farmMode: 'None',
        };
        addLog('register', `${username || robloxId} انضم`);
    }

    users[robloxId].lastSeen = Date.now();
    if (username) users[robloxId].username = username;
    if (jobId) users[robloxId].jobId = jobId;
    if (typeof money === 'number') users[robloxId].money = money;
    if (typeof bank === 'number') users[robloxId].bank = bank;
    if (typeof level === 'number') users[robloxId].level = level;
    if (currentJob) users[robloxId].currentJob = currentJob;
    if (farmMode) users[robloxId].farmMode = farmMode;
    if (typeof uptime === 'number') users[robloxId].uptime = uptime;

    // سحب الأوامر المعلقة
    const pendingCmds = commands[robloxId] || [];
    commands[robloxId] = [];

    res.json({
        success: true,
        commands: pendingCmds,
        serverTime: Date.now(),
    });
});

// ═══════════════════════════════════════════════════════
// 🎛️ Admin Actions
// ═══════════════════════════════════════════════════════
app.post('/admin/player/command', adminAuth, (req, res) => {
    const { userId, cmd } = req.body;
    if (!userId || !cmd) return res.redirect('/players');

    if (!commands[userId]) commands[userId] = [];
    commands[userId].push(cmd);

    addLog('command', `📤 أمر "${cmd}" → ${userId}`);
    res.redirect('/players');
});

app.post('/admin/broadcast/command', adminAuth, (req, res) => {
    const { cmd } = req.body;
    if (!cmd) return res.redirect('/players');

    const online = getOnlineUsers();
    for (const u of online) {
        if (!commands[u.robloxId]) commands[u.robloxId] = [];
        commands[u.robloxId].push(cmd);
    }

    addLog('command', `📢 أمر جماعي "${cmd}" → ${online.length} لاعب`);
    res.redirect('/players');
});

// ═══════════════════════════════════════════════════════
// 🧹 Cleanup
// ═══════════════════════════════════════════════════════
setInterval(() => {
    const now = Date.now();
    for (const id in users) {
        if (now - users[id].lastSeen > 60 * 60 * 1000) {
            delete users[id];
        }
    }
}, 60000);

// ═══════════════════════════════════════════════════════
// 🚀 Start
// ═══════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log('');
        console.log('╔══════════════════════════════════════════════╗');
        console.log('║  🚀 Trade Host v7.0 — Per-Player Controls    ║');
        console.log('╠══════════════════════════════════════════════╣');
        console.log(`║  🌐 http://localhost:${PORT}/dashboard`);
        console.log(`║  🔑 API: ${API_KEY}`);
        console.log(`║  👑 Admin: ${ADMIN_PASSWORD}`);
        console.log('╚══════════════════════════════════════════════╝');
    });
}

module.exports = app;

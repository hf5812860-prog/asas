// ═══════════════════════════════════════════════════════
// Roblox Trade Host v5.1 — Full Trade Room Support + HTTPS Fix
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
const TRADE_EXPIRE   = 30 * 1000;
const ROOM_EXPIRE    = 30 * 60 * 1000;

// ═══════════════════════════════════════════════════════
// 🗄️ Database
// ═══════════════════════════════════════════════════════
const scripts       = {};
const users         = {};
const trades        = {};
const tradeRequests = {};
const rooms         = {};
const conversations = {};
const logs          = [];
const timeline      = [];

let totalTrades = 0;
let totalMessages = 0;
let totalLoads = 0;
let totalRooms = 0;

// ═══════════════════════════════════════════════════════
// 🛠️ Helpers
// ═══════════════════════════════════════════════════════
function isOnline(u) { return u && (Date.now() - u.lastSeen < ONLINE_TIMEOUT); }
function getOnlineUsers() { return Object.values(users).filter(isOnline); }

function activeTrades() {
    const now = Date.now();
    return Object.values(trades).filter(t => t.status === 'pending' && now - t.createdAt < TRADE_EXPIRE)
        .sort((a, b) => b.createdAt - a.createdAt);
}

function recentPosters() {
    const now = Date.now();
    return Object.values(trades).filter(t => now - t.createdAt < 5 * 60 * 1000);
}

function activeRooms() {
    const now = Date.now();
    return Object.values(rooms).filter(r => !r.leftBy && now - r.createdAt < ROOM_EXPIRE);
}

function addLog(type, message) {
    logs.unshift({ type, message, time: Date.now() });
    if (logs.length > 200) logs.length = 200;
}

function addTimeline() {
    timeline.push({
        time: Date.now(),
        online: getOnlineUsers().length,
        trades: activeTrades().length,
        conversations: Object.keys(conversations).length,
        rooms: activeRooms().length,
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

function convKey(a, b) {
    a = String(a); b = String(b);
    return a < b ? a + "_" + b : b + "_" + a;
}

function genId(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
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

// ✅ دالة موحدة للحصول على الرابط الصحيح (HTTPS دائماً)
function getHostUrl(req) {
    const host = req.get('host') || 'localhost';
    // Render / Vercel دائماً يستخدمان HTTPS في الإنتاج
    return 'https://' + host;
}

setInterval(addTimeline, 10000);

// ═══════════════════════════════════════════════════════
// 🎨 Layout
// ═══════════════════════════════════════════════════════
function layout({ title, page, content }) {
    const navItems = [
        { href: '/dashboard', icon: '📊', label: 'لوحة التحكم', id: 'dashboard' },
        { href: '/scripts',   icon: '📜', label: 'السكربتات',   id: 'scripts' },
        { href: '/trades',    icon: '🔄', label: 'العروض',      id: 'trades' },
        { href: '/rooms',     icon: '🤝', label: 'الغرف',       id: 'rooms' },
        { href: '/chats',     icon: '💬', label: 'الدردشات',    id: 'chats' },
        { href: '/users',     icon: '👥', label: 'اللاعبين',    id: 'users' },
        { href: '/logs',      icon: '📋', label: 'السجلات',     id: 'logs' },
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
                    <div class="text-xs text-gray-500">v5.1</div>
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
    const active = activeTrades();
    const recentPostersList = recentPosters();
    const uniquePosters = new Set(recentPostersList.map(t => t.fromId));
    const activeConversations = Object.keys(conversations).length;
    const pendingRequests = Object.values(tradeRequests).filter(r => r.status === 'pending').length;
    const activeR = activeRooms();

    const stats = [
        { icon: '🟢', num: online.length, lbl: 'متصل الآن', color: 'emerald' },
        { icon: '📤', num: uniquePosters.size, lbl: 'ناشرون (5د)', color: 'blue' },
        { icon: '🔄', num: active.length, lbl: 'عروض نشطة', color: 'orange' },
        { icon: '🤝', num: activeR.length, lbl: 'غرف نشطة', color: 'pink' },
        { icon: '💬', num: activeConversations, lbl: 'محادثات', color: 'cyan' },
        { icon: '📨', num: pendingRequests, lbl: 'طلبات معلقة', color: 'purple' },
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
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">${statsHTML}</div>
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
                        { label: 'عروض', data: timeline.map(t => t.trades), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', tension: 0.4, fill: true },
                        { label: 'محادثات', data: timeline.map(t => t.conversations), borderColor: '#06b6d4', backgroundColor: 'rgba(6,182,212,0.1)', tension: 0.4, fill: true },
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
// 📜 Scripts Management
// ═══════════════════════════════════════════════════════
app.get('/scripts', adminAuth, (req, res) => {
    const list = Object.values(scripts).sort((a, b) => b.updatedAt - a.updatedAt);
    const host = getHostUrl(req);  // ✅ HTTPS

    const html = list.length === 0
        ? `<div class="text-center py-16 col-span-full">
             <div class="text-6xl mb-4">📜</div>
             <div class="text-gray-400 mb-2">لا توجد سكربتات</div>
             <div class="text-gray-500 text-sm mb-6">ارفع السكربت — راح يرتبط تلقائياً</div>
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
                            <span class="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded font-bold">🔗 تلقائي</span>
                        </div>
                        <p class="text-gray-400 text-sm mt-1">${esc(s.description || 'بدون وصف')}</p>
                    </div>
                    <div class="text-right">
                        <div class="text-2xl font-bold text-emerald-400">${s.loads || 0}</div>
                        <div class="text-xs text-gray-500">تحميل</div>
                    </div>
                </div>
                <div class="bg-gray-950 border border-gray-800 rounded-xl p-3 mb-3">
                    <div class="text-xs text-gray-500 mb-2">🔗 loadstring — يشتغل مباشرة:</div>
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
                    <p class="text-gray-500 text-sm mt-1">ارفع كود Luau كما هو — يتصل تلقائياً</p>
                </div>
                <a href="/scripts/new" class="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold rounded-xl">+ ارفع سكربت</a>
            </div>
        </header>
        <div class="p-6">
            <div class="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 mb-6">
                <div class="flex items-start gap-3">
                    <span class="text-2xl">✨</span>
                    <div>
                        <div class="font-bold text-blue-400 mb-1">الربط التلقائي مُفعّل</div>
                        <div class="text-sm text-gray-300">
                            السيرفر يستبدل <code class="text-emerald-400">API_URL</code> و <code class="text-emerald-400">API_KEY</code> تلقائياً.
                            لا حاجة لتعديل يدوي.
                        </div>
                    </div>
                </div>
            </div>
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
            <div class="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 mb-6">
                <div class="flex items-start gap-3">
                    <span class="text-2xl">🔗</span>
                    <div>
                        <div class="font-bold text-emerald-400 mb-1">الربط التلقائي</div>
                        <div class="text-sm text-gray-300">
                            الصق السكربت <b>كما هو</b>. السيرفر يستبدل الروابط تلقائياً.
                        </div>
                    </div>
                </div>
            </div>
            <form method="POST" action="/admin/scripts/save" class="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-5">
                <div>
                    <label class="block text-gray-300 text-sm font-semibold mb-2">اسم السكربت (إنجليزي بدون مسافات)</label>
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
                    <textarea name="content" required rows="30" placeholder="-- الصق كود السكربت هنا كما هو"
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
// 🚀 Loadstring — Auto-Injection (✅ مع HTTPS Fix)
// ═══════════════════════════════════════════════════════
app.get('/load/:name', (req, res) => {
    const s = scripts[req.params.name];
    if (!s) {
        return res.status(404).type('text/plain').send(`warn("[HOST] ❌ السكربت '${req.params.name}' غير موجود")`);
    }

    s.loads = (s.loads || 0) + 1;
    s.lastLoaded = Date.now();
    totalLoads++;

    addLog('load', `⚡ تحميل "${s.name}" (${s.loads})`);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // ✅✅✅ الإصلاح المهم: HTTPS دائماً
    const host = req.get('host') || 'localhost';
    const hostUrl = 'https://' + host;

    const injection = `-- ═══════════════════════════════════════════
-- ${s.name}
-- Server: ${hostUrl}
-- Time: ${new Date().toISOString()}
-- ═══════════════════════════════════════════
-- 🔗 AUTO-INJECTED
-- ═══════════════════════════════════════════
_G = _G or {}
_G.HOST_URL = "${hostUrl}"
_G.HOST_KEY = "${API_KEY}"
_G.SCRIPT_NAME = "${s.name}"
-- ═══════════════════════════════════════════\n\n`;

    let content = s.content;

    // استبدال API_URL → _G.HOST_URL
    content = content.replace(
        /(\bAPI_URL\s*=\s*)["'][^"'\n]*["']/g,
        '$1_G.HOST_URL'
    );
    // استبدال API_KEY → _G.HOST_KEY
    content = content.replace(
        /(\bAPI_KEY\s*=\s*)["'][^"'\n]*["']/g,
        '$1_G.HOST_KEY'
    );
    // استبدال BASE_URL (احتياطي)
    content = content.replace(
        /(\bBASE_URL\s*=\s*)["'][^"'\n]*["']/g,
        '$1_G.HOST_URL'
    );

    res.send(injection + content);
});

// ═══════════════════════════════════════════════════════
// 🔌 APIs
// ═══════════════════════════════════════════════════════
app.get('/dashboard/stats', apiAuth, (req, res) => {
    res.json({
        online: getOnlineUsers().length,
        totalUsers: Object.keys(users).length,
        activeTrades: activeTrades().length,
        activeRooms: activeRooms().length,
        totalTrades,
        totalMessages,
        totalRooms,
        conversations: Object.keys(conversations).length,
        totalLoads,
        uptime: Date.now() - START_TIME,
    });
});

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
        tradesCreated: users[robloxId]?.tradesCreated || 0,
        messagesSent: users[robloxId]?.messagesSent || 0,
    };
    if (isNew) addLog('register', `${username} سجل دخول`);
    res.json({ success: true });
});

app.post('/api/heartbeat', apiAuth, (req, res) => {
    const { robloxId, jobId } = req.body;
    if (!robloxId) return res.status(400).json({ error: 'Missing robloxId' });
    if (!users[robloxId]) {
        users[robloxId] = { robloxId: parseInt(robloxId), username: 'Unknown', jobId: jobId || '', lastSeen: Date.now(), tradesCreated: 0, messagesSent: 0 };
    } else {
        users[robloxId].lastSeen = Date.now();
        if (jobId) users[robloxId].jobId = jobId;
    }
    res.json({ success: true });
});

app.post('/api/trade/create', apiAuth, (req, res) => {
    const { fromId, fromName, myItems, theirItems, note, jobId } = req.body;
    if (!fromId) return res.status(400).json({ error: 'Missing fromId' });

    const id = genId('tr');
    const trade = {
        id,
        fromId: parseInt(fromId),
        fromName: fromName || 'Unknown',
        myItems: Array.isArray(myItems) ? myItems : [],
        theirItems: Array.isArray(theirItems) ? theirItems : [],
        note: note || '',
        jobId: jobId || '',
        status: 'pending',
        createdAt: Date.now(),
    };
    trades[id] = trade;
    totalTrades++;
    if (users[fromId]) users[fromId].tradesCreated = (users[fromId].tradesCreated || 0) + 1;
    addLog('create', `${fromName} نشر عرض`);
    res.json({ success: true, tradeId: id, trade });
});

app.get('/api/trades/all', apiAuth, (req, res) => res.json(activeTrades()));

app.post('/api/trade/:id/delete', apiAuth, (req, res) => {
    const trade = trades[req.params.id];
    if (!trade) return res.status(404).json({ error: 'Not found' });
    delete trades[req.params.id];
    addLog('delete', `${trade.fromName} حذف عرضه`);
    res.json({ success: true });
});

app.post('/api/trade/request', apiAuth, (req, res) => {
    const { tradeId, fromId, fromName, toId, toName, myItems, myJobId, jobId } = req.body;
    if (!fromId || !toId) return res.status(400).json({ error: 'Missing data' });

    const id = genId('req');
    tradeRequests[id] = {
        id, tradeId,
        fromId: parseInt(fromId), fromName,
        toId: parseInt(toId), toName,
        myItems: Array.isArray(myItems) ? myItems : [],
        myJobId: myJobId || jobId || '',
        ownerJobId: trades[tradeId]?.jobId || '',
        status: 'pending',
        createdAt: Date.now(),
    };
    addLog('request', `${fromName} → ${toName}`);
    res.json({ success: true, requestId: id });
});

app.get('/api/trade/requests/list/:userId', apiAuth, (req, res) => {
    const uid = parseInt(req.params.userId);
    const list = Object.values(tradeRequests)
        .filter(r => (r.fromId === uid || r.toId === uid) && r.status !== 'rejected' && r.status !== 'cancelled')
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(r => ({
            ...r,
            jobId: r.ownerJobId || r.myJobId || '',
            ownerJobId: r.ownerJobId || '',
            fromJobId: r.myJobId || '',
        }));
    res.json(list);
});

app.post('/api/trade/request/accept', apiAuth, (req, res) => {
    const { requestId, userId } = req.body;
    const r = tradeRequests[requestId];
    if (!r) return res.status(404).json({ error: 'Not found' });

    r.status = 'accepted';
    r.acceptedAt = Date.now();

    for (const id in tradeRequests) {
        const other = tradeRequests[id];
        if (id !== requestId && other.tradeId === r.tradeId && other.status === 'pending') {
            other.status = 'rejected';
            other.rejectedAt = Date.now();
            other.rejectedByAuto = true;
        }
    }

    for (const id in trades) {
        const t = trades[id];
        if (t.fromId === r.fromId) {
            delete trades[id];
        }
    }

    const roomId = genId('room');
    rooms[roomId] = {
        id: roomId,
        createdAt: Date.now(),
        otherId: r.fromId,
        ownerId: r.toId,
        leftBy: null,
        leftAt: null,
        requestId: requestId,
    };
    totalRooms++;

    const key = convKey(r.fromId, r.toId);
    if (!conversations[key]) conversations[key] = [];

    addLog('accept', `✅ ${r.toName} قبل ${r.fromName}`);

    res.json({
        success: true,
        requestId: r.id,
        roomId: roomId,
        otherId: r.fromId,
        otherName: r.fromName,
        jobId: r.ownerJobId || '',
        fromJobId: r.myJobId || '',
    });
});

app.post('/api/trade/request/reject', apiAuth, (req, res) => {
    const { requestId } = req.body;
    const r = tradeRequests[requestId];
    if (!r) return res.status(404).json({ error: 'Not found' });
    r.status = 'rejected';
    r.rejectedAt = Date.now();
    addLog('reject', `${r.toName} رفض ${r.fromName}`);
    res.json({ success: true });
});

app.post('/api/trade/cancel', apiAuth, (req, res) => {
    const { tradeId } = req.body;
    const r = tradeRequests[tradeId];
    if (r) { r.status = 'cancelled'; r.cancelledAt = Date.now(); }
    res.json({ success: true });
});

app.post('/api/trade/room/leave', apiAuth, (req, res) => {
    const { roomId, userId, otherId } = req.body;
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'Room not found' });

    room.leftBy = parseInt(userId);
    room.leftAt = Date.now();
    addLog('room_leave', `🚪 ${userId} خرج من الغرفة ${roomId}`);

    res.json({ success: true });
});

app.get('/api/trade/room/:roomId/status', apiAuth, (req, res) => {
    const room = rooms[req.params.roomId];
    if (!room) return res.json({ active: false, leftBy: null, exists: false });

    const isActive = !room.leftBy && (Date.now() - room.createdAt < ROOM_EXPIRE);
    res.json({
        active: isActive,
        leftBy: room.leftBy,
        leftAt: room.leftAt,
        createdAt: room.createdAt,
        exists: true,
    });
});

app.get('/api/dm/conversations/:userId', apiAuth, (req, res) => {
    const uid = parseInt(req.params.userId);
    const result = [];
    const seen = new Set();

    for (const key in conversations) {
        const [a, b] = key.split('_').map(Number);
        if (a === uid || b === uid) {
            const otherId = a === uid ? b : a;
            if (seen.has(otherId)) continue;
            seen.add(otherId);
            const msgs = conversations[key];
            result.push({
                userId: otherId,
                name: users[otherId]?.username || 'Player' + otherId,
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
        result.push({ userId: otherId, name: otherName, lastMsg: '— جديدة —', lastTime: r.acceptedAt || r.createdAt });
    }
    result.sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));
    res.json(result);
});

app.get('/api/dm/messages/:fromId/:toId', apiAuth, (req, res) => {
    const key = convKey(req.params.fromId, req.params.toId);
    res.json({ messages: conversations[key] || [] });
});

app.post('/api/dm/send', apiAuth, (req, res) => {
    const { fromId, fromName, toId, toName, message } = req.body;
    if (!fromId || !toId || !message) return res.status(400).json({ error: 'Missing data' });

    const key = convKey(fromId, toId);
    if (!conversations[key]) conversations[key] = [];
    conversations[key].push({
        fromId: parseInt(fromId),
        fromName: fromName || 'Unknown',
        toId: parseInt(toId),
        toName: toName || 'Unknown',
        message: String(message).trim(),
        time: Date.now(),
    });
    if (conversations[key].length > 500) conversations[key].splice(0, conversations[key].length - 500);

    totalMessages++;
    if (users[fromId]) users[fromId].messagesSent = (users[fromId].messagesSent || 0) + 1;

    const msgStr = String(message).trim();
    if (msgStr !== '[[JOIN]]' && msgStr !== '[[LEFT]]') {
        addLog('dm', `${fromName} → ${toName}`);
    }
    res.json({ success: true });
});

// ═══════════════════════════════════════════════════════
// 📄 Trades / Rooms / Chats / Users / Logs Pages
// ═══════════════════════════════════════════════════════
app.get('/trades', adminAuth, (req, res) => {
    const allList = Object.values(trades).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
    const active = activeTrades();
    const html = allList.length === 0
        ? '<div class="text-center py-12 text-gray-500">لا توجد عروض</div>'
        : allList.map(t => {
            const age = Math.floor((Date.now() - t.createdAt) / 1000);
            const isActive = t.status === 'pending' && age < 30;
            return `
                <div class="bg-gray-900/60 border ${isActive ? 'border-emerald-500/50' : 'border-gray-800'} rounded-xl p-4 mb-3">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-3">
                            <img src="https://www.roblox.com/headshot-thumbnail/image?userId=${t.fromId}&width=150&height=150&format=png" class="w-10 h-10 rounded-full border-2 ${isActive ? 'border-emerald-500' : 'border-gray-700'}">
                            <div><div class="font-bold text-white">${esc(t.fromName)}</div><div class="text-xs text-gray-500">منذ ${age} ثانية</div></div>
                        </div>
                        <span class="px-3 py-1 rounded-lg text-xs font-bold ${isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-700 text-gray-400'}">${isActive ? '🟢 نشط' : '⚫ منتهي'}</span>
                    </div>
                    <div class="text-sm text-gray-300 mb-2"><span class="text-gray-500">🚗 يعطي:</span> ${(t.myItems || []).map(i => esc(String(i).split('||')[0])).join(' • ') || '—'}</div>
                    <div class="text-sm text-gray-300"><span class="text-gray-500">🎯 يبي:</span> ${(t.theirItems || []).join(' • ') || 'أي عرض'}</div>
                </div>`;
        }).join('');
    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <div class="flex items-center justify-between">
                <div><h1 class="text-2xl font-bold text-white">🔄 العروض</h1><p class="text-gray-500 text-sm mt-1">آخر 50 عرض</p></div>
                <span class="px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm">${active.length} نشط</span>
            </div>
        </header>
        <div class="p-6">${html}</div>
    `;
    res.send(layout({ title: 'العروض', page: 'trades', content }));
});

app.get('/rooms', adminAuth, (req, res) => {
    const allRooms = Object.values(rooms).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
    const activeR = activeRooms();
    const html = allRooms.length === 0
        ? '<div class="text-center py-12 text-gray-500">لا توجد غرف</div>'
        : allRooms.map(r => {
            const isActive = !r.leftBy && (Date.now() - r.createdAt < ROOM_EXPIRE);
            const other = users[r.otherId];
            const owner = users[r.ownerId];
            return `
                <div class="bg-gray-900/60 border ${isActive ? 'border-pink-500/50' : 'border-gray-800'} rounded-xl p-4 mb-3">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center gap-3">
                            <img src="https://www.roblox.com/headshot-thumbnail/image?userId=${r.otherId}&width=150&height=150&format=png" class="w-10 h-10 rounded-full border-2 border-blue-500">
                            <div><div class="font-bold text-white">${esc(other?.username || 'ID:' + r.otherId)} ↔ ${esc(owner?.username || 'ID:' + r.ownerId)}</div><div class="text-xs text-gray-500">منذ ${timeAgo(r.createdAt)}</div></div>
                        </div>
                        <span class="px-3 py-1 rounded-lg text-xs font-bold ${isActive ? 'bg-pink-500/20 text-pink-400' : 'bg-gray-700 text-gray-400'}">${isActive ? '🟢 نشطة' : '⚫ منتهية'}</span>
                    </div>
                </div>`;
        }).join('');
    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <div class="flex items-center justify-between">
                <div><h1 class="text-2xl font-bold text-white">🤝 الغرف</h1><p class="text-gray-500 text-sm mt-1">آخر 50 غرفة</p></div>
                <span class="px-3 py-2 bg-pink-500/10 border border-pink-500/30 rounded-lg text-pink-400 text-sm">${activeR.length} نشطة</span>
            </div>
        </header>
        <div class="p-6">${html}</div>
    `;
    res.send(layout({ title: 'الغرف', page: 'rooms', content }));
});

app.get('/chats', adminAuth, (req, res) => {
    const convList = Object.entries(conversations).map(([key, msgs]) => {
        const [a, b] = key.split('_').map(Number);
        return { key, userA: { id: a, name: users[a]?.username || 'Player' + a }, userB: { id: b, name: users[b]?.username || 'Player' + b }, messages: msgs, lastMsg: msgs.length ? msgs[msgs.length - 1] : null, count: msgs.length };
    }).sort((a, b) => (b.lastMsg?.time || 0) - (a.lastMsg?.time || 0));
    const html = convList.length === 0 ? '<div class="text-center py-12 text-gray-500">لا توجد محادثات</div>'
        : convList.map(c => `
            <div class="bg-gray-900/60 border border-gray-800 rounded-xl p-5 mb-4">
                <div class="font-bold text-white mb-2">${esc(c.userA.name)} ↔ ${esc(c.userB.name)}</div>
                <div class="text-xs text-gray-500 mb-2">${c.count} رسالة</div>
                ${c.lastMsg ? `<div class="bg-gray-800/50 rounded-lg p-3 text-sm text-gray-200">${esc(c.lastMsg.message)}</div>` : ''}
            </div>
        `).join('');
    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <h1 class="text-2xl font-bold text-white">💬 الدردشات</h1>
        </header>
        <div class="p-6">${html}</div>
    `;
    res.send(layout({ title: 'الدردشات', page: 'chats', content }));
});

app.get('/users', adminAuth, (req, res) => {
    const list = Object.values(users).sort((a, b) => b.lastSeen - a.lastSeen);
    const rowsHTML = list.length === 0
        ? '<tr><td colspan="5" class="text-center py-12 text-gray-500">لا يوجد لاعبين</td></tr>'
        : list.map(u => `
            <tr class="border-t border-gray-800 hover:bg-gray-800/30">
                <td class="p-4">
                    <div class="flex items-center gap-3">
                        <img src="https://www.roblox.com/headshot-thumbnail/image?userId=${u.robloxId}&width=150&height=150&format=png" class="w-10 h-10 rounded-full border-2 ${isOnline(u) ? 'border-emerald-500' : 'border-gray-700'}">
                        <div><div class="text-white font-semibold">${esc(u.username)}</div><div class="text-xs ${isOnline(u) ? 'text-emerald-400' : 'text-gray-500'}">${isOnline(u) ? '🟢 متصل' : '⚫ غير متصل'}</div></div>
                    </div>
                </td>
                <td class="p-4 text-gray-400 font-mono text-xs">${u.robloxId}</td>
                <td class="p-4 text-gray-300 text-xs">${u.tradesCreated || 0}</td>
                <td class="p-4 text-gray-300 text-xs">${u.messagesSent || 0}</td>
                <td class="p-4 text-gray-300 text-xs">${timeAgo(u.lastSeen)}</td>
            </tr>
        `).join('');
    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <h1 class="text-2xl font-bold text-white">👥 اللاعبين</h1>
            <p class="text-gray-500 text-sm mt-1">${list.length} لاعب</p>
        </header>
        <div class="p-6">
            <div class="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
                <table class="w-full text-sm">
                    <thead class="bg-gray-800/50"><tr>
                        <th class="text-right p-4 text-gray-400">اللاعب</th>
                        <th class="text-right p-4 text-gray-400">ID</th>
                        <th class="text-right p-4 text-gray-400">عروض</th>
                        <th class="text-right p-4 text-gray-400">رسائل</th>
                        <th class="text-right p-4 text-gray-400">آخر ظهور</th>
                    </tr></thead>
                    <tbody>${rowsHTML}</tbody>
                </table>
            </div>
        </div>
    `;
    res.send(layout({ title: 'اللاعبين', page: 'users', content }));
});

app.get('/logs', adminAuth, (req, res) => {
    const icons = { register: '👤', create: '📤', delete: '🗑️', dm: '✉️', request: '📨', accept: '✅', reject: '❌', load: '⚡', script_save: '💾', script_delete: '🗑️', room_leave: '🚪' };
    const html = logs.length === 0 ? '<div class="text-center py-12 text-gray-500">لا توجد أحداث</div>'
        : logs.slice(0, 100).map(l => `
            <div class="p-3 border-b border-gray-800 flex items-center gap-3">
                <span class="text-lg">${icons[l.type] || '📌'}</span>
                <span class="text-sm text-gray-300 flex-1">${esc(l.message)}</span>
                <span class="text-xs text-gray-500">${timeAgo(l.time)}</span>
            </div>
        `).join('');
    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <h1 class="text-2xl font-bold text-white">📋 السجلات</h1>
        </header>
        <div class="p-6">
            <div class="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden max-h-[700px] overflow-y-auto">${html}</div>
        </div>
    `;
    res.send(layout({ title: 'السجلات', page: 'logs', content }));
});

// ═══════════════════════════════════════════════════════
// 🧹 Cleanup
// ═══════════════════════════════════════════════════════
setInterval(() => {
    const now = Date.now();
    for (const id in trades) {
        if (now - trades[id].createdAt > 5 * 60 * 1000) delete trades[id];
    }
    for (const id in tradeRequests) {
        if (now - tradeRequests[id].createdAt > 10 * 60 * 1000) delete tradeRequests[id];
    }
    for (const id in rooms) {
        if (now - rooms[id].createdAt > ROOM_EXPIRE) delete rooms[id];
    }
}, 30000);

// ═══════════════════════════════════════════════════════
// 🚀 Start
// ═══════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log('');
        console.log('╔══════════════════════════════════════════════╗');
        console.log('║  🚀 Trade Host v5.1 — HTTPS Fix Edition      ║');
        console.log('╠══════════════════════════════════════════════╣');
        console.log(`║  🌐 http://localhost:${PORT}/dashboard`);
        console.log(`║  🔑 API: ${API_KEY}`);
        console.log(`║  👑 Admin: ${ADMIN_PASSWORD}`);
        console.log('╚══════════════════════════════════════════════╝');
    });
}

module.exports = app;

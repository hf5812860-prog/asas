// ═══════════════════════════════════════════════════════
// Roblox Script Host v6.0 — Clean Edition
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
const ONLINE_TIMEOUT = 90 * 1000; // 90 ثانية — يسامح لو تأخر heartbeat

// ═══════════════════════════════════════════════════════
// 🗄️ Database (ذاكرة)
// ═══════════════════════════════════════════════════════
const scripts  = {};
const users    = {};
const logs     = [];
const timeline = [];

let totalLoads = 0;

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
    timeline.push({ time: Date.now(), online: getOnlineUsers().length });
    if (timeline.length > 60) timeline.shift();
}

function adminAuth(req, res, next) {
    const token = req.cookies.admin_token || req.headers['x-admin-token'];
    if (!token || token !== SESSION_SECRET) return res.redirect('/login');
    next();
}

function apiAuth(req, res, next) {
    // يقبل من الهيدر أو من query string (عشان السكربتات)
    const key = req.headers['x-api-key'] || req.query.key;
    if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
    next();
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

function validName(n) { return /^[a-zA-Z0-9_\-]{1,64}$/.test(n); }

setInterval(addTimeline, 10000);

// ═══════════════════════════════════════════════════════
// 🎨 Layout
// ═══════════════════════════════════════════════════════
function layout({ title, page, content }) {
    const navItems = [
        { href: '/dashboard', icon: '📊', label: 'لوحة التحكم', id: 'dashboard' },
        { href: '/scripts',   icon: '📜', label: 'السكربتات',   id: 'scripts' },
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
<title>${esc(title)} — Script Host</title>
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
                    <div class="font-bold text-white">Script Host</div>
                    <div class="text-xs text-gray-500">v6.0</div>
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
        <h1 class="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Script Host</h1>
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
    const scriptCount = Object.keys(scripts).length;

    const stats = [
        { icon: '🟢', num: online.length, lbl: 'متصل الآن',     color: 'emerald' },
        { icon: '📜', num: scriptCount,   lbl: 'عدد السكربتات', color: 'blue' },
        { icon: '⚡', num: totalLoads,    lbl: 'مرات التحميل',  color: 'orange' },
        { icon: '👥', num: Object.keys(users).length, lbl: 'إجمالي اللاعبين', color: 'purple' },
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
        : online.sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 15).map(u => `
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
                <div class="p-4 max-h-96 overflow-auto">${onlineHTML}</div>
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
                        { label: 'متصلين', data: timeline.map(t => t.online), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', tension: 0.4, fill: true }
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
    const host = req.protocol + '://' + req.get('host');

    const html = list.length === 0
        ? `<div class="text-center py-16 col-span-full">
             <div class="text-6xl mb-4">📜</div>
             <div class="text-gray-400 mb-2">لا توجد سكربتات</div>
             <div class="text-gray-500 text-sm mb-6">ارفع السكربت — راح يرتبط تلقائياً بالسيرفر</div>
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
                            السيرفر يستبدل <code class="text-emerald-400">HOST_URL</code> و <code class="text-emerald-400">HOST_KEY</code> تلقائياً.
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
                    <label class="block text-gray-300 text-sm font-semibold mb-2">اسم السكربت</label>
                    <input type="text" name="name" required pattern="[a-zA-Z0-9_\\-]{1,64}" placeholder="my-script"
                        class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white">
                </div>
                <div>
                    <label class="block text-gray-300 text-sm font-semibold mb-2">الوصف</label>
                    <input type="text" name="description" placeholder="وصف قصير"
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
// 🚀 Loadstring — Auto-Injection
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

    const hostUrl = req.protocol + '://' + req.get('host');

    const injection = `-- ═══════════════════════════════════════════
-- ${s.name}
-- Server: ${hostUrl}
-- Time: ${new Date().toISOString()}
-- 🔗 AUTO-INJECTED
-- ═══════════════════════════════════════════
_G = _G or {}
_G.HOST_URL = "${hostUrl}"
_G.HOST_KEY = "${API_KEY}"
_G.SCRIPT_NAME = "${s.name}"
-- ═══════════════════════════════════════════\n\n`;

    let content = s.content;

    // استبدال تلقائي للروابط القديمة
    content = content.replace(/(\bHOST_URL\s*=\s*)(_G\.HOST_URL\s*or\s*)?["'][^"'\n]*["']/g, '$1_G.HOST_URL or "http://localhost:3000"');
    content = content.replace(/(\bHOST_KEY\s*=\s*)(_G\.HOST_KEY\s*or\s*)?["'][^"'\n]*["']/g, '$1_G.HOST_KEY or ""');
    content = content.replace(/(\bAPI_URL\s*=\s*)["'][^"'\n]*["']/g, '$1_G.HOST_URL');
    content = content.replace(/(\bAPI_KEY\s*=\s*)["'][^"'\n]*["']/g, '$1_G.HOST_KEY');
    content = content.replace(/(\bBASE_URL\s*=\s*)["'][^"'\n]*["']/g, '$1_G.HOST_URL');

    res.send(injection + content);
});

// ═══════════════════════════════════════════════════════
// 🔌 APIs — Heartbeat & Register
// ═══════════════════════════════════════════════════════
app.get('/dashboard/stats', apiAuth, (req, res) => {
    res.json({
        online: getOnlineUsers().length,
        totalUsers: Object.keys(users).length,
        totalScripts: Object.keys(scripts).length,
        totalLoads,
        uptime: Date.now() - START_TIME,
    });
});

// ✅ يقبل robloxId أو userId
function extractUser(body) {
    const id = body.robloxId || body.userId || body.userid || body.RobloxId;
    const name = body.username || body.name || body.UserName || 'Unknown';
    return { id: id ? parseInt(id) : null, name: String(name) };
}

app.post('/api/register', apiAuth, (req, res) => {
    const { id, name } = extractUser(req.body);
    if (!id) return res.status(400).json({ error: 'Missing robloxId/userId' });
    const { jobId } = req.body;
    const isNew = !users[id];
    users[id] = {
        robloxId: id,
        username: name,
        jobId: jobId || '',
        lastSeen: Date.now(),
        joinedAt: users[id]?.joinedAt || Date.now(),
    };
    if (isNew) addLog('register', `👤 ${name} سجل دخول`);
    res.json({ success: true });
});

app.post('/api/heartbeat', apiAuth, (req, res) => {
    const { id, name } = extractUser(req.body);
    if (!id) return res.status(400).json({ error: 'Missing robloxId/userId' });

    const { jobId } = req.body;

    if (!users[id]) {
        users[id] = {
            robloxId: id,
            username: name,
            jobId: jobId || '',
            lastSeen: Date.now(),
            joinedAt: Date.now(),
        };
        addLog('register', `👤 ${name} اتصل (heartbeat)`);
    } else {
        users[id].lastSeen = Date.now();
        users[id].username = name; // حدّث الاسم
        if (jobId) users[id].jobId = jobId;
    }
    res.json({ success: true, time: Date.now() });
});

// ═══════════════════════════════════════════════════════
// 👥 Users Page
// ═══════════════════════════════════════════════════════
app.get('/users', adminAuth, (req, res) => {
    const list = Object.values(users).sort((a, b) => b.lastSeen - a.lastSeen);
    const rowsHTML = list.length === 0
        ? '<tr><td colspan="4" class="text-center py-12 text-gray-500">لا يوجد لاعبين</td></tr>'
        : list.map(u => `
            <tr class="border-t border-gray-800 hover:bg-gray-800/30">
                <td class="p-4">
                    <div class="flex items-center gap-3">
                        <img src="https://www.roblox.com/headshot-thumbnail/image?userId=${u.robloxId}&width=150&height=150&format=png"
                             class="w-10 h-10 rounded-full border-2 ${isOnline(u) ? 'border-emerald-500' : 'border-gray-700'}"
                             onerror="this.style.display='none'">
                        <div>
                            <div class="text-white font-semibold">${esc(u.username)}</div>
                            <div class="text-xs ${isOnline(u) ? 'text-emerald-400' : 'text-gray-500'}">${isOnline(u) ? '🟢 متصل' : '⚫ غير متصل'}</div>
                        </div>
                    </div>
                </td>
                <td class="p-4 text-gray-400 font-mono text-xs">${u.robloxId}</td>
                <td class="p-4 text-gray-300 text-xs">${esc(u.jobId || '—')}</td>
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
                    <thead class="bg-gray-800/50">
                        <tr>
                            <th class="text-right p-4 text-gray-400">اللاعب</th>
                            <th class="text-right p-4 text-gray-400">ID</th>
                            <th class="text-right p-4 text-gray-400">Job ID</th>
                            <th class="text-right p-4 text-gray-400">آخر ظهور</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHTML}</tbody>
                </table>
            </div>
        </div>
    `;
    res.send(layout({ title: 'اللاعبين', page: 'users', content }));
});

// ═══════════════════════════════════════════════════════
// 📋 Logs Page
// ═══════════════════════════════════════════════════════
app.get('/logs', adminAuth, (req, res) => {
    const icons = { register: '👤', load: '⚡', script_save: '💾', script_delete: '🗑️' };
    const html = logs.length === 0
        ? '<div class="text-center py-12 text-gray-500">لا توجد أحداث</div>'
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
    for (const id in users) {
        if (now - users[id].lastSeen > 30 * 60 * 1000) delete users[id];
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
        console.log('║  🚀 Script Host v6.0 — Clean Edition         ║');
        console.log('╠══════════════════════════════════════════════╣');
        console.log(`║  🌐 http://localhost:${PORT}/dashboard`);
        console.log(`║  🔑 API: ${API_KEY}`);
        console.log(`║  👑 Admin: ${ADMIN_PASSWORD}`);
        console.log('╚══════════════════════════════════════════════╝');
    });
}

module.exports = app;

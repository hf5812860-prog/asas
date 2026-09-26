// ═══════════════════════════════════════════════════════
// Roblox Custom Loader v3.0 — Script Hosting + Dashboard
// ═══════════════════════════════════════════════════════
const express      = require('express');
const cookieParser = require('cookie-parser');
const app          = express();

// ═══════════════════════════════════════════════════════
// ⚙️ Middleware
// ═══════════════════════════════════════════════════════
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ type: ['text/*', 'application/json'], limit: '10mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
    if (typeof req.body === 'string' && req.body.trim() && req.path !== '/api/script/save') {
        try { req.body = JSON.parse(req.body); } catch (e) {}
    }
    if (!req.body || typeof req.body !== 'object') req.body = {};
    next();
});

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-admin-token');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ═══════════════════════════════════════════════════════
// 🔐 الإعدادات
// ═══════════════════════════════════════════════════════
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SESSION_SECRET = process.env.SESSION_SECRET || "session-secret-change-me";
const START_TIME     = Date.now();
const ONLINE_TIMEOUT = 2 * 60 * 1000;

// ═══════════════════════════════════════════════════════
// 🗄️ Database (in-memory)
// ═══════════════════════════════════════════════════════
// scripts: { name: { name, content, updatedAt, loads, description } }
const scripts   = {};
const players   = {}; // { robloxId: {...} }
const logs      = []; // آخر 500 حدث
const analytics = []; // زيارات الـ loadstring

// ═══════════════════════════════════════════════════════
// 🛠️ Helpers
// ═══════════════════════════════════════════════════════
function isOnline(u) { return u && (Date.now() - u.lastSeen < ONLINE_TIMEOUT); }
function getOnlineUsers() { return Object.values(players).filter(isOnline); }

function addLog(type, message, data) {
    logs.unshift({ type, message, data: data || null, time: Date.now() });
    if (logs.length > 500) logs.length = 500;
    console.log(`[${type.toUpperCase()}] ${message}`);
}

function adminAuth(req, res, next) {
    const token = req.cookies.admin_token || req.headers['x-admin-token'];
    if (!token || token !== SESSION_SECRET) {
        if (req.headers['x-admin-token']) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        return res.redirect('/login');
    }
    next();
}

function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s} ثانية`;
    if (s < 3600) return `${Math.floor(s / 60)} دقيقة`;
    if (s < 86400) return `${Math.floor(s / 3600)} ساعة`;
    return `${Math.floor(s / 86400)} يوم`;
}

function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function validName(name) {
    return /^[a-zA-Z0-9_\-]{1,64}$/.test(name);
}

// ═══════════════════════════════════════════════════════
// 🎨 Layout
// ═══════════════════════════════════════════════════════
function layout({ title, page, content }) {
    const navItems = [
        { href: '/dashboard',  icon: '📊', label: 'لوحة التحكم',    id: 'dashboard' },
        { href: '/scripts',    icon: '📜', label: 'السكربتات',      id: 'scripts' },
        { href: '/players',    icon: '👥', label: 'اللاعبين',       id: 'players' },
        { href: '/logs',       icon: '📋', label: 'السجلات',        id: 'logs' },
    ];

    const navHTML = navItems.map(item => {
        const active = page === item.id;
        const cls = active
            ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white'
            : 'text-gray-400 hover:bg-gray-800/50';
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
<title>${esc(title)} — Roblox Loader</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=JetBrains+Mono&display=swap" rel="stylesheet">
<style>
    * { font-family: 'Cairo', sans-serif; }
    code, pre, .mono { font-family: 'JetBrains Mono', monospace; }
    body { background: #0a0a12; margin: 0; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #1a1a2e; }
    ::-webkit-scrollbar-thumb { background: #3b82f6; border-radius: 4px; }
    .pulse-dot {
        width: 8px; height: 8px; background: #10b981; border-radius: 50%;
        animation: pulse 1.5s infinite;
    }
    @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.3)} }
    .glow { box-shadow: 0 0 30px rgba(59,130,246,0.15); }
    textarea { font-family: 'JetBrains Mono', monospace; }
</style>
</head>
<body class="min-h-screen text-gray-200">

<div class="flex min-h-screen">
    <aside class="w-64 bg-gray-900/80 border-l border-gray-800 flex-shrink-0 hidden md:flex md:flex-col">
        <div class="p-6 border-b border-gray-800">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <span class="text-2xl">🎮</span>
                </div>
                <div>
                    <div class="font-bold text-white">Custom Loader</div>
                    <div class="text-xs text-gray-500">v3.0.0</div>
                </div>
            </div>
        </div>

        <nav class="flex-1 p-4 space-y-2">
            ${navHTML}
        </nav>

        <div class="p-4 border-t border-gray-800">
            <a href="/logout" class="flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10">
                <span class="text-xl">🚪</span>
                <span class="font-semibold">خروج</span>
            </a>
        </div>
    </aside>

    <main class="flex-1 overflow-auto">
        ${content}
    </main>
</div>

</body>
</html>`;
}

// ═══════════════════════════════════════════════════════
// 🏠 Login
// ═══════════════════════════════════════════════════════
app.get('/login', (req, res) => {
    const err = req.query.error ? `
        <div class="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm text-center">
            ❌ كلمة المرور غير صحيحة
        </div>` : '';

    res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>تسجيل دخول</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
<style>* { font-family: 'Cairo', sans-serif; } body { background: linear-gradient(135deg, #0f0f16 0%, #1a1a2e 50%, #0f0f16 100%); }</style>
</head>
<body class="min-h-screen flex items-center justify-center p-4">
<div class="w-full max-w-md">
<div class="bg-gray-900/60 backdrop-blur border border-gray-800 rounded-2xl shadow-2xl p-8">
    <div class="text-center mb-8">
        <div class="inline-block p-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mb-4">
            <span class="text-5xl">🎮</span>
        </div>
        <h1 class="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Custom Loader</h1>
        <p class="text-gray-400 mt-2 text-sm">أدخل كلمة مرور الأدمن</p>
    </div>
    ${err}
    <form method="POST" action="/login" class="space-y-4">
        <div>
            <label class="block text-gray-300 text-sm mb-2 font-semibold">كلمة المرور</label>
            <input type="password" name="password" required
                class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none transition"
                placeholder="••••••••">
        </div>
        <button type="submit" class="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold rounded-xl hover:opacity-90 transition shadow-lg shadow-blue-500/25">
            🔓 دخول
        </button>
    </form>
</div>
</div>
</body>
</html>`);
});

app.post('/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
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
// 🏠 Dashboard
// ═══════════════════════════════════════════════════════
app.get('/', (req, res) => res.redirect('/dashboard'));

app.get('/dashboard', adminAuth, (req, res) => {
    const online = getOnlineUsers();
    const totalLoads = Object.values(scripts).reduce((s, sc) => s + (sc.loads || 0), 0);
    const recentLogs = logs.slice(0, 10);

    const stats = [
        { icon: '🟢', num: online.length, lbl: 'متصل الآن', color: 'emerald' },
        { icon: '👥', num: Object.keys(players).length, lbl: 'إجمالي اللاعبين', color: 'blue' },
        { icon: '📜', num: Object.keys(scripts).length, lbl: 'السكربتات المنشورة', color: 'purple' },
        { icon: '⚡', num: totalLoads, lbl: 'إجمالي التحميلات', color: 'orange' },
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
        : online.sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 5).map(u => `
            <div class="flex items-center gap-3 p-3 bg-gray-800/40 rounded-xl border border-gray-800">
                <img src="https://www.roblox.com/headshot-thumbnail/image?userId=${u.robloxId}&width=150&height=150&format=png"
                     class="w-10 h-10 rounded-full border-2 border-emerald-500" onerror="this.style.display='none'">
                <div class="flex-1 min-w-0">
                    <div class="font-semibold text-white text-sm truncate">${esc(u.username)}</div>
                    <div class="text-xs text-emerald-400">منذ ${timeAgo(u.lastSeen)}</div>
                </div>
            </div>
        `).join('');

    const logIcons = { load: '⚡', register: '👤', admin: '👑', action: '📌', script_save: '💾' };
    const logsHTML = recentLogs.length === 0
        ? '<div class="text-center py-8 text-gray-500 text-sm">لا توجد أحداث</div>'
        : recentLogs.map(log => `
            <div class="flex items-start gap-3 p-3 bg-gray-800/40 rounded-xl border-r-2 border-blue-500">
                <span class="text-lg">${logIcons[log.type] || '📌'}</span>
                <div class="flex-1 min-w-0">
                    <div class="text-sm text-gray-300 truncate">${esc(log.message)}</div>
                    <div class="text-xs text-gray-500 mt-1">${timeAgo(log.time)}</div>
                </div>
            </div>
        `).join('');

    const scriptsList = Object.values(scripts).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
    const scriptsHTML = scriptsList.length === 0
        ? '<div class="text-center py-8 text-gray-500 text-sm">لا توجد سكربتات — أضف واحد من صفحة السكربتات</div>'
        : scriptsList.map(s => `
            <div class="flex items-center justify-between p-3 bg-gray-800/40 rounded-xl border border-gray-800">
                <div>
                    <div class="font-bold text-white text-sm">📜 ${esc(s.name)}</div>
                    <div class="text-xs text-gray-500 mt-1">${esc(s.description || 'بدون وصف')}</div>
                </div>
                <div class="text-right">
                    <div class="text-emerald-400 font-bold">${s.loads || 0}</div>
                    <div class="text-xs text-gray-500">تحميل</div>
                </div>
            </div>
        `).join('');

    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <div class="flex items-center justify-between">
                <div>
                    <h1 class="text-2xl font-bold text-white">📊 لوحة التحكم</h1>
                    <p class="text-gray-500 text-sm mt-1">مراقبة السكربتات واللاعبين</p>
                </div>
                <div class="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                    <div class="pulse-dot"></div>
                    <span class="text-emerald-400 text-sm font-semibold">متصل</span>
                </div>
            </div>
        </header>

        <div class="p-6 space-y-6">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">${statsHTML}</div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
                    <div class="p-5 border-b border-gray-800 flex items-center justify-between">
                        <h2 class="font-bold text-white flex items-center gap-2"><span class="text-xl">🟢</span> المتصلين الآن</h2>
                        <span class="text-xs text-gray-500">${online.length} لاعب</span>
                    </div>
                    <div class="p-4 space-y-2 max-h-72 overflow-auto">${onlineHTML}</div>
                </div>

                <div class="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
                    <div class="p-5 border-b border-gray-800 flex items-center justify-between">
                        <h2 class="font-bold text-white flex items-center gap-2"><span class="text-xl">📜</span> أحدث السكربتات</h2>
                        <a href="/scripts" class="text-xs text-blue-400 hover:text-blue-300">إدارة السكربتات →</a>
                    </div>
                    <div class="p-4 space-y-2 max-h-72 overflow-auto">${scriptsHTML}</div>
                </div>
            </div>

            <div class="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
                <div class="p-5 border-b border-gray-800 flex items-center justify-between">
                    <h2 class="font-bold text-white flex items-center gap-2"><span class="text-xl">📋</span> آخر الأحداث</h2>
                    <a href="/logs" class="text-xs text-blue-400 hover:text-blue-300">عرض الكل →</a>
                </div>
                <div class="p-4 space-y-2 max-h-96 overflow-auto">${logsHTML}</div>
            </div>
        </div>
    `;

    res.send(layout({ title: 'لوحة التحكم', page: 'dashboard', content }));
});

// ═══════════════════════════════════════════════════════
// 📜 Scripts Management Page
// ═══════════════════════════════════════════════════════
app.get('/scripts', adminAuth, (req, res) => {
    const list = Object.values(scripts).sort((a, b) => b.updatedAt - a.updatedAt);

    const scriptsHTML = list.length === 0
        ? `<div class="text-center py-16">
             <div class="text-6xl mb-4">📜</div>
             <div class="text-gray-400 mb-2">لا توجد سكربتات بعد</div>
             <div class="text-gray-500 text-sm">اضغط "إضافة سكربت" لتبدأ</div>
           </div>`
        : list.map(s => {
            const url = `/load/${s.name}`;
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
                    <div class="text-xs text-gray-500 mb-1">🔗 رابط التحميل:</div>
                    <div class="flex items-center gap-2">
                        <code class="flex-1 text-emerald-400 text-xs overflow-x-auto whitespace-nowrap">loadstring(game:HttpGet("${req.protocol}://${req.get('host')}${url}"))()</code>
                        <button onclick="copyToClipboard('loadstring(game:HttpGet(\\'${req.protocol}://${req.get('host')}${url}\\'))()')" 
                                class="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 text-xs font-semibold whitespace-nowrap">
                            📋 نسخ
                        </button>
                    </div>
                </div>

                <div class="flex gap-2 text-xs text-gray-500 mb-3">
                    <span>آخر تحديث: ${timeAgo(s.updatedAt)}</span>
                    <span>•</span>
                    <span>الحجم: ${s.content.length} حرف</span>
                </div>

                <div class="flex gap-2">
                    <a href="/scripts/edit/${s.name}" class="flex-1 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 text-sm font-semibold text-center">
                        ✏️ تعديل
                    </a>
                    <form method="POST" action="/admin/scripts/delete" onsubmit="return confirm('حذف السكربت؟')" class="flex-1">
                        <input type="hidden" name="name" value="${esc(s.name)}">
                        <button type="submit" class="w-full py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 text-sm font-semibold">
                            🗑️ حذف
                        </button>
                    </form>
                    <a href="${url}" target="_blank" class="flex-1 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 text-sm font-semibold text-center">
                        👁️ معاينة
                    </a>
                </div>
            </div>`;
        }).join('');

    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <div class="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-white">📜 إدارة السكربتات</h1>
                    <p class="text-gray-500 text-sm mt-1">أضف، عدّل، واحصل على روابط loadstring مباشرة</p>
                </div>
                <a href="/scripts/new" class="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold rounded-xl hover:opacity-90 transition shadow-lg shadow-emerald-500/25">
                    + إضافة سكربت
                </a>
            </div>
        </header>

        <div class="p-6">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                ${scriptsHTML}
            </div>
        </div>

        <script>
            function copyToClipboard(text) {
                navigator.clipboard.writeText(text).then(() => {
                    alert('✅ تم النسخ!\\n\\n' + text);
                });
            }
        </script>
    `;

    res.send(layout({ title: 'السكربتات', page: 'scripts', content }));
});

// ═══════════════════════════════════════════════════════
// 📝 New Script Page
// ═══════════════════════════════════════════════════════
app.get('/scripts/new', adminAuth, (req, res) => {
    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <div class="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-white">➕ إضافة سكربت جديد</h1>
                    <p class="text-gray-500 text-sm mt-1">الصق كود السكربت هنا وراح يكون متاح للتحميل</p>
                </div>
                <a href="/scripts" class="px-5 py-2.5 bg-gray-800 text-white font-bold rounded-xl hover:bg-gray-700">
                    ← رجوع
                </a>
            </div>
        </header>

        <div class="p-6">
            <form method="POST" action="/admin/scripts/save" class="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-5">
                <div>
                    <label class="block text-gray-300 text-sm font-semibold mb-2">اسم السكربت (بالإنجليزي فقط، بدون مسافات)</label>
                    <input type="text" name="name" required pattern="[a-zA-Z0-9_\\-]{1,64}"
                        placeholder="my-cool-script"
                        class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white mono focus:border-blue-500 focus:outline-none transition">
                    <p class="text-xs text-gray-500 mt-1">يُستخدم في رابط التحميل: <code class="text-blue-400">/load/اسم-السكربت</code></p>
                </div>

                <div>
                    <label class="block text-gray-300 text-sm font-semibold mb-2">الوصف (اختياري)</label>
                    <input type="text" name="description" placeholder="مثال: سكربت جمع السيارات تلقائياً"
                        class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white focus:border-blue-500 focus:outline-none transition">
                </div>

                <div>
                    <label class="block text-gray-300 text-sm font-semibold mb-2">كود السكربت (Luau)</label>
                    <textarea name="content" required rows="20" 
                        placeholder="-- اكتب كود السكربت هنا&#10;print('Hello from Roblox!')"
                        class="w-full px-4 py-3 bg-gray-950 border border-gray-700 rounded-xl text-emerald-400 text-sm focus:border-blue-500 focus:outline-none transition resize-y"></textarea>
                </div>

                <div class="flex gap-3 pt-2">
                    <button type="submit" class="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold rounded-xl hover:opacity-90">
                        💾 حفظ السكربت
                    </button>
                    <a href="/scripts" class="flex-1 py-3 bg-gray-800 text-white font-bold rounded-xl hover:bg-gray-700 text-center">
                        إلغاء
                    </a>
                </div>
            </form>
        </div>
    `;

    res.send(layout({ title: 'سكربت جديد', page: 'scripts', content }));
});

// ═══════════════════════════════════════════════════════
// ✏️ Edit Script Page
// ═══════════════════════════════════════════════════════
app.get('/scripts/edit/:name', adminAuth, (req, res) => {
    const s = scripts[req.params.name];
    if (!s) return res.redirect('/scripts');

    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <div class="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-white">✏️ تعديل: ${esc(s.name)}</h1>
                    <p class="text-gray-500 text-sm mt-1">آخر تحديث: ${timeAgo(s.updatedAt)}</p>
                </div>
                <a href="/scripts" class="px-5 py-2.5 bg-gray-800 text-white font-bold rounded-xl hover:bg-gray-700">
                    ← رجوع
                </a>
            </div>
        </header>

        <div class="p-6">
            <form method="POST" action="/admin/scripts/save" class="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-5">
                <input type="hidden" name="originalName" value="${esc(s.name)}">
                
                <div>
                    <label class="block text-gray-300 text-sm font-semibold mb-2">اسم السكربت</label>
                    <input type="text" name="name" required pattern="[a-zA-Z0-9_\\-]{1,64}" value="${esc(s.name)}"
                        class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white mono focus:border-blue-500 focus:outline-none transition">
                </div>

                <div>
                    <label class="block text-gray-300 text-sm font-semibold mb-2">الوصف</label>
                    <input type="text" name="description" value="${esc(s.description || '')}"
                        class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white focus:border-blue-500 focus:outline-none transition">
                </div>

                <div>
                    <label class="block text-gray-300 text-sm font-semibold mb-2">كود السكربت (Luau)</label>
                    <textarea name="content" required rows="20"
                        class="w-full px-4 py-3 bg-gray-950 border border-gray-700 rounded-xl text-emerald-400 text-sm focus:border-blue-500 focus:outline-none transition resize-y">${esc(s.content)}</textarea>
                </div>

                <div class="flex gap-3 pt-2">
                    <button type="submit" class="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold rounded-xl hover:opacity-90">
                        💾 حفظ التعديلات
                    </button>
                    <a href="/scripts" class="flex-1 py-3 bg-gray-800 text-white font-bold rounded-xl hover:bg-gray-700 text-center">
                        إلغاء
                    </a>
                </div>
            </form>
        </div>
    `;

    res.send(layout({ title: `تعديل ${s.name}`, page: 'scripts', content }));
});

// ═══════════════════════════════════════════════════════
// 👥 Players Page
// ═══════════════════════════════════════════════════════
app.get('/players', adminAuth, (req, res) => {
    const list = Object.values(players).sort((a, b) => b.lastSeen - a.lastSeen);

    const rowsHTML = list.length === 0
        ? '<tr><td colspan="5" class="text-center py-12 text-gray-500">لا يوجد لاعبين مسجلين</td></tr>'
        : list.map(p => {
            const statsStr = p.stats ? Object.entries(p.stats).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' • ') : '—';
            return `
                <tr class="border-t border-gray-800 hover:bg-gray-800/30">
                    <td class="p-4">
                        <div class="flex items-center gap-3">
                            <img src="https://www.roblox.com/headshot-thumbnail/image?userId=${p.robloxId}&width=150&height=150&format=png"
                                 class="w-10 h-10 rounded-full border-2 ${isOnline(p) ? 'border-emerald-500' : 'border-gray-700'}" onerror="this.style.display='none'">
                            <div>
                                <div class="text-white font-semibold">${esc(p.username)}</div>
                                <div class="text-xs ${isOnline(p) ? 'text-emerald-400' : 'text-gray-500'}">
                                    ${isOnline(p) ? '🟢 متصل' : '⚫ غير متصل'}
                                </div>
                            </div>
                        </div>
                    </td>
                    <td class="p-4 text-gray-400 mono text-xs">${p.robloxId}</td>
                    <td class="p-4 text-gray-300 text-xs">${esc(statsStr)}</td>
                    <td class="p-4 text-gray-300 text-xs">${timeAgo(p.lastSeen)}</td>
                    <td class="p-4 text-gray-500 text-xs">${p.scriptName ? esc(p.scriptName) : '—'}</td>
                </tr>`;
        }).join('');

    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <div class="flex items-center justify-between">
                <div>
                    <h1 class="text-2xl font-bold text-white">👥 اللاعبين</h1>
                    <p class="text-gray-500 text-sm mt-1">كل اللاعبين اللي شغلوا السكربت</p>
                </div>
                <div class="text-sm text-gray-400">
                    إجمالي: <span class="text-white font-bold">${list.length}</span>
                </div>
            </div>
        </header>

        <div class="p-6">
            <div class="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-gray-800/50">
                            <tr>
                                <th class="text-right p-4 text-gray-400 font-semibold">اللاعب</th>
                                <th class="text-right p-4 text-gray-400 font-semibold">Roblox ID</th>
                                <th class="text-right p-4 text-gray-400 font-semibold">الإحصائيات</th>
                                <th class="text-right p-4 text-gray-400 font-semibold">آخر نشاط</th>
                                <th class="text-right p-4 text-gray-400 font-semibold">السكربت</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHTML}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    res.send(layout({ title: 'اللاعبين', page: 'players', content }));
});

// ═══════════════════════════════════════════════════════
// 📋 Logs Page
// ═══════════════════════════════════════════════════════
app.get('/logs', adminAuth, (req, res) => {
    const logIcons = { load: '⚡', register: '👤', admin: '👑', action: '📌', script_save: '💾', script_delete: '🗑️' };
    const logColors = {
        load: 'border-emerald-500',
        register: 'border-blue-500',
        admin: 'border-purple-500',
        action: 'border-cyan-500',
        script_save: 'border-yellow-500',
        script_delete: 'border-red-500',
    };

    const logsHTML = logs.length === 0
        ? '<div class="text-center py-12 text-gray-500">لا توجد أحداث</div>'
        : logs.slice(0, 200).map(log => `
            <div class="p-4 border-b border-gray-800 hover:bg-gray-800/30 border-r-4 ${logColors[log.type] || 'border-gray-500'}">
                <div class="flex items-start gap-3">
                    <span class="text-lg">${logIcons[log.type] || '📌'}</span>
                    <div class="flex-1 min-w-0">
                        <div class="text-sm text-gray-200">${esc(log.message)}</div>
                        ${log.data ? `<div class="mt-2 text-xs text-gray-500 mono bg-gray-800/50 p-2 rounded overflow-auto">${esc(JSON.stringify(log.data).slice(0, 300))}</div>` : ''}
                        <div class="text-xs text-gray-500 mt-1">${timeAgo(log.time)}</div>
                    </div>
                </div>
            </div>
        `).join('');

    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <div class="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-white">📋 السجلات</h1>
                    <p class="text-gray-500 text-sm mt-1">كل الأحداث في مكان واحد</p>
                </div>
                <form method="POST" action="/admin/logs/clear" onsubmit="return confirm('مسح كل السجلات؟')">
                    <button type="submit" class="px-5 py-2.5 bg-red-500/20 text-red-400 font-bold rounded-xl hover:bg-red-500/30">
                        🧹 مسح السجلات
                    </button>
                </form>
            </div>
        </header>

        <div class="p-6">
            <div class="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
                <div class="max-h-[700px] overflow-y-auto">${logsHTML}</div>
            </div>
        </div>
    `;

    res.send(layout({ title: 'السجلات', page: 'logs', content }));
});

// ═══════════════════════════════════════════════════════
// 🚀 LOADSTRING ENDPOINT — جلب كود السكربت
// ═══════════════════════════════════════════════════════
app.get('/load/:name', (req, res) => {
    const name = req.params.name;
    const s = scripts[name];

    if (!s) {
        return res.status(404)
            .type('text/plain')
            .send(`warn("[LOADER] ❌ السكربت '${name}' غير موجود")`);
    }

    // زيادة العداد
    s.loads = (s.loads || 0) + 1;
    s.lastLoaded = Date.now();

    // تسجيل
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    analytics.unshift({ name, ip, time: Date.now(), userAgent: req.headers['user-agent'] || '' });
    if (analytics.length > 1000) analytics.length = 1000;

    addLog('load', `⚡ تم تحميل السكربت "${name}" (إجمالي: ${s.loads})`);

    // رأس يدعم Roblox
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // نضيف تعليق في البداية
    const header = `-- ═══════════════════════════════════════════
-- ${s.name}
-- ${s.description || 'No description'}
-- Loaded from: ${req.get('host')}
-- Time: ${new Date().toISOString()}
-- ═══════════════════════════════════════════\n\n`;

    res.send(header + s.content);
});

// ═══════════════════════════════════════════════════════
// 📊 Logging API — يستقبل بيانات من اللعبة
// ═══════════════════════════════════════════════════════
app.post('/api/log', (req, res) => {
    const { robloxId, username, type, data, scriptName } = req.body;

    if (!robloxId) {
        return res.status(400).json({ success: false, error: 'Missing robloxId' });
    }

    // تحديث/إنشاء اللاعب
    const isNew = !players[robloxId];
    players[robloxId] = {
        robloxId: parseInt(robloxId),
        username: username || 'Unknown',
        lastSeen: Date.now(),
        joinedAt: players[robloxId]?.joinedAt || Date.now(),
        stats: players[robloxId]?.stats || {},
        scriptName: scriptName || players[robloxId]?.scriptName || '',
    };

    if (data) {
        players[robloxId].stats = { ...players[robloxId].stats, ...data };
    }

    if (isNew) {
        addLog('register', `👤 ${username || robloxId} شغل السكربت${scriptName ? ` (${scriptName})` : ''}`);
    } else if (type) {
        addLog(type, `${username || robloxId} → ${JSON.stringify(data || {}).slice(0, 100)}`, data);
    }

    res.json({ success: true, received: type || 'heartbeat', serverTime: Date.now() });
});

app.post('/api/heartbeat', (req, res) => {
    const { robloxId, username, stats, scriptName } = req.body;

    if (!robloxId) return res.status(400).json({ success: false, error: 'Missing robloxId' });

    if (!players[robloxId]) {
        players[robloxId] = {
            robloxId: parseInt(robloxId),
            username: username || 'Unknown',
            lastSeen: Date.now(),
            joinedAt: Date.now(),
            stats: {},
            scriptName: scriptName || '',
        };
        addLog('register', `👤 ${username || robloxId} انضم${scriptName ? ` (${scriptName})` : ''}`);
    } else {
        players[robloxId].lastSeen = Date.now();
        if (stats) players[robloxId].stats = { ...players[robloxId].stats, ...stats };
        if (scriptName) players[robloxId].scriptName = scriptName;
    }

    res.json({ success: true, serverTime: Date.now() });
});

// API عام للإحصائيات
app.get('/api/stats', (req, res) => {
    res.json({
        online: getOnlineUsers().length,
        totalPlayers: Object.keys(players).length,
        totalScripts: Object.keys(scripts).length,
        totalLoads: Object.values(scripts).reduce((s, sc) => s + (sc.loads || 0), 0),
        uptime: Date.now() - START_TIME,
        version: "3.0.0",
    });
});

// ═══════════════════════════════════════════════════════
// 🎛️ Admin Actions
// ═══════════════════════════════════════════════════════
app.post('/admin/scripts/save', adminAuth, (req, res) => {
    const { name, description, content, originalName } = req.body;

    if (!name || !content) {
        return res.status(400).send('Missing name or content');
    }

    if (!validName(name)) {
        return res.status(400).send('Invalid name — use letters, numbers, _ and - only');
    }

    // إذا في تغيير اسم، احذف القديم
    if (originalName && originalName !== name && scripts[originalName]) {
        delete scripts[originalName];
    }

    const isNew = !scripts[name];
    scripts[name] = {
        name,
        description: description || '',
        content,
        updatedAt: Date.now(),
        createdAt: scripts[name]?.createdAt || Date.now(),
        loads: scripts[name]?.loads || 0,
    };

    addLog('script_save', `${isNew ? '➕' : '✏️'} ${isNew ? 'إضافة' : 'تعديل'} السكربت "${name}"`);

    res.redirect('/scripts');
});

app.post('/admin/scripts/delete', adminAuth, (req, res) => {
    const { name } = req.body;
    if (scripts[name]) {
        delete scripts[name];
        addLog('script_delete', `🗑️ حذف السكربت "${name}"`);
    }
    res.redirect('/scripts');
});

app.post('/admin/logs/clear', adminAuth, (req, res) => {
    logs.length = 0;
    addLog('admin', '🧹 تم مسح السجلات');
    res.redirect('/logs');
});

// API لإضافة سكربت من الخارج (JSON)
app.post('/api/scripts/save', adminAuth, (req, res) => {
    const { name, description, content } = req.body;
    if (!name || !content) return res.status(400).json({ success: false, error: 'Missing name or content' });
    if (!validName(name)) return res.status(400).json({ success: false, error: 'Invalid name' });

    scripts[name] = {
        name,
        description: description || '',
        content,
        updatedAt: Date.now(),
        createdAt: scripts[name]?.createdAt || Date.now(),
        loads: scripts[name]?.loads || 0,
    };

    addLog('script_save', `💾 API: حفظ السكربت "${name}"`);
    res.json({ success: true, name, url: `/load/${name}` });
});

// ═══════════════════════════════════════════════════════
// 🚀 Start
// ═══════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log('');
        console.log('╔══════════════════════════════════════════════╗');
        console.log('║  🎮 Roblox Custom Loader v3.0                ║');
        console.log('╠══════════════════════════════════════════════╣');
        console.log(`║  🌐 URL: http://localhost:${PORT}/dashboard`);
        console.log(`║  👑 Admin Pass: ${ADMIN_PASSWORD}`);
        console.log('╚══════════════════════════════════════════════╝');
        console.log('');
    });
}

module.exports = app;

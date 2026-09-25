// ═══════════════════════════════════════════════════════
// Roblox Dashboard Server v2.0 — كل شيء داخل ملف واحد
// ═══════════════════════════════════════════════════════
const express      = require('express');
const cookieParser = require('cookie-parser');
const app          = express();

// ═══════════════════════════════════════════════════════
// ⚙️ Middleware
// ═══════════════════════════════════════════════════════
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.text({ type: ['text/*', 'application/json'], limit: '2mb' }));
app.use(cookieParser());

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

// ═══════════════════════════════════════════════════════
// 🔐 الإعدادات
// ═══════════════════════════════════════════════════════
const API_KEY        = process.env.API_KEY        || "JXZXCV";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SESSION_SECRET = process.env.SESSION_SECRET || "super-secret-change-me";
const START_TIME     = Date.now();
const ONLINE_TIMEOUT = 2 * 60 * 1000;

// ═══════════════════════════════════════════════════════
// 🗄️ Database (in-memory)
// ═══════════════════════════════════════════════════════
const users     = {};
const keys      = {};
const logs      = [];
const authLog   = [];
const blacklist = {};

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
    logs.unshift({ type, message, data: data || null, time: Date.now() });
    if (logs.length > 500) logs.length = 500;
    console.log(`[${type.toUpperCase()}] ${message}`);
}

function apiAuth(req, res, next) {
    const key = req.headers['x-api-key'] || req.query.key;
    if (key !== API_KEY) return res.status(401).json({ success: false, error: 'Invalid API key' });
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
    return new Date(ts).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
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

// ═══════════════════════════════════════════════════════
// 🎨 Layout Helper — القالب الرئيسي
// ═══════════════════════════════════════════════════════
function layout({ title, page, content }) {
    const navItems = [
        { href: '/dashboard', icon: '📊', label: 'لوحة التحكم', id: 'dashboard' },
        { href: '/keys',      icon: '🔑', label: 'المفاتيح',    id: 'keys' },
        { href: '/users',     icon: '👥', label: 'اللاعبين',    id: 'users' },
        { href: '/logs',      icon: '📜', label: 'السجلات',     id: 'logs' },
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
<title>${esc(title)} — Roblox Panel</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
<style>
    * { font-family: 'Cairo', sans-serif; }
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
                    <div class="font-bold text-white">Roblox Panel</div>
                    <div class="text-xs text-gray-500">v2.0.0</div>
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

<script>
    // تحديث تلقائي كل 5 ثواني
    setTimeout(() => location.reload(), 5000);
</script>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════
// 🏠 Login Page
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
            <svg class="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
        </div>
        <h1 class="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">لوحة التحكم</h1>
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
// 🏠 Dashboard Page
// ═══════════════════════════════════════════════════════
app.get('/', (req, res) => res.redirect('/dashboard'));

app.get('/dashboard', adminAuth, (req, res) => {
    const online = getOnlineUsers();
    const activeKeys = Object.values(keys).filter(k => !k.expires || k.expires > Date.now()).length;
    const recentLogs = logs.slice(0, 10);
    const recentUsers = Object.values(users).sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 5);

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

    const logIcons = { auth: '🔐', register: '👤', admin: '👑', action: '⚡', error: '❌', key: '🔑' };
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

    const usersHTML = recentUsers.length === 0
        ? '<tr><td colspan="4" class="text-center py-8 text-gray-500">لا يوجد لاعبين</td></tr>'
        : recentUsers.map(u => `
            <tr class="border-t border-gray-800 hover:bg-gray-800/30">
                <td class="p-3">
                    <div class="flex items-center gap-2">
                        <img src="https://www.roblox.com/headshot-thumbnail/image?userId=${u.robloxId}&width=150&height=150&format=png" class="w-8 h-8 rounded-full">
                        <span class="text-white">${esc(u.username)}</span>
                    </div>
                </td>
                <td class="p-3 text-gray-400 font-mono text-xs">${u.robloxId}</td>
                <td class="p-3 text-emerald-400 font-mono text-xs">${esc((u.key || '—').slice(0, 16))}</td>
                <td class="p-3 text-gray-400 text-xs">${timeAgo(u.lastSeen)}</td>
            </tr>
        `).join('');

    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <div class="flex items-center justify-between">
                <div>
                    <h1 class="text-2xl font-bold text-white">📊 لوحة التحكم</h1>
                    <p class="text-gray-500 text-sm mt-1">مراقبة شاملة للسكربت</p>
                </div>
                <div class="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                    <div class="pulse-dot"></div>
                    <span class="text-emerald-400 text-sm font-semibold">متصل</span>
                </div>
            </div>
        </header>

        <div class="p-6 space-y-6">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 glow">
                    <div class="text-3xl mb-2">🟢</div>
                    <div class="text-3xl font-bold text-emerald-400">${online.length}</div>
                    <div class="text-gray-400 text-sm mt-1">متصل الآن</div>
                </div>
                <div class="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20 rounded-2xl p-5 glow">
                    <div class="text-3xl mb-2">👥</div>
                    <div class="text-3xl font-bold text-blue-400">${Object.keys(users).length}</div>
                    <div class="text-gray-400 text-sm mt-1">إجمالي اللاعبين</div>
                </div>
                <div class="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/20 rounded-2xl p-5 glow">
                    <div class="text-3xl mb-2">🔑</div>
                    <div class="text-3xl font-bold text-purple-400">${activeKeys}</div>
                    <div class="text-gray-400 text-sm mt-1">مفاتيح نشطة</div>
                </div>
                <div class="bg-gradient-to-br from-red-500/10 to-red-500/5 border border-red-500/20 rounded-2xl p-5 glow">
                    <div class="text-3xl mb-2">🚫</div>
                    <div class="text-3xl font-bold text-red-400">${Object.keys(blacklist).length}</div>
                    <div class="text-gray-400 text-sm mt-1">محجوبين</div>
                </div>
            </div>

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
                        <h2 class="font-bold text-white flex items-center gap-2"><span class="text-xl">📜</span> آخر الأحداث</h2>
                        <a href="/logs" class="text-xs text-blue-400 hover:text-blue-300">عرض الكل →</a>
                    </div>
                    <div class="p-4 space-y-2 max-h-72 overflow-auto">${logsHTML}</div>
                </div>
            </div>

            <div class="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
                <div class="p-5 border-b border-gray-800 flex items-center justify-between">
                    <h2 class="font-bold text-white flex items-center gap-2"><span class="text-xl">👥</span> أحدث اللاعبين</h2>
                    <a href="/users" class="text-xs text-blue-400 hover:text-blue-300">عرض الكل →</a>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-gray-800/50">
                            <tr>
                                <th class="text-right p-3 text-gray-400 font-semibold">اللاعب</th>
                                <th class="text-right p-3 text-gray-400 font-semibold">Roblox ID</th>
                                <th class="text-right p-3 text-gray-400 font-semibold">المفتاح</th>
                                <th class="text-right p-3 text-gray-400 font-semibold">آخر ظهور</th>
                            </tr>
                        </thead>
                        <tbody>${usersHTML}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    res.send(layout({ title: 'لوحة التحكم', page: 'dashboard', content }));
});

// ═══════════════════════════════════════════════════════
// 🔑 Keys Page
// ═══════════════════════════════════════════════════════
app.get('/keys', adminAuth, (req, res) => {
    const keysList = Object.entries(keys).map(([k, v]) => ({ key: k, ...v }));

    const rowsHTML = keysList.length === 0
        ? '<tr><td colspan="6" class="text-center py-12 text-gray-500">لا توجد مفاتيح بعد</td></tr>'
        : keysList.map(k => `
            <tr class="border-t border-gray-800 hover:bg-gray-800/30">
                <td class="p-4">
                    <div class="flex items-center gap-2">
                        <code class="text-emerald-400 font-mono text-xs bg-emerald-500/10 px-2 py-1 rounded">${esc(k.key)}</code>
                        <button onclick="navigator.clipboard.writeText('${esc(k.key)}');alert('✅ تم النسخ')" class="text-gray-500 hover:text-white">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                            </svg>
                        </button>
                    </div>
                </td>
                <td class="p-4"><span class="text-white font-semibold">${k.uses || 0}</span> <span class="text-gray-500">/ ${k.maxUses || '∞'}</span></td>
                <td class="p-4 text-gray-300 text-xs">${formatDate(k.expires)}</td>
                <td class="p-4 text-gray-500 font-mono text-xs">${k.hwid ? esc(k.hwid.slice(0, 12)) + '...' : '—'}</td>
                <td class="p-4 text-gray-400 text-xs">${esc(k.note || '—')}</td>
                <td class="p-4">
                    <form method="POST" action="/admin/keys/delete" onsubmit="return confirm('حذف المفتاح؟')" class="inline">
                        <input type="hidden" name="key" value="${esc(k.key)}">
                        <button type="submit" class="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 text-xs font-semibold">🗑️ حذف</button>
                    </form>
                </td>
            </tr>
        `).join('');

    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <div class="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-white">🔑 إدارة المفاتيح</h1>
                    <p class="text-gray-500 text-sm mt-1">توليد، عرض وحذف مفاتيح التفعيل</p>
                </div>
                <button onclick="openModal()" class="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold rounded-xl hover:opacity-90 transition shadow-lg shadow-emerald-500/25">
                    + توليد مفتاح
                </button>
            </div>
        </header>

        <div class="p-6">
            <div class="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-gray-800/50">
                            <tr>
                                <th class="text-right p-4 text-gray-400 font-semibold">المفتاح</th>
                                <th class="text-right p-4 text-gray-400 font-semibold">الاستخدامات</th>
                                <th class="text-right p-4 text-gray-400 font-semibold">الانتهاء</th>
                                <th class="text-right p-4 text-gray-400 font-semibold">HWID</th>
                                <th class="text-right p-4 text-gray-400 font-semibold">ملاحظة</th>
                                <th class="text-right p-4 text-gray-400 font-semibold">إجراء</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHTML}</tbody>
                    </table>
                </div>
            </div>
        </div>

        <div id="modal" class="fixed inset-0 bg-black/70 backdrop-blur-sm hidden items-center justify-center z-50 p-4">
            <div class="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6">
                <h2 class="text-xl font-bold text-white mb-4">🔑 توليد مفتاح جديد</h2>
                <form method="POST" action="/admin/keys/generate" class="space-y-4">
                    <div>
                        <label class="block text-gray-300 text-sm mb-2">عدد الاستخدامات</label>
                        <input type="number" name="maxUses" value="1" min="1"
                            class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 focus:outline-none">
                    </div>
                    <div>
                        <label class="block text-gray-300 text-sm mb-2">صلاحية بالأيام</label>
                        <input type="number" name="days" value="30" min="1"
                            class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 focus:outline-none">
                    </div>
                    <div>
                        <label class="block text-gray-300 text-sm mb-2">ملاحظة (اختياري)</label>
                        <input type="text" name="note" placeholder="مفتاح VIP"
                            class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 focus:outline-none">
                    </div>
                    <div class="flex gap-3 pt-2">
                        <button type="submit" class="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold rounded-xl hover:opacity-90">✅ توليد</button>
                        <button type="button" onclick="closeModal()" class="flex-1 py-3 bg-gray-800 text-white font-bold rounded-xl hover:bg-gray-700">إلغاء</button>
                    </div>
                </form>
            </div>
        </div>

        <script>
            function openModal() {
                const m = document.getElementById('modal');
                m.classList.remove('hidden'); m.classList.add('flex');
            }
            function closeModal() {
                const m = document.getElementById('modal');
                m.classList.add('hidden'); m.classList.remove('flex');
            }
        </script>
    `;

    res.send(layout({ title: 'المفاتيح', page: 'keys', content }));
});

// ═══════════════════════════════════════════════════════
// 👥 Users Page
// ═══════════════════════════════════════════════════════
app.get('/users', adminAuth, (req, res) => {
    const usersList = Object.values(users).sort((a, b) => b.lastSeen - a.lastSeen);

    const rowsHTML = usersList.length === 0
        ? '<tr><td colspan="6" class="text-center py-12 text-gray-500">لا يوجد لاعبين مسجلين</td></tr>'
        : usersList.map(u => `
            <tr class="border-t border-gray-800 hover:bg-gray-800/30">
                <td class="p-4">
                    <div class="flex items-center gap-3">
                        <img src="https://www.roblox.com/headshot-thumbnail/image?userId=${u.robloxId}&width=150&height=150&format=png"
                             class="w-10 h-10 rounded-full border-2 border-blue-500">
                        <span class="text-white font-semibold">${esc(u.username)}</span>
                    </div>
                </td>
                <td class="p-4 text-gray-400 font-mono text-xs">${u.robloxId}</td>
                <td class="p-4 text-emerald-400 font-mono text-xs">${esc((u.key || '—').slice(0, 16))}</td>
                <td class="p-4 text-gray-500 font-mono text-xs">${esc((u.hwid || '—').slice(0, 12))}</td>
                <td class="p-4 text-gray-300 text-xs">${timeAgo(u.lastSeen)}</td>
                <td class="p-4">
                    <form method="POST" action="/admin/users/block" onsubmit="return confirm('حجب اللاعب؟')" class="inline">
                        <input type="hidden" name="robloxId" value="${u.robloxId}">
                        <button type="submit" class="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 text-xs font-semibold">🚫 حجب</button>
                    </form>
                </td>
            </tr>
        `).join('');

    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <h1 class="text-2xl font-bold text-white">👥 اللاعبين</h1>
            <p class="text-gray-500 text-sm mt-1">إدارة جميع اللاعبين المسجلين</p>
        </header>

        <div class="p-6">
            <div class="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-gray-800/50">
                            <tr>
                                <th class="text-right p-4 text-gray-400 font-semibold">اللاعب</th>
                                <th class="text-right p-4 text-gray-400 font-semibold">Roblox ID</th>
                                <th class="text-right p-4 text-gray-400 font-semibold">المفتاح</th>
                                <th class="text-right p-4 text-gray-400 font-semibold">HWID</th>
                                <th class="text-right p-4 text-gray-400 font-semibold">آخر ظهور</th>
                                <th class="text-right p-4 text-gray-400 font-semibold">إجراء</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHTML}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    res.send(layout({ title: 'اللاعبين', page: 'users', content }));
});

// ═══════════════════════════════════════════════════════
// 📜 Logs Page
// ═══════════════════════════════════════════════════════
app.get('/logs', adminAuth, (req, res) => {
    const logIcons = { auth: '🔐', register: '👤', admin: '👑', action: '⚡', error: '❌', key: '🔑' };
    const logColors = {
        auth: 'border-cyan-500',
        register: 'border-emerald-500',
        admin: 'border-purple-500',
        action: 'border-blue-500',
        error: 'border-red-500',
    };

    const logsHTML = logs.length === 0
        ? '<div class="text-center py-12 text-gray-500">لا توجد أحداث</div>'
        : logs.slice(0, 200).map(log => `
            <div class="p-4 border-b border-gray-800 hover:bg-gray-800/30 border-r-4 ${logColors[log.type] || 'border-gray-500'}">
                <div class="flex items-start gap-3">
                    <span class="text-lg">${logIcons[log.type] || '📌'}</span>
                    <div class="flex-1 min-w-0">
                        <div class="text-sm text-gray-200">${esc(log.message)}</div>
                        ${log.data ? `<div class="mt-2 text-xs text-gray-500 font-mono bg-gray-800/50 p-2 rounded overflow-auto">${esc(JSON.stringify(log.data).slice(0, 200))}</div>` : ''}
                        <div class="text-xs text-gray-500 mt-1">${timeAgo(log.time)}</div>
                    </div>
                </div>
            </div>
        `).join('');

    const authHTML = authLog.length === 0
        ? '<div class="text-center py-12 text-gray-500">لا توجد محاولات</div>'
        : authLog.slice(0, 100).map(a => {
            const colors = {
                success: 'text-emerald-400 border-emerald-500',
                invalid: 'text-red-400 border-red-500',
                expired: 'text-orange-400 border-orange-500',
                hwid_mismatch: 'text-yellow-400 border-yellow-500',
                blocked: 'text-red-500 border-red-500',
                max_uses: 'text-red-400 border-red-500',
            };
            const c = colors[a.result] || 'text-gray-400 border-gray-500';
            return `
                <div class="p-4 border-b border-gray-800 border-r-4 ${c.split(' ')[1]}">
                    <div class="flex items-center justify-between">
                        <span class="font-mono text-xs ${c.split(' ')[0]}">${esc((a.result || '').toUpperCase())}</span>
                        <span class="text-xs text-gray-500">${timeAgo(a.time)}</span>
                    </div>
                    <div class="text-sm text-gray-300 mt-1">
                        👤 ${esc(a.username || 'Unknown')} <span class="text-gray-500">(${a.robloxId || '?'})</span>
                    </div>
                    <div class="text-xs text-gray-500 font-mono mt-1">🔑 ${esc((a.key || 'none').slice(0, 16))}</div>
                </div>
            `;
        }).join('');

    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <div class="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-white">📜 السجلات</h1>
                    <p class="text-gray-500 text-sm mt-1">جميع الأحداث الواردة من السكربت</p>
                </div>
                <form method="POST" action="/admin/logs/clear" onsubmit="return confirm('مسح كل السجلات؟')">
                    <button type="submit" class="px-5 py-2.5 bg-red-500/20 text-red-400 font-bold rounded-xl hover:bg-red-500/30">🧹 مسح السجلات</button>
                </form>
            </div>
        </header>

        <div class="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
                <div class="p-5 border-b border-gray-800"><h2 class="font-bold text-white">📌 الأحداث العامة</h2></div>
                <div class="max-h-[600px] overflow-y-auto">${logsHTML}</div>
            </div>

            <div class="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
                <div class="p-5 border-b border-gray-800"><h2 class="font-bold text-white">🔐 سجل التحقق</h2></div>
                <div class="max-h-[600px] overflow-y-auto">${authHTML}</div>
            </div>
        </div>
    `;

    res.send(layout({ title: 'السجلات', page: 'logs', content }));
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

    res.json({ success: true, message: 'Welcome!', expires: k.expires, uses: k.uses, maxUses: k.maxUses });
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
        version: "2.0.0",
    });
});

// ═══════════════════════════════════════════════════════
// 🎛️ Admin Actions
// ═══════════════════════════════════════════════════════
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

app.post('/admin/keys/delete', adminAuth, (req, res) => {
    const { key } = req.body;
    if (keys[key]) {
        delete keys[key];
        addLog('admin', `🗑️ حذف مفتاح: ${key}`);
    }
    res.redirect('/keys');
});

app.post('/admin/users/block', adminAuth, (req, res) => {
    const { robloxId } = req.body;
    blacklist[robloxId] = Date.now();
    if (users[robloxId]) delete users[robloxId];
    addLog('admin', `🚫 حجب: ${robloxId}`);
    res.redirect('/users');
});

app.post('/admin/users/unblock', adminAuth, (req, res) => {
    const { robloxId } = req.body;
    delete blacklist[robloxId];
    addLog('admin', `✅ فك حجب: ${robloxId}`);
    res.redirect('/users');
});

app.post('/admin/logs/clear', adminAuth, (req, res) => {
    logs.length = 0;
    addLog('admin', '🧹 تم مسح السجلات');
    res.redirect('/logs');
});

// ═══════════════════════════════════════════════════════
// 🚀 Start
// ═══════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log('');
        console.log('╔══════════════════════════════════════════════╗');
        console.log('║  🎨 Roblox Dashboard v2.0                    ║');
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

// ═══════════════════════════════════════════════════════
// 🚀 Rejoin Self-Reload Host v2.0
// ═══════════════════════════════════════════════════════
const express = require('express');
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.text({ type: ['text/*', 'text/plain'], limit: '50mb' }));

// ─── CORS ───
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ─── Cookie parser ───
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

// ─── Parse body ───
app.use((req, res, next) => {
    if (typeof req.body === 'string' && req.body.trim()) {
        try { req.body = JSON.parse(req.body); } catch (e) {}
    }
    if (!req.body || typeof req.body !== 'object') req.body = {};
    next();
});

// ═══════════════════════════════════════════════════════
// ⚙️ الإعدادات
// ═══════════════════════════════════════════════════════
const API_KEY        = process.env.API_KEY        || "JXZXCV";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SESSION_SECRET = process.env.SESSION_SECRET || "secret-" + Math.random().toString(36).slice(2);

// ═══════════════════════════════════════════════════════
// 🗄️ Database
// ═══════════════════════════════════════════════════════
const scripts = {};

// ═══════════════════════════════════════════════════════
// 🛠️ Helpers
// ═══════════════════════════════════════════════════════
function validName(n) {
    return /^[a-zA-Z0-9_\-]{1,64}$/.test(n);
}

function esc(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function adminAuth(req, res, next) {
    const token = req.cookies?.admin_token || req.headers['x-admin-token'] || req.query.token;
    if (token !== SESSION_SECRET) return res.redirect('/login');
    next();
}

function apiAuth(req, res, next) {
    if (req.headers['x-api-key'] !== API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// ═══════════════════════════════════════════════════════
// 🎨 Layout
// ═══════════════════════════════════════════════════════
function layout({ title, page, content }) {
    const navItems = [
        { href: '/dashboard', icon: '📊', label: 'لوحة التحكم', id: 'dashboard' },
        { href: '/scripts',   icon: '📜', label: 'السكربتات',   id: 'scripts' },
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
<title>${esc(title)} — Rejoin Host</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=JetBrains+Mono&display=swap" rel="stylesheet">
<style>
    * { font-family: 'Cairo', sans-serif; }
    code, pre, textarea { font-family: 'JetBrains Mono', monospace; }
    body { background: #0a0a12; margin: 0; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #1a1a2e; }
    ::-webkit-scrollbar-thumb { background: #3b82f6; border-radius: 4px; }
    .glow { box-shadow: 0 0 30px rgba(59,130,246,0.15); }
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
                    <div class="text-xs text-gray-500">v2.0</div>
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
    const list = Object.values(scripts);
    const totalLoads = list.reduce((a, s) => a + (s.loads || 0), 0);

    const stats = [
        { icon: '📜', num: list.length, lbl: 'سكربتات', color: 'blue' },
        { icon: '⚡', num: totalLoads, lbl: 'تحميلات', color: 'emerald' },
    ];

    const statsHTML = stats.map(s => `
        <div class="bg-gradient-to-br from-${s.color}-500/10 to-${s.color}-500/5 border border-${s.color}-500/20 rounded-2xl p-6 glow">
            <div class="text-3xl mb-2">${s.icon}</div>
            <div class="text-4xl font-bold text-${s.color}-400">${s.num}</div>
            <div class="text-gray-400 text-sm mt-2">${s.lbl}</div>
        </div>
    `).join('');

    const listHTML = list.length === 0
        ? `<div class="text-center py-12 text-gray-500">
             <div class="text-5xl mb-4">📭</div>
             <div class="mb-4">لا توجد سكربتات بعد</div>
             <a href="/scripts/new" class="inline-block px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold rounded-xl">
                 + ارفع أول سكربت
             </a>
           </div>`
        : list.slice(0, 5).map(s => `
            <div class="flex items-center justify-between p-4 bg-gray-800/40 rounded-xl border border-gray-800 mb-2">
                <div class="flex items-center gap-3">
                    <span class="text-2xl">📜</span>
                    <div>
                        <div class="font-bold text-white">${esc(s.name)}</div>
                        <div class="text-xs text-gray-500">${s.loads || 0} تحميل</div>
                    </div>
                </div>
                <a href="/scripts/edit/${esc(s.name)}" class="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm">تعديل</a>
            </div>
        `).join('');

    const content = `
        <header class="bg-gray-900/60 backdrop-blur border-b border-gray-800 p-6 sticky top-0 z-10">
            <div class="flex items-center justify-between">
                <div>
                    <h1 class="text-2xl font-bold text-white">📊 لوحة التحكم</h1>
                    <p class="text-gray-500 text-sm mt-1">إدارة سكربتات الريجوين</p>
                </div>
                <a href="/scripts/new" class="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold rounded-xl">
                    + ارفع سكربت
                </a>
            </div>
        </header>
        <div class="p-6 space-y-6">
            <div class="grid grid-cols-2 gap-4 max-w-2xl">${statsHTML}</div>
            <div class="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
                <h2 class="font-bold text-white mb-4 flex items-center gap-2">
                    <span class="text-xl">📋</span> آخر السكربتات
                </h2>
                ${listHTML}
            </div>
        </div>
    `;
    res.send(layout({ title: 'لوحة التحكم', page: 'dashboard', content }));
});

// ═══════════════════════════════════════════════════════
// 📜 Scripts List
// ═══════════════════════════════════════════════════════
app.get('/scripts', adminAuth, (req, res) => {
    const list = Object.values(scripts).sort((a, b) => b.updatedAt - a.updatedAt);
    const host = req.protocol + '://' + req.get('host');

    const html = list.length === 0
        ? `<div class="text-center py-16">
             <div class="text-6xl mb-4">📜</div>
             <div class="text-gray-400 mb-6">لا توجد سكربتات</div>
             <a href="/scripts/new" class="inline-block px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold rounded-xl">
                 + ارفع أول سكربت
             </a>
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
                            <span class="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded font-bold">🔗 Auto-Rejoin</span>
                        </div>
                        <p class="text-gray-400 text-sm">${esc(s.description || 'بدون وصف')}</p>
                    </div>
                    <div class="text-right">
                        <div class="text-2xl font-bold text-emerald-400">${s.loads || 0}</div>
                        <div class="text-xs text-gray-500">تحميل</div>
                    </div>
                </div>
                <div class="bg-gray-950 border border-gray-800 rounded-xl p-3 mb-3">
                    <div class="text-xs text-gray-500 mb-2">🔗 loadstring جاهز:</div>
                    <div class="flex items-center gap-2">
                        <code class="flex-1 text-emerald-400 text-xs overflow-x-auto whitespace-nowrap">${esc(loadCmd)}</code>
                        <button onclick="copyCmd('${esc(loadCmd).replace(/'/g, "\\'")}')"
                                class="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs font-semibold whitespace-nowrap">
                            📋 نسخ
                        </button>
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
                    <p class="text-gray-500 text-sm mt-1">ارفع السكربت — يشغل نفسه فقط عند Rejoin/Hop</p>
                </div>
                <a href="/scripts/new" class="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold rounded-xl">+ ارفع</a>
            </div>
        </header>
        <div class="p-6">
            <div class="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 mb-6">
                <div class="flex items-start gap-3">
                    <span class="text-2xl">✨</span>
                    <div>
                        <div class="font-bold text-emerald-400 mb-1">الربط التلقائي الذكي</div>
                        <div class="text-sm text-gray-300">
                            السيرفر يحقن <code class="text-emerald-400">_G.RegisterSelfReload()</code> — سكربتك يستدعيها فقط عند Rejoin/Hop.
                            الخروج العادي ما يشغل نفسه.
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

// ═══════════════════════════════════════════════════════
// ➕ New Script
// ═══════════════════════════════════════════════════════
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
                            الصق السكربت <b>كما هو</b> — السيرفر يضيف <code class="text-emerald-400">_G.RegisterSelfReload()</code> تلقائياً.
                        </div>
                    </div>
                </div>
            </div>
            <form method="POST" action="/admin/scripts/save" class="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-5">
                <div>
                    <label class="block text-gray-300 text-sm font-semibold mb-2">اسم السكربت</label>
                    <input type="text" name="name" required pattern="[a-zA-Z0-9_\\-]{1,64}" placeholder="my-script"
                        class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white">
                    <div class="text-xs text-gray-500 mt-1">أحرف إنجليزية وأرقام و _ - فقط</div>
                </div>
                <div>
                    <label class="block text-gray-300 text-sm font-semibold mb-2">الوصف (اختياري)</label>
                    <input type="text" name="description" placeholder="وصف مختصر"
                        class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white">
                </div>
                <div>
                    <label class="block text-gray-300 text-sm font-semibold mb-2">كود السكربت (Lua/Luau)</label>
                    <textarea name="content" required rows="25" placeholder="-- الصق كود السكربت هنا"
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

// ═══════════════════════════════════════════════════════
// ✏️ Edit Script
// ═══════════════════════════════════════════════════════
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
                    <textarea name="content" required rows="25"
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

// ═══════════════════════════════════════════════════════
// 💾 Save Script
// ═══════════════════════════════════════════════════════
app.post('/admin/scripts/save', adminAuth, (req, res) => {
    const { name, description, content, originalName } = req.body;
    if (!name || !content) return res.status(400).send('Missing data');
    if (!validName(name)) return res.status(400).send('Invalid name');

    if (originalName && originalName !== name && scripts[originalName]) {
        delete scripts[originalName];
    }

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

// ═══════════════════════════════════════════════════════
// 🗑️ Delete Script
// ═══════════════════════════════════════════════════════
app.post('/admin/scripts/delete', adminAuth, (req, res) => {
    const { name } = req.body;
    if (scripts[name]) delete scripts[name];
    res.redirect('/scripts');
});

// ═══════════════════════════════════════════════════════
// 🚀 Loadstring — Smart Self-Reload
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

    // ═══════════════════════════════════════════════════
    // 🔗 INJECTION HEADER — Smart Self-Reload
    // ═══════════════════════════════════════════════════
    const header = `-- ═══════════════════════════════════════════
-- ${s.name}
-- Server: ${hostUrl}
-- Time: ${new Date().toISOString()}
-- ═══════════════════════════════════════════
-- 🔗 AUTO-INJECTED — Smart Self-Reload v2
-- ═══════════════════════════════════════════
_G = _G or {}
_G.HOST_URL = "${hostUrl}"
_G.HOST_KEY = "${API_KEY}"
_G.SCRIPT_URL = "${scriptUrl}"
_G.SCRIPT_NAME = "${s.name}"

-- 🛡️ حماية من التشغيل المزدوج
_G.__LOADED = _G.__LOADED or {}
if _G.__LOADED[_G.SCRIPT_NAME] then
    warn("[HOST] ⚠️ محمّل مسبقاً — إلغاء")
    return
end
_G.__LOADED[_G.SCRIPT_NAME] = true

-- 🔓 امسح العلامة بعد 5 ثواني (يسمح بإعادة التشغيل من نفس السيرفر)
task.delay(5, function()
    if _G and _G.__LOADED then
        _G.__LOADED[_G.SCRIPT_NAME] = nil
    end
end)

-- ═══════════════════════════════════════════
-- 🔑 دالة تسجيل Self-Reload
-- سكربتك يستدعيها فقط عند Rejoin/Hop
-- ═══════════════════════════════════════════
function _G.RegisterSelfReload()
    if not queue_on_teleport then
        warn("[HOST] queue_on_teleport غير مدعوم")
        return false
    end
    local ok = pcall(function()
        queue_on_teleport(string.format([[
            task.wait(3)
            _G = _G or {}
            _G.__LOADED = nil
            loadstring(game:HttpGet("%s"))()
        ]], _G.SCRIPT_URL))
    end)
    if ok then
        print("[HOST] ✅ Self-Reload مسجّل — السكربت سيرجع بعد الريجوين")
    else
        warn("[HOST] ❌ فشل تسجيل Self-Reload")
    end
    return ok
end
-- ═══════════════════════════════════════════\n\n`;

    let content = s.content;

    // ✅ استبدال ذكي — يدعم كل الأشكال
    content = content.replace(
        /(\bAPI_URL\s*=\s*)["'][^"'\n]*["']/g,
        '$1_G.HOST_URL'
    );
    content = content.replace(
        /(\bAPI_KEY\s*=\s*)["'][^"'\n]*["']/g,
        '$1_G.HOST_KEY'
    );
    content = content.replace(
        /(\bBASE_URL\s*=\s*)["'][^"'\n]*["']/g,
        '$1_G.HOST_URL'
    );
    content = content.replace(
        /(\bHOST_URL\s*=\s*)["'][^"'\n]*["']/g,
        '$1_G.HOST_URL'
    );
    content = content.replace(
        /(\bHOST_KEY\s*=\s*)["'][^"'\n]*["']/g,
        '$1_G.HOST_KEY'
    );

    res.send(header + content);
});

// ═══════════════════════════════════════════════════════
// 🔌 API
// ═══════════════════════════════════════════════════════
app.get('/api/status', apiAuth, (req, res) => {
    res.json({
        ok: true,
        scripts: Object.keys(scripts).length,
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
        console.log('║  🔄 Rejoin Self-Reload Host v2.0             ║');
        console.log('╠══════════════════════════════════════════════╣');
        console.log(`║  🌐 http://localhost:${PORT}/dashboard`);
        console.log(`║  🔑 API Key: ${API_KEY}`);
        console.log(`║  👑 Admin:   ${ADMIN_PASSWORD}`);
        console.log('╚══════════════════════════════════════════════╝');
    });
}

module.exports = app;

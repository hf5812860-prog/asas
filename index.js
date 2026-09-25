const express = require('express');
const crypto  = require('crypto');
const app     = express();

app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// 🔑 المفتاح (ثابت عشان ما يتغير)
const API_KEY = process.env.API_KEY || "JXZXCV";
const START_TIME = Date.now();

// 💾 Storage
const users   = {};
const trades  = {};
const logs    = [];
let totalTrades = 0;

function addLog(type, message) {
    logs.unshift({ type, message, time: Date.now() });
    if (logs.length > 50) logs.length = 50;
    console.log(`[${type.toUpperCase()}] ${message}`);
}

function auth(req, res, next) {
    if (req.headers['x-api-key'] !== API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// ═══════════════════════════════════════════════════════
// 🎨 Dashboard
// ═══════════════════════════════════════════════════════
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Roblox Trade System</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0f0f16;--bg-2:#16161f;--bg-3:#1e1e2b;--border:#2a2a3e;--text:#e4e4ed;--text-dim:#8888a0;--blue:#6ba8ff;--green:#4dc47e;--orange:#ffb84d;--red:#ff6b6b;--purple:#a78bfa}
body{font-family:'Segoe UI',Tahoma,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;padding:20px}
.container{max-width:1400px;margin:0 auto}
.header{background:linear-gradient(135deg,#1e1e2b,#252535);border:1px solid var(--border);border-radius:16px;padding:20px 25px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:15px}
.header h1{font-size:24px;background:linear-gradient(90deg,#6ba8ff,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.status-badge{display:flex;align-items:center;gap:8px;background:rgba(77,196,126,.1);padding:6px 14px;border-radius:20px;border:1px solid rgba(77,196,126,.3);color:var(--green);font-weight:600;font-size:13px}
.pulse{width:8px;height:8px;background:var(--green);border-radius:50%;animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5;transform:scale(1.3)}}
.key-card{background:linear-gradient(135deg,#2a1e3e,#1e1e2b);border:1px solid #4a3a6e;border-radius:16px;padding:20px 25px;margin-bottom:20px}
.key-header{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.key-header .icon{font-size:22px}
.key-header .title{font-weight:bold;color:var(--purple);font-size:15px}
.key-header .hint{font-size:11px;color:var(--text-dim);margin-right:auto}
.key-value{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.key-text{flex:1;min-width:250px;background:rgba(0,0,0,.4);padding:12px 16px;border-radius:10px;font-family:'Courier New',monospace;font-size:13px;color:var(--green);letter-spacing:1px;border:1px solid #3a3a5e;overflow-x:auto;white-space:nowrap}
.key-btn{background:linear-gradient(135deg,#6ba8ff,#a78bfa);color:#fff;border:none;padding:12px 22px;border-radius:10px;font-weight:bold;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:6px;font-family:inherit}
.key-btn:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(107,168,255,.3)}
.key-btn.copied{background:linear-gradient(135deg,#4dc47e,#3aa86a)}
.key-note{margin-top:12px;font-size:12px;color:var(--text-dim)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:15px;margin-bottom:20px}
.stat-card{background:linear-gradient(135deg,var(--bg-2),var(--bg-3));border:1px solid var(--border);border-radius:14px;padding:20px}
.stat-icon{font-size:28px;margin-bottom:10px}
.stat-num{font-size:32px;font-weight:bold;color:var(--blue);margin-bottom:4px}
.stat-card.green .stat-num{color:var(--green)}
.stat-card.orange .stat-num{color:var(--orange)}
.stat-card.purple .stat-num{color:var(--purple)}
.stat-lbl{font-size:13px;color:var(--text-dim)}
.grid-2{display:grid;grid-template-columns:1.6fr 1fr;gap:20px}
@media(max-width:900px){.grid-2{grid-template-columns:1fr}}
.panel{background:var(--bg-2);border:1px solid var(--border);border-radius:16px;overflow:hidden}
.panel-header{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;background:var(--bg-3)}
.panel-header h2{font-size:16px}
.panel-body{padding:15px;max-height:500px;overflow-y:auto}
.trade-card{background:var(--bg-3);border:1px solid var(--border);border-radius:12px;padding:15px;margin-bottom:10px;display:flex;gap:15px}
.trade-avatar{width:55px;height:55px;border-radius:50%;border:2px solid var(--blue);background:var(--bg);flex-shrink:0}
.trade-info{flex:1;min-width:0}
.trade-name{font-weight:bold;color:var(--blue);font-size:15px;margin-bottom:6px}
.trade-row{font-size:13px;margin-bottom:4px;display:flex;gap:6px}
.trade-row .label{color:var(--text-dim)}
.trade-items{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.trade-time{font-size:11px;color:var(--text-dim);margin-top:8px}
.log-item{padding:12px;border-radius:10px;background:var(--bg-3);margin-bottom:8px;border-right:3px solid var(--blue);display:flex;gap:12px;align-items:flex-start}
.log-item.create{border-color:var(--green)}
.log-item.delete{border-color:var(--red)}
.log-item.accept{border-color:var(--green)}
.log-item.reject{border-color:var(--orange)}
.log-icon{font-size:18px}
.log-msg{font-size:13px;margin-bottom:3px;word-break:break-word}
.log-time{font-size:11px;color:var(--text-dim)}
.empty{text-align:center;padding:40px 20px;color:var(--text-dim)}
.empty-icon{font-size:40px;margin-bottom:10px;opacity:.4}
.footer{text-align:center;padding:20px;color:var(--text-dim);font-size:12px;margin-top:20px}
.toast{position:fixed;bottom:30px;left:50%;transform:translateX(-50%) translateY(100px);background:linear-gradient(135deg,#4dc47e,#3aa86a);color:#fff;padding:14px 28px;border-radius:12px;font-weight:bold;box-shadow:0 10px 30px rgba(0,0,0,.4);transition:transform .3s;z-index:9999}
.toast.show{transform:translateX(-50%) translateY(0)}
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>🔄 Roblox Trade System</h1>
        <div style="display:flex;align-items:center;gap:15px;font-size:13px;color:var(--text-dim)">
            <div class="status-badge"><div class="pulse"></div><span>متصل</span></div>
            <span>⏱️ <span id="uptime">0s</span></span>
        </div>
    </div>
    <div class="key-card">
        <div class="key-header">
            <span class="icon">🔑</span>
            <span class="title">مفتاح API الخاص بك</span>
            <span class="hint">انسخه وحطه في سكربت Roblox</span>
        </div>
        <div class="key-value">
            <div class="key-text" id="api-key">${API_KEY}</div>
            <button class="key-btn" onclick="copyKey()">
                <span id="copy-icon">📋</span>
                <span id="copy-text">نسخ المفتاح</span>
            </button>
        </div>
        <div class="key-note">⚠️ لا تشارك هذا المفتاح مع أحد</div>
    </div>
    <div class="stats">
        <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-num" id="stat-users">0</div><div class="stat-lbl">لاعبين مسجلين</div></div>
        <div class="stat-card green"><div class="stat-icon">🔄</div><div class="stat-num" id="stat-trades">0</div><div class="stat-lbl">عروض نشطة</div></div>
        <div class="stat-card orange"><div class="stat-icon">✅</div><div class="stat-num" id="stat-total">0</div><div class="stat-lbl">إجمالي العروض</div></div>
        <div class="stat-card purple"><div class="stat-icon">⏱️</div><div class="stat-num" id="stat-uptime">0s</div><div class="stat-lbl">مدة التشغيل</div></div>
    </div>
    <div class="grid-2">
        <div class="panel">
            <div class="panel-header"><h2>🔄 العروض النشطة</h2><span style="font-size:12px;color:var(--text-dim)" id="trades-count">0 عرض</span></div>
            <div class="panel-body" id="trades-list"><div class="empty"><div class="empty-icon">📭</div><div>لا توجد عروض</div></div></div>
        </div>
        <div class="panel">
            <div class="panel-header"><h2>📜 آخر الأحداث</h2></div>
            <div class="panel-body" id="logs-list"><div class="empty"><div class="empty-icon">📋</div><div>لا توجد أحداث</div></div></div>
        </div>
    </div>
    <div class="footer">v1.0 • التحديث كل 3 ثواني</div>
</div>
<div class="toast" id="toast">✅ تم النسخ!</div>
<script>
const API_KEY = "${API_KEY}";
function timeAgo(ms){const s=Math.floor((Date.now()-ms)/1000);if(s<60)return s+' ثانية';if(s<3600)return Math.floor(s/60)+' دقيقة';if(s<86400)return Math.floor(s/3600)+' ساعة';return Math.floor(s/86400)+' يوم'}
function fmt(ms){const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60);if(h>0)return h+'h '+m+'m';if(m>0)return m+'m '+(s%60)+'s';return s+'s'}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function copyKey(){const k=document.getElementById('api-key').textContent.trim();const b=document.getElementById('copy-btn');const i=document.getElementById('copy-icon');const l=document.getElementById('copy-text');navigator.clipboard.writeText(k).then(()=>{b.classList.add('copied');i.textContent='✅';l.textContent='تم النسخ!';showToast('✅ تم نسخ المفتاح');setTimeout(()=>{b.classList.remove('copied');i.textContent='📋';l.textContent='نسخ المفتاح'},2000)})}
function showToast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2000)}
async function fStats(){try{const r=await fetch('/dashboard/stats',{headers:{'x-api-key':API_KEY}});if(!r.ok)return;const d=await r.json();document.getElementById('stat-users').textContent=d.users;document.getElementById('stat-trades').textContent=d.trades;document.getElementById('stat-total').textContent=d.totalTrades;document.getElementById('stat-uptime').textContent=fmt(d.uptime);document.getElementById('uptime').textContent=fmt(d.uptime)}catch(e){}}
async function fTrades(){try{const r=await fetch('/api/trades/all',{headers:{'x-api-key':API_KEY}});if(!r.ok)return;const t=await r.json();document.getElementById('trades-count').textContent=t.length+' عرض';const l=document.getElementById('trades-list');if(t.length===0){l.innerHTML='<div class="empty"><div class="empty-icon">📭</div><div>لا توجد عروض</div></div>';return}l.innerHTML=t.map(x=>{const av='https://www.roblox.com/headshot-thumbnail/image?userId='+(x.fromId||1)+'&width=150&height=150&format=png';const g=(x.myItems||[]).join(', ')||'—';const w=(x.theirItems||[]).join(', ')||'أي عرض';const n=x.note?'<div class="trade-row"><span class="label">💬</span><span class="trade-items">'+esc(x.note)+'</span></div>':'';return '<div class="trade-card"><img class="trade-avatar" src="'+av+'" onerror="this.style.display=\\'none\\'"><div class="trade-info"><div class="trade-name">👤 '+esc(x.fromName)+'</div><div class="trade-row"><span class="label">🎁 يعطي:</span><span class="trade-items">'+esc(g)+'</span></div><div class="trade-row"><span class="label">🎯 يبي:</span><span class="trade-items">'+esc(w)+'</span></div>'+n+'<div class="trade-time">⏱️ منذ '+timeAgo(x.createdAt)+'</div></div></div>'}).join('')}catch(e){}}
async function fLogs(){try{const r=await fetch('/dashboard/logs',{headers:{'x-api-key':API_KEY}});if(!r.ok)return;const ls=await r.json();const l=document.getElementById('logs-list');if(ls.length===0){l.innerHTML='<div class="empty"><div class="empty-icon">📋</div><div>لا توجد أحداث</div></div>';return}const ic={register:'👤',create:'📤',delete:'🗑️',accept:'✅',reject:'❌'};l.innerHTML=ls.map(x=>'<div class="log-item '+x.type+'"><div class="log-icon">'+(ic[x.type]||'📌')+'</div><div><div class="log-msg">'+esc(x.message)+'</div><div class="log-time">منذ '+timeAgo(x.time)+'</div></div></div>').join('')}catch(e){}}
function refresh(){fStats();fTrades();fLogs()}
refresh();setInterval(refresh,3000);
</script>
</body>
</html>`);
});

// ═══════════════════════════════════════════════════════
// 📊 Dashboard API
// ═══════════════════════════════════════════════════════
app.get('/dashboard/stats', auth, (req, res) => {
    res.json({
        users:       Object.keys(users).length,
        trades:      Object.values(trades).filter(t => t.status === 'pending').length,
        totalTrades: totalTrades,
        uptime:      Date.now() - START_TIME,
    });
});

app.get('/dashboard/logs', auth, (req, res) => res.json(logs));

// ═══════════════════════════════════════════════════════
// 📝 API
// ═══════════════════════════════════════════════════════
app.post('/api/register', auth, (req, res) => {
    const { robloxId, username, jobId } = req.body;
    if (!robloxId) return res.status(400).json({ error: 'Missing robloxId' });
    users[robloxId] = { robloxId, username, jobId, lastSeen: Date.now() };
    addLog('register', `${username} سجّل دخول`);
    res.json({ success: true });
});

app.post('/api/trade/create', auth, (req, res) => {
    const { fromId, fromName, myItems, theirItems, note, jobId } = req.body;
    if (!fromId) return res.status(400).json({ error: 'Missing fromId' });
    const id = 'tr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    trades[id] = {
        id, fromId, fromName,
        myItems: Array.isArray(myItems) ? myItems : [],
        theirItems: Array.isArray(theirItems) ? theirItems : [],
        note: note || "", jobId: jobId || "",
        status: 'pending', createdAt: Date.now()
    };
    totalTrades++;
    addLog('create', `${fromName} نشر عرضاً`);
    res.json({ success: true, tradeId: id });
});

app.get('/api/trades/all', auth, (req, res) => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const list = Object.values(trades).filter(t => t.status === 'pending' && t.createdAt > cutoff);
    list.sort((a, b) => b.createdAt - a.createdAt);
    res.json(list);
});

app.post('/api/trade/:id/delete', auth, (req, res) => {
    const trade = trades[req.params.id];
    if (!trade) return res.status(404).json({ error: 'Not found' });
    if (trade.fromId != req.body.fromId) return res.status(403).json({ error: 'Not yours' });
    addLog('delete', `${trade.fromName} حذف عرضه`);
    delete trades[req.params.id];
    res.json({ success: true });
});

app.post('/api/trade/:id/respond', auth, (req, res) => {
    const { accept, responderId } = req.body;
    const trade = trades[req.params.id];
    if (!trade) return res.status(404).json({ error: 'Not found' });
    if (trade.fromId == responderId) return res.status(403).json({ error: 'Own trade' });
    trade.status = accept ? 'accepted' : 'rejected';
    trade.respondedAt = Date.now();
    trade.responderId = responderId;
    addLog(accept ? 'accept' : 'reject', `تم ${accept ? 'قبول' : 'رفض'} عرض ${trade.fromName}`);
    res.json({ success: true, trade });
});

// تنظيف
setInterval(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const id in trades) {
        if (trades[id].createdAt < cutoff) delete trades[id];
    }
}, 60 * 60 * 1000);

// 🚀 تشغيل
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║  🚀 Roblox Trade System                  ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  🌐 Port: ${PORT}                            ║`);
    console.log(`║  🔑 Key: ${API_KEY}`);
    console.log('╚══════════════════════════════════════════╝');
});

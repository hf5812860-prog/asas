// ═══════════════════════════════════════════════════════
// Roblox Trade System v13.0 — Backend
// ═══════════════════════════════════════════════════════
const express = require('express');
const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.text({ type: ['text/*', 'application/json'], limit: '2mb' }));

app.use((req, res, next) => {
    if (typeof req.body === 'string' && req.body.trim()) {
        try { req.body = JSON.parse(req.body); } catch (e) {}
    }
    if (!req.body || typeof req.body !== 'object') req.body = {};
    next();
});

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const API_KEY = process.env.API_KEY || "JXZXCV";
const START_TIME = Date.now();
const ONLINE_TIMEOUT = 2 * 60 * 1000;
const TRADE_EXPIRE_MS = 30 * 1000;

const users         = {};
const trades        = {};
const tradeRequests = {};
const dmMessages    = {};
const chats         = [];
const logs          = [];
let totalTrades = 0;

function isOnline(u){ return u && (Date.now() - u.lastSeen < ONLINE_TIMEOUT); }
function getOnlineUsers(){ return Object.values(users).filter(isOnline); }

function addLog(type, message) {
    logs.unshift({ type, message, time: Date.now() });
    if (logs.length > 80) logs.length = 80;
    console.log('[' + type.toUpperCase() + '] ' + message);
}

function auth(req, res, next) {
    const key = req.headers['x-api-key'] || req.headers['X-API-KEY'] || req.query.key;
    if (key !== API_KEY) {
        console.log('[AUTH] ❌ rejected', req.method, req.path);
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

function convKey(a, b) {
    a = String(a); b = String(b);
    return a < b ? a + "_" + b : b + "_" + a;
}

function activeTrades() {
    const now = Date.now();
    return Object.values(trades).filter(t =>
        t.status === 'pending' && now - t.createdAt < TRADE_EXPIRE_MS
    ).sort((a, b) => b.createdAt - a.createdAt);
}

// ═══════════════════════════════════════════════════════
// 🏠 DASHBOARD
// ═══════════════════════════════════════════════════════
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>Roblox Trade System v13.0</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0f0f16;--bg-2:#16161f;--bg-3:#1e1e2b;--border:#2a2a3e;--text:#e4e4ed;--text-dim:#8888a0;--blue:#6ba8ff;--green:#4dc47e;--orange:#ffb84d;--red:#ff6b6b;--purple:#a78bfa;--cyan:#4dd4dd}
body{font-family:'Segoe UI',Tahoma,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;padding:20px}
.container{max-width:1400px;margin:0 auto}
.header{background:linear-gradient(135deg,#1e1e2b,#252535);border:1px solid var(--border);border-radius:16px;padding:20px 25px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:15px}
.header h1{font-size:24px;background:linear-gradient(90deg,#6ba8ff,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.status-badge{display:flex;align-items:center;gap:8px;background:rgba(77,196,126,.1);padding:6px 14px;border-radius:20px;border:1px solid rgba(77,196,126,.3);color:var(--green);font-weight:600;font-size:13px}
.pulse{width:8px;height:8px;background:var(--green);border-radius:50%;animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5;transform:scale(1.3)}}
.key-card{background:linear-gradient(135deg,#2a1e3e,#1e1e2b);border:1px solid #4a3a6e;border-radius:16px;padding:20px 25px;margin-bottom:20px}
.key-header{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.key-header .title{font-weight:bold;color:var(--purple);font-size:15px}
.key-value{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.key-text{flex:1;min-width:250px;background:rgba(0,0,0,.4);padding:12px 16px;border-radius:10px;font-family:monospace;font-size:13px;color:var(--green);letter-spacing:1px;border:1px solid #3a3a5e}
.key-btn{background:linear-gradient(135deg,#6ba8ff,#a78bfa);color:#fff;border:none;padding:12px 22px;border-radius:10px;font-weight:bold;cursor:pointer;font-size:13px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:15px;margin-bottom:20px}
.stat-card{background:linear-gradient(135deg,var(--bg-2),var(--bg-3));border:1px solid var(--border);border-radius:14px;padding:20px}
.stat-icon{font-size:28px;margin-bottom:10px}
.stat-num{font-size:32px;font-weight:bold;color:var(--blue);margin-bottom:4px}
.stat-card.green .stat-num{color:var(--green)}
.stat-card.orange .stat-num{color:var(--orange)}
.stat-card.purple .stat-num{color:var(--purple)}
.stat-card.cyan .stat-num{color:var(--cyan)}
.stat-lbl{font-size:13px;color:var(--text-dim)}
.grid-2{display:grid;grid-template-columns:1.6fr 1fr;gap:20px}
@media(max-width:900px){.grid-2{grid-template-columns:1fr}}
.panel{background:var(--bg-2);border:1px solid var(--border);border-radius:16px;overflow:hidden;margin-bottom:20px}
.panel-header{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;background:var(--bg-3)}
.panel-header h2{font-size:16px}
.panel-body{padding:15px;max-height:500px;overflow-y:auto}
.trade-card{background:var(--bg-3);border:1px solid var(--border);border-radius:12px;padding:15px;margin-bottom:10px;display:flex;gap:15px}
.trade-avatar{width:55px;height:55px;border-radius:50%;border:2px solid var(--blue);background:var(--bg);flex-shrink:0}
.trade-info{flex:1;min-width:0}
.trade-name{font-weight:bold;color:var(--blue);font-size:15px;margin-bottom:6px}
.trade-row{font-size:13px;margin-bottom:4px;display:flex;gap:6px}
.trade-row .label{color:var(--text-dim)}
.trade-items{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
.trade-time{font-size:11px;color:var(--text-dim);margin-top:8px}
.log-item{padding:12px;border-radius:10px;background:var(--bg-3);margin-bottom:8px;border-right:3px solid var(--blue);display:flex;gap:12px}
.log-item.create{border-color:var(--green)}
.log-item.delete{border-color:var(--red)}
.log-item.dm{border-color:var(--cyan)}
.log-item.chat{border-color:var(--purple)}
.log-item.trade_request{border-color:#00d4ff}
.log-item.accept{border-color:#00ff88}
.log-item.reject{border-color:#ff4466}
.log-msg{font-size:13px;margin-bottom:3px;word-break:break-word}
.log-time{font-size:11px;color:var(--text-dim)}
.empty{text-align:center;padding:40px 20px;color:var(--text-dim)}
.user-card{display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--bg-3);border:1px solid var(--border);border-radius:10px;margin-bottom:8px}
.user-avatar{width:40px;height:40px;border-radius:50%;border:2px solid var(--green)}
.user-name{font-weight:600;font-size:14px}
.user-status{font-size:11px;color:var(--green)}
.footer{text-align:center;padding:20px;color:var(--text-dim);font-size:12px}
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>🔄 Roblox Trade System v13.0</h1>
        <div style="display:flex;align-items:center;gap:15px;font-size:13px;color:var(--text-dim)">
            <div class="status-badge"><div class="pulse"></div><span>متصل</span></div>
            <span>⏱️ <span id="uptime">0s</span></span>
        </div>
    </div>
    <div class="key-card">
        <div class="key-header"><span>🔑</span><span class="title">مفتاح API</span></div>
        <div class="key-value">
            <div class="key-text">${API_KEY}</div>
            <button class="key-btn" onclick="navigator.clipboard.writeText('${API_KEY}');this.textContent='✅ تم'">📋 نسخ</button>
        </div>
    </div>
    <div class="stats">
        <div class="stat-card green"><div class="stat-icon">🟢</div><div class="stat-num" id="s-online">0</div><div class="stat-lbl">متصل الآن</div></div>
        <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-num" id="s-users">0</div><div class="stat-lbl">إجمالي اللاعبين</div></div>
        <div class="stat-card orange"><div class="stat-icon">🔄</div><div class="stat-num" id="s-trades">0</div><div class="stat-lbl">عروض نشطة</div></div>
        <div class="stat-card purple"><div class="stat-icon">📨</div><div class="stat-num" id="s-requests">0</div><div class="stat-lbl">طلبات مقايضة</div></div>
        <div class="stat-card cyan"><div class="stat-icon">💬</div><div class="stat-num" id="s-dms">0</div><div class="stat-lbl">محادثات</div></div>
    </div>
    <div class="grid-2">
        <div class="panel">
            <div class="panel-header"><h2>🔄 العروض النشطة (30s)</h2><span style="font-size:12px;color:var(--text-dim)" id="trades-count">0</span></div>
            <div class="panel-body" id="trades-list"><div class="empty">لا توجد عروض</div></div>
        </div>
        <div class="panel">
            <div class="panel-header"><h2>🟢 المتصلين الآن</h2></div>
            <div class="panel-body" id="online-list"><div class="empty">لا أحد متصل</div></div>
        </div>
    </div>
    <div class="panel">
        <div class="panel-header"><h2>📜 آخر الأحداث</h2></div>
        <div class="panel-body" id="logs-list" style="max-height:350px"><div class="empty">لا توجد أحداث</div></div>
    </div>
    <div class="footer">v13.0 • التحديث كل 3 ثواني</div>
</div>
<script>
const API_KEY = "${API_KEY}";
function timeAgo(ms){const s=Math.floor((Date.now()-ms)/1000);if(s<60)return s+' ث';if(s<3600)return Math.floor(s/60)+' د';return Math.floor(s/3600)+' س'}
function fmt(ms){const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60);if(h>0)return h+'h '+m+'m';if(m>0)return m+'m '+(s%60)+'s';return s+'s'}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
async function fStats(){
    try{
        const r=await fetch('/dashboard/stats',{headers:{'x-api-key':API_KEY}});
        if(!r.ok)return;
        const d=await r.json();
        document.getElementById('s-online').textContent=d.online;
        document.getElementById('s-users').textContent=d.users;
        document.getElementById('s-trades').textContent=d.trades;
        document.getElementById('s-requests').textContent=d.requests;
        document.getElementById('s-dms').textContent=d.conversations;
        document.getElementById('uptime').textContent=fmt(d.uptime);
    }catch(e){}
}
async function fTrades(){
    try{
        const r=await fetch('/api/trades/all',{headers:{'x-api-key':API_KEY}});
        if(!r.ok)return;
        const t=await r.json();
        document.getElementById('trades-count').textContent=(t.length||0)+' عرض';
        const l=document.getElementById('trades-list');
        if(!t.length){l.innerHTML='<div class="empty">لا توجد عروض</div>';return;}
        l.innerHTML=t.map(x=>{
            const av='https://www.roblox.com/headshot-thumbnail/image?userId='+(x.fromId||1)+'&width=150&height=150&format=png';
            const left=Math.max(0,30-Math.floor((Date.now()-x.createdAt)/1000));
            const cars=(x.myItems||[]).map(i=>String(i).split('||')[0]).join(' • ')||'—';
            const want=(x.theirItems||[]).join(' • ')||'أي عرض';
            return '<div class="trade-card"><img class="trade-avatar" src="'+av+'"><div class="trade-info"><div class="trade-name">👤 '+esc(x.fromName)+'</div><div class="trade-row"><span class="label">🚗 يعطي:</span><span class="trade-items">'+esc(cars)+'</span></div><div class="trade-row"><span class="label">🎯 يبي:</span><span class="trade-items">'+esc(want)+'</span></div><div class="trade-time">⏱️ ينتهي بعد '+left+' ثانية</div></div></div>';
        }).join('');
    }catch(e){}
}
async function fOnline(){
    try{
        const r=await fetch('/dashboard/online',{headers:{'x-api-key':API_KEY}});
        if(!r.ok)return;
        const list=await r.json();
        const l=document.getElementById('online-list');
        if(!list.length){l.innerHTML='<div class="empty">لا أحد متصل</div>';return;}
        l.innerHTML=list.map(u=>{
            const av='https://www.roblox.com/headshot-thumbnail/image?userId='+(u.robloxId||1)+'&width=150&height=150&format=png';
            const age=Math.floor((Date.now()-u.lastSeen)/1000);
            return '<div class="user-card"><img class="user-avatar" src="'+av+'"><div><div class="user-name">'+esc(u.username)+'</div><div class="user-status">منذ '+age+' ث</div></div></div>';
        }).join('');
    }catch(e){}
}
async function fLogs(){
    try{
        const r=await fetch('/dashboard/logs',{headers:{'x-api-key':API_KEY}});
        if(!r.ok)return;
        const ls=await r.json();
        const l=document.getElementById('logs-list');
        if(!ls.length){l.innerHTML='<div class="empty">لا توجد أحداث</div>';return;}
        const ic={register:'👤',create:'📤',delete:'🗑️',trade_request:'📨',accept:'✅',reject:'❌',dm:'💬',chat:'💭'};
        l.innerHTML=ls.map(x=>'<div class="log-item '+x.type+'"><div>'+(ic[x.type]||'📌')+'</div><div><div class="log-msg">'+esc(x.message)+'</div><div class="log-time">منذ '+timeAgo(x.time)+'</div></div></div>').join('');
    }catch(e){}
}
function refresh(){fStats();fTrades();fOnline();fLogs()}
refresh();
setInterval(refresh,3000);
</script>
</body>
</html>`);
});

app.get('/dashboard/stats', auth, (req, res) => {
    res.json({
        online:        getOnlineUsers().length,
        users:         Object.keys(users).length,
        trades:        activeTrades().length,
        requests:      Object.values(tradeRequests).filter(r => r.status === 'pending').length,
        conversations: Object.keys(dmMessages).length,
        chats:         chats.length,
        totalTrades,
        uptime:        Date.now() - START_TIME,
    });
});
app.get('/dashboard/online', auth, (req, res) => {
    res.json(getOnlineUsers().sort((a,b) => b.lastSeen - a.lastSeen));
});
app.get('/dashboard/logs', auth, (req, res) => res.json(logs));

// ═══════════════════════════════════════════════════════
// 📝 REGISTER + HEARTBEAT
// ═══════════════════════════════════════════════════════
app.post('/api/register', auth, (req, res) => {
    const { robloxId, username, jobId } = req.body;
    if (!robloxId) return res.status(400).json({ error: 'Missing robloxId' });
    const isNew = !users[robloxId];
    users[robloxId] = {
        robloxId: parseInt(robloxId),
        username: username || 'Unknown',
        jobId: jobId || '',
        lastSeen: Date.now(),
    };
    if (isNew) addLog('register', `${username} سجّل دخول`);
    res.json({ success: true });
});

app.post('/api/heartbeat', auth, (req, res) => {
    const { robloxId } = req.body;
    if (!robloxId) return res.status(400).json({ error: 'Missing robloxId' });
    if (!users[robloxId]) {
        users[robloxId] = { robloxId: parseInt(robloxId), username: 'Unknown', jobId: '', lastSeen: Date.now() };
    } else {
        users[robloxId].lastSeen = Date.now();
    }
    res.json({ success: true });
});

// ═══════════════════════════════════════════════════════
// 📤 CREATE TRADE
// ═══════════════════════════════════════════════════════
app.post('/api/trade/create', auth, (req, res) => {
    console.log('[CREATE] ═══════════════════════════');
    console.log('[CREATE] body:', JSON.stringify(req.body).slice(0, 500));

    const fromId   = req.body.fromId   || req.body.FromId || req.body.userId;
    const fromName = req.body.fromName || req.body.username || 'Unknown';
    let myItems     = req.body.myItems     || req.body.items || [];
    let theirItems  = req.body.theirItems  || req.body.want  || [];
    const note  = req.body.note  || '';
    const jobId = req.body.jobId || '';

    if (typeof myItems === 'string') {
        try { myItems = JSON.parse(myItems); } catch (e) { myItems = [myItems]; }
    }
    if (typeof theirItems === 'string') {
        try { theirItems = JSON.parse(theirItems); } catch (e) { theirItems = [theirItems]; }
    }
    if (!Array.isArray(myItems))    myItems = [];
    if (!Array.isArray(theirItems)) theirItems = [];

    if (!fromId) {
        console.log('[CREATE] ❌ Missing fromId');
        return res.status(400).json({ error: 'Missing fromId' });
    }

    const id = 'tr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const now = Date.now();

    trades[id] = {
        id,
        fromId: parseInt(fromId),
        fromName,
        myItems,
        theirItems,
        note,
        jobId,
        status: 'pending',
        createdAt: now,
        expiresAt: now + TRADE_EXPIRE_MS,
    };

    totalTrades++;
    addLog('create', `${fromName} نشر عرضاً`);
    console.log('[CREATE] ✅ محفوظ:', id, '| إجمالي:', Object.keys(trades).length);
    console.log('[CREATE] ═══════════════════════════');

    res.status(200).json({
        success: true,
        tradeId: id,
        trade: trades[id],
    });
});

app.get('/api/trades/all', auth, (req, res) => {
    const list = activeTrades();
    res.json(list);
});

app.post('/api/trade/:id/delete', auth, (req, res) => {
    const trade = trades[req.params.id];
    if (!trade) return res.status(404).json({ error: 'Not found' });
    if (req.body.fromId && trade.fromId !== parseInt(req.body.fromId)) {
        return res.status(403).json({ error: 'Not yours' });
    }
    addLog('delete', `${trade.fromName} حذف عرضه`);
    delete trades[req.params.id];
    res.json({ success: true });
});

// ═══════════════════════════════════════════════════════
// 📨 TRADE REQUESTS
// ═══════════════════════════════════════════════════════
app.post('/api/trade/request', auth, (req, res) => {
    const { tradeId, fromId, fromName, toId, toName, myItems } = req.body;
    if (!fromId || !toId) return res.status(400).json({ error: 'Missing data' });
    const id = 'req_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    tradeRequests[id] = {
        id,
        tradeId,
        fromId: parseInt(fromId),
        fromName,
        toId: parseInt(toId),
        toName,
        myItems: Array.isArray(myItems) ? myItems : [],
        status: 'pending',
        createdAt: Date.now(),
    };
    addLog('trade_request', `${fromName} أرسل طلب مقايضة إلى ${toName}`);
    res.json({ success: true, requestId: id });
});

app.get('/api/trade/requests/list/:userId', auth, (req, res) => {
    const uid = parseInt(req.params.userId);
    const list = Object.values(tradeRequests).filter(r =>
        (r.fromId === uid || r.toId === uid) && r.status !== 'rejected' && r.status !== 'cancelled'
    );
    list.sort((a, b) => b.createdAt - a.createdAt);
    res.json(list);
});

app.get('/api/trade/requests/:userId', auth, (req, res) => {
    const uid = parseInt(req.params.userId);
    const list = Object.values(tradeRequests).filter(r =>
        (r.fromId === uid || r.toId === uid) && r.status !== 'rejected' && r.status !== 'cancelled'
    );
    res.json(list);
});

app.post('/api/trade/request/accept', auth, (req, res) => {
    const { requestId, userId } = req.body;
    const r = tradeRequests[requestId];
    if (!r) return res.status(404).json({ error: 'Not found' });
    if (r.toId !== parseInt(userId)) return res.status(403).json({ error: 'Not yours' });
    r.status = 'accepted';
    r.acceptedAt = Date.now();
    const key = convKey(r.fromId, r.toId);
    if (!dmMessages[key]) dmMessages[key] = [];
    addLog('accept', `✅ ${r.toName} قبل عرض ${r.fromName}`);
    res.json({ success: true, requestId: r.id, otherId: r.fromId, otherName: r.fromName });
});

app.post('/api/trade/request/reject', auth, (req, res) => {
    const { requestId, userId } = req.body;
    const r = tradeRequests[requestId];
    if (!r) return res.status(404).json({ error: 'Not found' });
    r.status = 'rejected';
    r.rejectedAt = Date.now();
    addLog('reject', `${r.toName} رفض طلب ${r.fromName}`);
    res.json({ success: true });
});

app.post('/api/trade/confirm', auth, (req, res) => {
    const { tradeId } = req.body;
    const r = tradeRequests[tradeId];
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, trade: r });
});

app.post('/api/trade/cancel', auth, (req, res) => {
    const { tradeId } = req.body;
    const r = tradeRequests[tradeId];
    if (r) {
        r.status = 'cancelled';
        r.cancelledAt = Date.now();
    }
    res.json({ success: true });
});

// ═══════════════════════════════════════════════════════
// 💬 DM
// ═══════════════════════════════════════════════════════
app.get('/api/dm/conversations/:userId', auth, (req, res) => {
    const uid = parseInt(req.params.userId);
    const result = [];
    const seen = new Set();
    for (const key in dmMessages) {
        const [a, b] = key.split('_').map(Number);
        if (a === uid || b === uid) {
            const otherId = a === uid ? b : a;
            if (seen.has(otherId)) continue;
            seen.add(otherId);
            const otherUser = users[otherId];
            const msgs = dmMessages[key];
            result.push({
                userId: otherId,
                name: otherUser ? otherUser.username : ('Player' + otherId),
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
        result.push({
            userId: otherId,
            name: otherName,
            lastMsg: '— محادثة جديدة —',
            lastTime: r.acceptedAt || r.createdAt,
        });
    }
    result.sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));
    res.json(result);
});

app.get('/api/dm/messages/:fromId/:toId', auth, (req, res) => {
    const key = convKey(req.params.fromId, req.params.toId);
    res.json({ messages: dmMessages[key] || [] });
});

app.post('/api/dm/send', auth, (req, res) => {
    const { fromId, fromName, toId, toName, message } = req.body;
    if (!fromId || !toId || !message) return res.status(400).json({ error: 'Missing data' });
    if (String(message).length > 500) return res.status(400).json({ error: 'Too long' });
    const key = convKey(fromId, toId);
    if (!dmMessages[key]) dmMessages[key] = [];
    dmMessages[key].push({
        fromId: parseInt(fromId),
        fromName,
        toId: parseInt(toId),
        toName,
        message: String(message).trim(),
        time: Date.now(),
    });
    if (dmMessages[key].length > 300) dmMessages[key].splice(0, dmMessages[key].length - 300);
    addLog('dm', `${fromName} → ${toName}: ${String(message).slice(0, 40)}`);
    res.json({ success: true });
});

// ═══════════════════════════════════════════════════════
// 💭 CHAT عام
// ═══════════════════════════════════════════════════════
app.get('/chat/messages', (req, res) => {
    res.json({
        messages: chats.slice(-100),
        online: getOnlineUsers().length,
    });
});

app.post('/chat/send', (req, res) => {
    const { username, message, userId } = req.body;
    if (!username || !message) return res.status(400).json({ error: 'Missing data' });
    if (message.length > 200) return res.status(400).json({ error: 'Too long' });
    chats.push({
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
        userId: userId || 1,
        username,
        message: message.trim(),
        time: Date.now(),
    });
    if (chats.length > 200) chats.splice(0, chats.length - 200);
    addLog('chat', `${username}: ${message.substring(0, 50)}`);
    res.json({ success: true });
});

// ═══════════════════════════════════════════════════════
// 🧹 تنظيف
// ═══════════════════════════════════════════════════════
setInterval(() => {
    const now = Date.now();
    for (const id in trades) {
        if (now - trades[id].createdAt > TRADE_EXPIRE_MS) {
            console.log('[CLEANUP] 🗑️ حذف عرض منتهي:', id);
            delete trades[id];
        }
    }
    for (const id in tradeRequests) {
        if (now - tradeRequests[id].createdAt > 10 * 60 * 1000) {
            delete tradeRequests[id];
        }
    }
}, 5000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║  🚀 Roblox Trade System v13.0            ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  🌐 Port: ${PORT}`);
    console.log(`║  🔑 Key: ${API_KEY}`);
    console.log('╚══════════════════════════════════════════╝');
    console.log('');
});

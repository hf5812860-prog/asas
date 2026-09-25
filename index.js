// ═══════════════════════════════════════════════════════
// Roblox Trade System v8.0 — Backend + Dashboard
// Trade + Chat + DM + Trade Requests + 30s Expire
// ═══════════════════════════════════════════════════════

const express = require('express');
const app = express();

app.use(express.json());
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
const TRADE_EXPIRE_MS = 30 * 1000;   // 30 ثانية

const users         = {};
const trades        = {};
const chats         = [];
const privateMsgs   = {};
const tradeRequests = {};
const logs          = [];
let totalTrades = 0;

function isOnline(u){ return u && (Date.now() - u.lastSeen < ONLINE_TIMEOUT); }
function getOnlineUsers(){ return Object.values(users).filter(isOnline); }

function addLog(type, message) {
    logs.unshift({ type, message, time: Date.now() });
    if (logs.length > 50) logs.length = 50;
    console.log('[' + type.toUpperCase() + '] ' + message);
}

function auth(req, res, next) {
    if (req.headers['x-api-key'] !== API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

function convKey(id1, id2) {
    const a = String(id1), b = String(id2);
    return a < b ? (a + "_" + b) : (b + "_" + a);
}

// ═══════════════════════════════════════════════════════
// 🎨 DASHBOARD
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
.nav{display:flex;gap:10px}
.nav a{padding:10px 20px;background:var(--bg-3);border:1px solid var(--border);border-radius:10px;color:var(--text);text-decoration:none;font-size:13px;font-weight:600}
.nav a:hover,.nav a.active{background:linear-gradient(135deg,#6ba8ff,#a78bfa);border-color:transparent;color:#fff}
.status-badge{display:flex;align-items:center;gap:8px;background:rgba(77,196,126,.1);padding:6px 14px;border-radius:20px;border:1px solid rgba(77,196,126,.3);color:var(--green);font-weight:600;font-size:13px}
.pulse{width:8px;height:8px;background:var(--green);border-radius:50%;animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5;transform:scale(1.3)}}
.key-card{background:linear-gradient(135deg,#2a1e3e,#1e1e2b);border:1px solid #4a3a6e;border-radius:16px;padding:20px 25px;margin-bottom:20px}
.key-header{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.key-header .icon{font-size:22px}
.key-header .title{font-weight:bold;color:var(--purple);font-size:15px}
.key-value{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.key-text{flex:1;min-width:250px;background:rgba(0,0,0,.4);padding:12px 16px;border-radius:10px;font-family:monospace;font-size:13px;color:var(--green);letter-spacing:1px;border:1px solid #3a3a5e;overflow-x:auto;white-space:nowrap}
.key-btn{background:linear-gradient(135deg,#6ba8ff,#a78bfa);color:#fff;border:none;padding:12px 22px;border-radius:10px;font-weight:bold;cursor:pointer;font-size:13px;font-family:inherit}
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
.trade-items{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.trade-time{font-size:11px;color:var(--text-dim);margin-top:8px}
.log-item{padding:12px;border-radius:10px;background:var(--bg-3);margin-bottom:8px;border-right:3px solid var(--blue);display:flex;gap:12px;align-items:flex-start}
.log-item.create{border-color:var(--green)}
.log-item.delete{border-color:var(--red)}
.log-item.chat{border-color:var(--purple)}
.log-item.dm{border-color:var(--orange)}
.log-item.trade_request{border-color:#00d4ff}
.log-item.trade_complete{border-color:#00ff88}
.log-icon{font-size:18px}
.log-msg{font-size:13px;margin-bottom:3px;word-break:break-word}
.log-time{font-size:11px;color:var(--text-dim)}
.empty{text-align:center;padding:40px 20px;color:var(--text-dim)}
.empty-icon{font-size:40px;margin-bottom:10px;opacity:.4}
.user-card{display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--bg-3);border:1px solid var(--border);border-radius:10px;margin-bottom:8px}
.user-avatar{width:40px;height:40px;border-radius:50%;border:2px solid var(--green);background:var(--bg)}
.user-name{font-weight:600;font-size:14px}
.user-status{font-size:11px;color:var(--green);display:flex;align-items:center;gap:4px}
.dot-online{width:6px;height:6px;background:var(--green);border-radius:50%;animation:pulse 1.5s infinite}
.footer{text-align:center;padding:20px;color:var(--text-dim);font-size:12px}
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>🔄 Roblox Trade System v8.0</h1>
        <div class="nav">
            <a href="/" class="active">📊 Dashboard</a>
            <a href="/chat">💬 Chat</a>
        </div>
        <div style="display:flex;align-items:center;gap:15px;font-size:13px;color:var(--text-dim)">
            <div class="status-badge"><div class="pulse"></div><span>متصل</span></div>
            <span>⏱️ <span id="uptime">0s</span></span>
        </div>
    </div>

    <div class="key-card">
        <div class="key-header"><span class="icon">🔑</span><span class="title">مفتاح API</span></div>
        <div class="key-value">
            <div class="key-text" id="api-key">${API_KEY}</div>
            <button class="key-btn" onclick="navigator.clipboard.writeText('${API_KEY}');this.textContent='✅ تم'">📋 نسخ</button>
        </div>
    </div>

    <div class="stats">
        <div class="stat-card green"><div class="stat-icon">🟢</div><div class="stat-num" id="s-online">0</div><div class="stat-lbl">متصل الآن</div></div>
        <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-num" id="s-users">0</div><div class="stat-lbl">إجمالي اللاعبين</div></div>
        <div class="stat-card orange"><div class="stat-icon">🔄</div><div class="stat-num" id="s-trades">0</div><div class="stat-lbl">عروض نشطة</div></div>
        <div class="stat-card purple"><div class="stat-icon">🤝</div><div class="stat-num" id="s-requests">0</div><div class="stat-lbl">طلبات مقايضة</div></div>
    </div>

    <div class="grid-2">
        <div class="panel">
            <div class="panel-header"><h2>🔄 العروض النشطة (30s)</h2><span style="font-size:12px;color:var(--text-dim)" id="trades-count">0</span></div>
            <div class="panel-body" id="trades-list"><div class="empty"><div class="empty-icon">📭</div><div>لا توجد عروض</div></div></div>
        </div>
        <div class="panel">
            <div class="panel-header"><h2>🟢 المتصلين الآن</h2></div>
            <div class="panel-body" id="online-list"><div class="empty"><div class="empty-icon">👥</div><div>لا أحد متصل</div></div></div>
        </div>
    </div>

    <div class="panel">
        <div class="panel-header"><h2>📜 آخر الأحداث</h2></div>
        <div class="panel-body" id="logs-list" style="max-height:300px"><div class="empty"><div class="empty-icon">📋</div><div>لا توجد أحداث</div></div></div>
    </div>

    <div class="footer">v8.0 • التحديث كل 3 ثواني</div>
</div>
<script>
const API_KEY = "${API_KEY}";
function timeAgo(ms){const s=Math.floor((Date.now()-ms)/1000);if(s<60)return s+' ث';if(s<3600)return Math.floor(s/60)+' د';if(s<86400)return Math.floor(s/3600)+' س';return Math.floor(s/86400)+' ي'}
function fmt(ms){const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60);if(h>0)return h+'h '+m+'m';if(m>0)return m+'m '+(s%60)+'s';return s+'s'}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
async function fStats(){try{const r=await fetch('/dashboard/stats',{headers:{'x-api-key':API_KEY}});if(!r.ok)return;const d=await r.json();document.getElementById('s-online').textContent=d.online;document.getElementById('s-users').textContent=d.users;document.getElementById('s-trades').textContent=d.trades;document.getElementById('s-requests').textContent=d.requests;document.getElementById('uptime').textContent=fmt(d.uptime)}catch(e){}}
async function fTrades(){try{const r=await fetch('/api/trades/all',{headers:{'x-api-key':API_KEY}});if(!r.ok)return;const t=await r.json();document.getElementById('trades-count').textContent=t.length+' عرض';const l=document.getElementById('trades-list');if(t.length===0){l.innerHTML='<div class="empty"><div class="empty-icon">📭</div><div>لا توجد عروض</div></div>';return}l.innerHTML=t.map(x=>{const av='https://www.roblox.com/headshot-thumbnail/image?userId='+(x.fromId||1)+'&width=150&height=150&format=png';const g=(x.myItems||[]).join(' • ')||'—';const w=(x.theirItems||[]).join(' • ')||'أي عرض';return '<div class="trade-card"><img class="trade-avatar" src="'+av+'"><div class="trade-info"><div class="trade-name">👤 '+esc(x.fromName)+'</div><div class="trade-row"><span class="label">🎁 يعطي:</span><span class="trade-items">'+esc(g)+'</span></div><div class="trade-row"><span class="label">🎯 يبي:</span><span class="trade-items">'+esc(w)+'</span></div><div class="trade-time">⏱️ منذ '+timeAgo(x.createdAt)+'</div></div></div>'}).join('')}catch(e){}}
async function fOnline(){try{const r=await fetch('/dashboard/online',{headers:{'x-api-key':API_KEY}});if(!r.ok)return;const list=await r.json();const l=document.getElementById('online-list');if(list.length===0){l.innerHTML='<div class="empty"><div class="empty-icon">👥</div><div>لا أحد متصل</div></div>';return}l.innerHTML=list.map(u=>{const av='https://www.roblox.com/headshot-thumbnail/image?userId='+(u.robloxId||1)+'&width=150&height=150&format=png';const age=Math.floor((Date.now()-u.lastSeen)/1000);return '<div class="user-card"><img class="user-avatar" src="'+av+'"><div style="flex:1"><div class="user-name">'+esc(u.username)+'</div><div class="user-status"><span class="dot-online"></span>منذ '+age+' ث</div></div></div>'}).join('')}catch(e){}}
async function fLogs(){try{const r=await fetch('/dashboard/logs',{headers:{'x-api-key':API_KEY}});if(!r.ok)return;const ls=await r.json();const l=document.getElementById('logs-list');if(ls.length===0){l.innerHTML='<div class="empty"><div class="empty-icon">📋</div><div>لا توجد أحداث</div></div>';return}const ic={register:'👤',create:'📤',delete:'🗑️',chat:'💬',dm:'✉️',trade_request:'🤝',trade_complete:'✅'};l.innerHTML=ls.map(x=>'<div class="log-item '+x.type+'"><div class="log-icon">'+(ic[x.type]||'📌')+'</div><div><div class="log-msg">'+esc(x.message)+'</div><div class="log-time">منذ '+timeAgo(x.time)+'</div></div></div>').join('')}catch(e){}}
function refresh(){fStats();fTrades();fOnline();fLogs()}
refresh();setInterval(refresh,3000);
</script>
</body>
</html>`);
});

// ═══════════════════════════════════════════════════════
// 💬 CHAT PAGE
// ═══════════════════════════════════════════════════════
app.get('/chat', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Chat</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0f0f16;--bg-2:#16161f;--bg-3:#1e1e2b;--border:#2a2a3e;--text:#e4e4ed;--text-dim:#8888a0;--blue:#6ba8ff;--green:#4dc47e;--purple:#a78bfa}
body{font-family:'Segoe UI',Tahoma,sans-serif;background:var(--bg);color:var(--text);height:100vh;overflow:hidden;padding:20px;display:flex;flex-direction:column}
.top-bar{background:linear-gradient(135deg,#1e1e2b,#252535);border:1px solid var(--border);border-radius:16px;padding:15px 20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:15px}
.top-bar h1{font-size:20px;background:linear-gradient(90deg,#6ba8ff,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.nav{display:flex;gap:10px}
.nav a{padding:10px 20px;background:var(--bg-3);border:1px solid var(--border);border-radius:10px;color:var(--text);text-decoration:none;font-size:13px;font-weight:600}
.nav a:hover,.nav a.active{background:linear-gradient(135deg,#6ba8ff,#a78bfa);border-color:transparent;color:#fff}
.main-grid{flex:1;display:grid;grid-template-columns:280px 1fr;gap:20px;min-height:0}
@media(max-width:800px){.main-grid{grid-template-columns:1fr}}
.sidebar{background:var(--bg-2);border:1px solid var(--border);border-radius:16px;overflow:hidden;display:flex;flex-direction:column}
.sidebar-header{padding:15px;background:var(--bg-3);border-bottom:1px solid var(--border);font-weight:bold;color:var(--blue);font-size:14px}
.user-list{flex:1;overflow-y:auto;padding:10px}
.user-item{display:flex;gap:10px;align-items:center;padding:10px;background:var(--bg-3);border:1px solid var(--border);border-radius:10px;margin-bottom:6px;cursor:pointer;transition:.15s}
.user-item:hover{border-color:var(--blue)}
.user-item.active{background:linear-gradient(135deg,#2a4a6e,#3a5a7e);border-color:#4a6a8e}
.user-item-avatar{width:38px;height:38px;border-radius:50%;border:2px solid var(--green)}
.user-item-info{flex:1;min-width:0}
.user-item-name{font-size:13px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.user-item-status{font-size:11px;color:var(--green)}
.chat-area{background:var(--bg-2);border:1px solid var(--border);border-radius:16px;overflow:hidden;display:flex;flex-direction:column}
.chat-header{padding:15px 20px;background:var(--bg-3);border-bottom:1px solid var(--border);font-weight:bold;color:var(--blue);display:flex;justify-content:space-between;align-items:center}
.chat-header .online-count{font-size:12px;color:var(--green);display:flex;align-items:center;gap:6px}
.dot-online{width:8px;height:8px;background:var(--green);border-radius:50%;animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5;transform:scale(1.3)}}
.messages{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:12px}
.msg{display:flex;gap:10px;align-items:flex-start;max-width:70%}
.msg.self{align-self:flex-start;flex-direction:row-reverse}
.msg-avatar{width:40px;height:40px;border-radius:50%;border:2px solid var(--blue);flex-shrink:0;background:var(--bg)}
.msg-body{background:var(--bg-3);padding:10px 14px;border-radius:12px;border:1px solid var(--border)}
.msg.self .msg-body{background:linear-gradient(135deg,#2a4a6e,#3a5a7e);border-color:#4a6a8e}
.msg-name{font-size:11px;color:var(--blue);font-weight:600;margin-bottom:4px}
.msg-text{font-size:14px;color:var(--text);word-wrap:break-word;line-height:1.5}
.msg-time{font-size:10px;color:var(--text-dim);margin-top:4px}
.input-area{padding:15px;background:var(--bg-3);border-top:1px solid var(--border);display:flex;gap:10px}
.input{flex:1;padding:12px 16px;background:var(--bg);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:inherit;font-size:14px;outline:none}
.input:focus{border-color:var(--blue)}
.send-btn{padding:12px 24px;background:linear-gradient(135deg,#6ba8ff,#a78bfa);color:#fff;border:none;border-radius:10px;font-weight:bold;cursor:pointer;font-family:inherit;font-size:14px}
.send-btn:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(107,168,255,.3)}
.login-bar{background:var(--bg-2);border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:20px;display:flex;gap:10px}
.login-input{flex:1;padding:12px 16px;background:var(--bg);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:inherit;font-size:14px;outline:none}
.login-btn{padding:12px 24px;background:linear-gradient(135deg,#4dc47e,#3aa86a);color:#fff;border:none;border-radius:10px;font-weight:bold;cursor:pointer;font-family:inherit;font-size:14px}
</style>
</head>
<body>

<div class="login-bar" id="login-bar">
    <input class="login-input" id="username-input" placeholder="اكتب اسمك (نفس اسمك في Roblox)" maxlength="30">
    <button class="login-btn" onclick="login()">دخول</button>
</div>

<div class="top-bar" id="top-bar" style="display:none">
    <h1>💬 الشات</h1>
    <div class="nav">
        <a href="/">📊 Dashboard</a>
        <a href="/chat" class="active">💬 Chat</a>
    </div>
    <div style="font-size:12px;color:var(--text-dim)">👤 <span id="my-name">-</span></div>
</div>

<div class="main-grid" id="main-grid" style="display:none">
    <div class="sidebar">
        <div class="sidebar-header">👥 المتصلين الآن</div>
        <div class="user-list" id="user-list">
            <div style="text-align:center;color:#888;padding:20px;font-size:12px">لا أحد متصل</div>
        </div>
    </div>
    <div class="chat-area">
        <div class="chat-header">
            <span id="chat-title">💬 الدردشة العامة</span>
            <div class="online-count"><span class="dot-online"></span><span id="online-count">0</span> متصل</div>
        </div>
        <div class="messages" id="messages"></div>
        <div class="input-area">
            <input class="input" id="msg-input" placeholder="اكتب رسالتك..." maxlength="200" onkeypress="if(event.key==='Enter')sendMsg()">
            <button class="send-btn" onclick="sendMsg()">📤</button>
        </div>
    </div>
</div>

<script>
let myUsername = localStorage.getItem('chat_username') || '';
let currentChat = 'public';
let lastMsgCount = 0;
let currentUserId = null;

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function timeAgo(ms){const s=Math.floor((Date.now()-ms)/1000);if(s<60)return 'الآن';if(s<3600)return Math.floor(s/60)+' د';if(s<86400)return Math.floor(s/3600)+' س';return Math.floor(s/86400)+' ي'}

async function login(){
    const n = document.getElementById('username-input').value.trim();
    if(n.length < 2){alert('اكتب اسمك أول');return}
    myUsername = n;
    localStorage.setItem('chat_username', n);
    try{
        const r = await fetch('/chat/find-user?username=' + encodeURIComponent(n));
        if(r.ok){const d = await r.json(); currentUserId = d.userId;}
    }catch(e){}
    document.getElementById('login-bar').style.display = 'none';
    document.getElementById('top-bar').style.display = 'flex';
    document.getElementById('main-grid').style.display = 'grid';
    document.getElementById('my-name').textContent = myUsername;
    loadUsers();
    loadMessages(true);
}

async function loadUsers(){
    try{
        const r = await fetch('/chat/users');
        if(!r.ok) return;
        const list = await r.json();
        document.getElementById('online-count').textContent = list.length;
        const ul = document.getElementById('user-list');
        if(list.length === 0){
            ul.innerHTML = '<div style="text-align:center;color:#888;padding:20px;font-size:12px">لا أحد متصل</div>';
            return;
        }
        ul.innerHTML = list.map(u=>{
            const av = 'https://www.roblox.com/headshot-thumbnail/image?userId='+(u.robloxId||1)+'&width=150&height=150&format=png';
            const isSelf = u.username === myUsername;
            const isActive = String(currentChat) === String(u.robloxId);
            return '<div class="user-item '+(isActive?'active':'')+'" onclick="openDM('+u.robloxId+', \\''+esc(u.username)+'\\')"><img class="user-item-avatar" src="'+av+'"><div class="user-item-info"><div class="user-item-name">'+esc(u.username)+(isSelf?' (أنت)':'')+'</div><div class="user-item-status">🟢 متصل</div></div></div>';
        }).join('');
    }catch(e){}
}

function openDM(userId, username){
    currentChat = String(userId);
    lastMsgCount = 0;
    document.getElementById('chat-title').textContent = '💬 محادثة خاصة مع ' + username;
    loadMessages(true);
    loadUsers();
}

function openPublic(){
    currentChat = 'public';
    lastMsgCount = 0;
    document.getElementById('chat-title').textContent = '💬 الدردشة العامة';
    loadMessages(true);
    loadUsers();
}

async function sendMsg(){
    if(!myUsername){alert('سجل دخول أول');return}
    const inp = document.getElementById('msg-input');
    const msg = inp.value.trim();
    if(!msg) return;
    inp.value = '';

    try{
        if(currentChat === 'public'){
            await fetch('/chat/send',{
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({username: myUsername, message: msg, userId: currentUserId})
            });
        } else {
            await fetch('/chat/dm/send',{
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({
                    fromId: currentUserId,
                    fromName: myUsername,
                    toId: parseInt(currentChat),
                    message: msg
                })
            });
        }
        loadMessages(true);
    }catch(e){alert('فشل الإرسال')}
}

async function loadMessages(force){
    try{
        let url;
        if(currentChat === 'public'){
            url = '/chat/messages';
        } else {
            url = '/chat/dm/messages?fromId=' + currentUserId + '&toId=' + currentChat;
        }
        const r = await fetch(url);
        if(!r.ok) return;
        const data = await r.json();
        const messages = currentChat === 'public' ? data.messages : data;

        if(!force && messages.length === lastMsgCount) return;
        lastMsgCount = messages.length;

        const c = document.getElementById('messages');
        const wasAtBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 100;

        if(messages.length === 0){
            c.innerHTML = '<div style="text-align:center;color:#888;padding:40px">لا توجد رسائل. كن أول من يكتب!</div>';
            return;
        }

        c.innerHTML = messages.map(m=>{
            const self = m.username === myUsername || m.fromName === myUsername;
            const av = 'https://www.roblox.com/headshot-thumbnail/image?userId='+(m.userId||m.fromId||1)+'&width=150&height=150&format=png';
            const name = m.username || m.fromName;
            return '<div class="msg '+(self?'self':'')+'"><img class="msg-avatar" src="'+av+'"><div class="msg-body"><div class="msg-name">'+esc(name)+'</div><div class="msg-text">'+esc(m.message)+'</div><div class="msg-time">'+timeAgo(m.time)+'</div></div></div>';
        }).join('');

        if(wasAtBottom || force) c.scrollTop = c.scrollHeight;
    }catch(e){}
}

if(myUsername){
    fetch('/chat/find-user?username=' + encodeURIComponent(myUsername)).then(r=>{
        if(r.ok){
            r.json().then(d=>{
                currentUserId = d.userId;
                document.getElementById('login-bar').style.display = 'none';
                document.getElementById('top-bar').style.display = 'flex';
                document.getElementById('main-grid').style.display = 'grid';
                document.getElementById('my-name').textContent = myUsername;
                loadUsers();
                loadMessages(true);
            });
        }
    });
}

loadUsers();
loadMessages(true);
setInterval(()=>{ loadUsers(); loadMessages(false); }, 2000);
</script>
</body>
</html>`);
});

// ═══════════════════════════════════════════════════════
// 📊 DASHBOARD APIS
// ═══════════════════════════════════════════════════════
app.get('/dashboard/stats', auth, (req, res) => {
    res.json({
        online:   getOnlineUsers().length,
        users:    Object.keys(users).length,
        trades:   Object.values(trades).filter(t => t.status === 'pending').length,
        requests: Object.values(tradeRequests).filter(r => r.status === 'pending').length,
        chats:    chats.length,
        uptime:   Date.now() - START_TIME,
    });
});

app.get('/dashboard/online', auth, (req, res) => {
    res.json(getOnlineUsers().sort((a,b) => b.lastSeen - a.lastSeen));
});

app.get('/dashboard/logs', auth, (req, res) => res.json(logs));

// ═══════════════════════════════════════════════════════
// 💬 CHAT APIS
// ═══════════════════════════════════════════════════════
app.get('/chat/users', (req, res) => {
    res.json(getOnlineUsers().sort((a,b) => b.lastSeen - a.lastSeen));
});

app.get('/chat/find-user', (req, res) => {
    const username = req.query.username;
    for(const id in users){
        if(users[id].username === username){
            return res.json({userId: users[id].robloxId, username: users[id].username});
        }
    }
    res.status(404).json({error:'not found'});
});

app.get('/chat/messages', (req, res) => {
    res.json({
        messages: chats.slice(-100),
        online: getOnlineUsers().length,
    });
});

app.post('/chat/send', (req, res) => {
    const { username, message, userId } = req.body;
    if(!username || !message) return res.status(400).json({error:'Missing data'});
    if(message.length > 200) return res.status(400).json({error:'Too long'});

    chats.push({
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
        userId: userId || 1,
        username,
        message: message.trim(),
        time: Date.now(),
    });
    if(chats.length > 200) chats.splice(0, chats.length - 200);

    addLog('chat', `${username}: ${message.substring(0, 50)}`);
    res.json({success: true});
});

// 💌 DM
app.post('/chat/dm/send', (req, res) => {
    const { fromId, fromName, toId, message } = req.body;
    if(!fromId || !toId || !message) return res.status(400).json({error:'Missing data'});
    if(message.length > 200) return res.status(400).json({error:'Too long'});

    const key = convKey(fromId, toId);
    if(!privateMsgs[key]) privateMsgs[key] = [];

    privateMsgs[key].push({
        id: 'dm_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
        fromId: parseInt(fromId),
        fromName,
        toId: parseInt(toId),
        username: fromName,
        userId: parseInt(fromId),
        message: message.trim(),
        time: Date.now(),
    });
    if(privateMsgs[key].length > 200) privateMsgs[key].splice(0, privateMsgs[key].length - 200);

    addLog('dm', `${fromName} → ${toId}: ${message.substring(0, 30)}`);
    res.json({success: true});
});

app.get('/chat/dm/messages', (req, res) => {
    const fromId = req.query.fromId;
    const toId = req.query.toId;
    if(!fromId || !toId) return res.status(400).json({error:'Missing data'});
    const key = convKey(fromId, toId);
    res.json(privateMsgs[key] || []);
});

// ═══════════════════════════════════════════════════════
// 📝 TRADE APIS
// ═══════════════════════════════════════════════════════
app.post('/api/register', auth, (req, res) => {
    const { robloxId, username, jobId } = req.body;
    if(!robloxId) return res.status(400).json({error:'Missing robloxId'});

    const isNew = !users[robloxId];
    users[robloxId] = { robloxId, username, jobId, lastSeen: Date.now() };
    if(isNew) addLog('register', `${username} سجّل دخول`);
    res.json({success: true});
});

app.post('/api/heartbeat', auth, (req, res) => {
    const { robloxId } = req.body;
    if(!robloxId) return res.status(400).json({error:'Missing robloxId'});

    if(!users[robloxId]){
        users[robloxId] = { robloxId, username: 'Unknown', jobId: '', lastSeen: Date.now() };
    } else {
        users[robloxId].lastSeen = Date.now();
    }
    res.json({success: true});
});

app.post('/api/trade/create', auth, (req, res) => {
    const { fromId, fromName, myItems, theirItems, note, jobId } = req.body;
    if(!fromId) return res.status(400).json({error:'Missing fromId'});

    const id = 'tr_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
    trades[id] = {
        id, fromId, fromName,
        myItems: Array.isArray(myItems) ? myItems : [],
        theirItems: Array.isArray(theirItems) ? theirItems : [],
        note: note || "",
        jobId: jobId || "",
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + TRADE_EXPIRE_MS,
    };
    totalTrades++;
    addLog('create', `${fromName} نشر عرضاً: [${(myItems||[]).join(', ')}]`);
    res.json({success: true, tradeId: id});
});

app.get('/api/trades/all', auth, (req, res) => {
    const now = Date.now();
    const list = Object.values(trades).filter(t =>
        t.status === 'pending' && (now - t.createdAt) < TRADE_EXPIRE_MS
    );
    list.sort((a,b) => b.createdAt - a.createdAt);
    res.json(list);
});

app.post('/api/trade/:id/delete', auth, (req, res) => {
    const trade = trades[req.params.id];
    if(!trade) return res.status(404).json({error:'Not found'});
    if(trade.fromId != req.body.fromId) return res.status(403).json({error:'Not yours'});
    addLog('delete', `${trade.fromName} حذف عرضه`);
    delete trades[req.params.id];
    res.json({success: true});
});

// ═══════════════════════════════════════════════════════
// 🤝 TRADE REQUESTS (نظام المقايضة)
// ═══════════════════════════════════════════════════════
app.post('/api/trade/request', auth, (req, res) => {
    const { tradeId, fromId, fromName, toId, toName } = req.body;
    if(!tradeId || !fromId || !toId) return res.status(400).json({error:'Missing data'});

    const reqId = 'trq_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);

    tradeRequests[reqId] = {
        id: reqId,
        tradeId,
        fromId,
        fromName,
        toId,
        toName,
        status: 'pending',
        myCars: [],
        theirCars: [],
        myConfirmed: false,
        theirConfirmed: false,
        createdAt: Date.now(),
    };

    addLog('trade_request', `${fromName} قبل عرض ${toName}`);
    res.json({ success: true, requestId: reqId });
});

app.get('/api/trade/requests/:userId', auth, (req, res) => {
    const uid = parseInt(req.params.userId);
    const list = Object.values(tradeRequests).filter(r =>
        (r.fromId === uid || r.toId === uid) && r.status === 'pending'
    );
    list.sort((a,b) => b.createdAt - a.createdAt);
    res.json(list);
});

app.post('/api/trade/confirm', auth, (req, res) => {
    const { tradeId, userId, username, cars } = req.body;
    const t = tradeRequests[tradeId];
    if(!t) return res.status(404).json({error:'Not found'});

    if(userId === t.fromId){
        t.myCars = cars || [];
        t.myConfirmed = true;
    }
    if(userId === t.toId){
        t.theirCars = cars || [];
        t.theirConfirmed = true;
    }

    if(t.myConfirmed && t.theirConfirmed){
        t.status = 'completed';
        t.completedAt = Date.now();
        addLog('trade_complete', `✅ تمت المقايضة بين ${t.fromName} و ${t.toName}`);
    }

    res.json({ success: true, trade: t, completed: t.status === 'completed' });
});

app.post('/api/trade/cancel', auth, (req, res) => {
    const { tradeId, userId } = req.body;
    const t = tradeRequests[tradeId];
    if(t){
        t.status = 'cancelled';
        t.cancelledAt = Date.now();
        addLog('delete', `${t.fromName} ألغى المقايضة`);
    }
    res.json({success: true});
});

// جلب حالة طلب معين (للمزامنة)
app.get('/api/trade/request/:id', auth, (req, res) => {
    const t = tradeRequests[req.params.id];
    if(!t) return res.status(404).json({error:'Not found'});
    res.json(t);
});

// ═══════════════════════════════════════════════════════
// ⏰ تنظيف دوري
// ═══════════════════════════════════════════════════════
setInterval(() => {
    const now = Date.now();

    // احذف العروض المنتهية (30 ثانية)
    for(const id in trades){
        if(now - trades[id].createdAt > TRADE_EXPIRE_MS){
            delete trades[id];
        }
    }

    // احذف طلبات المقايضة القديمة (5 دقائق)
    for(const id in tradeRequests){
        if(now - tradeRequests[id].createdAt > 5 * 60 * 1000){
            delete tradeRequests[id];
        }
    }
}, 5000);

// ═══════════════════════════════════════════════════════
// 🚀 تشغيل
// ═══════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║  🚀 Roblox Trade System v8.0             ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  🌐 Port: ${PORT}                            ║`);
    console.log(`║  🔑 Key: ${API_KEY}`);
    console.log('║  💬 Chat + DM + Trade Requests            ║');
    console.log('║  ⏱️  Trade Expire: 30 seconds             ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('');
});

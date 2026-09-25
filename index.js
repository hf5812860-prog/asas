// ═══════════════════════════════════════════════════════
// Roblox Trade System v2.0
// • Shات كامل
// • heartbeat للاعبين المتصلين
// • تتبع نشاط حقيقي
// ═══════════════════════════════════════════════════════

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

const API_KEY = process.env.API_KEY || "JXZXCV";
const START_TIME = Date.now();

// 💾 Storage
const users    = {};    // { userId: {username, jobId, lastSeen, online} }
const trades   = {};    // { tradeId: {...} }
const chats    = [];    // [{id, userId, username, message, time, room}]
const logs     = [];
let totalTrades = 0;

// ⏱️ نشط = آخر 2 دقيقة
const ONLINE_TIMEOUT = 2 * 60 * 1000;

function isOnline(user) {
    return user && (Date.now() - user.lastSeen < ONLINE_TIMEOUT);
}

function getOnlineUsers() {
    return Object.values(users).filter(isOnline);
}

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
.nav{display:flex;gap:10px}
.nav a{padding:10px 20px;background:var(--bg-3);border:1px solid var(--border);border-radius:10px;color:var(--text);text-decoration:none;font-size:13px;font-weight:600;transition:.2s}
.nav a:hover,.nav a.active{background:linear-gradient(135deg,#6ba8ff,#a78bfa);border-color:transparent;color:#fff}
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
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:15px;margin-bottom:20px}
.stat-card{background:linear-gradient(135deg,var(--bg-2),var(--bg-3));border:1px solid var(--border);border-radius:14px;padding:20px}
.stat-icon{font-size:28px;margin-bottom:10px}
.stat-num{font-size:32px;font-weight:bold;color:var(--blue);margin-bottom:4px}
.stat-card.green .stat-num{color:var(--green)}
.stat-card.orange .stat-num{color:var(--orange)}
.stat-card.purple .stat-num{color:var(--purple)}
.stat-card.red .stat-num{color:var(--red)}
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

/* Online users */
.user-card{display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--bg-3);border:1px solid var(--border);border-radius:10px;margin-bottom:8px}
.user-avatar{width:40px;height:40px;border-radius:50%;border:2px solid var(--green);background:var(--bg)}
.user-name{font-weight:600;font-size:14px;color:var(--text)}
.user-status{font-size:11px;color:var(--green);display:flex;align-items:center;gap:4px}
.dot-online{width:6px;height:6px;background:var(--green);border-radius:50%;animation:pulse 1.5s infinite}

/* Chat */
.chat-container{display:flex;flex-direction:column;height:600px;background:var(--bg-2);border:1px solid var(--border);border-radius:16px;overflow:hidden}
.chat-header{padding:16px 20px;background:var(--bg-3);border-bottom:1px solid var(--border);font-weight:bold;color:var(--blue)}
.chat-messages{flex:1;overflow-y:auto;padding:15px;display:flex;flex-direction:column;gap:10px}
.chat-msg{display:flex;gap:10px;align-items:flex-start;max-width:80%}
.chat-msg.self{align-self:flex-end;flex-direction:row-reverse}
.chat-msg-avatar{width:36px;height:36px;border-radius:50%;border:2px solid var(--blue);flex-shrink:0}
.chat-msg-body{background:var(--bg-3);padding:10px 14px;border-radius:12px;border:1px solid var(--border)}
.chat-msg.self .chat-msg-body{background:linear-gradient(135deg,#2a4a6e,#3a5a7e);border-color:#4a6a8e}
.chat-msg-name{font-size:11px;color:var(--blue);font-weight:600;margin-bottom:4px}
.chat-msg-text{font-size:14px;color:var(--text);word-wrap:break-word;max-width:400px}
.chat-msg-time{font-size:10px;color:var(--text-dim);margin-top:4px}
.chat-input-area{padding:15px;background:var(--bg-3);border-top:1px solid var(--border);display:flex;gap:10px}
.chat-input{flex:1;padding:12px 16px;background:var(--bg);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:inherit;font-size:14px;outline:none}
.chat-input:focus{border-color:var(--blue)}
.chat-send{padding:12px 24px;background:linear-gradient(135deg,#6ba8ff,#a78bfa);color:#fff;border:none;border-radius:10px;font-weight:bold;cursor:pointer;font-family:inherit;font-size:14px}
.chat-send:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(107,168,255,.3)}
.toast{position:fixed;bottom:30px;left:50%;transform:translateX(-50%) translateY(100px);background:linear-gradient(135deg,#4dc47e,#3aa86a);color:#fff;padding:14px 28px;border-radius:12px;font-weight:bold;box-shadow:0 10px 30px rgba(0,0,0,.4);transition:transform .3s;z-index:9999}
.toast.show{transform:translateX(-50%) translateY(0)}
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>🔄 Roblox Trade System</h1>
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
    </div>

    <div class="stats">
        <div class="stat-card green"><div class="stat-icon">🟢</div><div class="stat-num" id="stat-online">0</div><div class="stat-lbl">متصل الآن</div></div>
        <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-num" id="stat-users">0</div><div class="stat-lbl">إجمالي اللاعبين</div></div>
        <div class="stat-card orange"><div class="stat-icon">🔄</div><div class="stat-num" id="stat-trades">0</div><div class="stat-lbl">عروض نشطة</div></div>
        <div class="stat-card purple"><div class="stat-icon">⏱️</div><div class="stat-num" id="stat-uptime">0s</div><div class="stat-lbl">مدة التشغيل</div></div>
    </div>

    <div class="grid-2">
        <div class="panel">
            <div class="panel-header"><h2>🔄 العروض النشطة</h2><span style="font-size:12px;color:var(--text-dim)" id="trades-count">0 عرض</span></div>
            <div class="panel-body" id="trades-list"><div class="empty"><div class="empty-icon">📭</div><div>لا توجد عروض</div></div></div>
        </div>
        <div class="panel">
            <div class="panel-header"><h2>🟢 المتصلين الآن</h2></div>
            <div class="panel-body" id="online-list"><div class="empty"><div class="empty-icon">👥</div><div>لا أحد متصل</div></div></div>
        </div>
    </div>

    <div class="panel" style="margin-top:20px">
        <div class="panel-header"><h2>📜 آخر الأحداث</h2></div>
        <div class="panel-body" id="logs-list" style="max-height:300px"><div class="empty"><div class="empty-icon">📋</div><div>لا توجد أحداث</div></div></div>
    </div>

    <div class="footer">v2.0 • التحديث كل 3 ثواني</div>
</div>
<div class="toast" id="toast">✅ تم النسخ!</div>
<script>
const API_KEY = "${API_KEY}";
function timeAgo(ms){const s=Math.floor((Date.now()-ms)/1000);if(s<60)return s+' ثانية';if(s<3600)return Math.floor(s/60)+' دقيقة';if(s<86400)return Math.floor(s/3600)+' ساعة';return Math.floor(s/86400)+' يوم'}
function fmt(ms){const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60);if(h>0)return h+'h '+m+'m';if(m>0)return m+'m '+(s%60)+'s';return s+'s'}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function copyKey(){const k=document.getElementById('api-key').textContent.trim();navigator.clipboard.writeText(k).then(()=>{showToast('✅ تم نسخ المفتاح')})}
function showToast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2000)}
async function fStats(){try{const r=await fetch('/dashboard/stats',{headers:{'x-api-key':API_KEY}});if(!r.ok)return;const d=await r.json();document.getElementById('stat-online').textContent=d.online;document.getElementById('stat-users').textContent=d.users;document.getElementById('stat-trades').textContent=d.trades;document.getElementById('stat-uptime').textContent=fmt(d.uptime);document.getElementById('uptime').textContent=fmt(d.uptime)}catch(e){}}
async function fTrades(){try{const r=await fetch('/api/trades/all',{headers:{'x-api-key':API_KEY}});if(!r.ok)return;const t=await r.json();document.getElementById('trades-count').textContent=t.length+' عرض';const l=document.getElementById('trades-list');if(t.length===0){l.innerHTML='<div class="empty"><div class="empty-icon">📭</div><div>لا توجد عروض</div></div>';return}l.innerHTML=t.map(x=>{const av='https://www.roblox.com/headshot-thumbnail/image?userId='+(x.fromId||1)+'&width=150&height=150&format=png';const g=(x.myItems||[]).join(', ')||'—';const w=(x.theirItems||[]).join(', ')||'أي عرض';const n=x.note?'<div class="trade-row"><span class="label">💬</span><span class="trade-items">'+esc(x.note)+'</span></div>':'';return '<div class="trade-card"><img class="trade-avatar" src="'+av+'" onerror="this.style.display=\\'none\\'"><div class="trade-info"><div class="trade-name">👤 '+esc(x.fromName)+'</div><div class="trade-row"><span class="label">🎁 يعطي:</span><span class="trade-items">'+esc(g)+'</span></div><div class="trade-row"><span class="label">🎯 يبي:</span><span class="trade-items">'+esc(w)+'</span></div>'+n+'<div class="trade-time">⏱️ منذ '+timeAgo(x.createdAt)+'</div></div></div>'}).join('')}catch(e){}}
async function fOnline(){try{const r=await fetch('/dashboard/online',{headers:{'x-api-key':API_KEY}});if(!r.ok)return;const list=await r.json();const l=document.getElementById('online-list');if(list.length===0){l.innerHTML='<div class="empty"><div class="empty-icon">👥</div><div>لا أحد متصل</div></div>';return}l.innerHTML=list.map(u=>{const av='https://www.roblox.com/headshot-thumbnail/image?userId='+(u.robloxId||1)+'&width=150&height=150&format=png';const age=Math.floor((Date.now()-u.lastSeen)/1000);return '<div class="user-card"><img class="user-avatar" src="'+av+'" onerror="this.style.display=\\'none\\'"><div style="flex:1"><div class="user-name">'+esc(u.username)+'</div><div class="user-status"><span class="dot-online"></span>نشط منذ '+age+' ثانية</div></div></div>'}).join('')}catch(e){}}
async function fLogs(){try{const r=await fetch('/dashboard/logs',{headers:{'x-api-key':API_KEY}});if(!r.ok)return;const ls=await r.json();const l=document.getElementById('logs-list');if(ls.length===0){l.innerHTML='<div class="empty"><div class="empty-icon">📋</div><div>لا توجد أحداث</div></div>';return}const ic={register:'👤',create:'📤',delete:'🗑️',accept:'✅',reject:'❌',chat:'💬'};l.innerHTML=ls.map(x=>'<div class="log-item '+x.type+'"><div class="log-icon">'+(ic[x.type]||'📌')+'</div><div><div class="log-msg">'+esc(x.message)+'</div><div class="log-time">منذ '+timeAgo(x.time)+'</div></div></div>').join('')}catch(e){}}
function refresh(){fStats();fTrades();fOnline();fLogs()}
refresh();setInterval(refresh,3000);
</script>
</body>
</html>`);
});

// ═══════════════════════════════════════════════════════
// 💬 صفحة الشات
// ═══════════════════════════════════════════════════════
app.get('/chat', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Chat — Roblox Trade System</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0f0f16;--bg-2:#16161f;--bg-3:#1e1e2b;--border:#2a2a3e;--text:#e4e4ed;--text-dim:#8888a0;--blue:#6ba8ff;--green:#4dc47e;--purple:#a78bfa}
body{font-family:'Segoe UI',Tahoma,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;padding:20px}
.container{max-width:1000px;margin:0 auto}
.header{background:linear-gradient(135deg,#1e1e2b,#252535);border:1px solid var(--border);border-radius:16px;padding:20px 25px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:15px}
.header h1{font-size:24px;background:linear-gradient(90deg,#6ba8ff,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.nav{display:flex;gap:10px}
.nav a{padding:10px 20px;background:var(--bg-3);border:1px solid var(--border);border-radius:10px;color:var(--text);text-decoration:none;font-size:13px;font-weight:600;transition:.2s}
.nav a:hover,.nav a.active{background:linear-gradient(135deg,#6ba8ff,#a78bfa);border-color:transparent;color:#fff}
.login-bar{background:var(--bg-2);border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:20px;display:flex;gap:10px}
.login-input{flex:1;padding:12px 16px;background:var(--bg);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:inherit;font-size:14px;outline:none}
.login-input:focus{border-color:var(--blue)}
.login-btn{padding:12px 24px;background:linear-gradient(135deg,#4dc47e,#3aa86a);color:#fff;border:none;border-radius:10px;font-weight:bold;cursor:pointer;font-family:inherit;font-size:14px}
.chat-container{display:flex;flex-direction:column;height:600px;background:var(--bg-2);border:1px solid var(--border);border-radius:16px;overflow:hidden}
.chat-header{padding:16px 20px;background:var(--bg-3);border-bottom:1px solid var(--border);font-weight:bold;color:var(--blue);display:flex;justify-content:space-between;align-items:center}
.chat-online{font-size:12px;color:var(--text-dim);display:flex;align-items:center;gap:6px}
.dot-online{width:8px;height:8px;background:var(--green);border-radius:50%;animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5;transform:scale(1.3)}}
.chat-messages{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:12px}
.chat-msg{display:flex;gap:10px;align-items:flex-start;max-width:75%}
.chat-msg.self{align-self:flex-start;flex-direction:row-reverse}
.chat-msg-avatar{width:40px;height:40px;border-radius:50%;border:2px solid var(--blue);flex-shrink:0;background:var(--bg)}
.chat-msg-body{background:var(--bg-3);padding:10px 14px;border-radius:12px;border:1px solid var(--border)}
.chat-msg.self .chat-msg-body{background:linear-gradient(135deg,#2a4a6e,#3a5a7e);border-color:#4a6a8e}
.chat-msg-name{font-size:11px;color:var(--blue);font-weight:600;margin-bottom:4px}
.chat-msg-text{font-size:14px;color:var(--text);word-wrap:break-word;line-height:1.5}
.chat-msg-time{font-size:10px;color:var(--text-dim);margin-top:4px}
.chat-input-area{padding:15px;background:var(--bg-3);border-top:1px solid var(--border);display:flex;gap:10px}
.chat-input{flex:1;padding:12px 16px;background:var(--bg);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:inherit;font-size:14px;outline:none}
.chat-input:focus{border-color:var(--blue)}
.chat-send{padding:12px 24px;background:linear-gradient(135deg,#6ba8ff,#a78bfa);color:#fff;border:none;border-radius:10px;font-weight:bold;cursor:pointer;font-family:inherit;font-size:14px}
.chat-send:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(107,168,255,.3)}
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>💬 الشات العام</h1>
        <div class="nav">
            <a href="/">📊 Dashboard</a>
            <a href="/chat" class="active">💬 Chat</a>
        </div>
    </div>

    <div class="login-bar" id="login-bar">
        <input class="login-input" id="username-input" placeholder="اكتب اسمك (مثال: اسمك في Roblox)" maxlength="30">
        <button class="login-btn" onclick="login()">دخول</button>
    </div>

    <div class="chat-container" id="chat-container" style="display:none">
        <div class="chat-header">
            <span>💬 الدردشة العامة</span>
            <div class="chat-online"><span class="dot-online"></span><span id="online-count">0</span> متصل</div>
        </div>
        <div class="chat-messages" id="chat-messages"></div>
        <div class="chat-input-area">
            <input class="chat-input" id="message-input" placeholder="اكتب رسالتك..." maxlength="200" onkeypress="if(event.key==='Enter')sendMsg()">
            <button class="chat-send" onclick="sendMsg()">📤 إرسال</button>
        </div>
    </div>
</div>

<script>
let myUsername = localStorage.getItem('chat_username') || '';
let lastMsgCount = 0;

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function timeAgo(ms){const s=Math.floor((Date.now()-ms)/1000);if(s<60)return 'الآن';if(s<3600)return Math.floor(s/60)+' د';if(s<86400)return Math.floor(s/3600)+' س';return Math.floor(s/86400)+' ي'}

function login(){
    const n = document.getElementById('username-input').value.trim();
    if(n.length < 2){alert('اكتب اسمك أول');return}
    myUsername = n;
    localStorage.setItem('chat_username', n);
    document.getElementById('login-bar').style.display = 'none';
    document.getElementById('chat-container').style.display = 'flex';
    loadMessages(true);
}

async function sendMsg(){
    if(!myUsername){alert('سجل دخول أول');return}
    const inp = document.getElementById('message-input');
    const msg = inp.value.trim();
    if(!msg) return;
    inp.value = '';

    try{
        await fetch('/chat/send',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({username: myUsername, message: msg})
        });
        loadMessages(true);
    }catch(e){alert('فشل الإرسال')}
}

async function loadMessages(force){
    try{
        const r = await fetch('/chat/messages');
        if(!r.ok) return;
        const data = await r.json();
        document.getElementById('online-count').textContent = data.online;

        if(!force && data.messages.length === lastMsgCount) return;
        lastMsgCount = data.messages.length;

        const c = document.getElementById('chat-messages');
        const wasAtBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 100;

        if(data.messages.length === 0){
            c.innerHTML = '<div style="text-align:center;color:#888;padding:40px">لا توجد رسائل بعد. كن أول من يكتب!</div>';
            return;
        }

        c.innerHTML = data.messages.map(m=>{
            const self = m.username === myUsername;
            const av = 'https://www.roblox.com/headshot-thumbnail/image?userId='+(m.userId||1)+'&width=150&height=150&format=png';
            return '<div class="chat-msg '+(self?'self':'')+'"><img class="chat-msg-avatar" src="'+av+'" onerror="this.style.display=\\'none\\'"><div class="chat-msg-body"><div class="chat-msg-name">'+esc(m.username)+'</div><div class="chat-msg-text">'+esc(m.message)+'</div><div class="chat-msg-time">'+timeAgo(m.time)+'</div></div></div>';
        }).join('');

        if(wasAtBottom || force) c.scrollTop = c.scrollHeight;
    }catch(e){}
}

if(myUsername){
    document.getElementById('login-bar').style.display = 'none';
    document.getElementById('chat-container').style.display = 'flex';
}

loadMessages(true);
setInterval(()=>loadMessages(false), 2000);
</script>
</body>
</html>`);
});

// ═══════════════════════════════════════════════════════
// 📊 Dashboard APIs
// ═══════════════════════════════════════════════════════
app.get('/dashboard/stats', auth, (req, res) => {
    res.json({
        online:      getOnlineUsers().length

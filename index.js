// Roblox Trade System v12.1
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
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key, X-API-KEY');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const API_KEY = process.env.API_KEY || 'JXZXCV';
const START_TIME = Date.now();
const ONLINE_TIMEOUT = 2 * 60 * 1000;
const TRADE_EXPIRE_MS = 30 * 1000;
const g = global.__tradeStore || { users: {}, trades: {}, tradeRequests: {}, dmMessages: {}, logs: [], totalTrades: 0 };
global.__tradeStore = g;
const { users, trades, tradeRequests, dmMessages, logs } = g;

function isOnline(u) { return u && Date.now() - u.lastSeen < ONLINE_TIMEOUT; }
function getOnlineUsers() { return Object.values(users).filter(isOnline); }
function addLog(type, message) {
  logs.unshift({ type, message, time: Date.now() });
  if (logs.length > 80) logs.length = 80;
  console.log('[' + type.toUpperCase() + '] ' + message);
}
function auth(req, res, next) {
  const key = req.headers['x-api-key'] || req.headers['X-API-KEY'] || req.query.key;
  if (key !== API_KEY) return res.status(401).json({ success: false, error: 'Unauthorized' });
  next();
}
function convKey(a, b) { a = String(a); b = String(b); return a < b ? a + '_' + b : b + '_' + a; }
function activeTrades() {
  const now = Date.now();
  return Object.values(trades).filter(t => t.status === 'pending' && now - t.createdAt < TRADE_EXPIRE_MS).sort((a,b) => b.createdAt - a.createdAt);
}
function toInt(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; }
function ensureConv(a, b) { const k = convKey(a, b); if (!dmMessages[k]) dmMessages[k] = []; return k; }

function sendDash(_req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>Trade System v12.1</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Segoe UI,Tahoma,sans-serif;background:#0f0f16;color:#e4e4ed;padding:20px}
.wrap{max-width:1400px;margin:0 auto}
.header,.card{background:#16161f;border:1px solid #2a2a3e;border-radius:16px;padding:18px;margin-bottom:16px}
h1{background:linear-gradient(90deg,#6ba8ff,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px}
.stat{background:#1e1e2b;border:1px solid #2a2a3e;border-radius:14px;padding:16px}
.num{font-size:28px;font-weight:700;color:#6ba8ff}
.grid{display:grid;grid-template-columns:1.6fr 1fr;gap:16px}
@media(max-width:900px){.grid{grid-template-columns:1fr}}
.item{background:#1e1e2b;border:1px solid #2a2a3e;border-radius:12px;padding:12px;margin-bottom:8px}
.key{font-family:monospace;color:#4dc47e;background:#000;padding:10px;border-radius:8px}
.empty{color:#888;text-align:center;padding:30px}
</style></head><body><div class="wrap">
<div class="header"><h1>Roblox Trade System v12.1</h1><div>عروض + طلبات + دردشة خاصة</div></div>
<div class="card"><b>API KEY</b><div class="key">${API_KEY}</div></div>
<div class="stats">
<div class="stat"><div class="num" id="s-online">0</div><div>متصل</div></div>
<div class="stat"><div class="num" id="s-users">0</div><div>لاعبين</div></div>
<div class="stat"><div class="num" id="s-trades">0</div><div>عروض</div></div>
<div class="stat"><div class="num" id="s-requests">0</div><div>طلبات</div></div>
<div class="stat"><div class="num" id="s-dms">0</div><div>دردشات خاصة</div></div>
</div>
<div class="grid">
<div class="card"><h3>العروض النشطة</h3><div id="trades-list" class="empty">لا توجد عروض</div></div>
<div class="card"><h3>المتصلين</h3><div id="online-list" class="empty">لا أحد متصل</div></div>
</div>
<div class="card"><h3>الأحداث</h3><div id="logs-list" class="empty">لا توجد أحداث</div></div>
</div>
<script>
const K="${API_KEY}";
const H={'x-api-key':K};
function esc(s){return String(s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
async function j(u){const r=await fetch(u,{headers:H});return r.ok?r.json():null}
async function refresh(){
  const s=await j('/dashboard/stats'); if(s){document.getElementById('s-online').textContent=s.online;document.getElementById('s-users').textContent=s.users;document.getElementById('s-trades').textContent=s.trades;document.getElementById('s-requests').textContent=s.requests;document.getElementById('s-dms').textContent=s.conversations;}
  const raw=await j('/api/trades/all'); const t=raw? (Array.isArray(raw)?raw:(raw.trades||[])):[];
  const tl=document.getElementById('trades-list');
  tl.innerHTML=t.length?t.map(x=>{const cars=(x.myItems||[]).map(i=>String(i).split('||')[0]).join(' • ');const left=Math.max(0,30-Math.floor((Date.now()-x.createdAt)/1000));return '<div class="item"><b>'+esc(x.fromName)+'</b><div>🚗 '+esc(cars)+'</div><div>🎯 '+esc((x.theirItems||[]).join(' • ')||'أي عرض')+'</div><div>⏱️ '+left+' ث</div></div>'}).join(''):'<div class="empty">لا توجد عروض</div>';
  const o=await j('/dashboard/online')||[];
  document.getElementById('online-list').innerHTML=o.length?o.map(u=>'<div class="item"><b>'+esc(u.username)+'</b></div>').join(''):'<div class="empty">لا أحد متصل</div>';
  const l=await j('/dashboard/logs')||[];
  document.getElementById('logs-list').innerHTML=l.length?l.map(x=>'<div class="item">'+esc(x.message)+'</div>').join(''):'<div class="empty">لا توجد أحداث</div>';
}
refresh(); setInterval(refresh,3000);
</script></body></html>`);
}
app.get('/', sendDash);
app.get('/dashboard', sendDash);
app.get('/index.html', sendDash);
app.get('/health', (_req, res) => res.json({ ok: true, dashboard: true }));

app.get('/dashboard/stats', auth, (_req, res) => {
  res.json({ success:true, online:getOnlineUsers().length, users:Object.keys(users).length, trades:activeTrades().length, requests:Object.values(tradeRequests).filter(r=>r.status==='pending').length, conversations:Object.keys(dmMessages).length, totalTrades:g.totalTrades, uptime:Date.now()-START_TIME });
});
app.get('/dashboard/online', auth, (_req, res) => res.json(getOnlineUsers().sort((a,b)=>b.lastSeen-a.lastSeen)));
app.get('/dashboard/logs', auth, (_req, res) => res.json(logs));

app.post('/api/register', auth, (req, res) => {
  const { robloxId, username, jobId } = req.body;
  if (!robloxId) return res.status(400).json({ success:false, error:'Missing robloxId' });
  const id = String(robloxId);
  const isNew = !users[id];
  users[id] = { robloxId:toInt(robloxId), username:username||'Unknown', jobId:jobId||'', lastSeen:Date.now() };
  if (isNew) addLog('register', (username||id)+' سجّل دخول');
  res.json({ success:true });
});
app.post('/api/heartbeat', auth, (req, res) => {
  const { robloxId } = req.body;
  if (!robloxId) return res.status(400).json({ success:false, error:'Missing robloxId' });
  const id = String(robloxId);
  if (!users[id]) users[id] = { robloxId:toInt(robloxId), username:'Unknown', jobId:'', lastSeen:Date.now() };
  else users[id].lastSeen = Date.now();
  res.json({ success:true });
});

app.post('/api/trade/create', auth, (req, res) => {
  const fromId = req.body.fromId || req.body.userId;
  const fromName = req.body.fromName || req.body.username || 'Unknown';
  let myItems = req.body.myItems || [];
  let theirItems = req.body.theirItems || [];
  if (typeof myItems === 'string') { try { myItems = JSON.parse(myItems); } catch(e) { myItems = [myItems]; } }
  if (typeof theirItems === 'string') { try { theirItems = JSON.parse(theirItems); } catch(e) { theirItems = [theirItems]; } }
  if (!Array.isArray(myItems)) myItems = [];
  if (!Array.isArray(theirItems)) theirItems = [];
  if (!fromId || !myItems.length) return res.status(400).json({ success:false, error:'Missing fromId or cars' });
  const id = 'tr_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  const now = Date.now();
  trades[id] = { id, fromId:toInt(fromId), fromName, myItems, theirItems, note:req.body.note||'', jobId:req.body.jobId||'', status:'pending', createdAt:now, expiresAt:now+TRADE_EXPIRE_MS };
  g.totalTrades++;
  addLog('create', fromName+' نشر عرضاً');
  res.json({ success:true, tradeId:id, id, trade:trades[id] });
});
app.get('/api/trades/all', auth, (_req, res) => res.json({ success:true, trades: activeTrades() }));
app.post('/api/trade/:id/delete', auth, (req, res) => {
  const trade = trades[req.params.id];
  if (!trade) return res.json({ success:true });
  if (req.body.fromId && trade.fromId !== toInt(req.body.fromId)) return res.status(403).json({ success:false, error:'Not yours' });
  addLog('delete', trade.fromName+' حذف عرضه');
  delete trades[req.params.id];
  res.json({ success:true });
});

app.post('/api/trade/request', auth, (req, res) => {
  const { tradeId, fromId, fromName, toId, toName, myItems } = req.body;
  if (!fromId || !toId) return res.status(400).json({ success:false, error:'Missing data' });
  const offered = Array.isArray(myItems) ? myItems : [];
  if (!offered.length) return res.status(400).json({ success:false, error:'No cars offered' });
  const id = 'req_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  tradeRequests[id] = { id, tradeId, fromId:toInt(fromId), fromName, toId:toInt(toId), toName, myItems:offered, status:'pending', createdAt:Date.now() };
  addLog('trade_request', fromName+' أرسل طلب مقايضة إلى '+toName);
  res.json({ success:true, requestId:id, id });
});
app.get('/api/trade/requests/list/:userId', auth, (req, res) => {
  const uid = toInt(req.params.userId);
  res.json(Object.values(tradeRequests).filter(r => (r.fromId===uid||r.toId===uid) && r.status!=='rejected' && r.status!=='cancelled').sort((a,b)=>b.createdAt-a.createdAt));
});
app.get('/api/trade/requests/:userId', auth, (req, res) => {
  const uid = toInt(req.params.userId);
  res.json(Object.values(tradeRequests).filter(r => (r.fromId===uid||r.toId===uid) && r.status!=='rejected' && r.status!=='cancelled'));
});
app.post('/api/trade/request/accept', auth, (req, res) => {
  const r = tradeRequests[req.body.requestId];
  if (!r) return res.status(404).json({ success:false, error:'Not found' });
  if (r.toId !== toInt(req.body.userId)) return res.status(403).json({ success:false, error:'Not yours' });
  r.status = 'accepted';
  r.acceptedAt = Date.now();
  const key = ensureConv(r.fromId, r.toId);
  dmMessages[key].push({ fromId:r.toId, fromName:r.toName, toId:r.fromId, toName:r.fromName, message:'✅ تم قبول المقايضة — تقدرون تكملون من الدردشة الخاصة', time:Date.now() });
  addLog('accept', r.toName+' قبل عرض '+r.fromName);
  res.json({ success:true, requestId:r.id, otherId:r.fromId, otherName:r.fromName });
});
app.post('/api/trade/request/reject', auth, (req, res) => {
  const r = tradeRequests[req.body.requestId];
  if (!r) return res.status(404).json({ success:false, error:'Not found' });
  r.status = 'rejected';
  r.rejectedAt = Date.now();
  addLog('reject', r.toName+' رفض طلب '+r.fromName);
  res.json({ success:true });
});

app.get('/api/dm/conversations/:userId', auth, (req, res) => {
  const uid = toInt(req.params.userId);
  const result = [];
  const seen = new Set();
  for (const key in dmMessages) {
    const [a,b] = key.split('_').map(Number);
    if (a!==uid && b!==uid) continue;
    const otherId = a===uid ? b : a;
    if (seen.has(otherId)) continue;
    seen.add(otherId);
    const msgs = dmMessages[key] || [];
    const last = msgs[msgs.length-1];
    const otherUser = users[String(otherId)];
    result.push({ userId:otherId, name: otherUser ? otherUser.username : (last ? (last.fromId===otherId?last.fromName:last.toName) : ('Player'+otherId)), lastMsg: last?last.message:'', lastTime: last?last.time:0 });
  }
  for (const id in tradeRequests) {
    const r = tradeRequests[id];
    if (r.status !== 'accepted') continue;
    let otherId, otherName;
    if (r.fromId===uid) { otherId=r.toId; otherName=r.toName; }
    else if (r.toId===uid) { otherId=r.fromId; otherName=r.fromName; }
    else continue;
    if (seen.has(otherId)) continue;
    seen.add(otherId);
    result.push({ userId:otherId, name:otherName, lastMsg:'— دردشة خاصة جديدة —', lastTime:r.acceptedAt||r.createdAt });
  }
  result.sort((a,b)=>(b.lastTime||0)-(a.lastTime||0));
  res.json(result);
});
app.get('/api/dm/messages/:fromId/:toId', auth, (req, res) => {
  res.json({ success:true, messages: dmMessages[convKey(req.params.fromId, req.params.toId)] || [] });
});
app.post('/api/dm/send', auth, (req, res) => {
  const { fromId, fromName, toId, toName, message } = req.body;
  if (!fromId || !toId || !message) return res.status(400).json({ success:false, error:'Missing data' });
  if (String(message).length > 500) return res.status(400).json({ success:false, error:'Too long' });
  const key = ensureConv(fromId, toId);
  dmMessages[key].push({ fromId:toInt(fromId), fromName, toId:toInt(toId), toName, message:String(message).trim(), time:Date.now() });
  if (dmMessages[key].length > 300) dmMessages[key].splice(0, dmMessages[key].length-300);
  addLog('dm', fromName+' → '+toName+': '+String(message).slice(0,40));
  res.json({ success:true });
});

app.use((_req,res)=>res.status(404).json({ success:false, error:'not found' }));
setInterval(() => {
  const now = Date.now();
  for (const id in trades) if (now - trades[id].createdAt > TRADE_EXPIRE_MS) delete trades[id];
  for (const id in tradeRequests) if (now - tradeRequests[id].createdAt > 10*60*1000) delete tradeRequests[id];
}, 5000);

const PORT = process.env.PORT || 3000;
if (require.main === module) app.listen(PORT, () => console.log('Trade System v12.1 on', PORT));
module.exports = app;

"""
خادم مفكك Luraph AI — ملف واحد كامل.
FastAPI + Celery + SQLite + Anthropic/OpenAI + تحليل ثابت + تقرير AI + محادثة.

التشغيل:
    # الباكند
    uvicorn server:app --host 0.0.0.0 --port 8000

    # العامل
    celery -A server.celery worker --loglevel=info --concurrency=2

المتغيرات البيئية (كلها اختيارية إلا REDIS_URL على الإنتاج):
    SECRET_KEY        مفتاح سري عام
    REDIS_URL         رابط redis (افتراضي: redis://localhost:6379/0)
    STORAGE_DIR       مجلد التخزين (افتراضي: ./storage)
    DEOBF_ROOT        مسار شجرة deobf (افتراضي: ./deobf)
    MAX_UPLOAD_MB     حد حجم الملف بالميغا (افتراضي: 100)
    MAX_RUNTIME_SEC   حد زمن التنفيذ بالثواني (افتراضي: 3600)
    API_KEYS          مفاتيح API مفصولة بفواصل (افتراضي: فارغ = بلا مصادقة)
    DATABASE_URL      رابط قاعدة البيانات (افتراضي: sqlite:///./storage/jobs.db)
    AI_PROVIDER       anthropic أو openai (افتراضي: anthropic)
    ANTHROPIC_API_KEY مفتاح Anthropic
    OPENAI_API_KEY    مفتاح OpenAI
    AI_MODEL          اسم الموديل (افتراضي: claude-sonnet-4-5)
    AI_MAX_TOKENS     أقصى توكنات للرد (افتراضي: 8192)
"""
import asyncio
import json
import os
import re
import subprocess
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path

import aiofiles
import redis
from celery import Celery, shared_task
from fastapi import (Depends, FastAPI, File, Header, HTTPException, UploadFile,
                     WebSocket, WebSocketDisconnect)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy import (Column, DateTime, Float, Integer, String, Text,
                        create_engine)
from sqlalchemy.orm import declarative_base, sessionmaker


# ============================================================
# الإعدادات
# ============================================================
SECRET_KEY      = os.environ.get("SECRET_KEY", "dev")
REDIS_URL       = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
STORAGE_DIR     = os.environ.get("STORAGE_DIR", "./storage")
DEOBF_ROOT      = os.environ.get("DEOBF_ROOT", "./deobf")
MAX_UPLOAD_MB   = int(os.environ.get("MAX_UPLOAD_MB", "100"))
MAX_RUNTIME_SEC = int(os.environ.get("MAX_RUNTIME_SEC", "3600"))
API_KEYS        = [k.strip() for k in os.environ.get("API_KEYS", "").split(",") if k.strip()]
DATABASE_URL    = os.environ.get("DATABASE_URL", f"sqlite:///{STORAGE_DIR}/jobs.db")

AI_PROVIDER       = os.environ.get("AI_PROVIDER", "anthropic")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY    = os.environ.get("OPENAI_API_KEY", "")
AI_MODEL          = os.environ.get("AI_MODEL", "claude-sonnet-4-5")
AI_MAX_TOKENS     = int(os.environ.get("AI_MAX_TOKENS", "8192"))

Path(STORAGE_DIR, "inputs").mkdir(parents=True, exist_ok=True)
Path(STORAGE_DIR, "outputs").mkdir(parents=True, exist_ok=True)


# ============================================================
# قاعدة البيانات
# ============================================================
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


class Job(Base):
    __tablename__ = "jobs"

    id             = Column(String(32), primary_key=True, default=lambda: uuid.uuid4().hex)
    created_at     = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    status         = Column(String(16), default="queued", index=True)
    stage          = Column(String(64), default="uploaded")
    progress       = Column(Integer, default=0)
    input_name     = Column(String(255), nullable=False)
    input_size     = Column(Integer, nullable=False, default=0)
    input_path     = Column(String(512), nullable=False, default="")
    input_sha256   = Column(String(64), nullable=True, index=True)
    obfuscator     = Column(String(64), nullable=True)
    output_path    = Column(String(512), nullable=True)
    output_size    = Column(Integer, nullable=True)
    report_path    = Column(String(512), nullable=True)
    ai_report_path = Column(String(512), nullable=True)
    error          = Column(Text, nullable=True)
    runtime_sec    = Column(Float, nullable=True)
    analysis_json  = Column(Text, nullable=True)
    client_ip      = Column(String(64), nullable=True)
    api_key_id     = Column(String(64), nullable=True)


Base.metadata.create_all(engine)


# ============================================================
# Celery
# ============================================================
celery = Celery("deobf", broker=REDIS_URL, backend=REDIS_URL)
celery.conf.update(
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_time_limit=MAX_RUNTIME_SEC,
    task_soft_time_limit=MAX_RUNTIME_SEC - 30,
    task_track_started=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
)

R = redis.Redis.from_url(REDIS_URL, decode_responses=False)


def publish(job_id: str, **kw):
    """أرسل تحديثاً إلى قناة redis + خزّنه في قاعدة البيانات."""
    try:
        R.publish(f"job:{job_id}", json.dumps(kw, ensure_ascii=False))
    except Exception:
        pass
    with SessionLocal() as db:
        j = db.get(Job, job_id)
        if j:
            for k, v in kw.items():
                if hasattr(j, k):
                    setattr(j, k, v)
            db.commit()


# ============================================================
# المصادقة
# ============================================================
def require_key(x_api_key: str = Header(default=""), k: str = ""):
    supplied = x_api_key or k
    if API_KEYS and supplied not in API_KEYS:
        raise HTTPException(401, "مفتاح API غير صحيح")
    return supplied or "anonymous"


# ============================================================
# التحليل الثابت
# ============================================================
URL_RE     = re.compile(rb"https?://[^\s\"'<>]{4,200}")
WEBHOOK_RE = re.compile(rb"(discord\.com/api/webhooks|api\.telegram\.org/bot|hooks\.slack\.com)")
IP_RE      = re.compile(rb"\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b")
DOMAIN_RE  = re.compile(rb"\b(?:[a-z0-9-]+\.)+[a-z]{2,24}\b", re.I)
KEY_RE     = re.compile(
    rb"[\"']?([A-Za-z_]*(?:key|token|secret|passwd|password|auth)[A-Za-z_]*)[\"']?\s*[:=]\s*[\"']([^\"']{6,200})[\"']",
    re.I,
)

SUSPICIOUS = {
    b"loadstring": "تنفيذ كود ديناميكي",
    b"getfenv": "الوصول للبيئة",
    b"setfenv": "تعديل البيئة",
    b"getgenv": "بيئة المنفذ",
    b"HttpGet": "طلب شبكي",
    b"HttpGetAsync": "طلب شبكي متزامن",
    b"HttpPost": "إرسال شبكي",
    b"request": "طلب شبكي",
    b"syn.request": "طلب Synapse",
    b"http_request": "طلب HTTP",
    b"firesignal": "إطلاق إشارة",
    b"firetouchinterest": "إطلاق لمس",
    b"hookfunction": "اعتراض دالة",
    b"hookmetamethod": "اعتراض ميتا",
    b"getrawmetatable": "قراءة ميتا الجدول",
    b"setreadonly": "تعديل حماية الجدول",
    b"getconnections": "استخراج اتصالات",
    b"decompile": "تفكيك بايت كود",
    b"getscriptbytecode": "استخراج بايت كود",
    b"saveinstance": "حفظ الخريطة",
    b"queue_on_teleport": "طابور انتقال",
    b"DebuggerManager": "مكتبة التصحيح",
    b"debug.getinfo": "تسريب معلومات",
    b"debug.getupvalue": "تسريب upvalue",
    b"debug.setupvalue": "تعديل upvalue",
    b"debug.getregistry": "قراءة السجل",
    b"require(": "استدعاء وحدة",
    b"Instance.new": "إنشاء كائن",
    b"game:GetService": "وصول للخدمة",
    b"workspace.": "الوصول للعالم",
    b"Players.LocalPlayer": "اللاعب المحلي",
    b"Kick(": "طرد لاعب",
    b"Ban(": "حظر لاعب",
    b"teleport": "انتقال",
    b"buy": "شراء",
    b"marketplace": "المتجر",
    b"robux": "عملة",
    b"R$": "عملة",
    b"BitLocker": "تشفير القرص",
    b"powershell": "تشغيل PowerShell",
    b"cmd.exe": "تشغيل CMD",
    b"wscript": "تشغيل WScript",
    b"reg add": "تعديل الريجستري",
    b"schtasks": "مهمة مجدولة",
    b"certutil": "أداة شهادات",
    b"bitsadmin": "BITS",
    b"mimikatz": "سرقة بيانات اعتماد",
    b"clipper": "اختطاف الحافظة",
    b"discord.com/api/webhooks": "ويب هوك ديسكورد",
    b"api.telegram.org": "تسريب تيليجرام",
    b"pastebin.com/raw": "جلب من Pastebin",
    b"hastebin": "Hastebin",
    b"transferFrom": "نقل توكن",
    b"approve(": "موافقة توكن",
    b"connect(": "ربط محفظة",
    b"signTransaction": "توقيع محفظة",
    b"drain": "تفريغ محفظة",
    b"seed phrase": "عبارة استرداد",
    b"private key": "مفتاح خاص",
    b"aes": "تشفير AES",
    b"rc4": "تشفير RC4",
    b"base64": "Base64",
    b"decode": "فك ترميز",
    b"encode": "ترميز",
    b"xor": "XOR",
    b"keylogger": "مسجل مفاتيح",
    b"GetAsyncKeyState": "قراءة المفاتيح",
    b"SetWindowsHookEx": "تثبيت هوك",
    b"CreateRemoteThread": "خيط بعيد",
    b"VirtualAllocEx": "تخصيص بعيد",
    b"WriteProcessMemory": "كتابة بالعملية",
    b"NtCreateThreadEx": "خيط NT",
    b"LoadLibrary": "تحميل DLL",
    b"GetProcAddress": "بحث رمز",
    b"ShellExecute": "تنفيذ shell",
    b"WinExec": "تنفيذ WinExec",
    b"CreateProcess": "إنشاء عملية",
    b"system(": "تنفيذ نظام",
    b"io.popen": "تنفيذ أمر",
    b"os.execute": "تنفيذ OS",
    b"os.remove": "حذف ملف",
    b"os.rename": "إعادة تسمية",
    b"writefile": "كتابة ملف",
    b"readfile": "قراءة ملف",
    b"appendfile": "إضافة ملف",
    b"delfile": "حذف ملف",
    b"listfiles": "سرد ملفات",
    b"makefolder": "إنشاء مجلد",
}


def analyze_source(text: str) -> dict:
    """تحليل ثابت كامل للسكربت."""
    b = text.encode("latin-1", "ignore")

    urls     = sorted({m.group(0).decode("latin-1", "ignore") for m in URL_RE.finditer(b)})
    domains  = sorted({m.group(0).decode("latin-1", "ignore") for m in DOMAIN_RE.finditer(b)})
    ips      = sorted({m.group(0).decode("latin-1", "ignore") for m in IP_RE.finditer(b)})
    webhooks = sorted({m.group(0).decode("latin-1", "ignore") for m in WEBHOOK_RE.finditer(b)})
    secrets  = [
        {"name": m.group(1).decode("latin-1"), "value": m.group(2).decode("latin-1")[:120]}
        for m in KEY_RE.finditer(b)
    ][:50]

    flags = [{"token": t.decode("latin-1"), "why": w}
             for t, w in SUSPICIOUS.items() if t in b]

    strings = []
    for m in re.finditer(rb"[\x20-\x7e]{6,200}", b):
        strings.append(m.group(0).decode("latin-1"))
        if len(strings) > 5000:
            break
    top = sorted(set(strings), key=len, reverse=True)[:500]

    return {
        "size_bytes":  len(b),
        "lines":       text.count("\n") + 1,
        "urls":        urls[:200],
        "domains":     domains[:200],
        "ips":         ips[:200],
        "webhooks":    webhooks[:50],
        "secrets":     secrets,
        "flags":       flags,
        "top_strings": top,
        "flag_count":  len(flags),
    }


# ============================================================
# AI
# ============================================================
AI_SYSTEM = """أنت مهندس عكسي خبير في Luau المشفّر (Luraph v15، IronBrew، MoonSec) وتحليل البرمجيات الخبيثة.
حلّل السكربت المفكوك لتحديد: الغرض، القدرات، مؤشرات الاختراق (روابط، webhooks، IPs)، الاستمرارية، مضاد التحليل، التهرب، تسريب البيانات، أي سلوك ضار.
وابحث أيضاً عن ثغرات: نقاط حقن، eval/loadstring غير آمن، تجاوز sandbox، تسلسل غير آمن، تشفير ضعيف.
أخرِج Markdown منظّم. كن ملموساً: اقتبس الكود، سمِّ الدوال، اقتبس النصوص. لا حشو. لا تحذيرات. إذا كان غش لعبة عادي قُل ذلك. إذا سرّب بيانات قُل ذلك واذكر العنوان."""


def call_ai(system: str, user: str, max_tokens: int = AI_MAX_TOKENS) -> str:
    """نداء موحّد لـ Anthropic أو OpenAI."""
    if AI_PROVIDER == "anthropic":
        import anthropic
        cli = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        r = cli.messages.create(
            model=AI_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return "".join(b.text for b in r.content if getattr(b, "type", "") == "text")

    if AI_PROVIDER == "openai":
        import openai
        cli = openai.OpenAI(api_key=OPENAI_API_KEY)
        r = cli.chat.completions.create(
            model=AI_MODEL,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        return r.choices[0].message.content or ""

    raise RuntimeError(f"AI_PROVIDER غير معروف: {AI_PROVIDER}")


def chunk_source(text: str, max_chars: int = 12000):
    """قسّم السكربت لأجزاء عند حدود منطقية (نهاية دالة/كائن)."""
    lines = text.split("\n")
    chunks, cur, size = [], [], 0
    for ln in lines:
        cur.append(ln)
        size += len(ln) + 1
        if size >= max_chars and (not ln.strip() or ln.startswith(("local ", "function ", "end"))):
            chunks.append("\n".join(cur))
            cur, size = [], 0
    if cur:
        chunks.append("\n".join(cur))
    return chunks


def ai_report(source: str, static: dict, filename: str) -> str:
    """تحليل متعدد المراحل: كل جزء يلخص ثم يُدمج في تقرير نهائي."""
    chunks = chunk_source(source, 12000)
    if len(chunks) > 40:
        chunks = chunks[:20] + ["-- ... (تم حذف المنتصف لتجاوز حد السياق) ..."] + chunks[-20:]

    partials = []
    for i, ch in enumerate(chunks):
        prompt = (
            f"الملف: {filename}\nالجزء {i+1}/{len(chunks)}\n\n"
            f"```luau\n{ch}\n```\n\n"
            "لخّص ما يفعله هذا الجزء في 5 نقاط كحد أقصى. "
            "أشر للسلوك المشبوه، مؤشرات الاختراق، مضاد التحليل، وأي ثغرة."
        )
        try:
            partials.append(call_ai(AI_SYSTEM, prompt, max_tokens=1500))
        except Exception as e:
            partials.append(f"[فشل الجزء {i+1}: {e}]")

    synthesis = f"""ملخص التحليل الثابت:
- الحجم: {static['size_bytes']} بايت، {static['lines']} سطر
- العلامات: {static['flag_count']}
- الروابط: {static['urls'][:10]}
- Webhooks: {static['webhooks'][:5]}
- IPs: {static['ips'][:10]}
- رموز مشبوهة: {[f['token'] for f in static['flags'][:30]]}
- أسرار: {static['secrets'][:5]}

ملخصات الأجزاء:
{chr(10).join(f'--- الجزء {i+1} ---' + chr(10) + p for i, p in enumerate(partials))}

أخرج التقرير النهائي بصيغة Markdown بهذه الأقسام:
# الملخص التنفيذي
# الغرض
# القدرات
# مؤشرات الاختراق (روابط، نطاقات، IPs، Webhooks، أسرار)
# مضاد التحليل
# تسريب البيانات
# الثغرات المكتشفة (مع مراجع الكود)
# الخطورة (منخفضة/متوسطة/عالية/حرجة) والسبب
# التوصيات
"""
    return call_ai(AI_SYSTEM, synthesis, max_tokens=AI_MAX_TOKENS)


# ============================================================
# مهمة التفكيك (Celery)
# ============================================================
@shared_task(bind=True, name="run_deobf")
def run_deobf(self, job_id: str):
    """المهمة الكاملة: كشف → تفكيك → تحليل → تقرير AI."""
    with SessionLocal() as db:
        job = db.get(Job, job_id)
        if not job:
            return
        inp  = job.input_path
        name = job.input_name

    t0 = time.time()
    out      = os.path.join(STORAGE_DIR, "outputs", f"{job_id}.devirt.luau")
    rep_path = os.path.join(STORAGE_DIR, "outputs", f"{job_id}.analysis.json")
    ai_path  = os.path.join(STORAGE_DIR, "outputs", f"{job_id}.report.md")

    publish(job_id, status="running", stage="كشف", progress=2)

    # ---- كشف نوع التشويش
    obf = "unknown"
    try:
        d = subprocess.run(
            [sys.executable, os.path.join(DEOBF_ROOT, "deob.py"), inp, "--detect"],
            capture_output=True, text=True, timeout=60,
        )
        parts = (d.stdout.strip().splitlines()[-1] if d.stdout.strip() else "").split("\t")
        if parts:
            obf = parts[0]
    except Exception:
        pass
    publish(job_id, obfuscator=obf, stage="تفكيك", progress=5)

    # ---- تفكيك
    cmd = [
        sys.executable, os.path.join(DEOBF_ROOT, "deob.py"),
        inp, "-o", out,
        "--timeout", str(MAX_RUNTIME_SEC),
        "--budget",  str(MAX_RUNTIME_SEC - 60),
        "--devirt-rounds", "200",
    ]
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        encoding="utf-8",
        errors="replace",
    )
    try:
        for line in proc.stdout:
            m = re.search(r"round (\d+)", line)
            if m:
                pct = min(70, 5 + int(m.group(1)) // 3)
                publish(job_id, stage=f"جولة {m.group(1)}", progress=pct)
            if time.time() - t0 > MAX_RUNTIME_SEC:
                proc.kill()
                publish(job_id, status="failed", stage="مهلة",
                        error=f"تجاوز {MAX_RUNTIME_SEC} ثانية")
                return
        proc.wait(timeout=60)
    except Exception as e:
        try:
            proc.kill()
        except Exception:
            pass
        publish(job_id, status="failed", stage="انهيار", error=str(e)[:500])
        return

    if proc.returncode != 0 or not Path(out).exists():
        publish(job_id, status="failed", stage="تفكيك",
                error=f"deob.py فشل برمز {proc.returncode}")
        return

    # ---- تحليل ثابت
    publish(job_id, stage="تحليل ثابت", progress=75)
    try:
        with open(out, encoding="utf-8", errors="replace") as f:
            source = f.read()
    except Exception as e:
        publish(job_id, status="failed", stage="قراءة", error=str(e))
        return

    static = analyze_source(source)
    with open(rep_path, "w", encoding="utf-8") as f:
        json.dump(static, f, ensure_ascii=False, indent=2)

    # ---- تقرير AI
    has_ai = (
        (AI_PROVIDER == "anthropic" and ANTHROPIC_API_KEY) or
        (AI_PROVIDER == "openai" and OPENAI_API_KEY)
    )
    if has_ai:
        publish(job_id, stage="تحليل AI", progress=80)
        try:
            report = ai_report(source, static, name)
            with open(ai_path, "w", encoding="utf-8") as f:
                f.write(report)
        except Exception as e:
            with open(ai_path, "w", encoding="utf-8") as f:
                f.write(f"# فشل تقرير AI\n\n{e}")
    else:
        with open(ai_path, "w", encoding="utf-8") as f:
            f.write("# AI معطّل (لا يوجد مفتاح API)\n")

    # ---- نهاية
    size = os.path.getsize(out)
    publish(
        job_id,
        status="done",
        stage="تم",
        progress=100,
        output_path=out,
        output_size=size,
        report_path=rep_path,
        ai_report_path=ai_path,
        runtime_sec=time.time() - t0,
        analysis_json=json.dumps(static, ensure_ascii=False),
    )


# ============================================================
# FastAPI
# ============================================================
app = FastAPI(title="مفكك Luraph AI", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)


@app.get("/api/health")
def health():
    return {"ok": True, "version": "1.0.0"}


@app.post("/api/upload")
async def upload(
    file: UploadFile = File(...),
    k: str = "",
    x_api_key: str = Header(default=""),
):
    require_key(x_api_key, k)

    if file.size and file.size > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"الملف أكبر من {MAX_UPLOAD_MB} ميغا")
    if not file.filename.lower().endswith((".lua", ".luau", ".txt")):
        raise HTTPException(400, "الملف يجب أن يكون .lua أو .luau أو .txt")

    with SessionLocal() as db:
        job = Job(input_name=file.filename, input_size=0, input_path="")
        db.add(job)
        db.commit()
        db.refresh(job)
        job_id = job.id

    safe = re.sub(r"[^\w.\-]", "_", file.filename)[:120]
    path = os.path.join(STORAGE_DIR, "inputs", f"{job_id}__{safe}")

    size = 0
    async with aiofiles.open(path, "wb") as f:
        while True:
            chunk = await file.read(1 << 20)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_UPLOAD_MB * 1024 * 1024:
                await f.close()
                try:
                    os.remove(path)
                except Exception:
                    pass
                with SessionLocal() as db:
                    j = db.get(Job, job_id)
                    if j:
                        db.delete(j)
                        db.commit()
                raise HTTPException(413, f"الملف أكبر من {MAX_UPLOAD_MB} ميغا")
            await f.write(chunk)

    with SessionLocal() as db:
        j = db.get(Job, job_id)
        j.input_path = path
        j.input_size = size
        db.commit()

    run_deobf.delay(job_id)
    return {"id": job_id, "status": "queued"}


def _job_dict(j: Job) -> dict:
    out = {}
    for c in j.__table__.columns:
        v = getattr(j, c.name)
        if isinstance(v, datetime):
            v = v.isoformat()
        out[c.name] = v
    return out


@app.get("/api/jobs")
def list_jobs(k: str = "", x_api_key: str = Header(default="")):
    require_key(x_api_key, k)
    with SessionLocal() as db:
        rows = db.query(Job).order_by(Job.created_at.desc()).limit(200).all()
        return [_job_dict(r) for r in rows]


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str, k: str = "", x_api_key: str = Header(default="")):
    require_key(x_api_key, k)
    with SessionLocal() as db:
        r = db.get(Job, job_id)
        if not r:
            raise HTTPException(404, "لا يوجد هذا العنصر")
        return _job_dict(r)


@app.get("/api/jobs/{job_id}/source", response_class=PlainTextResponse)
def get_source(job_id: str, k: str = "", x_api_key: str = Header(default="")):
    require_key(x_api_key, k)
    with SessionLocal() as db:
        r = db.get(Job, job_id)
        if not r or not r.output_path or not os.path.exists(r.output_path):
            raise HTTPException(404, "لم يكتمل التفكيك")
        with open(r.output_path, encoding="utf-8", errors="replace") as f:
            return f.read()


@app.get("/api/jobs/{job_id}/source/download")
def download_source(job_id: str, k: str = "", x_api_key: str = Header(default="")):
    require_key(x_api_key, k)
    with SessionLocal() as db:
        r = db.get(Job, job_id)
        if not r or not r.output_path or not os.path.exists(r.output_path):
            raise HTTPException(404, "لم يكتمل التفكيك")
        return FileResponse(
            r.output_path,
            media_type="text/plain",
            filename=f"{r.input_name}.devirt.luau",
        )


@app.get("/api/jobs/{job_id}/report", response_class=PlainTextResponse)
def get_report(job_id: str, k: str = "", x_api_key: str = Header(default="")):
    require_key(x_api_key, k)
    with SessionLocal() as db:
        r = db.get(Job, job_id)
        if not r or not r.ai_report_path or not os.path.exists(r.ai_report_path):
            raise HTTPException(404, "لا يوجد تقرير")
        with open(r.ai_report_path, encoding="utf-8") as f:
            return f.read()


@app.get("/api/jobs/{job_id}/analysis")
def get_analysis(job_id: str, k: str = "", x_api_key: str = Header(default="")):
    require_key(x_api_key, k)
    with SessionLocal() as db:
        r = db.get(Job, job_id)
        if not r or not r.analysis_json:
            raise HTTPException(404, "لا يوجد تحليل")
        return json.loads(r.analysis_json)


@app.post("/api/jobs/{job_id}/chat")
async def chat(
    job_id: str,
    body: dict,
    k: str = "",
    x_api_key: str = Header(default=""),
):
    require_key(x_api_key, k)
    with SessionLocal() as db:
        r = db.get(Job, job_id)
        if not r or not r.output_path or not os.path.exists(r.output_path):
            raise HTTPException(404, "لم يكتمل التفكيك")
        with open(r.output_path, encoding="utf-8", errors="replace") as f:
            source = f.read()

    question = (body.get("q") or "").strip()
    if not question:
        raise HTTPException(400, "سؤال فارغ")

    chunks = chunk_source(source, 12000)
    qwords = set(re.findall(r"\w+", question.lower()))
    scored = sorted(
        chunks,
        key=lambda c: -len(qwords & set(re.findall(r"\w+", c.lower()))),
    )[:3]
    ctx = "\n\n".join(f"```luau\n{c}\n```" for c in scored)

    try:
        answer = call_ai(
            AI_SYSTEM,
            f"السؤال: {question}\n\nالكود المتعلق:\n{ctx}\n\nأجب مع مراجع الكود.",
            max_tokens=2000,
        )
    except Exception as e:
        raise HTTPException(502, f"فشل AI: {e}")

    return {"answer": answer}


@app.delete("/api/jobs/{job_id}")
def delete_job(
    job_id: str,
    confirm: str = "",
    k: str = "",
    x_api_key: str = Header(default=""),
):
    require_key(x_api_key, k)
    # حذف لا رجعة فيه: يحتاج ?confirm=yes
    if confirm != "yes":
        raise HTTPException(400, "أضف ?confirm=yes للتأكيد")
    with SessionLocal() as db:
        r = db.get(Job, job_id)
        if not r:
            raise HTTPException(404)
        for p in (r.input_path, r.output_path, r.report_path, r.ai_report_path):
            if p and os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass
        db.delete(r)
        db.commit()
    return {"deleted": job_id}


@app.websocket("/ws/jobs/{job_id}")
async def ws_job(ws: WebSocket, job_id: str):
    await ws.accept()
    ps = R.pubsub()
    ps.subscribe(f"job:{job_id}")
    try:
        with SessionLocal() as db:
            r = db.get(Job, job_id)
            if r:
                await ws.send_text(json.dumps({
                    "status":   r.status,
                    "stage":    r.stage,
                    "progress": r.progress,
                    "error":    r.error,
                }, ensure_ascii=False))

        while True:
            msg = ps.get_message(timeout=30)
            if msg and msg["type"] == "message":
                data = msg["data"].decode("utf-8") if isinstance(msg["data"], bytes) else msg["data"]
                await ws.send_text(data)
                try:
                    if json.loads(data).get("status") in ("done", "failed"):
                        break
                except Exception:
                    pass
            else:
                # كشف إغلاق الاتصال + إبقاء الاتصال حياً
                try:
                    await ws.send_text(json.dumps({"ping": True}))
                except Exception:
                    break
                await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        pass
    finally:
        try:
            ps.unsubscribe(f"job:{job_id}")
            ps.close()
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

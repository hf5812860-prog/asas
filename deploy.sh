#!/usr/bin/env bash
# ============================================================
# نشر كامل: باكند على VPS + واجهة على Vercel
# الاستخدام:
#   VPS_HOST=root@1.2.3.4 DOMAIN=api.example.com ./deploy.sh all
#   ./deploy.sh backend   # الباكند فقط
#   ./deploy.sh ssl       # Nginx + SSL فقط
#   ./deploy.sh frontend  # الواجهة فقط
#   ./deploy.sh status    # عرض الحالة
#   ./deploy.sh logs      # متابعة اللوق
#   ./deploy.sh restart   # إعادة التشغيل
#   ./deploy.sh clean     # حذف كل شيء من VPS
# ============================================================
set -euo pipefail

# ---- القيم الافتراضية (غيّرها أو مرّرها كمغيّرات بيئة) ----
VPS_HOST="${VPS_HOST:-root@YOUR-VPS-IP}"
VPS_DIR="${VPS_DIR:-/opt/luraph-deobf}"
DOMAIN="${DOMAIN:-api.example.com}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
VERCEL_PROJECT="${VERCEL_PROJECT:-luraph-deobf}"
API_KEY="${API_KEY:-$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 32)}"
AI_PROVIDER="${AI_PROVIDER:-anthropic}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-sk-ant-CHANGE-ME}"
OPENAI_API_KEY="${OPENAI_API_KEY:-}"
AI_MODEL="${AI_MODEL:-claude-sonnet-4-5}"
MAX_UPLOAD_MB="${MAX_UPLOAD_MB:-100}"
MAX_RUNTIME_SEC="${MAX_RUNTIME_SEC:-3600}"

# ---- ألوان ----
R=$'\033[0m'; B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; RE=$'\033[31m'; C=$'\033[36m'
log()  { echo "${C}▶${R} $*"; }
ok()   { echo "${G}✅${R} $*"; }
warn() { echo "${Y}⚠️${R}  $*"; }
die()  { echo "${RE}✖${R}  $*" >&2; exit 1; }

need() {
  command -v "$1" >/dev/null 2>&1 || die "أداة مفقودة: $1 — ثبّتها ثم أعد المحاولة"
}

# ============================================================
# توليد ملفات الإعداد
# ============================================================
write_compose() {
  log "كتابة docker-compose.yml"
  cat > docker-compose.yml <<'YAML'
version: "3.9"

services:
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  backend:
    build:
      context: .
      dockerfile_inline: |
        FROM python:3.11-slim
        RUN apt-get update && apt-get install -y --no-install-recommends \
            build-essential git cmake ninja-build gcc g++ ca-certificates pypy3 \
            && rm -rf /var/lib/apt/lists/*
        WORKDIR /app
        COPY requirements.txt .
        RUN pip install --no-cache-dir -r requirements.txt
        COPY server.py .
        ENV PYTHONPATH=/app
        EXPOSE 8000
        CMD ["uvicorn","server:app","--host","0.0.0.0","--port","8000","--workers","2"]
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./deobf:/app/deobf:ro
      - ./bin:/app/bin:ro
      - deobf_data:/var/lib/deobf
    ports:
      - "127.0.0.1:8000:8000"
    depends_on:
      redis:
        condition: service_healthy

  worker:
    build:
      context: .
      dockerfile_inline: |
        FROM python:3.11-slim
        RUN apt-get update && apt-get install -y --no-install-recommends \
            build-essential git cmake ninja-build gcc g++ ca-certificates pypy3 \
            && rm -rf /var/lib/apt/lists/*
        WORKDIR /app
        COPY requirements.txt .
        RUN pip install --no-cache-dir -r requirements.txt
        COPY server.py .
        ENV PYTHONPATH=/app
        CMD ["celery","-A","server.celery","worker","--loglevel=info","--concurrency=2"]
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./deobf:/app/deobf:ro
      - ./bin:/app/bin:ro
      - deobf_data:/var/lib/deobf
    depends_on:
      redis:
        condition: service_healthy

volumes:
  redis_data:
  deobf_data:
YAML
  ok "docker-compose.yml جاهز"
}

write_requirements() {
  log "كتابة requirements.txt"
  cat > requirements.txt <<'REQ'
fastapi==0.115.0
uvicorn[standard]==0.32.0
celery==5.4.0
redis==5.1.0
sqlalchemy==2.0.36
python-multipart==0.0.12
aiofiles==24.1.0
websockets==13.1
anthropic==0.39.0
openai==1.54.0
REQ
  ok "requirements.txt جاهز"
}

write_env() {
  log "كتابة .env"
  cat > .env <<ENV
SECRET_KEY=$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 48)
REDIS_URL=redis://redis:6379/0
STORAGE_DIR=/var/lib/deobf
MAX_UPLOAD_MB=$MAX_UPLOAD_MB
MAX_RUNTIME_SEC=$MAX_RUNTIME_SEC
API_KEYS=$API_KEY
DEOBF_ROOT=/app/deobf
AI_PROVIDER=$AI_PROVIDER
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
OPENAI_API_KEY=$OPENAI_API_KEY
AI_MODEL=$AI_MODEL
AI_MAX_TOKENS=8192
ENV
  ok ".env جاهز (مفتاح API: $API_KEY)"
}

# ============================================================
# الباكند على VPS
# ============================================================
deploy_backend() {
  need ssh
  need rsync
  need scp

  log "تجهيز VPS: $VPS_HOST"
  ssh -o StrictHostKeyChecking=accept-new "$VPS_HOST" "mkdir -p $VPS_DIR"

  log "نسخ الملفات إلى VPS"
  scp -q server.py docker-compose.yml requirements.txt .env "$VPS_HOST:$VPS_DIR/"

  if [ -d deobf ]; then
    log "نسخ مجلد deobf"
    rsync -az --delete deobf/ "$VPS_HOST:$VPS_DIR/deobf/"
  else
    die "مجلد deobf مفقود — ضعه بجوار deploy.sh"
  fi

  if [ -d bin ]; then
    log "نسخ مجلد bin"
    rsync -az --delete bin/ "$VPS_HOST:$VPS_DIR/bin/"
  else
    warn "مجلد bin مفقود (luau.exe / luau-ast.exe)"
  fi

  log "تثبيت Docker إن لم يكن موجوداً"
  ssh "$VPS_HOST" "command -v docker >/dev/null 2>&1 || (curl -fsSL https://get.docker.com | sh)"

  log "بناء وتشغيل الحاويات"
  ssh "$VPS_HOST" "cd $VPS_DIR && docker compose down --remove-orphans && docker compose up -d --build"

  log "انتظار الجاهزية"
  for i in $(seq 1 30); do
    if ssh "$VPS_HOST" "curl -fsS http://127.0.0.1:8000/api/health" >/dev/null 2>&1; then
      ok "الباكند يعمل"
      return 0
    fi
    sleep 2
  done
  warn "لم يستجب الباكند بعد 60 ثانية — تحقق بـ: ./deploy.sh logs"
  return 0
}

# ============================================================
# Nginx + SSL
# ============================================================
setup_nginx_ssl() {
  need ssh

  log "تثبيت Nginx + Certbot"
  ssh "$VPS_HOST" "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx certbot python3-certbot-nginx"

  log "كتابة إعداد Nginx لـ $DOMAIN"
  ssh "$VPS_HOST" "cat > /etc/nginx/sites-available/deobf <<'NGINX'
server {
    listen 80;
    server_name $DOMAIN;

    client_max_body_size ${MAX_UPLOAD_MB}M;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \"upgrade\";
        proxy_set_header Host \$host;
        proxy_read_timeout 3600s;
    }

    location / {
        return 200 'مفكك Luraph AI — الباكند يعمل.\n';
        add_header Content-Type text/plain;
    }
}
NGINX"

  ssh "$VPS_HOST" "ln -sf /etc/nginx/sites-available/deobf /etc/nginx/sites-enabled/deobf && nginx -t"
  ssh "$VPS_HOST" "systemctl enable nginx && systemctl reload nginx"

  log "طلب شهادة SSL لـ $DOMAIN"
  if ssh "$VPS_HOST" "certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $ADMIN_EMAIL --redirect"; then
    ok "SSL جاهز: https://$DOMAIN"
  else
    warn "فشل Certbot — تأكد أن DNS يشير إلى VPS وأن المنفذ 80 مفتوح"
  fi
}

# ============================================================
# الواجهة على Vercel
# ============================================================
deploy_frontend() {
  need npm

  if [ ! -f index.html ]; then
    die "index.html مفقود — ضعه بجوار deploy.sh"
  fi

  log "كتابة vercel.json"
  cat > vercel.json <<JSON
{
  "version": 2,
  "buildCommand": null,
  "outputDirectory": ".",
  "cleanUrls": true,
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://$DOMAIN/api/:path*" },
    { "source": "/ws/:path*",  "destination": "https://$DOMAIN/ws/:path*" }
  ]
}
JSON

  log "تثبيت Vercel CLI"
  npm i -g vercel >/dev/null 2>&1 || die "فشل تثبيت vercel CLI"

  log "نشر على Vercel"
  vercel --prod --yes --name "$VERCEL_PROJECT"

  ok "الواجهة منشورة"
}

# ============================================================
# أوامر إدارة
# ============================================================
show_status() {
  log "الحالة على VPS"
  ssh "$VPS_HOST" "cd $VPS_DIR && docker compose ps"
  log "الصحة"
  curl -fsS "https://$DOMAIN/api/health" || warn "لم يستجب https://$DOMAIN/api/health"
  echo
  log "مفتاح API الحالي"
  grep '^API_KEYS=' .env
}

show_logs() {
  ssh "$VPS_HOST" "cd $VPS_DIR && docker compose logs -f --tail=200"
}

restart_backend() {
  log "إعادة تشغيل الحاويات"
  ssh "$VPS_HOST" "cd $VPS_DIR && docker compose restart"
  ok "تم"
}

clean_remote() {
  warn "سيحذف كل شيء في $VPS_DIR — متابعة؟ (yes/no)"
  read -r ans
  [ "$ans" = "yes" ] || { echo "ألغيت"; return; }
  ssh "$VPS_HOST" "cd $VPS_DIR && docker compose down -v --remove-orphans && cd / && rm -rf $VPS_DIR"
  ok "تم الحذف"
}

# ============================================================
# الطباعة والتحقق
# ============================================================
banner() {
  cat <<EOF

${B}${C}╔══════════════════════════════════════════════════════════╗
║         مفكك Luraph AI — نشر كامل                        ║
╚══════════════════════════════════════════════════════════╝${R}

  VPS_HOST        : $VPS_HOST
  VPS_DIR         : $VPS_DIR
  DOMAIN          : $DOMAIN
  ADMIN_EMAIL     : $ADMIN_EMAIL
  VERCEL_PROJECT  : $VERCEL_PROJECT
  AI_PROVIDER     : $AI_PROVIDER
  AI_MODEL        : $AI_MODEL
  MAX_UPLOAD_MB   : $MAX_UPLOAD_MB
  MAX_RUNTIME_SEC : $MAX_RUNTIME_SEC
  API_KEY         : $API_KEY

EOF
}

preflight() {
  [ "$VPS_HOST" = "root@YOUR-VPS-IP" ] && die "غيّر VPS_HOST أولاً"
  [ "$DOMAIN" = "api.example.com" ]    && die "غيّر DOMAIN أولاً"
  [ "$AI_PROVIDER" = "anthropic" ] && [ "$ANTHROPIC_API_KEY" = "sk-ant-CHANGE-ME" ] && \
    warn "لم تضبط ANTHROPIC_API_KEY — سيعمل التفكيك بلا تقرير AI"
  [ "$AI_PROVIDER" = "openai" ] && [ -z "$OPENAI_API_KEY" ] && \
    warn "لم تضبط OPENAI_API_KEY — سيعمل التفكيك بلا تقرير AI"
  [ -f deobf/deob.py ] || warn "لم أجد deobf/deob.py — تأكد أن شجرة deobf بجانب deploy.sh"
}

# ============================================================
# Main
# ============================================================
main() {
  cmd="${1:-all}"
  banner

  case "$cmd" in
    all)
      preflight
      write_compose
      write_requirements
      write_env
      deploy_backend
      setup_nginx_ssl
      deploy_frontend
      echo
      ok "🎉 اكتمل النشر"
      echo
      echo "  الواجهة  : https://$VERCEL_PROJECT.vercel.app"
      echo "  الباكند  : https://$DOMAIN/api/health"
      echo "  مفتاح API: $API_KEY"
      echo
      ;;
    backend)
      preflight
      write_compose
      write_requirements
      write_env
      deploy_backend
      ;;
    ssl)
      preflight
      setup_nginx_ssl
      ;;
    frontend)
      preflight
      deploy_frontend
      ;;
    status)   show_status ;;
    logs)     show_logs ;;
    restart)  restart_backend ;;
    clean)    clean_remote ;;
    *)
      cat <<EOF
الاستخدام: $0 {all|backend|ssl|frontend|status|logs|restart|clean}

  all       نشر كامل (باكند + SSL + واجهة)
  backend   نشر الباكند فقط
  ssl       Nginx + شهادة SSL فقط
  frontend  الواجهة على Vercel فقط
  status    عرض الحالة
  logs      متابعة اللوق
  restart   إعادة تشغيل الحاويات
  clean     حذف كل شيء من VPS (يحتاج تأكيد)
EOF
      exit 2
      ;;
  esac
}

main "$@"

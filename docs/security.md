# Security

This project implements the take-home security baseline: **HTTPS in deploy** and **API key auth on all business endpoints**.

---

## API key authentication

### How it works

- Every request under `/api/*` must include header: `X-API-Key: <your-key>`
- Validation uses constant-time comparison (`secrets.compare_digest`) to reduce timing leaks
- A global middleware in `backend/app/main.py` enforces this; routers also declare `Depends(require_api_key)` for clarity
- **Public paths** (no key): `/healthz`, `/docs`, `/openapi.json`, `/redoc` only
- **CORS preflight** (`OPTIONS`) is allowed without a key so browsers can call the API

### Configuration

| Variable | Location | Notes |
|----------|----------|-------|
| `API_KEY` | `backend/.env` | Strong random string — `openssl rand -hex 32` |
| `VITE_API_KEY` | `frontend/.env` | Must match `API_KEY` (baked into SPA at build time) |

HappyRobot workflow webhook tools must send the same header:

```json
{ "X-API-Key": "your-api-key", "Content-Type": "application/json" }
```

### Smoke test

```bash
# Should fail
curl -i http://localhost:8000/api/loads/search

# Should succeed
curl -i -H "X-API-Key: $API_KEY" http://localhost:8000/api/loads/search

# Public
curl -i http://localhost:8000/healthz
```

### Production note

The dashboard embeds `VITE_API_KEY` in the JS bundle. For a real broker deployment, put **SSO** in front of the dashboard and issue short-lived session tokens instead of a static build-time key.

---

## HTTPS

### Local development (HTTP is OK)

Browsers allow `getUserMedia` (microphone) on `http://localhost` without TLS. Default `docker compose up` uses:

- API: `http://localhost:8000`
- App: `http://localhost:5173`

### Local HTTPS (self-signed via Caddy)

Use the `https` compose profile for TLS with Caddy's **internal CA**:

```bash
# backend/.env — add HTTPS origins
CORS_ORIGINS=http://localhost:5173,https://localhost:8444

# frontend/.env
VITE_API_BASE_URL=https://localhost:8443

docker compose --profile https up --build
```

| Service | URL |
|---------|-----|
| API | https://localhost:8443 |
| App | https://localhost:8444 |

Accept the browser certificate warning, or run `caddy trust` if you have the Caddy CLI.

Config: [`caddy/Caddyfile.local`](../caddy/Caddyfile.local)

### Production (Let's Encrypt)

**Fly.io** — HTTPS is automatic on `*.fly.dev` (current demo deploy).

**VPS + domain** — uncomment the `caddy` service in `docker-compose.yml` and use [`caddy/Caddyfile`](../caddy/Caddyfile) with your real domains. Caddy obtains Let's Encrypt certificates on first request.

Security headers enabled: `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`.

---

## Other controls

| Control | Implementation |
|---------|----------------|
| FMCSA key | Server-only — never in frontend or HappyRobot workflow |
| HappyRobot key | Server-only — used by `/api/voice/token` and platform sync |
| Floor rate | Stripped from all load API responses |
| Negotiation policy | Server-side — not in LLM prompt |
| Webhook reliability | Always HTTP 200 to HappyRobot; auth still required via `X-API-Key` |

---

## Checklist before demo / interview

- [ ] `API_KEY` is not the default `dev-api-key-change-me`
- [ ] HappyRobot tools and post-call webhook send `X-API-Key`
- [ ] Production URLs use `https://`
- [ ] `CORS_ORIGINS` lists only your app origins
- [ ] `.env` files are not committed

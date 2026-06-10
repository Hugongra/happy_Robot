# Deployment

Three options here, in order from quickest to most production-ready.

---

## Option A — Local dev (5 minutes)

You want the call flow running against the platform so you can iterate
on the prompt.

```bash
# 1. Backend
cd backend
cp .env.example .env
# edit .env: set API_KEY, FMCSA_WEB_KEY, HAPPYROBOT_API_KEY, HAPPYROBOT_WORKFLOW_ID

# 2. Frontend
cd ../frontend
cp .env.example .env
# edit .env: VITE_API_KEY must equal API_KEY above

# 3. Bring it all up
cd ..
docker compose up --build
```

- Backend: <http://localhost:8000> (Swagger UI at `/docs`)
- Frontend: <http://localhost:5173>
- Healthcheck: `curl http://localhost:8000/healthz`

> **Note on the web call locally.** Browsers require HTTPS for `getUserMedia` *except* on `localhost` and `127.0.0.1`. So local dev works without HTTPS, but the moment you point the dashboard at a non-loopback address you need TLS.

### Option A2 — Local HTTPS (self-signed)

See [`security.md`](security.md). Quick start:

```bash
# backend/.env — add https://localhost:8444 to CORS_ORIGINS
# frontend/.env — VITE_API_BASE_URL=https://localhost:8443
docker compose --profile https up --build
```

- API: https://localhost:8443  
- App: https://localhost:8444  

---

## Option B — Fly.io (recommended for the demo)

Fly handles HTTPS automatically (Let's Encrypt) and is free for one
small app. The deployment is two `fly deploy` commands.

### Prerequisites

```bash
brew install flyctl   # or curl -L https://fly.io/install.sh | sh
fly auth signup       # or fly auth login
```

### Deploy the backend

```bash
cd backend

# Create the app + persistent volume for the SQLite DB
fly launch --name acme-carrier-api --no-deploy --region mad
fly volumes create carrier_data --size 1 --region mad

# Edit fly.toml to mount the volume at /app/data:
#   [mounts]
#   source = "carrier_data"
#   destination = "/app/data"
#
# Edit fly.toml to expose port 8000:
#   [http_service]
#   internal_port = 8000

# Inject secrets (these are env vars but encrypted at rest)
fly secrets set \
  API_KEY=$(openssl rand -hex 32) \
  FMCSA_WEB_KEY=<your-fmcsa-key> \
  HAPPYROBOT_API_KEY=sk_live_... \
  HAPPYROBOT_WORKFLOW_ID=gf3jkwu16004 \
  CORS_ORIGINS=https://acme-carrier-app.fly.dev

fly deploy
```

Verify: `curl https://acme-carrier-api.fly.dev/healthz`

### Deploy the frontend

```bash
cd ../frontend

fly launch --name acme-carrier-app --no-deploy --region mad
# Edit fly.toml to use port 80 (nginx).

# Inject the build-time env. Frontend env vars must be passed as build args.
fly deploy --build-arg VITE_API_BASE_URL=https://acme-carrier-api.fly.dev \
           --build-arg VITE_API_KEY=<the API_KEY you generated>
```

Visit `https://acme-carrier-app.fly.dev/call` and click Start Call.

> **Reproduce** — every secret is set via `fly secrets set`; every other
> config is in `fly.toml` and committed to the repo. To stand up a new
> environment, clone the repo, run the two `fly launch` commands above
> with new names, set the secrets, deploy.

---

## Option C — Any docker host with a domain (production-ish)

If you have a VPS and two domains (`api.acme-demo.com`, `app.acme-demo.com`):

1. Point both A records at the host.
2. Edit `caddy/Caddyfile` — replace `api.example.com` and `app.example.com` with your real domains.
3. In `docker-compose.yml` uncomment the `caddy` service and its volumes.
4. Drop `backend/.env` and `frontend/.env` in place.
5. `docker compose up -d --build`.

Caddy will get certs from Let's Encrypt on first request. Logs:
`docker compose logs -f caddy`.

---

## Smoke test after any deploy

```bash
# 1. Backend health
curl https://<api-host>/healthz

# 2. Auth works
curl -i https://<api-host>/api/loads/search             # → 401
curl -H "X-API-Key: $KEY" https://<api-host>/api/loads/search  # → 200, JSON array

# 3. FMCSA
curl -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
     -X POST https://<api-host>/api/fmcsa/verify \
     -d '{"mc_number":"MC-12345"}'

# 4. Webhook
curl -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
     -X POST https://<api-host>/api/webhooks/call-completed \
     -d '{"mc_number":"123","load_id":"ACM-1001","loadboard_rate":2100,"agreed_rate":2050,"counter_offers":[1800,1950,2050],"outcome":"load_booked","sentiment":"positive"}'

# 5. Make a real call from the frontend, then refresh the dashboard.
```

---

## Reproducing from scratch

```bash
git clone https://github.com/<you>/carrier-sales-agent.git
cd carrier-sales-agent
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# fill in both .env files
docker compose up --build
```

The DB is seeded with eight sample loads from `backend/app/db/seed_loads.json`
on first boot. To reset, remove the `backend_data` volume:
`docker compose down -v`.

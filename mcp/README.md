# Carrier Sales MCP Server

A read-only [Model Context Protocol](https://modelcontextprotocol.io/) server that exposes the same Carrier Sales FastAPI endpoints the ops dashboard uses. The dashboard is one consumer of the API; Claude Desktop (or any MCP client) is another — same contract, same `X-API-Key` auth.

## Demo quickstart (Claude Desktop, 2 minutes)

1. `pip install -r mcp/requirements.txt`
2. `cp mcp/.env.example mcp/.env` and fill `CARRIER_API_KEY`.
3. Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "carrier-sales": {
      "command": "python",
      "args": ["-m", "mcp.server"],
      "cwd": "/ABSOLUTE/PATH/TO/REPO",
      "env": {
        "CARRIER_API_BASE_URL": "https://acme-carrier-api-hugog.fly.dev",
        "CARRIER_API_KEY": "<your-key>"
      }
    }
  }
}
```

On Windows, use `%APPDATA%\Claude\claude_desktop_config.json` instead.

4. Restart Claude Desktop. Try:
   - "Show me the carrier-sales KPIs for the last 7 days."
   - "Any Dallas to Atlanta dry van loads?"
   - "List the 5 most recent calls and open the first one's details."

## Tools (read-only)

| Tool | API | Defaults | Example questions |
|------|-----|----------|-------------------|
| `search_loads` | `GET /api/loads/search` | `limit=10` (backend max 10) | "Any Dallas to Atlanta dry van loads?" |
| `get_metrics_summary` | `GET /api/metrics/summary` | `window_days=7`, cache 60s | "Show me last week's booking rate" |
| `get_recent_calls` | `GET /api/metrics/recent-calls` | `limit=15`, `offset=0`, max 50 | "List recent booked calls" |
| `get_call_detail` | `GET /api/metrics/calls/{id}` | — | "Show the transcript for call 7" |

Responses include `x_cache` (`HIT`/`MISS`) on cacheable reads. `get_recent_calls` also returns `total_count`, `has_more`, and `offset` for paging through up to 200 backend rows.

## Future work: write tools

Read-only by design. A future iteration could add write tools (`book_load`, `add_call_note`, `update_load_status`) behind:

- a feature flag (`MCP_WRITE_ENABLED`)
- explicit human confirmation in the tool response
- server-side audit log keyed by MCP session
- per-tool authorization (not all clients get write access)

Not implemented in this submission to keep the surface read-only and the security story simple.

## Architecture

```
mcp/
├── stdio_server.py # Tools MCP (read)
├── server/         # Entry: python -m mcp.server
├── bootstrap.py    # PyPI mcp import shim
├── client.py       # httpx client + retries + cache
├── cache.py        # TTLCache helper
├── models.py       # Pydantic models
├── config.py       # pydantic-settings
├── rate_limit.py   # 120 calls/min per session (configurable)
└── tests/
```

**Resilience:** 10s connect / 30s read timeouts, exponential backoff retries (max 3) on HTTP 429/5xx, in-memory cache (60s) for metrics summary, rate limit 120 backend calls/minute per MCP session (configurable).

## Install

From the repository root:

```bash
cd mcp
pip install -r requirements.txt
cp .env.example .env
# Edit .env: set CARRIER_API_KEY (must match backend API_KEY)
```

## Run

From the `mcp/` directory (stdio transport — default for Claude Desktop):

```bash
cd mcp
python server.py
```

Alternatives from repo root:

```bash
python -m mcp.server
python mcp/server.py
```

Against the deployed API:

```bash
cd mcp
export CARRIER_API_BASE_URL=https://acme-carrier-api-hugog.fly.dev
export CARRIER_API_KEY=<your-api-key>
python server.py
```

## Tests

```bash
cd mcp
pip install -r requirements.txt
pytest
```

HTTP calls are mocked; no live API required.

## Claude Desktop configuration

Edit `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "carrier-sales": {
      "command": "python",
      "args": ["-m", "mcp.server"],
      "cwd": "/ABSOLUTE/PATH/TO/carrier-sales-agent",
      "env": {
        "CARRIER_API_BASE_URL": "https://acme-carrier-api-hugog.fly.dev",
        "CARRIER_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

Replace `/ABSOLUTE/PATH/TO/carrier-sales-agent` with your clone path. Use the same `API_KEY` as the backend (`backend/.env` or Fly secrets).

Restart Claude Desktop after saving.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CARRIER_API_BASE_URL` | No | `http://localhost:8000` | FastAPI base URL |
| `CARRIER_API_KEY` | Yes | — | Sent as `X-API-Key` on every request |
| `MCP_RATE_LIMIT_PER_MIN` | No | `120` | Max backend calls per minute per MCP session |

Values can be set in `mcp/.env` (loaded via python-dotenv) or in the Claude Desktop `env` block.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Connection refused | API not running or wrong base URL | Start backend or set `CARRIER_API_BASE_URL` to Fly.io URL |
| 401 Unauthorized | Key mismatch | Set `CARRIER_API_KEY` equal to backend `API_KEY` |
| Rate limit reached | >120 backend calls/min (default) | Wait for retry hint in message or raise `MCP_RATE_LIMIT_PER_MIN` |
| Empty call list | All rows filtered as test calls | Call with `hide_test_calls=false` |
| Tool import errors | Running from wrong directory | Use `cwd` in Claude config pointing to repo root |

## Docker (optional)

```bash
cd mcp
docker build -t carrier-sales-mcp .
docker run --rm -i \
  -e CARRIER_API_BASE_URL=https://acme-carrier-api-hugog.fly.dev \
  -e CARRIER_API_KEY=<your-api-key> \
  carrier-sales-mcp
```

## Smoke check

With the API up:

```bash
export CARRIER_API_BASE_URL=http://localhost:8000
export CARRIER_API_KEY=<your-key>
cd ..
./scripts/smoke.sh
```

Then start the MCP server and ask Claude: "What loads do we have from Dallas to Atlanta?"

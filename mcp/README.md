# Carrier Sales MCP Server

A read-only [Model Context Protocol](https://modelcontextprotocol.io/) server that exposes the same Carrier Sales FastAPI endpoints the ops dashboard uses. The dashboard is one consumer of the API; Claude Desktop (or any MCP client) is another — same contract, same `X-API-Key` auth.

## Tools (read-only)

| Tool | API | Example questions |
|------|-----|-------------------|
| `search_loads` | `GET /api/loads/search` | "Any Dallas to Atlanta dry van loads?", "What's posted out of Chicago?" |
| `get_metrics_summary` | `GET /api/metrics/summary` | "Show me last week's booking rate", "What are our KPIs for 30 days?" |
| `get_recent_calls` | `GET /api/metrics/recent-calls` | "List recent booked calls", "Show price-rejected calls" |
| `get_call_detail` | `GET /api/metrics/calls/{id}` | "Open call ID 42", "Show the transcript for call 7" |

No write tools. No sync endpoint. No call placement.

## Install

From the repository root:

```bash
cd mcp
pip install -r requirements.txt
cp .env.example .env
# Edit .env: set CARRIER_API_KEY (must match backend API_KEY)
```

Or with uv:

```bash
cd mcp
uv pip install -r requirements.txt
```

## Run

From the `mcp/` directory (stdio transport — default for Claude Desktop):

```bash
cd mcp
python server.py
```

Alternatives from repo root:

```bash
python mcp/server.py
python -m mcp          # uses mcp/__main__.py
```

Against the deployed API:

```bash
cd mcp
export CARRIER_API_BASE_URL=https://acme-carrier-api-hugog.fly.dev
export CARRIER_API_KEY=<your-api-key>
python server.py
```

## Claude Desktop configuration

Edit `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "carrier-sales": {
      "command": "python",
      "args": ["/ABSOLUTE/PATH/TO/carrier-sales-agent/mcp/server.py"],
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

Values can be set in `mcp/.env` (loaded via python-dotenv) or in the Claude Desktop `env` block.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Connection refused | API not running or wrong base URL | Start backend (`docker compose up`) or set `CARRIER_API_BASE_URL` to Fly.io URL |
| 401 Unauthorized | Key mismatch | Set `CARRIER_API_KEY` equal to backend `API_KEY` |
| Empty call list | All rows filtered as test calls | Call with `hide_test_calls=false` or make a live web call first |
| Tool import errors | Running from wrong directory | Run `python server.py` from `mcp/` or use absolute path in Claude config |

## Docker (optional)

Build and run alongside the stack (stdio — attach your MCP client to the container process):

```bash
cd mcp
docker build -t carrier-sales-mcp .
docker run --rm -i \
  -e CARRIER_API_BASE_URL=https://acme-carrier-api-hugog.fly.dev \
  -e CARRIER_API_KEY=<your-api-key> \
  carrier-sales-mcp
```

Not wired into `docker-compose.yml` by default. HTTP/SSE transport can be added later via the MCP SDK if needed.

## Smoke check

With the API up:

```bash
export CARRIER_API_BASE_URL=http://localhost:8000
export CARRIER_API_KEY=<your-key>
cd ..
./scripts/smoke.sh
```

Then start the MCP server and ask Claude: "What loads do we have from Dallas to Atlanta?"

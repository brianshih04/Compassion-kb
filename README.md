# Compassion KB

MCP (Model Context Protocol) Server for Compassio Knowledge Base, deployed locally with Cloudflare Tunnel.

## What it does

Exposes a personal knowledge base as MCP tools, so AI tools (Claude Desktop, Claude Code, Hermes, etc.) can directly read and write your content — ideas, decisions, insights, meeting notes, article drafts.

**Core principle: AI tools can change, but your data stays in your own system.**

## MCP Tools

| Tool | Description |
|---|---|
| `create_entry` | Create a new KB entry (title, content, category, tags, source) |
| `get_entry` | Retrieve an entry by ID |
| `update_entry` | Update an existing entry |
| `delete_entry` | Delete an entry |
| `search_knowledge` | Full-text search with FTS5, category/tag filters |
| `list_entries` | Paginated listing with filters |
| `list_categories` | All categories and tag counts |

## MCP Resources

| Resource | URI |
|---|---|
| Entries index | `compassion-kb://entries` |

## Quick Start

```bash
# Install dependencies
npm install

# Start server (default port 8095)
node src/index.js

# With auth token
AUTH_TOKEN=your-secret node src/index.js

# Custom port
PORT=3000 node src/index.js
```

## Cloudflare Tunnel

Add to your `~/.cloudflared/config.yml`:

```yaml
ingress:
  - hostname: compassion-kb.your-domain.com
    service: http://localhost:8095
  - service: http_status:404
```

Then add DNS:
```bash
cloudflared tunnel route dns <tunnel-id> compassion-kb.your-domain.com
```

Restart cloudflared, and the MCP server is live.

## Connect to AI Tools

### Hermes Agent

Add to `~/.hermes/config.yaml`:
```yaml
mcp_servers:
  compassion-kb:
    url: http://localhost:8095/mcp
    # For remote via tunnel:
    # url: https://compassion-kb.your-domain.com/mcp
    timeout: 30
```

### Claude Desktop

Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "compassion-kb": {
      "url": "http://localhost:8095/mcp"
    }
  }
}
```

### Claude Code

Add to `.mcp.json`:
```json
{
  "mcpServers": {
    "compassion-kb": {
      "url": "http://localhost:8095/mcp"
    }
  }
}
```

## Storage

SQLite + FTS5 full-text search. Database at `./data/compassion-kb.db`.

## License

MIT

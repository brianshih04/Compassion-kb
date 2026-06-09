/**
 * Compassion KB — MCP Server for Compassio Knowledge Base
 *
 * Local MCP server over Streamable HTTP, backed by SQLite with FTS5.
 * Expose via Cloudflare Tunnel for remote AI tool access.
 *
 * Transport: Streamable HTTP (Web Standard)
 * Storage: SQLite + FTS5 full-text search
 * Auth: Bearer token
 */

const http = require("http");
const crypto = require("crypto");
const path = require("path");
const Database = require("better-sqlite3");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { WebStandardStreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js");
const { z } = require("zod");

// ─── Config ─────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || "8095", 10);
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "compassion-kb.db");

// ─── SQLite Setup ──────────────────────────────────────

function initDatabase() {
  const fs = require("fs");
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      tags TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
      title, content, category, tags, source,
      content=entries, content_rowid=rowid
    );
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
      INSERT INTO entries_fts(rowid, title, content, category, tags, source)
      VALUES (new.rowid, new.title, new.content, new.category, new.tags, new.source);
    END;
    CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
      INSERT INTO entries_fts(entries_fts, rowid, title, content, category, tags, source)
      VALUES ('delete', old.rowid, old.title, old.content, old.category, old.tags, old.source);
    END;
    CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
      INSERT INTO entries_fts(entries_fts, rowid, title, content, category, tags, source)
      VALUES ('delete', old.rowid, old.title, old.content, old.category, old.tags, old.source);
      INSERT INTO entries_fts(rowid, title, content, category, tags, source)
      VALUES (new.rowid, new.title, new.content, new.category, new.tags, new.source);
    END;
  `);

  return db;
}

// ─── Helpers ────────────────────────────────────────────

function generateId() { return crypto.randomUUID(); }

function validateBearerToken(reqOrRequest) {
  if (!AUTH_TOKEN) return true;
  const auth = reqOrRequest.headers?.get
    ? reqOrRequest.headers.get("Authorization")
    : reqOrRequest.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === AUTH_TOKEN;
}

// ─── MCP Server ──────────────────────────────────────────

function createMcpServer(db) {
  const server = new McpServer(
    { name: "compassion-kb", version: "1.0.0" },
    { capabilities: { tools: {}, resources: {} } }
  );

  // Prepared statements
  const stmtInsert = db.prepare(`INSERT INTO entries (id, title, content, category, tags, source) VALUES (?, ?, ?, ?, ?, ?)`);
  const stmtGet = db.prepare("SELECT * FROM entries WHERE id = ?");
  const stmtUpdate = db.prepare(`UPDATE entries SET title=?, content=?, category=?, tags=?, updated_at=datetime('now') WHERE id=?`);
  const stmtDelete = db.prepare("DELETE FROM entries WHERE id = ?");
  const stmtCount = db.prepare("SELECT COUNT(*) as cnt FROM entries");
  const stmtSearch = db.prepare(`
    SELECT e.id, e.title, e.content, e.category, e.tags, e.source, e.created_at, e.updated_at, rank
    FROM entries_fts f JOIN entries e ON e.rowid = f.rowid
    WHERE entries_fts MATCH ? ORDER BY rank LIMIT ?
  `);

  // ── create_entry ──
  server.tool(
    "create_entry",
    "Create a new knowledge base entry. Save ideas, insights, decisions, meeting notes, article drafts.",
    {
      title: z.string().describe("Title of the entry"),
      content: z.string().describe("Content (markdown supported)"),
      category: z.string().default("general").describe("Category: idea, decision, insight, meeting-notes, client-feedback, article-draft, general"),
      tags: z.array(z.string()).default([]).describe("Tags (e.g. ['branding', 'AI', 'content-strategy'])"),
      source: z.string().default("manual").describe("Source: chatgpt, claude, manual, etc."),
    },
    async ({ title, content, category, tags, source }) => {
      const id = generateId();
      stmtInsert.run(id, title, content, category, JSON.stringify(tags), source);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, id, title, category, createdAt: new Date().toISOString() }, null, 2) }],
      };
    }
  );

  // ── get_entry ──
  server.tool(
    "get_entry",
    "Retrieve a knowledge base entry by ID.",
    { id: z.string().describe("Entry ID (UUID)") },
    async ({ id }) => {
      const row = stmtGet.get(id);
      if (!row) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "Entry not found" }) }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify({ success: true, entry: { ...row, tags: JSON.parse(row.tags) } }, null, 2) }] };
    }
  );

  // ── update_entry ──
  server.tool(
    "update_entry",
    "Update an existing knowledge base entry. Provide any combination of fields to update.",
    {
      id: z.string().describe("Entry ID to update"),
      title: z.string().optional().describe("New title"),
      content: z.string().optional().describe("New content"),
      category: z.string().optional().describe("New category"),
      tags: z.array(z.string()).optional().describe("New tags"),
    },
    async ({ id, title, content, category, tags }) => {
      const existing = stmtGet.get(id);
      if (!existing) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "Entry not found" }) }], isError: true };
      stmtUpdate.run(title ?? existing.title, content ?? existing.content, category ?? existing.category, tags ? JSON.stringify(tags) : existing.tags, id);
      return { content: [{ type: "text", text: JSON.stringify({ success: true, id, updatedAt: new Date().toISOString() }, null, 2) }] };
    }
  );

  // ── delete_entry ──
  server.tool(
    "delete_entry",
    "Delete a knowledge base entry by ID.",
    { id: z.string().describe("Entry ID to delete") },
    async ({ id }) => {
      const existing = stmtGet.get(id);
      if (!existing) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "Entry not found" }) }], isError: true };
      stmtDelete.run(id);
      return { content: [{ type: "text", text: JSON.stringify({ success: true, deleted: id }) }] };
    }
  );

  // ── search_knowledge ──
  server.tool(
    "search_knowledge",
    "Full-text search across the knowledge base using FTS5.",
    {
      query: z.string().describe("Search query"),
      category: z.string().optional().describe("Filter by category"),
      tags: z.array(z.string()).optional().describe("Filter by tags (match any)"),
      limit: z.number().default(20).describe("Max results"),
    },
    async ({ query, category, tags, limit }) => {
      const ftsQuery = query
        .replace(/[^\w\s\u4e00-\u9fff]/g, " ")
        .split(/\s+/).filter(Boolean)
        .map((w) => `"${w}"`).join(" OR ");
      if (!ftsQuery) return { content: [{ type: "text", text: JSON.stringify({ success: true, count: 0, results: [] }) }] };

      const rows = stmtSearch.all(ftsQuery, limit + 100);
      const results = [];
      for (const row of rows) {
        if (category && row.category !== category) continue;
        const entryTags = JSON.parse(row.tags);
        if (tags && tags.length > 0 && !tags.some((t) => entryTags.includes(t))) continue;
        results.push({
          id: row.id, title: row.title, category: row.category, tags: entryTags,
          source: row.source, createdAt: row.created_at, updatedAt: row.updated_at,
          preview: row.content.slice(0, 200) + (row.content.length > 200 ? "..." : ""),
        });
        if (results.length >= limit) break;
      }
      return { content: [{ type: "text", text: JSON.stringify({ success: true, count: results.length, results }, null, 2) }] };
    }
  );

  // ── list_entries ──
  server.tool(
    "list_entries",
    "List knowledge base entries with filtering. Returns summaries without full content.",
    {
      category: z.string().optional().describe("Filter by category"),
      source: z.string().optional().describe("Filter by source"),
      limit: z.number().default(20).describe("Max entries"),
      offset: z.number().default(0).describe("Skip N entries"),
    },
    async ({ category, source, limit, offset }) => {
      const conds = [];
      const params = [];
      if (category) { conds.push("category = ?"); params.push(category); }
      if (source) { conds.push("source = ?"); params.push(source); }
      const where = conds.length > 0 ? `AND ${conds.join(" AND ")}` : "";
      const rows = db.prepare(`SELECT id, title, category, tags, source, created_at, updated_at FROM entries WHERE 1=1 ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset)
        .map((r) => ({ ...r, tags: JSON.parse(r.tags) }));
      const { cnt } = stmtCount.get();
      return { content: [{ type: "text", text: JSON.stringify({ success: true, total: cnt, offset, limit, results: rows }, null, 2) }] };
    }
  );

  // ── list_categories ──
  server.tool(
    "list_categories",
    "List all categories and tag counts in the knowledge base.",
    {},
    async () => {
      const categories = db.prepare("SELECT category, COUNT(*) as cnt FROM entries GROUP BY category").all();
      const tagRows = db.prepare("SELECT tags FROM entries").all();
      const tagCounts = {};
      for (const row of tagRows) for (const tag of JSON.parse(row.tags)) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      const { cnt } = stmtCount.get();
      return { content: [{ type: "text", text: JSON.stringify({ success: true, totalEntries: cnt, categories: Object.fromEntries(categories.map(c => [c.category, c.cnt])), tags: tagCounts }, null, 2) }] };
    }
  );

  // ── Resource: entries index ──
  server.resource(
    "entries-index",
    "compassion-kb://entries",
    async (uri) => {
      const entries = db.prepare("SELECT id, title, category, tags, source, created_at FROM entries ORDER BY created_at DESC").all();
      const index = entries.map((e) => {
        const tags = JSON.parse(e.tags);
        return `- [${e.title}](compassion-kb://entry/${e.id}) — ${e.category}, ${tags.join(", ")} (${e.created_at.slice(0, 10)})`;
      }).join("\n");
      return {
        contents: [{
          uri: uri.toString(),
          mimeType: "text/markdown",
          text: `# Knowledge Base Index (${entries.length} entries)\n\n${index}`,
        }],
      };
    }
  );

  return server;
}

// ─── HTTP Server ───────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
};

const db = initDatabase();
console.log(`📚 SQLite: ${DB_PATH}`);
console.log(`🔑 Auth: ${AUTH_TOKEN ? "enabled" : "disabled"}`);

const httpServer = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json", ...CORS_HEADERS });
    return res.end(JSON.stringify({
      name: "compassion-kb", version: "1.0.0",
      protocol: "MCP (Model Context Protocol)",
      transport: "Streamable HTTP", storage: "SQLite + FTS5",
    }));
  }

  if (!validateBearerToken(req)) {
    res.writeHead(401, { "Content-Type": "application/json", ...CORS_HEADERS });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }

  if (req.url === "/mcp") {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    const server = createMcpServer(db);
    server.connect(transport);

    const body = await new Promise((resolve) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    });

    const webRequest = new Request(`http://localhost:${PORT}${req.url}`, {
      method: req.method,
      headers: Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === "string")),
      body: req.method !== "GET" && req.method !== "DELETE" ? body : undefined,
    });

    const webResponse = await transport.handleRequest(webRequest);

    res.writeHead(webResponse.status, Object.fromEntries(webResponse.headers.entries()));
    const reader = webResponse.body?.getReader();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    }
    return res.end();
  }

  res.writeHead(404, { "Content-Type": "application/json", ...CORS_HEADERS });
  return res.end(JSON.stringify({ error: "Not Found" }));
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 Compassion KB running on http://0.0.0.0:${PORT}`);
  console.log(`   MCP: POST http://0.0.0.0:${PORT}/mcp`);
  console.log(`   Add to Cloudflare Tunnel: compassion-kb -> http://localhost:${PORT}`);
});

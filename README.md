# Compassion KB

> **AI 可以換，工具可以換，但你的知識要留在自己手上。**

Compassion KB 是一個基於 [MCP（Model Context Protocol）](https://modelcontextprotocol.io/) 的個人知識庫伺服器。讓 Claude、ChatGPT、Hermes 等 AI 工具透過標準化協議，直接讀寫你的知識庫 — 想法、決策、靈感、會議記錄、文章草稿，全部沉澱在屬於自己的系統裡。

## 為什麼需要這個？

我們每天跟 AI 討論出很多有價值的內容 — 產品方向、客戶洞察、寫作靈感、技術決策。但這些內容往往散落在不同 AI 工具的對話視窗裡。換了工具、換了模型、甚至只是隔幾天忘記那串對話在哪裡，那些東西就慢慢散掉了。

Compassion KB 解決這個問題：

- **內容資產化** — 從一次性的聊天，變成可以反覆使用的知識資產
- **工具無關** — 用 MCP 標準協議，任何支援 MCP 的 AI 工具都能接上來
- **資料自主** — SQLite 存在你自己的機器上，不鎖在任何平台的雲端裡
- **全文搜尋** — FTS5 強大的全文檢索，快速找到任何一條記錄

## 功能

- **7 個 MCP 工具** — 完整的 CRUD 操作 + 全文搜尋 + 分類管理
- **SQLite + FTS5** — 本地儲存，零依賴雲端服務
- **Streamable HTTP** — 標準 MCP 傳輸協議，相容 Claude Desktop / Claude Code / Hermes 等
- **Cloudflare Tunnel** — 可選擇公開到網際網路，讓遠端 AI 工具也能存取
- **Bearer Token 認證** — 可選的安全層，防止未授權存取

## MCP 工具一覽

| 工具 | 說明 |
|---|---|
| `create_entry` | 新增知識庫條目（標題、內容、分類、標籤、來源） |
| `get_entry` | 依 ID 取得單筆條目 |
| `update_entry` | 更新現有條目（可傳入任意欄位組合） |
| `delete_entry` | 刪除條目 |
| `search_knowledge` | FTS5 全文搜尋，支援分類 / 標籤篩選 |
| `list_entries` | 分頁列表，支援分類 / 來源篩選 |
| `list_categories` | 列出所有分類及其數量、所有標籤及其使用次數 |

### MCP 資源

| 資源名稱 | URI |
|---|---|
| 條目索引 | `compassion-kb://entries` |

## 快速開始

### 前置需求

- **Node.js** ≥ 18
- 適合 SQLite 編譯的環境（Linux / macOS / WSL）

### 安裝

```bash
git clone https://github.com/brianshih04/Compassion-kb.git
cd Compassion-kb
npm install
```

### 啟動

```bash
# 預設啟動（port 8095，無認證）
npm start

# 指定埠號
PORT=3000 npm start

# 啟用 Bearer Token 認證
AUTH_TOKEN=your-secret-token npm start

# 自訂資料庫路徑
DB_PATH=/path/to/kb.db npm start
```

啟動後會看到：

```
📚 SQLite: /path/to/data/compassion-kb.db
🔑 Auth: disabled
🚀 Compassion KB running on http://0.0.0.0:8095
   MCP: POST http://0.0.0.0:8095/mcp
```

### 驗證伺服器

```bash
# 健康檢查
curl http://localhost:8095/

# MCP 初始化
curl -X POST http://localhost:8095/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {},
      "clientInfo": {"name": "test", "version": "1.0.0"}
    }
  }'
```

## 使用者指南

### 分類系統

內建 7 個分類，適合知識工作者的常見內容類型：

| 分類 | 適用場景 |
|---|---|
| `idea` | 靈感、點子、腦力激盪的結果 |
| `decision` | 重要決策及其理由（為什麼選 A 不選 B） |
| `insight` | 觀察、心得、從經驗中學到的教訓 |
| `meeting-notes` | 會議記錄、諮詢摘要、訪談重點 |
| `client-feedback` | 客戶回饋、常見問題、痛點觀察 |
| `article-draft` | 文章草稿、內容素材、寫作大綱 |
| `general` | 未分類的通用內容 |

### 標籤系統

標籤是自由的文字陣列，用於跨分類的關聯檢索。建議用法：

```
["AI", "MCP", "knowledge-base"]     # 技術相關
["個人品牌", "內容經營", "行銷"]      # 品牌相關
["客戶A", "專案B"]                   # 專案相關
```

### 來源標記

記錄這條知識來自哪裡，方便日後追溯：

| 來源 | 說明 |
|---|---|
| `manual` | 手動輸入（預設） |
| `chatgpt` | 跟 ChatGPT 討論產出 |
| `claude` | 跟 Claude 討論產出 |
| `hermes` | Hermes Agent 產出 |
| `meeting` | 會議 / 諮詢過程記錄 |

### 典型工作流程

**1. 記錄想法（透過 AI 對話）**

> 幫我把這段討論記下來：我們決定用 MCP 協議來做知識庫整合，因為它是標準協議，未來換 AI 工具不用重新串接。

AI 會呼叫 `create_entry`，自動分類為 `decision`，打上標籤 `["MCP", "knowledge-base"]`。

**2. 沉澱靈感**

> 今天的客戶諮詢有一個觀察：很多創作者不是不會寫內容，而是從靈感到成品的摩擦太多。

AI 會呼叫 `create_entry`，分類為 `client-feedback`。

**3. 回顧與整理**

> 幫我把最近跟 AI 討論過的決策整理成一篇文章大綱。

AI 會先 `search_knowledge` 搜尋 `decision` 分類的條目，再 `get_entry` 取得完整內容，綜合整理成大綱。

**4. 內容轉化**

> 把知識庫裡關於「AI 工作台」的靈感，整理成一則社群貼文。

AI 搜尋相關條目 → 提取重點 → 生成貼文。

## 連接 AI 工具

### Hermes Agent

在 `~/.hermes/config.yaml` 中加入：

```yaml
mcp_servers:
  compassion-kb:
    url: http://localhost:8095/mcp
    # 透過 Cloudflare Tunnel 遠端存取：
    # url: https://compassion-kb.your-domain.com/mcp
    timeout: 30
```

重啟 Hermes 後即可使用 `mcp_compassion_kb_*` 系列工具。

### Claude Desktop

在 `claude_desktop_config.json` 中加入：

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

在專案根目錄的 `.mcp.json` 中加入：

```json
{
  "mcpServers": {
    "compassion-kb": {
      "url": "http://localhost:8095/mcp"
    }
  }
}
```

### ChatGPT

ChatGPT 目前不原生支援 MCP。建議透過 [MCP Gateway](https://github.com/brianshih04/claude-mcp-gateway) 等橋接方案，將 MCP 工具轉為 ChatGPT 可呼叫的 HTTP API。

## Cloudflare Tunnel 設定（可選）

如果你需要從外部網路存取知識庫（例如讓 Claude Desktop 或其他遠端工具連線），可以透過 Cloudflare Tunnel 公開。

### 設定步驟

**1. 在 Cloudflare Tunnel 設定中加入路由**

編輯 `~/.cloudflared/config.yml`（或 `/etc/cloudflared/config.yml`），在 `ingress` 區塊加入：

```yaml
ingress:
  - hostname: compassion-kb.your-domain.com
    service: http://localhost:8095
  # ... 其他路由 ...
  - service: http_status:404  # 必須在最後
```

**2. 新增 DNS 記錄**

```bash
cloudflared tunnel route dns <tunnel-id> compassion-kb.your-domain.com
```

**3. 重啟 Cloudflare Tunnel**

```bash
# systemd 管理
sudo systemctl restart cloudflared

# 或手動重啟
cloudflared tunnel run <tunnel-name>
```

**4. 驗證**

```bash
curl https://compassion-kb.your-domain.com/
```

## 部署為背景服務

### systemd 使用者服務（推薦）

建立 `~/.config/systemd/user/compassion-kb.service`：

```ini
[Unit]
Description=Compassion KB MCP Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/your-user/Compassion-kb
ExecStart=/path/to/node src/index.js
Restart=on-failure
RestartSec=5
Environment=PORT=8095
# Environment=AUTH_TOKEN=your-secret-token

[Install]
WantedBy=default.target
```

啟用並啟動：

```bash
systemctl --user daemon-reload
systemctl --user enable compassion-kb
systemctl --user start compassion-kb
systemctl --user status compassion-kb
```

### PM2

```bash
pm2 start src/index.js --name compassion-kb
pm2 save
pm2 startup
```

## 環境變數

| 變數 | 預設值 | 說明 |
|---|---|---|
| `PORT` | `8095` | 伺服器監聽埠號 |
| `AUTH_TOKEN` | （無） | Bearer Token，留空則停用認證 |
| `DB_PATH` | `./data/compassion-kb.db` | SQLite 資料庫路徑 |

## 資料庫結構

SQLite + FTS5 全文搜尋。資料庫檔案位於 `./data/compassion-kb.db`（已加入 `.gitignore`）。

```
entries
├── id           TEXT PRIMARY KEY (UUID)
├── title        TEXT NOT NULL
├── content      TEXT NOT NULL (支援 Markdown)
├── category     TEXT DEFAULT 'general'
├── tags         TEXT DEFAULT '[]' (JSON 陣列)
├── source       TEXT DEFAULT 'manual'
├── created_at   TEXT (ISO 8601)
└── updated_at   TEXT (ISO 8601)

entries_fts (FTS5 虛擬表)
├── title, content, category, tags, source
└── 自動同步（INSERT / UPDATE / DELETE 觸發器）
```

## 傳輸協議

- **Transport**: Streamable HTTP（Web Standard）
- **Protocol Version**: `2025-06-18`
- **Endpoint**: `POST /mcp`
- **Headers**:
  - `Content-Type: application/json`
  - `Accept: application/json, text/event-stream`
  - `Authorization: Bearer <token>`（若啟用認證）

## 技術架構

```
┌──────────────┐     MCP (Streamable HTTP)     ┌──────────────────┐
│  Claude       │ ──────────────────────────────▶│                  │
│  ChatGPT      │                               │  Compassion KB   │
│  Hermes       │                               │  MCP Server      │
│  Claude Code  │                               │                  │
└──────────────┘                               │  ┌────────────┐  │
                                               │  │  SQLite     │  │
       ┌───────────────────┐                   │  │  + FTS5     │  │
       │  Cloudflare Tunnel │──────────────────▶│  └────────────┘  │
       │  (optional)        │  HTTPS             │                  │
       └───────────────────┘                   └──────────────────┘
```

## 授權

MIT License

## 專案資訊

- **作者**: [Brian Shih](https://github.com/brianshih04)
- **專案首頁**: [brianshih04/Compassion-kb](https://github.com/brianshih04/Compassion-kb)
- **問題回報**: [GitHub Issues](https://github.com/brianshih04/Compassion-kb/issues)

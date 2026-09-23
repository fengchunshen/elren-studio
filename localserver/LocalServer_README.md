# Elren Studio 本地接收器配置

## 目录结构（必读）
```
localserver/
  elren-server-full.py            # 本地接收器主程序（全功能）
  elren-local-config.json         # 本地接收器配置
  LocalServer_README.md            # 本说明
  Docker_README.md                 # Docker 部署说明
  Middleware_README-ComfyUI.md     # ComfyUI 中间件说明
  comfy-middleware/                # ComfyUI 代理/中间件代码
  workflows/                       # ComfyUI 模板目录（template.json / meta.json）
```

本地接收器（LocalServer）是 Elren Studio 的核心基础设施，负责 **本地缓存/保存**、**跨域代理 (CORS)**、以及 **ComfyUI 中间件接入**。  
并发优化：内部采用线程化 HTTP Server 处理请求，避免流式/上传阻塞其它请求；ComfyUI 任务另有队列管理，避免并发卡死。

---

## 0. 启动方式（必读）

### 环境要求
* Python 3.8+

### 启动
推荐运行全功能版本：
```bash
python elren-server-full.py
```
默认监听端口：**9527**

若使用仓库内置即梦一键包（位于 `localserver/jimeng-api/`），请使用当前版本：
- `JimengAPI_Release_Green_260211_v1.9.1.7z`（Windows）
- `JimengAPI_For_Mac_Users_260211_v1.9.1.7z`（macOS）

### Docker 启动
若希望通过容器运行本地接收器，请参考：
* `localserver/Docker_README.md`

> 当前 compose 方案可同时启动前端（`http://127.0.0.1:8080`）和本地接收器（`http://127.0.0.1:9527`）。

### 配置文件作用（elren-local-config.json）
该配置文件决定本地接收器的核心行为：
* **allowed_roots**：允许读写/保存的根目录白名单。
* **save_path**：资源保存目录（必须落在 allowed_roots 内）。
* **proxy_allowed_hosts**：代理白名单（决定哪些域名允许走 `/proxy`）。
* **proxy_timeout**：代理超时（秒）。

修改配置后需重启本地接收器生效。

---

## 1. 缓存功能（主动缓存 + 保存节点）

### 1.1 功能说明
LocalServer 会在后台主动缓存所有被访问的图片/视频资源：
* **主动缓存**：每次加载资源都会写入本地 `save_path` 并做 hash 去重。
* **缓存优先级**：资源加载顺序为 `本地缓存 → 代理 → 直连`，确保带宽稳定与 CORS 安全。
* **保存节点联动**：在画布启用“保存节点”后，可将输出自动落盘到本地目录，支持批量导出与复用。

### 1.2 如何在画布启用
* 在 Elren Studio 的 **设置面板** 启用本地缓存与保存节点。  
* 若有“本地连接器 / 本地缓存”开关，请确保已打开。  

### 1.3 更换保存目录 / 刷新缓存
修改同目录的 `elren-local-config.json`：
```json
{
  "allowed_roots": [
    "C:\\Users\\YourName\\Downloads",
    "D:\\ElrenData",
    "E:\\ElrenData"
  ],
  "save_path": "D:\\ElrenData"
}
```
说明：
* `save_path` 必须位于 `allowed_roots` 内，否则服务拒绝启动。
* 修改后 **重启本地接收器**。
* 若需要刷新缓存，可删除旧目录或更换目录后再刷新页面。

### 1.4 从更名前的版本升级
启动时会自动把旧名称的数据原地改名，新旧同时存在时不合并，只在日志中提示：
* 同目录的 `tapnow-local-config.json` → `elren-local-config.json`；
* 默认保存目录 `~/Downloads/TapnowStudio` → `~/Downloads/ElrenStudio`（仅在未通过 `-d` 指定目录时）；
* 保存目录下的缓存 `.tapnow_cache` → `.elren_cache`（启动时及页面更新保存目录时）。

浏览器里已保存的缓存地址会随前端数据迁移一并改写。环境变量开关改为 `ELREN_ENABLE_*`。Windows 默认白名单由 `D:\TapnowData` 改为 `D:\ElrenData`：继续使用旧目录请将其加入 `allowed_roots`，或把目录改名。

---

## 2. 代理功能（解决 CORS）

### 2.1 什么是 CORS
浏览器出于安全限制，**禁止前端直接访问非同源 API**。  
本地接收器通过 `/proxy` 中转，绕过浏览器跨域限制。

### 2.2 代理用于谁
* 需要浏览器跨域访问的第三方 API（如 OpenAI / Gemini / ModelScope / SiliconFlow / BizyAir）。
* 上传/下载需要稳定 CORS 支持的图片与视频资源。
* 需要流式响应（SSE）或大体积上传的接口调用。

### 2.3 如何开启
在 `elren-local-config.json` 中配置白名单并重启服务：

```json
{
  "allowed_roots": [
    "C:\\Users\\YourName\\Downloads",
    "D:\\ElrenData"
  ],
  "proxy_allowed_hosts": [
    "api.openai.com",
    "generativelanguage.googleapis.com",
    "api-inference.modelscope.cn",
    "api.bizyair.cn",
    "googlecdn.datas.systems",
    "*.openai.azure.com"
  ],
  "proxy_timeout": 300
}
```

前端操作：
* 在 Elren Studio 设置面板打开 **本地代理**（或 Proxy 开关）。
* 如果配置了 Provider 的 Base URL，可使用 `http://127.0.0.1:9527/proxy` 作为转发入口。

### 2.4 达成效果
* 浏览器跨域限制被绕过（CORS 允许）。
* 支持流式响应（SSE）与上传。
* 减少前端直连失败概率。

使用示例：
```javascript
const target = 'https://api.openai.com/v1/chat/completions';
const url = `http://127.0.0.1:9527/proxy?url=${encodeURIComponent(target)}`;
const resp = await fetch(url, {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});
```

### 2.5 地址写法（Query / Header）
**Query 方式（推荐）**
```javascript
const target = 'https://api.openai.com/v1/chat/completions';
const url = `http://127.0.0.1:9527/proxy?url=${encodeURIComponent(target)}`;
```

**Header 方式（避免过长 URL）**
```javascript
const resp = await fetch('http://127.0.0.1:9527/proxy', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-Proxy-Target': 'https://api.openai.com/v1/chat/completions'
  },
  body: JSON.stringify(payload)
});
```

**上传文件（multipart）**
```javascript
const form = new FormData();
form.append('file', file);
const url = `http://127.0.0.1:9527/proxy?url=${encodeURIComponent(uploadUrl)}`;
await fetch(url, {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}` },
  body: form
});
```
注意：不要手动设置 `Content-Type`，浏览器会自动添加 boundary。

说明：
* `proxy_allowed_hosts` 为空则代理被禁用。
* 如需临时允许任意域名，可设置为 `["*"]`（不建议）。
* `proxy_timeout` 为代理超时秒数，设置为 `0` 表示不超时。

---

## 3. 本地 ComfyUI 接入（中间件）

本地 ComfyUI 中间件用于将 `127.0.0.1:8188` 封装成统一的 BizyAir 风格接口：
* **目标**：让前端不用理解 ComfyUI 节点图，只传 prompt/seed/steps 等参数即可。
* **收益**：统一异步轮询、统一输出解析、支持 batch 多图输出。

具体配置与模板生成流程请见：
* `localserver/Middleware_README-ComfyUI.md`

---

## 关联参考
* 模型库设置请参考 `docs/models/model-template-readme.md` 的第 4 章（含参数调节）与第 5 章（异步任务）。
* ComfyUI 模板与 meta 映射流程详见 `localserver/Middleware_README-ComfyUI.md`。

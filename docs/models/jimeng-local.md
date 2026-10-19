# 即梦本地代理配置（本地模式）

浏览器安全策略（CORS）和即梦接口签名使浏览器无法直连即梦，本地模式需要配合开源项目 [jimeng-api](https://github.com/iptag/jimeng-api) 作为本机代理。平台模式由后端调用供应商，不使用本流程。

## 1. 启动 jimeng-api

任选一种方式：

- 从 [jimeng-api Releases](https://github.com/iptag/jimeng-api/releases) 下载对应系统的版本并运行。
- 使用仓库内置的一键包，解压后运行：
  - Windows：`localserver/jimeng-api/JimengAPI_Release_Green_260211_v1.9.1.7z`
  - macOS：`localserver/jimeng-api/JimengAPI_For_Mac_Users_260211_v1.9.1.7z`

服务默认地址为 `http://localhost:5100`。

## 2. 获取 Session ID

1. 在浏览器登录 [即梦官网](https://jimeng.jianying.com/)。
2. 按 `F12` 打开开发者工具，进入 `Application`（应用）标签页。
3. 在左侧 `Cookies` 中选择即梦域名。
4. 复制 `sessionid` 的值。

## 3. 在 Elren Studio 中连接

1. 打开项目菜单中的 **API 设置**。
2. 找到即梦相关模型（或新增模型）。
3. **Base URL** 填 `http://localhost:5100`，**API Key** 填上一步复制的 `sessionid`。
4. （可选）勾选设置底部的“即梦图生图使用本地文件”，提升上传稳定性。

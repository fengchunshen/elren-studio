# Elren Middleware 配置说明 (本地 ComfyUI 代理)

本文件仅描述 **ComfyUI 中间件** 的模板与 API 逻辑。  
安装启动、代理/CORS、本地缓存等内容已移动至：
* `localserver/LocalServer_README.md`

---

## 1. 模板配置 (核心)

Middleware 不会自动扫描 ComfyUI，你需要手动导入工作流并配置参数映射。

所有的模板存放于 `workflows/` 目录下。

### 目录结构
```
localserver/
  elren-server-full.py
  workflows/
    ├── sdxl_standard/          <-- App ID (模板名称)
    │   ├── template.json       <-- ComfyUI 导出的 API JSON
    │   └── meta.json           <-- 参数映射配置
    └── flux_dev/               <-- 另一个模板
        ├── template.json
        └── meta.json
```

### 如何创建模板 (template.json)
1. 打开 ComfyUI 网页版。
2. 打开设置 (齿轮) -> 勾选 **Enable Dev mode Options**。
3. 点击 **Save (API Format)** 按钮。
4. 将保存的 json 重命名为 `template.json` 并放入对应文件夹。

### 自动生成 meta.json（脚本）
`localserver/workflows/prepare_workflow_templates.bat`（或 `.ps1`）会遍历所有目录：

* 读取 `template.json`，分析每个节点的 `inputs`。
* 自动生成 `meta.json` 映射常用字段（prompt/seed/steps/width/height/batch/sampler/scheduler/ratio）。
* 若需要定制，可以在生成后的 `meta.json` 中手动调整 nodeId 及 field 路径。

只需执行一次 `prepare_workflow_templates.bat`，就可以保持 meta 与 ComfyUI 模板同步。后续模板更新只需再执行一次脚本。

### 如何配置映射 (meta.json)
你需要告诉 Middleware，用户的输入 (如 `prompt`) 应该填入哪个节点的哪个字段。

```json
{
  "name": "SDXL 标准文生图",
  "params_map": {
    "prompt": { 
        "node_id": "6",       // 节点 ID (从 template.json 中找)
        "field": "inputs.text" // 要修改的字段路径
    },
    "seed": { 
        "node_id": "3", 
        "field": "inputs.seed" 
    },
    "cfg": {
        "node_id": "3",
        "field": "inputs.cfg"
    }
  }
}
```

---

## 2. API 接口文档

### 2.1 获取可用模板列表
*   **URL**: `GET /comfy/apps`
*   **Response**:
    ```json
    { "apps": ["sdxl_standard", "flux_dev"] }
    ```

### 2.2 提交生成任务
*   **URL**: `POST /comfy/queue`  
*   **兼容**: `POST /w/v1/webapp/task/openapi/create` / `POST /task/openapi/ai-app/run`
*   **Body**:
    ```json
    {
      "app_id": "sdxl_standard",  // 对应文件夹名
      "inputs": {
        "prompt": "a beautiful girl, 8k, best quality",
        "seed": 123456
      }
    }
    ```
*   **Response**:
    ```json
    {
      "requestId": "550e8400-e29b-41d4-a716-446655440000",
      "status": "Queued",
      "code": 20000,
      "message": "Ok"
    }
    ```

### 2.3 查询任务进度
*   **URL**: `GET /comfy/status/{job_id}`  
*   **兼容**: `GET /w/v1/webapp/task/openapi/detail?requestId=...`
*   **Response (处理中)**:
    ```json
    { "status": "processing" }
    ```
*   **Response (成功)**:
    ```json
    {
      "status": "success",
      "result": {
        "images": [
            "http://127.0.0.1:8188/view?filename=ComfyUI_001.png&..."
        ]
      }
    }
    ```

### 2.4 获取输出
* **URL**: `GET /w/v1/webapp/task/openapi/outputs?requestId=...`
* **Response**:
  ```json
  {
    "code": 20000,
    "message": "Ok",
    "data": {
      "outputs": [{ "object_url": "http://127.0.0.1:8188/view?..." }]
    }
  }
  ```

### 2.5 联通测试
```bash
curl http://127.0.0.1:9527/comfy/apps
curl http://127.0.0.1:9527/w/v1/webapp/task/openapi/detail?requestId=<id>
```

## 3. 模型库配置引用
本地 ComfyUI 模型推荐通过 `docs/models/model-template-readme.md` 内的模型库章节配置：

* 章节 4（本地 ComfyUI，含参数调节）详细描述 template/meta/请求模板。
* 章节 5（异步任务）说明轮询配置与 outputs 解析。
* 章节 6（BizyAir）可作为参考进行对照配置。

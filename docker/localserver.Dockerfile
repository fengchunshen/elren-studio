# ============================================
# Elren Local Server Docker Image
# 仅包含 Python 本地接收器服务（9527）
# ============================================
FROM python:3.11-slim

LABEL maintainer="Elren Studio"
LABEL description="Elren Local Server"

WORKDIR /app

# 安装 Python 依赖
COPY localserver/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# 复制服务器代码和配置
COPY localserver/ ./localserver/

# 创建数据目录
RUN mkdir -p /app/data

# ============================================
# 环境变量配置
# ============================================
# 功能开关
ENV ELREN_ENABLE_FILE_SERVER=true
ENV ELREN_ENABLE_PROXY=true
ENV ELREN_ENABLE_COMFY=false
ENV ELREN_ENABLE_LOG=true

# 端口
EXPOSE 9527

# 健康检查（服务提供 /ping 与 /status，根路径会返回 404）
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:9527/ping')" || exit 1

# 启动命令
WORKDIR /app/localserver
CMD ["python", "elren-server-full.py", "-d", "/app/data"]

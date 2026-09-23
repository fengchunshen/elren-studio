# ============================================
# Elren Web Docker Image
# 前端静态页面容器（Nginx）
# ============================================

# ============================================
# Stage 1: 构建前端
# ============================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --production=false

# 复制源码并构建
COPY . .
RUN npm run build

# ============================================
# Stage 2: Nginx 运行时
# ============================================
FROM nginx:1.27-alpine

LABEL maintainer="Elren Studio"
LABEL description="Elren Web Static Server"

# 覆盖默认站点配置（含 SPA fallback）
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf

# 复制构建产物
COPY --from=frontend-builder /app/dist/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://localhost/ || exit 1

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
COPY index.html vite.config.js tailwind.config.js postcss.config.js ./
ENV VITE_PLATFORM_MODE=true
RUN npm run build

FROM nginx:alpine
COPY docker/nginx/platform.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
EXPOSE 80


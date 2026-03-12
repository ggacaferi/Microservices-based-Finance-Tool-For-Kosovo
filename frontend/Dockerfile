# ── Build Stage ────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json vite.config.ts index.html ./
COPY src/ ./src/

RUN npm run build

# ── Production Stage (nginx) ──────────────────────────────
FROM nginx:1.25-alpine AS production

COPY --from=builder /app/dist /usr/share/nginx/html

# SPA routing — redirect all non-file requests to index.html
RUN printf 'server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  resolver 127.0.0.11 valid=10s;\n\
  location /api/ {\n\
    set $gw gateway;\n\
    proxy_pass http://$gw:3000;\n\
  }\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

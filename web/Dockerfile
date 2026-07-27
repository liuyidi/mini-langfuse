# --- Build stage ---
FROM docker.m.daocloud.io/library/node:20-alpine AS builder
WORKDIR /app
# Alpine + npm China mirrors
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories \
    && npm config set registry https://registry.npmmirror.com
COPY package.json ./
RUN npm install --loglevel=error
COPY tsconfig.json vite.config.ts tailwind.config.js postcss.config.js index.html ./
COPY src ./src
RUN npm run build

# --- Serve stage ---
FROM docker.m.daocloud.io/library/nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

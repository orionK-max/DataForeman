# Core service Dockerfile
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production

# Install Docker CLI for service restart functionality
RUN apk add --no-cache docker-cli

COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install --no-audit --no-fund; fi

COPY src ./src
COPY migrations ./migrations
COPY migrations-tsdb ./migrations-tsdb
COPY start.sh ./start.sh
RUN chmod +x ./start.sh && mkdir -p logs/core && chmod 0755 logs logs/core

EXPOSE 3000
CMD ["./start.sh"]

FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY src ./src

ENV LOG_LEVEL=info
CMD ["node", "src/ingestor.mjs"]

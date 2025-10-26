FROM node:22-alpine
WORKDIR /app

# Install Python, PyComm3 and build tools for native dependencies
RUN apk add --no-cache python3 py3-pip build-base linux-headers && \
    pip3 install --break-system-packages pycomm3==1.2.14

# Install dependencies (with retry logic for network issues)
COPY package.json package-lock.json* ./
RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Copy source
# Force cache bust for source code updates
ARG CACHE_BUST=1
COPY src ./src

ENV LOG_LEVEL=info
ENV CONNECTIVITY_SCRIPT=src/index-multirate.mjs
CMD ["sh", "-c", "node ${CONNECTIVITY_SCRIPT} 2>&1 | node /app/src/filter-eip-logs.mjs | tee -a /var/log/connectivity/connectivity.current"]


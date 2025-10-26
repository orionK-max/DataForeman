# Build stage
FROM node:22-alpine AS build

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./

# Install dependencies
RUN if [ -f package-lock.json ]; then npm ci; \
    else npm install --no-fund --no-audit; fi

# Copy application files
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:1.27-alpine

# Copy built files from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Create log directory for nginx
RUN mkdir -p /var/log/front && chmod 0777 /var/log/front

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

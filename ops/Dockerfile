FROM node:22-alpine
RUN apk add --no-cache docker-cli
WORKDIR /app
COPY rotator-daemon.js .
COPY rotate-logs.js .
ENTRYPOINT ["node", "/app/rotator-daemon.js"]

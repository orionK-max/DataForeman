FROM node:22-alpine
WORKDIR /app
COPY rotator-daemon.js .
COPY rotate-logs.js .
ENTRYPOINT ["node", "/app/rotator-daemon.js"]

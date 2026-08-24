FROM emqx/nanomq:0.24.14-full

# Create directories for config and logs
RUN mkdir -p /etc/nanomq /var/log/broker

# Copy config template (real secrets are injected at container start from env vars,
# not baked into the image) and the render-and-start entrypoint script.
COPY nanomq.conf.template /etc/nanomq/nanomq.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose ports:
# 1883: MQTT
# 8883: MQTT over TLS
# 8081: WebSocket
# 8001: HTTP API
EXPOSE 1883 8883 8081 8001

CMD ["/docker-entrypoint.sh"]

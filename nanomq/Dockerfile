FROM emqx/nanomq:0.22.4-full

# Create directories for config and logs
RUN mkdir -p /etc/nanomq /var/log/nanomq

# Copy default configuration
COPY nanomq.conf /etc/nanomq/nanomq.conf

# Expose ports:
# 1883: MQTT
# 8883: MQTT over TLS
# 8081: WebSocket
# 8001: HTTP API
EXPOSE 1883 8883 8081 8001

CMD ["nanomq", "start", "--conf", "/etc/nanomq/nanomq.conf"]

#!/bin/sh
# Renders nanomq.conf.template into a real config by substituting secret placeholders
# with values from the environment (MQTT_BROKER_HTTP_PASSWORD / MQTT_WEBHOOK_SECRET, set
# via .env), then starts NanoMQ. Keeps real secrets out of the file committed to git.
set -eu

: "${MQTT_BROKER_HTTP_PASSWORD:?MQTT_BROKER_HTTP_PASSWORD is not set}"
: "${MQTT_WEBHOOK_SECRET:?MQTT_WEBHOOK_SECRET is not set}"

TEMPLATE="/etc/nanomq/nanomq.conf.template"
RENDERED="/etc/nanomq/nanomq.conf"

sed \
  -e "s|__MQTT_BROKER_HTTP_PASSWORD__|${MQTT_BROKER_HTTP_PASSWORD}|g" \
  -e "s|__MQTT_WEBHOOK_SECRET__|${MQTT_WEBHOOK_SECRET}|g" \
  "$TEMPLATE" > "$RENDERED"

mkdir -p /var/log/broker
exec nanomq start --conf "$RENDERED" >> /var/log/broker/broker.current 2>&1

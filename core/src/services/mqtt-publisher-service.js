/**
 * MQTT Publisher Service
 *
 * Runs inside core. Loads all enabled publishers from DB, schedules interval
 * publishing, and handles on_change triggers from telemetry-ingest.
 *
 * Publishing uses the NanoMQ HTTP REST API (POST /api/v4/mqtt/publish).
 * Tag values are read from app.runtimeState (in-memory cache fed by NATS telemetry).
 *
 * Storage format:  {{tag_id:1234}}   (numeric, rename-safe)
 * Display format:  {{ConnectionName|TagName}}  (shown in UI, resolved via Validate button)
 */

// Matches {{tag_id:N}} tokens stored in payload_template
const TOKEN_RE = /\{\{tag_id:(\d+)\}\}/g;

/**
 * Parse all {{tag_id:N}} tokens from a template string.
 * Returns an array of tag_id integers.
 */
export function parseTemplateTokens(template) {
  if (!template) return [];
  TOKEN_RE.lastIndex = 0;
  const ids = [];
  const seen = new Set();
  let m;
  while ((m = TOKEN_RE.exec(template)) !== null) {
    const tagId = parseInt(m[1], 10);
    if (!seen.has(tagId)) { seen.add(tagId); ids.push(tagId); }
  }
  return ids;
}

export class MqttPublisherService {
  constructor(app) {
    this.app = app;
    this.publishers = new Map();
    this.tagToPublishers = new Map();
  }

  /** Load all enabled publishers from DB and start their schedulers. */
  async init() {
    await this.reload();
  }

  /** Reload all publishers (called after any publisher CUD operation). */
  async reload() {
    // Stop existing interval timers
    for (const pub of this.publishers.values()) {
      if (pub.timer) clearInterval(pub.timer);
    }
    this.publishers.clear();
    this.tagToPublishers.clear();

    let rows;
    try {
      ({ rows } = await this.app.db.query(
        'SELECT * FROM mqtt_publishers WHERE enabled = true'
      ));
    } catch (err) {
      this.app.log.error({ err }, 'MqttPublisherService: failed to load publishers');
      return;
    }

    for (const row of rows) {
      // Build tagRefs directly from {{tag_id:N}} tokens in the template.
      // No extra DB query needed — IDs are embedded in the stored template.
      const tagRefs = new Map();
      TOKEN_RE.lastIndex = 0;
      let m;
      while ((m = TOKEN_RE.exec(row.payload_template || '')) !== null) {
        const tagId = parseInt(m[1], 10);
        tagRefs.set(`tag_id:${tagId}`, tagId);
      }

      const pub = { ...row, tagRefs, lastPublished: 0, timer: null };
      this.publishers.set(row.id, pub);

      // Build reverse index for on_change lookups
      for (const tagId of tagRefs.values()) {
        if (!this.tagToPublishers.has(tagId)) {
          this.tagToPublishers.set(tagId, new Set());
        }
        this.tagToPublishers.get(tagId).add(row.id);
      }

      // Start interval timer if needed
      if ((row.publish_mode === 'interval' || row.publish_mode === 'both') && row.interval_ms > 0) {
        pub.timer = setInterval(() => {
          this._publishNow(row.id).catch(err => {
            this.app.log.warn({ err, publisherId: row.id }, 'MQTT interval publish error');
          });
        }, row.interval_ms);
      }
    }

    this.app.log.info({ count: this.publishers.size }, 'MqttPublisherService: loaded publishers');
  }

  /**
   * Called by telemetry-ingest after every tag value update.
   * Triggers on_change publishers that watch this tag.
   * Non-blocking — fires and forgets.
   */
  onTagUpdate(tagId, value) {
    const pubIds = this.tagToPublishers.get(tagId);
    if (!pubIds || pubIds.size === 0) return;

    const now = Date.now();
    for (const pubId of pubIds) {
      const pub = this.publishers.get(pubId);
      if (!pub) continue;
      if (pub.publish_mode !== 'on_change' && pub.publish_mode !== 'both') continue;

      // Throttle to min_interval_ms (default 500ms)
      const minMs = pub.min_interval_ms ?? 500;
      if (now - pub.lastPublished < minMs) continue;

      this._publishNow(pubId).catch(err => {
        this.app.log.warn({ err, pubId }, 'MQTT on_change publish error');
      });
    }
  }

  async _publishNow(pubId) {
    const pub = this.publishers.get(pubId);
    if (!pub || !pub.mqtt_topic || !pub.payload_template) return;

    const payload = this._resolveTemplate(pub);
    await this._mqttPublish(pub.mqtt_topic, payload, pub.qos ?? 0, pub.retain ?? false);
    pub.lastPublished = Date.now();
  }

  /** Resolve all {{tag_id:N}} tokens in the template using runtimeState cache. */
  _resolveTemplate(pub) {
    TOKEN_RE.lastIndex = 0;
    return pub.payload_template.replace(TOKEN_RE, (match, idStr) => {
      const tagId = parseInt(idStr, 10);
      const cached = this.app.runtimeState.getTagValue(tagId);
      if (cached === undefined || cached.value === undefined) return 'null';

      const val = cached.value;
      if (val === null || val === undefined) return 'null';

      // For JSON templates, use JSON.stringify to get proper types (numbers, booleans).
      // For raw templates, use string coercion.
      if (pub.payload_format === 'json') return JSON.stringify(val);
      return String(val);
    });
  }

  /** Publish a message via the NanoMQ HTTP REST API. */
  async _mqttPublish(topic, payload, qos, retain) {
    const nanoMqUrl = process.env.NANOMQ_HTTP_URL || 'http://broker:8001';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${nanoMqUrl}/api/v4/mqtt/publish`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': 'Basic ' + Buffer.from('admin:public').toString('base64'),
          'Content-Type': 'application/json',
          'connection': 'close',
        },
        body: JSON.stringify({
          topic,
          payload: String(payload),
          qos: qos ?? 0,
          retain: retain ?? false,
          clientid: 'df-publisher',
        }),
      });
      if (!res.ok) {
        this.app.log.warn({ topic, status: res.status }, 'MQTT publish: HTTP error from broker');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        this.app.log.warn({ err, topic }, 'MQTT publish: request failed');
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

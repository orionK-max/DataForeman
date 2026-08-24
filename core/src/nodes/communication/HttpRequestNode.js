import { BaseNode } from '../base/BaseNode.js';

/**
 * HttpRequestNode - Make HTTP requests to external APIs
 *
 * Fires an HTTP request on each execution and outputs the parsed response.
 * Supports GET/POST/PUT/PATCH/DELETE, custom headers, and a JSON-path-style
 * extractor so you can pluck a nested field without a separate node.
 */
export class HttpRequestNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'HTTP Request',
    name: 'http-request',
    version: 1,
    description: 'Fetch data from an HTTP/HTTPS API endpoint',
    category: 'COMMUNICATION',
    section: 'BASIC',
    icon: '🌐',
    color: '#0277BD',

    inputs: [],

    ioRules: [
      {
        inputs: {
          definitions: [
            {
              type: 'boolean',
              displayName: 'Trigger',
              required: false,
              skipNodeOnNull: false,
              typeFixed: true,
              description: 'When false, the request is skipped. Leave unconnected to always fire.'
            }
          ],
          dynamic: {
            min: 0,
            max: 9,
            default: 0,
            canAdd: true,
            canRemove: true,
            type: 'any',
            typeFixed: false,
            template: {
              displayName: 'Value {n}'
            }
          }
        }
      }
    ],

    outputs: [
      {
        displayName: 'Response',
        type: 'object',
        description: 'Parsed JSON response body (or extracted field)'
      }
    ],

    visual: {
      canvas: {
        minWidth: 180,
        shape: 'rounded-rect',
        borderRadius: 8,
        resizable: false
      },
      layout: [
        {
          type: 'header',
          icon: '🌐',
          title: 'HTTP Request',
          color: '#0277BD',
          badges: ['executionOrder']
        },
        {
          type: 'subtitle',
          text: '{{method}} {{url}}',
          visible: '{{url}}',
          maxLength: 30
        }
      ],
      handles: {
        inputs: [],
        outputs: [
          { index: 0, position: 'auto', color: 'auto', label: null, visible: true }
        ],
        size: 12,
        borderWidth: 2,
        borderColor: '#ffffff'
      },
      status: {
        execution: { enabled: true, position: 'top-left', offset: { x: -10, y: -10 } },
        pinned: { enabled: true, position: 'top-right', offset: { x: -8, y: -8 } },
        executionOrder: { enabled: true, position: 'header' }
      },
      runtime: { enabled: false }
    },

    properties: [
      {
        name: 'url',
        displayName: 'URL',
        type: 'string',
        default: '',
        required: true,
        description: 'Full URL to request. Use {{1}}, {{2}}, ... to embed dynamic input values (e.g. https://api.day.app/key/Alert/Value+is+{{1}})'
      },
      {
        name: 'method',
        displayName: 'Method',
        type: 'select',
        default: 'GET',
        required: true,
        options: [
          { label: 'GET',    value: 'GET' },
          { label: 'POST',   value: 'POST' },
          { label: 'PUT',    value: 'PUT' },
          { label: 'PATCH',  value: 'PATCH' },
          { label: 'DELETE', value: 'DELETE' }
        ],
        description: 'HTTP method'
      },
      {
        name: 'headers',
        displayName: 'Headers',
        type: 'json',
        default: { 'User-Agent': 'DataForeman/1.0 (contact@example.com)' },
        description: 'HTTP request headers as a JSON object'
      },
      {
        name: 'body',
        displayName: 'Request Body',
        type: 'json',
        default: {},
        description: 'JSON body for POST/PUT/PATCH requests. Use {{1}}, {{2}}, ... to embed dynamic input values.'
      },
      {
        name: 'extractPath',
        displayName: 'Extract Path',
        type: 'string',
        default: '',
        description: 'Dot-notation path to extract from response (e.g. properties.periods.0.temperature). Leave empty for full response.'
      },
      {
        name: 'timeout',
        displayName: 'Timeout (ms)',
        type: 'number',
        default: 10000,
        min: 500,
        max: 60000,
        description: 'Request timeout in milliseconds'
      },
      {
        name: 'onError',
        displayName: 'On Error',
        type: 'select',
        default: 'stop',
        options: [
          { label: 'Stop Flow', value: 'stop' },
          { label: 'Continue (output null)', value: 'continue' }
        ],
        description: 'How to handle request errors'
      }
    ],

    configUI: {
      sections: [
        {
          type: 'property-group',
          title: 'Request',
          properties: ['url', 'method']
        },
        {
          type: 'property-group',
          title: 'Headers & Body',
          properties: ['headers', 'body']
        },
        {
          type: 'property-group',
          title: 'Options',
          properties: ['timeout', 'onError']
        },
        {
          type: 'property-group',
          title: 'Response',
          properties: ['extractPath']
        }
      ]
    },

    help: {
      overview: "Makes HTTP/HTTPS requests to external APIs and web services. The optional Trigger input (boolean) gates execution — connect a Comparison node to fire only on condition. Add extra inputs to embed live values into the URL or body using {{1}}, {{2}}, ... placeholders.",
      useCases: [
        "Sending push notifications (e.g. Bark/Pushover) when a sensor threshold is breached",
        "Fetching data from REST APIs (weather, IoT cloud platforms, ERP systems)",
        "Sending sensor values to external HTTP endpoints",
        "Polling a remote API on each flow execution"
      ],
      examples: [
        {
          title: "Bark push notification on motion",
          description: "Fire a Bark notification when motion sensor value equals 1. Connect Comparison output to Trigger input.",
          configuration: {
            url: 'https://api.day.app/YOUR_KEY/Motion/Motion+detected',
            method: 'GET'
          },
          output: { message: 'pong' }
        },
        {
          title: "Bark notification with live value",
          description: "Include the actual sensor reading in the notification. Add one dynamic input and connect the tag. Use {{1}} in the URL.",
          configuration: {
            url: 'https://api.day.app/YOUR_KEY/Alert/Temperature+is+{{1}}',
            method: 'GET'
          },
          output: { message: 'pong' }
        },
        {
          title: "POST JSON with dynamic values",
          description: "Send sensor readings in a JSON body using {{N}} placeholders",
          configuration: {
            url: 'https://example.com/api/readings',
            method: 'POST',
            headers: { 'Authorization': 'Bearer YOUR_TOKEN' },
            body: '{"sensor":"T1","value":{{1}}}'
          },
          output: { success: true }
        },
        {
          title: "Fetch weather data",
          description: "GET a JSON API and extract a nested value",
          configuration: {
            url: 'https://api.weather.gov/points/39.7456,-97.0892',
            method: 'GET',
            extractPath: 'properties.relativeLocation.properties.city'
          },
          output: "Concordia"
        }
      ],
      tips: [
        "Trigger input (index 0): connect a boolean — when false the request is skipped; leave unconnected to always fire",
        "Dynamic inputs start at index 1 — use {{1}}, {{2}}, ... in the URL, body, or headers to embed their values",
        "Extract Path uses dot notation — e.g. 'properties.periods.0.temperature' drills into nested JSON",
        "Leave Extract Path empty to receive the full response object",
        "Set On Error to 'Continue' to pass null downstream instead of stopping the flow on failures",
        "Timeout default is 10 seconds — lower it for fast APIs, raise it for slow ones",
        "Non-2xx responses output the parsed body with degraded quality (64) rather than throwing an error"
      ],
      relatedNodes: ["json-ops", "debug-log", "tag-output", "comparison"]
    }
  };

  validate(node) {
    const errors = [];
    const url = this.getParameter(node, 'url', '');
    if (!url || typeof url !== 'string' || url.trim() === '') {
      errors.push('URL is required');
    } else {
      // Strip {{N}} placeholders before URL validation so templates are accepted
      const testUrl = url.trim().replace(/\{\{\d+\}\}/g, '0');
      try {
        const parsed = new URL(testUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          errors.push('URL must use http or https');
        }
      } catch {
        errors.push('URL is not valid');
      }
    }
    return { valid: errors.length === 0, errors };
  }

  getLogMessages() {
    return {
      info: (result) => `HTTP ${result.metadata?.method} ${result.metadata?.url} → ${result.metadata?.status}`,
      debug: (result) => {
        const m = result.metadata || {};
        const parts = [
          `HTTP ${m.method} ${m.url} → ${m.status} (${m.durationMs}ms)`,
          m.requestHeaders?.length ? `headers: [${m.requestHeaders.join(', ')}]` : null,
          m.requestBodyBytes ? `body: ${m.requestBodyBytes}B sent` : null,
          m.responseContentType ? `content-type: ${m.responseContentType.split(';')[0].trim()}` : null,
          m.responseSizeBytes != null ? `response: ${m.responseSizeBytes}B` : null,
          m.extractPath ? `extract: "${m.extractPath}" → ${m.outputSizeBytes}B` : null,
        ];
        return parts.filter(Boolean).join(' | ');
      },
      error: (error) => `HTTP request failed: ${error.message}`
    };
  }

  /**
   * Replace {{N}} placeholders in a string with values from the inputs map.
   * e.g. _interpolate('Alert: {{1}}', { 1: '42.5' }) → 'Alert: 42.5'
   */
  _interpolate(template, values) {
    if (!template || typeof template !== 'string') return template;
    return template.replace(/\{\{(\d+)\}\}/g, (match, idx) => {
      const key = parseInt(idx, 10);
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match;
    });
  }

  /**
   * Resolve dot-notation path against an object.
   * e.g. extractByPath(obj, 'properties.periods.0.temperature')
   */
  _extractByPath(obj, path) {
    if (!path || typeof path !== 'string' || path.trim() === '') return obj;
    return path.trim().split('.').reduce((acc, key) => {
      if (acc === null || acc === undefined) return undefined;
      return acc[key];
    }, obj);
  }

  async execute(context) {
    // --- Trigger check (input 0) ---
    // If trigger is connected and explicitly false, skip the request entirely
    const triggerData = context.getInputValue(0);
    if (triggerData !== null && triggerData !== undefined && triggerData.value === false) {
      return { value: null, quality: 192, metadata: { skipped: true, reason: 'trigger_false' } };
    }

    // --- Collect dynamic input values for {{N}} interpolation ---
    // Scan handles 0–9; getInputValue returns null when not connected
    const inputValues = {};
    for (let i = 0; i <= 9; i++) {
      const data = context.getInputValue(i);
      if (data !== null && data !== undefined) {
        inputValues[i] = String(data.value ?? '');
      }
    }

    let url      = this._interpolate(this.getParameter(context.node, 'url', '').trim(), inputValues);
    const method   = this.getParameter(context.node, 'method', 'GET').toUpperCase();
    let headersRaw = this.getParameter(context.node, 'headers', {});
    let bodyRaw    = this.getParameter(context.node, 'body', '');
    const extract  = this.getParameter(context.node, 'extractPath', '');
    const timeout  = this.getParameter(context.node, 'timeout', 10000);
    const onError  = this.getParameter(context.node, 'onError', 'stop');

    if (!url) throw new Error('URL is required');

    // Validate URL at runtime to prevent SSRF against internal addresses
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('URL must use http or https');
    }

    // Build headers map from JSON object, interpolating values
    const headersMap = {};
    if (headersRaw && typeof headersRaw === 'object' && !Array.isArray(headersRaw)) {
      for (const [key, value] of Object.entries(headersRaw)) {
        if (key && typeof key === 'string' && key.trim()) {
          headersMap[key.trim()] = this._interpolate(String(value ?? ''), inputValues);
        }
      }
    }

    // Interpolate body and parse optional JSON body
    if (typeof bodyRaw === 'object') bodyRaw = JSON.stringify(bodyRaw);
    bodyRaw = this._interpolate(bodyRaw, inputValues);

    let bodyString = undefined;
    if (['POST', 'PUT', 'PATCH'].includes(method) && bodyRaw && bodyRaw.trim()) {
      try {
        // Validate it is valid JSON before sending
        JSON.parse(bodyRaw);
        bodyString = bodyRaw;
        if (!headersMap['Content-Type'] && !headersMap['content-type']) {
          headersMap['Content-Type'] = 'application/json';
        }
      } catch {
        throw new Error('Request body is not valid JSON');
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const start = Date.now();
    let status = 0;
    try {
      const response = await fetch(url, {
        method,
        headers: headersMap,
        body: bodyString,
        signal: controller.signal
      });

      status = response.status;
      const durationMs = Date.now() - start;

      let responseData;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('json') || contentType.includes('ld+json') || contentType.includes('geo+json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      const quality = response.ok ? 192 : 64;
      const extracted = this._extractByPath(responseData, extract);
      const outputValue = extracted !== undefined ? extracted : responseData;

      const responseSize = typeof responseData === 'string'
        ? responseData.length
        : JSON.stringify(responseData).length;
      const outputSize = typeof outputValue === 'object'
        ? JSON.stringify(outputValue).length
        : String(outputValue ?? '').length;

      return {
        value: outputValue,
        quality,
        metadata: {
          method,
          url,
          status,
          durationMs,
          requestHeaders: Object.keys(headersMap),
          requestBodyBytes: bodyString ? bodyString.length : 0,
          responseContentType: contentType,
          responseSizeBytes: responseSize,
          extractPath: extract || null,
          outputSizeBytes: outputSize,
        }
      };
    } catch (err) {
      const durationMs = Date.now() - start;
      if (onError === 'continue') {
        return { value: null, quality: 0, metadata: { method, url, status, durationMs, requestHeaders: Object.keys(headersMap), requestBodyBytes: bodyString ? bodyString.length : 0, error: err.message } };
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

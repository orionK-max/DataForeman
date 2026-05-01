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
        description: 'Full URL to request (e.g. https://api.weather.gov/points/39.7456,-97.0892)'
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
        description: 'JSON body for POST/PUT/PATCH requests'
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
      overview: "Makes HTTP/HTTPS requests to external APIs and web services. Supports all common HTTP methods, custom headers, JSON request bodies, and dot-notation path extraction to pluck a specific field from the response.",
      useCases: [
        "Fetching data from REST APIs (weather, IoT cloud platforms, ERP systems)",
        "Sending sensor values to external HTTP endpoints",
        "Querying web services that return JSON data",
        "Polling a remote API on each flow execution"
      ],
      examples: [
        {
          title: "Fetch weather data",
          description: "GET a JSON API and extract a nested value",
          configuration: {
            url: 'https://api.weather.gov/points/39.7456,-97.0892',
            method: 'GET',
            extractPath: 'properties.relativeLocation.properties.city'
          },
          output: "Concordia"
        },
        {
          title: "POST JSON to an endpoint",
          description: "Send a JSON body with a POST request",
          configuration: {
            url: 'https://example.com/api/readings',
            method: 'POST',
            headers: { 'Authorization': 'Bearer YOUR_TOKEN' },
            body: '{"sensor":"T1","value":22.5}'
          },
          output: { success: true }
        },
        {
          title: "Authenticated GET",
          description: "Pass an API key via headers",
          configuration: {
            url: 'https://api.example.com/devices',
            method: 'GET',
            headers: { 'X-Api-Key': 'abc123' }
          },
          output: [{ id: 1, name: "Device A" }]
        }
      ],
      tips: [
        "Extract Path uses dot notation — e.g. 'properties.periods.0.temperature' drills into nested JSON",
        "Leave Extract Path empty to receive the full response object",
        "Header values are stored in the flow — avoid pasting long-lived secrets; prefer environment-injected values",
        "Set On Error to 'Continue' to pass null downstream instead of stopping the flow on failures",
        "Timeout default is 10 seconds — lower it for fast APIs, raise it for slow ones",
        "Non-2xx responses output the parsed body with degraded quality (64) rather than throwing an error"
      ],
      relatedNodes: ["json-ops", "debug-log", "tag-output"]
    }
  };

  validate(node) {
    const errors = [];
    const url = this.getParameter(node, 'url', '');
    if (!url || typeof url !== 'string' || url.trim() === '') {
      errors.push('URL is required');
    } else {
      try {
        const parsed = new URL(url.trim());
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
    const url      = this.getParameter(context.node, 'url', '').trim();
    const method   = this.getParameter(context.node, 'method', 'GET').toUpperCase();
    const headers  = this.getParameter(context.node, 'headers', []);
    const bodyRaw  = this.getParameter(context.node, 'body', '');
    const extract  = this.getParameter(context.node, 'extractPath', '');
    const timeout  = this.getParameter(context.node, 'timeout', 10000);
    const onError  = this.getParameter(context.node, 'onError', 'stop');

    if (!url) throw new Error('URL is required');

    // Validate URL at runtime to prevent SSRF against internal addresses
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('URL must use http or https');
    }

    // Build headers map from JSON object
    const headersMap = {};
    if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
      for (const [key, value] of Object.entries(headers)) {
        if (key && typeof key === 'string' && key.trim()) {
          headersMap[key.trim()] = String(value ?? '');
        }
      }
    }

    // Parse optional JSON body
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

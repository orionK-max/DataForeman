import { BaseNode } from '../base/BaseNode.js';

/**
 * Save File Node
 * Writes the incoming value to disk (restricted to FLOW_ALLOWED_PATHS).
 */
export class SaveFileNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'Save File',
    name: 'save-file',
    version: 1,
     description: 'Prepare a file download from input data',
    category: 'FILE_OPERATIONS',
    section: 'BASIC',
    icon: '💾',
    color: '#607D8B',

    inputs: [
      {
        name: 'input',
        type: 'main',
        displayName: 'Data',
        description: 'Data to write to the file'
      },
      {
        name: 'filename',
        type: 'string',
        displayName: 'File Name',
        description: 'Optional dynamic filename (overrides configured filename)'
      }
    ],
    outputs: [],

    visual: {
      canvas: {
        minWidth: 170,
        shape: 'rounded-rect',
        borderRadius: 8,
        resizable: false
      },
      layout: [
        {
          type: 'header',
          icon: '💾',
          title: 'Save File',
          color: '#607D8B',
          badges: ['executionOrder']
        },
        {
          type: 'subtitle',
          text: '{{filename}}',
          visible: '{{filename}}'
        },
        {
          type: 'values',
          items: [
            { label: 'Format', value: '{{format}}' }
          ],
          visible: '{{format}}'
        },
        {
          type: 'values',
          items: [
            { label: 'MIME', value: '{{mimeType}}' }
          ],
          visible: '{{mimeType}}'
        }
      ],
      handles: {
        inputs: [
          { index: 0, position: 'auto', color: 'auto', label: 'Data', visible: true },
          { index: 1, position: 'auto', color: 'auto', label: 'Filename', visible: true }
        ],
        outputs: [],
        size: 12,
        borderWidth: 2,
        borderColor: '#ffffff'
      },
      status: {
        execution: {
          enabled: true,
          position: 'top-left',
          offset: { x: -10, y: -10 }
        },
        pinned: {
          enabled: true,
          position: 'top-right',
          offset: { x: -8, y: -8 }
        },
        executionOrder: {
          enabled: true,
          position: 'header'
        }
      },
      runtime: {
        enabled: false
      }
    },

    properties: [
      {
        name: 'filename',
        displayName: 'File Name',
        type: 'string',
        default: 'output.txt',
        required: false,
        description: 'Default filename (can be overridden by filename input)'
      },
      {
        name: 'format',
        displayName: 'Format',
        type: 'select',
        default: 'text',
        required: true,
        options: [
          { label: 'Text (UTF-8)', value: 'text' },
          { label: 'JSON (pretty)', value: 'json' },
          { label: 'Base64 (decode)', value: 'base64' }
        ],
        description: 'How to encode the downloaded file'
      },
      {
        name: 'mimeType',
        displayName: 'MIME Type',
        type: 'string',
        default: '',
        required: false,
        description: 'Optional MIME type (e.g. text/plain, application/json)'
      }
    ],

    configUI: {
      sections: [
        {
          type: 'property-group',
          title: 'Output Configuration',
          items: [
            {
              type: 'text',
              property: 'filename',
              label: 'File Name',
              default: 'output.txt',
              required: false,
              helperText: 'Default filename (can be overridden by input connection)'
            }
          ]
        },
        {
          type: 'property-group',
          title: 'Encoding',
          items: [
            {
              type: 'select',
              property: 'format',
              label: 'Format',
              default: 'text',
              options: [
                { value: 'text', label: 'Text (UTF-8)' },
                { value: 'json', label: 'JSON (pretty)' },
                { value: 'base64', label: 'Base64 (decode)' }
              ],
              helperText: 'How to encode the downloaded file'
            },
            {
              type: 'text',
              property: 'mimeType',
              label: 'MIME Type',
              default: '',
              helperText: 'Optional (e.g., text/plain, application/json)'
            }
          ]
        }
      ]
    }
  };

  getLogMessages() {
    return {
      info: (result) => {
        const filename = result.value?.__download?.filename || 'unknown';
        const mimeType = result.value?.__download?.mimeType || 'unknown';
        return `Prepared download: ${filename} (${result.bytes} bytes, ${mimeType})`;
      },
      debug: (result) => {
        const download = result.value?.__download;
        if (!download) {
          return `Prepared download (${result.bytes} bytes) - no download data`;
        }
        const filename = download.filename || 'unknown';
        const mimeType = download.mimeType || 'unknown';
        const dataBase64 = download.dataBase64 || '';
        // Decode first 500 chars for preview
        let preview = '';
        if (dataBase64) {
          try {
            const decoded = Buffer.from(dataBase64.substring(0, 1000), 'base64').toString('utf8');
            preview = decoded.substring(0, 500) + (dataBase64.length > 1000 ? '...' : '');
          } catch (e) {
            preview = '[Binary content]';
          }
        }
        return `Prepared download: ${filename} (${result.bytes} bytes, ${mimeType})\nContent preview: ${preview}`;
      },
      error: (error) => `Save file failed: ${error.message}`
    };
  }

  async execute(context) {
    // Get filename from input (if connected) or parameter (fallback)
    const filenameInput = context.getInputValue(1);
    const filenameParam = this.getParameter(context.node, 'filename', 'output.txt');
    const filename = (filenameInput?.value || filenameInput) || filenameParam;
    
    const format = this.getParameter(context.node, 'format', 'text');
    const mimeTypeParam = this.getParameter(context.node, 'mimeType', '');

    // Extract input value from data input
    const inputData = context.getInputValue(0);
    const value = (inputData && typeof inputData === 'object' && 'value' in inputData) ? inputData.value : inputData;

    // Prepare payload
    let buffer;
    let mimeType;

    if (format === 'base64') {
      if (typeof value !== 'string') {
        throw new Error('Base64 format requires a string input');
      }
      buffer = Buffer.from(value, 'base64');
      mimeType = mimeTypeParam || 'application/octet-stream';
    } else if (format === 'json') {
      const jsonString = JSON.stringify(value, null, 2);
      buffer = Buffer.from(jsonString, 'utf8');
      mimeType = mimeTypeParam || 'application/json';
    } else {
      // text
      let text;
      if (typeof value === 'string') {
        text = value;
      } else if (value === null || value === undefined) {
        text = '';
      } else if (typeof value === 'object') {
        text = JSON.stringify(value);
      } else {
        text = String(value);
      }
      buffer = Buffer.from(text, 'utf8');
      mimeType = mimeTypeParam || 'text/plain';
    }

    const bytes = buffer.length;

    // No outputs; the UI can detect this payload and trigger a browser download.
    return {
      value: {
        __download: {
          filename,
          mimeType,
          dataBase64: buffer.toString('base64')
        }
      },
      quality: 192,
      bytes,
      timestamp: new Date().toISOString()
    };
  }
}

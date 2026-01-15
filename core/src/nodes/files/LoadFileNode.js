import { BaseNode } from '../base/BaseNode.js';

/**
 * Load File Node
 * Reads a file from disk (restricted to FLOW_ALLOWED_PATHS) and outputs its contents.
 */
export class LoadFileNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'Load File',
    name: 'load-file',
    version: 1,
     description: 'Upload a file into the flow and output its contents',
    category: 'FILE_OPERATIONS',
    section: 'BASIC',
    icon: '📄',
    color: '#607D8B',

    inputs: [],
    outputs: [
      {
        name: 'output',
        type: 'main',
        displayName: 'Contents',
        description: 'File contents (string)'
      }
    ],

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
          icon: '📄',
          title: 'Load File',
          color: '#607D8B',
          badges: ['executionOrder']
        },
        {
          type: 'subtitle',
          text: '{{file.name}}',
          visible: '{{file.name}}'
        },
        {
          type: 'values',
          items: [
            { label: 'Size', value: '{{file.size}} bytes' }
          ],
          visible: '{{file.name}}'
        },
        {
          type: 'values',
          items: [
            { label: 'Uploaded', value: '{{file.lastModified}}', format: 'relativeTime' }
          ],
          visible: '{{file.name}}'
        }
      ],
      handles: {
        inputs: [],
        outputs: [{ index: 0, position: 'auto', color: 'auto', label: null, visible: true }],
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
        name: 'file',
        displayName: 'File',
        type: 'fileUpload',
        default: null,
        required: true,
        description: 'Select a file to upload and store with this flow'
      },
      {
        name: 'output',
        displayName: 'Output',
        type: 'select',
        default: 'utf8',
        required: true,
        options: [
          { label: 'Text (UTF-8)', value: 'utf8' },
          { label: 'Base64 (string)', value: 'base64' },
          { label: 'JSON (parse)', value: 'json' }
        ],
        description: 'How to interpret the uploaded file'
      }
    ],

    configUI: {
      sections: [
        {
          type: 'property-group',
          title: 'File Upload',
          items: [
            {
              type: 'file-upload',
              property: 'file',
              label: 'File',
              required: true,
              helperText: 'Upload a file to read during flow execution',
              showMetadata: true,
              metadata: [
                { key: 'size', label: 'Size', format: 'bytes' },
                { key: 'mimeType', label: 'Type' },
                { key: 'lastModified', label: 'Uploaded', format: 'date' }
              ]
            }
          ]
        },
        {
          type: 'property-group',
          title: 'Output Format',
          items: [
            {
              type: 'select',
              property: 'output',
              label: 'Format',
              default: 'utf8',
              options: [
                { value: 'utf8', label: 'Text (UTF-8)' },
                { value: 'base64', label: 'Base64 (string)' },
                { value: 'json', label: 'JSON (parse)' }
              ],
              helperText: 'How to interpret the uploaded file contents'
            }
          ]
        }
      ]
    }
  };

  getLogMessages() {
    return {
      info: (result) => {
        const filename = result.filename || 'unknown';
        const mimeType = result.mimeType || 'unknown';
        return `Loaded file: ${filename} (${result.bytes} bytes, ${mimeType})`;
      },
      debug: (result) => {
        const filename = result.filename || 'unknown';
        const mimeType = result.mimeType || 'unknown';
        const preview = typeof result.value === 'string' 
          ? result.value.substring(0, 500) + (result.value.length > 500 ? '...' : '')
          : JSON.stringify(result.value).substring(0, 500);
        return `Loaded file: ${filename} (${result.bytes} bytes, ${mimeType})\nContent preview: ${preview}`;
      },
      error: (error) => `Load file failed: ${error.message}`
    };
  }

  async execute(context) {
    const file = this.getParameter(context.node, 'file', null);
    const output = this.getParameter(context.node, 'output', 'utf8');

    if (!file || typeof file !== 'object') {
      throw new Error('No file selected');
    }

    const dataBase64 = file.dataBase64;
    if (!dataBase64 || typeof dataBase64 !== 'string') {
      throw new Error('Uploaded file data is missing');
    }

    const buffer = Buffer.from(dataBase64, 'base64');

    if (output === 'base64') {
      return {
        value: buffer.toString('base64'),
        quality: 192,
        bytes: buffer.length,
        filename: file.name || undefined,
        mimeType: file.mimeType || undefined,
        timestamp: new Date().toISOString()
      };
    }

    const text = buffer.toString('utf8');

    if (output === 'json') {
      try {
        const parsed = JSON.parse(text);
        return {
          value: parsed,
          quality: 192,
          bytes: buffer.length,
          filename: file.name || undefined,
          mimeType: file.mimeType || undefined,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        throw new Error(`Invalid JSON: ${error.message}`);
      }
    }

    return {
      value: text,
      quality: 192,
      bytes: buffer.length,
      filename: file.name || undefined,
      mimeType: file.mimeType || undefined,
      timestamp: new Date().toISOString()
    };
  }
}

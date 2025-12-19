import { BaseNode } from '../base/BaseNode.js';

/**
 * Range Check Node - checks if value is within specified range
 * Common for validation and limit checking in industrial applications
 */
export class RangeCheckNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'Range Check',
    name: 'range-check',
    version: 1,
    description: 'Check if value is within min/max range (returns boolean)',
    category: 'LOGIC_MATH',
    section: 'COMPARISON',
    icon: '📏',
    color: '#4CAF50',
    inputs: [
      { type: 'number', displayName: 'Value', required: true }
    ],
    outputs: [
      { type: 'boolean', displayName: 'In Range' },
      { type: 'number', displayName: 'Value' }
    ],
    visual: {
      canvas: {
        minWidth: 160,
        shape: 'rounded-rect',
        borderRadius: 8,
        resizable: false
      },
      layout: [
        {
          type: 'header',
          icon: '📏',
          title: 'Range Check',
          color: '#4CAF50',
          badges: ['executionOrder']
        },
        {
          type: 'subtitle',
          text: '[{{min}} ... {{max}}]',
          visible: '{{min}}'
        }
      ],
      handles: {
        inputs: [
          { index: 0, position: 'auto', color: 'auto', label: null, visible: true }
        ],
        outputs: [
          { index: 0, position: 'auto', color: 'auto', label: null, visible: true },
          { index: 1, position: 'auto', color: 'auto', label: null, visible: true }
        ],
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
        displayName: 'Minimum',
        name: 'min',
        type: 'number',
        default: 0,
        required: true,
        userExposable: true,
        description: 'Minimum value (inclusive)'
      },
      {
        displayName: 'Maximum',
        name: 'max',
        type: 'number',
        default: 100,
        required: true,
        userExposable: true,
        description: 'Maximum value (inclusive)'
      },
      {
        displayName: 'Range Mode',
        name: 'rangeMode',
        type: 'select',
        options: [
          {
            label: 'Inclusive [min, max]',
            value: 'inclusive'
          },
          {
            label: 'Exclusive (min, max)',
            value: 'exclusive'
          },
          {
            label: 'Min Inclusive [min, max)',
            value: 'minInclusive'
          },
          {
            label: 'Max Inclusive (min, max]',
            value: 'maxInclusive'
          }
        ],
        default: 'inclusive',
        required: true,
        description: 'How to handle boundary values'
      },
      {
        displayName: 'Output Mode',
        name: 'outputMode',
        type: 'select',
        options: [
          {
            label: 'Boolean Only',
            value: 'boolean'
          },
          {
            label: 'Boolean + Value',
            value: 'both'
          }
        ],
        default: 'both',
        required: true,
        description: 'What to output'
      }
    ],

    // Config UI structure
    configUI: {
      sections: [
        {
          type: 'property-group',
          title: 'Configuration'
        }
      ]
    }
  };

  async execute(context) {
    const { log } = context;
    const min = this.getParameter(context.node, 'min', 0);
    const max = this.getParameter(context.node, 'max', 100);
    const rangeMode = this.getParameter(context.node, 'rangeMode', 'inclusive');
    const outputMode = this.getParameter(context.node, 'outputMode', 'both');
    
    // Get input value
    const inputData = context.getInputValue(0);
    const inputValue = inputData?.value ?? inputData;

    // Handle null/undefined/non-numeric
    if (inputValue === null || inputValue === undefined) {
      if (outputMode === 'both') {
        return [
          { value: false, quality: 192 },
          { value: null, quality: 192 }
        ];
      }
      return { value: false, quality: 192 };
    }

    const numValue = Number(inputValue);
    if (isNaN(numValue)) {
      if (outputMode === 'both') {
        return [
          { value: false, quality: 192 },
          { value: inputValue, quality: 192 }
        ];
      }
      return { value: false, quality: 192 };
    }

    // Ensure min <= max
    const actualMin = Math.min(min, max);
    const actualMax = Math.max(min, max);

    // Check range based on mode
    let inRange = false;
    
    switch (rangeMode) {
      case 'inclusive':
        inRange = numValue >= actualMin && numValue <= actualMax;
        break;
      case 'exclusive':
        inRange = numValue > actualMin && numValue < actualMax;
        break;
      case 'minInclusive':
        inRange = numValue >= actualMin && numValue < actualMax;
        break;
      case 'maxInclusive':
        inRange = numValue > actualMin && numValue <= actualMax;
        break;
      default:
        inRange = numValue >= actualMin && numValue <= actualMax;
    }

    // Return based on output mode
    if (outputMode === 'both') {
      const timestamp = new Date().toISOString();
      return [
        { value: inRange, quality: 0, timestamp },
        { value: numValue, quality: 0, timestamp }
      ];
    }
    
    return { 
      value: inRange, 
      quality: 0,
      min,
      max,
      rangeMode,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Declarative log messages
   */
  getLogMessages() {
    return {
      info: (result) => {
        const r = Array.isArray(result) ? result[0] : result;
        return `Range check: ${r.value ? 'IN' : 'OUT OF'} range [${r.min}, ${r.max}] (${r.rangeMode})`;
      },
      debug: (result) => {
        const r = Array.isArray(result) ? result[0] : result;
        return `Range: ${r.rangeMode}, min: ${r.min}, max: ${r.max}, result: ${r.value}`;
      },
      error: (error) => `Range check failed: ${error.message}`
    };
  }

  static get help() {
    return {
      overview: "Checks if a numeric value falls within a specified min/max range. Returns boolean result on first output and passes through the original value on second output. Supports inclusive, exclusive, and mixed boundary modes.",
      useCases: [
        "Validate sensor readings are within normal operating range before processing",
        "Implement alarm conditions when values exceed safe limits",
        "Filter production data by checking batch sizes against specifications",
        "Quality control - verify measurements meet tolerance requirements"
      ],
      examples: [
        {
          title: "Temperature Range (inclusive)",
          config: { min: 20, max: 30, rangeMode: "inclusive" },
          input: { value: 25 },
          output: { inRange: true, value: 25 }
        },
        {
          title: "Boundary Test (exclusive)",
          config: { min: 0, max: 100, rangeMode: "exclusive" },
          input: { value: 100 },
          output: { inRange: false, value: 100 }
        },
        {
          title: "Pressure Limit",
          config: { min: 0, max: 150, rangeMode: "inclusive" },
          input: { value: 175 },
          output: { inRange: false, value: 175 }
        }
      ],
      tips: [
        "Inclusive mode [min, max]: value must be >= min AND <= max",
        "Exclusive mode (min, max): value must be > min AND < max",
        "Use first output (boolean) for conditional logic with Gate or BooleanLogic nodes",
        "Use second output (number) to pass value through for further processing",
        "Mixed modes available: [min, max) includes min, (min, max] includes max"
      ],
      relatedNodes: ["ComparisonNode", "ClampNode", "GateNode"]
    };
  }
}

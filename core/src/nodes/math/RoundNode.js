import { BaseNode } from '../base/BaseNode.js';

/**
 * Round/Truncate Node
 * Performs rounding operations on numeric values with configurable precision and rounding modes.
 * 
 * Rounding modes:
 * - round: Standard rounding (Math.round) - rounds to nearest integer or decimal place
 * - floor: Round down (Math.floor) - always rounds toward negative infinity
 * - ceil: Round up (Math.ceil) - always rounds toward positive infinity
 * - trunc: Truncate (Math.trunc) - removes decimal part, rounds toward zero
 * 
 * Precision examples:
 * - precision=0: Round to integer (12.567 → 13)
 * - precision=1: Round to 1 decimal (12.567 → 12.6)
 * - precision=2: Round to 2 decimals (12.567 → 12.57)
 * - precision=-1: Round to tens (123 → 120)
 * - precision=-2: Round to hundreds (567 → 600)
 */
export class RoundNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'Round',
    name: 'round',
    version: 1,
    category: 'LOGIC_MATH',
    section: 'MATH',
    description: 'Round, floor, ceil, or truncate numeric values with configurable precision',
    icon: '🔘',
    color: '#00897B',
    inputs: [
      {
        name: 'value',
        type: 'number',
        displayName: 'Value',
        description: 'The value to round'
      }
    ],
    outputs: [
      {
        name: 'rounded',
        type: 'number',
        displayName: 'Rounded',
        description: 'The rounded result'
      }
    ],
    properties: [
      {
        name: 'mode',
        type: 'select',
        displayName: 'Rounding Mode',
        description: 'How to round the value',
        default: 'round',
        required: false,
        options: [
          { label: 'Round (nearest)', value: 'round' },
          { label: 'Floor (down)', value: 'floor' },
          { label: 'Ceil (up)', value: 'ceil' },
          { label: 'Truncate (toward zero)', value: 'trunc' }
        ]
      },
      {
        name: 'precision',
        type: 'number',
        displayName: 'Precision',
        description: 'Decimal places (0=integer, 1=tenths, -1=tens, etc)',
        default: 0,
        required: false
      }
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
          icon: '🔘',
          title: 'Round',
          color: '#00897B',
          badges: ['executionOrder']
        },
        {
          type: 'subtitle',
          text: '{{mode}} ({{precision}})'
        }
      ],
      handles: {
        inputs: [
          { index: 0, position: 'auto', color: 'auto', label: null, visible: true }
        ],
        outputs: [
          { index: 0, position: 'auto', color: 'auto', label: null, visible: true }
        ],
        size: 12,
        borderWidth: 2,
        borderColor: '#ffffff'
      }
    },
    
    configUI: {
      sections: [
        {
          type: 'property-group',
          title: 'Configuration'
        }
      ]
    },
    
    help: {
      overview: "Rounds numeric values using different rounding modes (round, floor, ceil, truncate) with configurable precision. Useful for formatting numbers, removing decimal places, or aligning values to specific increments.",
      useCases: [
        "Formatting display values to specific decimal places",
        "Converting precise measurements to whole numbers",
        "Implementing price rounding (e.g., round to nearest $0.05)",
        "Reducing data precision for storage or transmission"
      ],
      examples: [
        {
          title: "Standard Rounding",
          description: "Round to 2 decimal places",
          configuration: { mode: 'round', precision: 2 },
          input: 3.14159,
          output: 3.14
        },
        {
          title: "Floor to Integer",
          description: "Round down to whole number",
          configuration: { mode: 'floor', precision: 0 },
          input: 7.8,
          output: 7
        },
        {
          title: "Ceiling",
          description: "Round up to nearest tenth",
          configuration: { mode: 'ceil', precision: 1 },
          input: 12.34,
          output: 12.4
        }
      ],
      tips: [
        "Precision 0 produces integers",
        "Negative precision rounds to left of decimal (e.g., -1 rounds to nearest 10)",
        "Truncate mode always rounds toward zero",
        "Use floor/ceil for directional rounding"
      ],
      relatedNodes: ["clamp", "math"]
    }
  };

  get description() {
    return RoundNode.description;
  }

  /**
   * Round value using specified mode and precision
   */
  async execute(context) {
    const { node } = context;
    const mode = this.getParameter(node, 'mode', 'round');
    const precision = Number(this.getParameter(node, 'precision', 0));
    
    // Get input
    const inputData = context.getInputValue(0);
    if (!inputData) {
      return { value: null, quality: 1 }; // Bad quality - no input
    }
    
    const inputValue = inputData.value;
    const inputQuality = inputData.quality ?? 0;
    
    // Validate input is a number
    if (typeof inputValue !== 'number' || isNaN(inputValue)) {
      return {
        value: null,
        quality: 1,
        error: `Invalid input: expected number, got ${typeof inputValue}`
      };
    }

    try {
      // Calculate rounding factor
      const factor = Math.pow(10, precision);

      let result;
      switch (mode) {
        case 'floor':
          result = Math.floor(inputValue * factor) / factor;
          break;
        case 'ceil':
          result = Math.ceil(inputValue * factor) / factor;
          break;
        case 'trunc':
          result = Math.trunc(inputValue * factor) / factor;
          break;
        case 'round':
        default:
          result = Math.round(inputValue * factor) / factor;
          break;
      }

      return {
        value: result,
        quality: inputQuality, // inherit quality from input
        originalValue: inputValue, // preserve original for debugging
        mode,
        precision
      };

    } catch (error) {
      return {
        value: null,
        quality: 1,
        error: error.message
      };
    }
  }
}

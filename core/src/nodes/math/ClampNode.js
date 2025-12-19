/**
 * Clamp Node
 * 
 * Limits input value to specified min/max range.
 * Common for setpoint limiting, safety bounds, and range enforcement.
 * 
 * @category LOGIC_MATH
 * @section MATH
 */

import { BaseNode } from '../base/BaseNode.js';

export class ClampNode extends BaseNode {
  description = {
    schemaVersion: 1,
    name: 'clamp',
    displayName: 'Clamp',
    version: 1,
    category: 'LOGIC_MATH',
    section: 'MATH',
    description: 'Limits value to min/max range',
    icon: '📐',
    color: '#9C27B0',
    
    inputs: [
      {
        name: 'value',
        type: 'number',
        displayName: 'Value',
        required: true
      }
    ],
    
    outputs: [
      {
        name: 'output',
        type: 'number',
        displayName: 'Clamped'
      }
    ],
    
    properties: [
      {
        name: 'min',
        displayName: 'Minimum',
        type: 'number',
        default: 0,
        required: true,
        description: 'Minimum allowed value'
      },
      {
        name: 'max',
        displayName: 'Maximum',
        type: 'number',
        default: 100,
        required: true,
        description: 'Maximum allowed value'
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
          icon: '📐',
          title: 'Clamp',
          color: '#9C27B0',
          badges: ['executionOrder']
        },
        {
          type: 'subtitle',
          text: '{{min}} ≤ x ≤ {{max}}'
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
      overview: "Limits numeric values to a specified range by constraining them between minimum and maximum boundaries. Values below the minimum are set to the minimum, and values above the maximum are set to the maximum.",
      useCases: [
        "Preventing sensor readings from exceeding safe operating ranges",
        "Ensuring user inputs stay within valid bounds",
        "Normalizing values to a specific scale (e.g., 0-100)",
        "Protecting equipment by limiting control signals"
      ],
      examples: [
        {
          title: "Temperature Safety",
          description: "Limit temperature setpoint to safe range",
          configuration: { min: 10, max: 30 },
          input: 45,
          output: 30
        },
        {
          title: "Negative Value",
          description: "Constrain below-minimum value",
          configuration: { min: 0, max: 100 },
          input: -15,
          output: 0
        }
      ],
      tips: [
        "Use negative min/max values for bipolar ranges (e.g., -100 to 100)",
        "Clamp is applied after all calculations in a flow",
        "Good quality (0) is preserved when clamping"
      ],
      relatedNodes: ["round", "math"]
    }
  };

  get description() {
    return ClampNode.description;
  }

  /**
   * Clamp value to min/max range
   */
  async execute(context) {
    const { node } = context;
    const min = this.getParameter(node, 'min', 0);
    const max = this.getParameter(node, 'max', 100);
    
    // Get input
    const inputData = context.getInputValue(0);
    if (!inputData) {
      return { value: null, quality: 1 }; // Bad quality - no input
    }
    
    const inputValue = inputData.value;
    const inputQuality = inputData.quality ?? 0;
    
    // Validate min <= max
    if (min > max) {
      return {
        value: null,
        quality: 1,
        error: `Invalid range: min (${min}) must be <= max (${max})`
      };
    }
    
    // Handle non-numeric input
    if (typeof inputValue !== 'number' || isNaN(inputValue)) {
      return {
        value: null,
        quality: 1,
        error: 'Input must be a number'
      };
    }
    
    // Clamp the value
    let clampedValue = inputValue;
    if (inputValue < min) {
      clampedValue = min;
    } else if (inputValue > max) {
      clampedValue = max;
    }
    
    return {
      value: clampedValue,
      quality: inputQuality, // Inherit input quality
      clamped: clampedValue !== inputValue, // Indicate if clamping occurred
      originalValue: inputValue
    };
  }
}

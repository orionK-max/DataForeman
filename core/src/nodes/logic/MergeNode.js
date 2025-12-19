import { BaseNode } from '../base/BaseNode.js';

/**
 * Merge Node
 * Combines multiple inputs into a single output using configurable merge strategies.
 * 
 * Merge strategies:
 * - first-valid: Returns first non-null input with good quality (quality=0)
 * - first-non-null: Returns first non-null input regardless of quality
 * - highest-quality: Returns input with best quality (lowest quality code)
 * - latest: Returns most recent input (highest timestamp)
 * - min: Returns input with minimum numeric value
 * - max: Returns input with maximum numeric value
 * - average: Returns average of all numeric inputs
 * - sum: Returns sum of all numeric inputs
 */
export class MergeNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'Merge',
    name: 'merge',
    version: 1,
    category: 'LOGIC_MATH',
    section: 'LOGIC',
    description: 'Combine multiple inputs using various merge strategies',
    icon: '🔀',
    color: '#7B1FA2',
    inputs: [
      {
        name: 'input1',
        type: 'main',
        displayName: 'Input 1',
        description: 'First input'
      },
      {
        name: 'input2',
        type: 'main',
        displayName: 'Input 2',
        description: 'Second input'
      },
      {
        name: 'input3',
        type: 'main',
        displayName: 'Input 3',
        description: 'Third input (optional)',
        required: false
      },
      {
        name: 'input4',
        type: 'main',
        displayName: 'Input 4',
        description: 'Fourth input (optional)',
        required: false
      }
    ],
    outputs: [
      {
        name: 'merged',
        type: 'main',
        displayName: 'Merged',
        description: 'The merged result'
      }
    ],
    properties: [
      {
        name: 'strategy',
        type: 'select',
        displayName: 'Merge Strategy',
        description: 'How to combine the inputs',
        default: 'first-valid',
        required: false,
        options: [
          { label: 'First Valid (non-null, good quality)', value: 'first-valid' },
          { label: 'First Non-Null (any quality)', value: 'first-non-null' },
          { label: 'Highest Quality', value: 'highest-quality' },
          { label: 'Latest (by timestamp)', value: 'latest' },
          { label: 'Minimum', value: 'min' },
          { label: 'Maximum', value: 'max' },
          { label: 'Average', value: 'average' },
          { label: 'Sum', value: 'sum' }
        ]
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
          icon: '🔀',
          title: 'Merge',
          color: '#7B1FA2',
          badges: ['executionOrder']
        },
        {
          type: 'subtitle',
          text: '{{strategy}}'
        }
      ],
      handles: {
        inputs: [],  // Dynamic - populated by backend based on inputCount
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
      overview: "Combines multiple input values into a single output using various merge strategies. Essential for selecting from multiple data sources, implementing fallback logic, or aggregating sensor readings.",
      useCases: [
        "Implementing sensor redundancy with automatic failover",
        "Selecting best quality reading from multiple sources",
        "Creating fallback chains (primary → backup → default)",
        "Aggregating values (min, max, average, sum)"
      ],
      examples: [
        {
          title: "Sensor Redundancy",
          description: "Use backup sensor when primary fails",
          configuration: { strategy: 'first-valid' },
          input: [null, 25.3, 24.8],
          output: 25.3
        },
        {
          title: "Quality Selection",
          description: "Pick reading with best quality",
          configuration: { strategy: 'highest-quality' },
          input: [{value: 100, quality: 0.5}, {value: 98, quality: 0}],
          output: 98
        },
        {
          title: "Temperature Average",
          description: "Average multiple sensor readings",
          configuration: { strategy: 'average' },
          input: [22.1, 22.5, 22.3],
          output: 22.3
        }
      ],
      tips: [
        "first-valid: Returns first non-null value (fast failover)",
        "first-non-null: Stricter - requires value !== null && value !== undefined",
        "highest-quality: Best for redundant sensors with quality metrics",
        "latest: Use timestamp metadata to pick most recent",
        "Math strategies (min/max/average/sum) ignore null values"
      ],
      relatedNodes: ["gate", "switch", "boolean-logic"]
    }
  };

  get description() {
    return MergeNode.description;
  }

  /**
   * Merge inputs using specified strategy
   */
  async execute(context) {
    const { node } = context;
    const strategy = this.getParameter(node, 'strategy', 'first-valid');
    
    // Collect all available inputs
    const inputs = [];
    const inputCount = context.getInputCount();
    
    for (let i = 0; i < inputCount; i++) {
      const inputData = context.getInputValue(i);
      if (inputData !== null && inputData !== undefined) {
        inputs.push({
          index: i,
          value: inputData.value,
          quality: inputData.quality ?? 0,
          timestamp: inputData.timestamp ?? Date.now()
        });
      }
    }

    // No inputs available
    if (inputs.length === 0) {
      return { value: null, quality: 1 }; // Bad quality - no inputs
    }

    try {
      let result;

      switch (strategy) {
        case 'first-valid':
          result = this._firstValid(inputs);
          break;
        case 'first-non-null':
          result = this._firstNonNull(inputs);
          break;
        case 'highest-quality':
          result = this._highestQuality(inputs);
          break;
        case 'latest':
          result = this._latest(inputs);
          break;
        case 'min':
          result = this._min(inputs);
          break;
        case 'max':
          result = this._max(inputs);
          break;
        case 'average':
          result = this._average(inputs);
          break;
        case 'sum':
          result = this._sum(inputs);
          break;
        default:
          result = this._firstValid(inputs);
      }

      return {
        value: result.value,
        quality: result.quality,
        strategy,
        sourceIndex: result.sourceIndex,
        inputCount: inputs.length
      };

    } catch (error) {
      return {
        value: null,
        quality: 1,
        error: error.message
      };
    }
  }

  /**
   * Returns first input with quality=0 (good) and non-null value
   */
  _firstValid(inputs) {
    for (const input of inputs) {
      if (input.value !== null && input.value !== undefined && input.quality === 0) {
        return {
          value: input.value,
          quality: input.quality,
          sourceIndex: input.index
        };
      }
    }
    // No valid input, return first non-null
    return this._firstNonNull(inputs);
  }

  /**
   * Returns first non-null input
   */
  _firstNonNull(inputs) {
    for (const input of inputs) {
      if (input.value !== null && input.value !== undefined) {
        return {
          value: input.value,
          quality: input.quality,
          sourceIndex: input.index
        };
      }
    }
    return { value: null, quality: 1, sourceIndex: -1 };
  }

  /**
   * Returns input with best quality (lowest quality code)
   */
  _highestQuality(inputs) {
    let best = inputs[0];
    for (const input of inputs) {
      if (input.quality < best.quality) {
        best = input;
      }
    }
    return {
      value: best.value,
      quality: best.quality,
      sourceIndex: best.index
    };
  }

  /**
   * Returns most recent input (highest timestamp)
   */
  _latest(inputs) {
    let latest = inputs[0];
    for (const input of inputs) {
      if (input.timestamp > latest.timestamp) {
        latest = input;
      }
    }
    return {
      value: latest.value,
      quality: latest.quality,
      sourceIndex: latest.index
    };
  }

  /**
   * Returns input with minimum numeric value
   */
  _min(inputs) {
    const numericInputs = inputs.filter(
      input => typeof input.value === 'number' && !isNaN(input.value)
    );
    
    if (numericInputs.length === 0) {
      return { value: null, quality: 1, sourceIndex: -1 };
    }

    let min = numericInputs[0];
    for (const input of numericInputs) {
      if (input.value < min.value) {
        min = input;
      }
    }
    return {
      value: min.value,
      quality: min.quality,
      sourceIndex: min.index
    };
  }

  /**
   * Returns input with maximum numeric value
   */
  _max(inputs) {
    const numericInputs = inputs.filter(
      input => typeof input.value === 'number' && !isNaN(input.value)
    );
    
    if (numericInputs.length === 0) {
      return { value: null, quality: 1, sourceIndex: -1 };
    }

    let max = numericInputs[0];
    for (const input of numericInputs) {
      if (input.value > max.value) {
        max = input;
      }
    }
    return {
      value: max.value,
      quality: max.quality,
      sourceIndex: max.index
    };
  }

  /**
   * Returns average of all numeric inputs
   */
  _average(inputs) {
    const numericInputs = inputs.filter(
      input => typeof input.value === 'number' && !isNaN(input.value)
    );
    
    if (numericInputs.length === 0) {
      return { value: null, quality: 1, sourceIndex: -1 };
    }

    const sum = numericInputs.reduce((acc, input) => acc + input.value, 0);
    const avg = sum / numericInputs.length;
    
    // Quality is worst of all inputs
    const worstQuality = Math.max(...numericInputs.map(i => i.quality));
    
    return {
      value: avg,
      quality: worstQuality,
      sourceIndex: -1 // Calculated from multiple sources
    };
  }

  /**
   * Returns sum of all numeric inputs
   */
  _sum(inputs) {
    const numericInputs = inputs.filter(
      input => typeof input.value === 'number' && !isNaN(input.value)
    );
    
    if (numericInputs.length === 0) {
      return { value: null, quality: 1, sourceIndex: -1 };
    }

    const sum = numericInputs.reduce((acc, input) => acc + input.value, 0);
    
    // Quality is worst of all inputs
    const worstQuality = Math.max(...numericInputs.map(i => i.quality));
    
    return {
      value: sum,
      quality: worstQuality,
      sourceIndex: -1 // Calculated from multiple sources
    };
  }
}

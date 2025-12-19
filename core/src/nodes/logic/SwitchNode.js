import { BaseNode } from '../base/BaseNode.js';

/**
 * Switch/Case Node - routes input to different outputs based on value
 * Similar to switch/case statement in programming
 */
export class SwitchNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'Switch',
    name: 'switch',
    version: 1,
    description: 'Route value to different outputs based on case matching (like switch/case statement)',
    category: 'LOGIC_MATH',
    section: 'CONTROL',
    icon: '🔀',
    color: '#FF9800',
    inputs: [
      { type: 'main', displayName: 'Value', required: true }
    ],
    outputs: [
      { type: 'main', displayName: 'Case 1' },
      { type: 'main', displayName: 'Case 2' },
      { type: 'main', displayName: 'Default' }
    ],
    ioRules: [
      {
        inputs: {
          count: 1,
          type: 'main'
        },
        outputs: {
          min: 2,  // At least 1 case + 1 default
          max: 11, // 10 cases + 1 default
          default: 3,
          canAdd: true,
          canRemove: true,
          type: 'main'
        }
      }
    ],
    // Note: lastOutputIsDefault logic remains in execute() method
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
          title: 'Switch',
          color: '#FF9800',
          badges: ['executionOrder']
        },
        {
          type: 'subtitle',
          text: '{{cases.length}} cases',
          visible: '{{cases}}'
        }
      ],
      handles: {
        inputs: [
          { index: 0, position: 'auto', color: 'auto', label: null, visible: true }
        ],
        outputs: [],  // Dynamic
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
        displayName: 'Case 1 Value',
        name: 'case1Value',
        type: 'string',
        default: '1',
        required: true,
        userExposable: true,
        description: 'Value to match for case 1'
      },
      {
        displayName: 'Case 2 Value',
        name: 'case2Value',
        type: 'string',
        default: '2',
        required: true,
        userExposable: true,
        description: 'Value to match for case 2'
      },
      {
        displayName: 'Case 3 Value',
        name: 'case3Value',
        type: 'string',
        default: '',
        userExposable: true,
        description: 'Value to match for case 3 (optional)',
        displayOptions: {
          show: {
            _outputCount: [4, 5, 6, 7, 8, 9, 10, 11]
          }
        }
      },
      {
        displayName: 'Case 4 Value',
        name: 'case4Value',
        type: 'string',
        default: '',
        userExposable: true,
        description: 'Value to match for case 4 (optional)',
        displayOptions: {
          show: {
            _outputCount: [5, 6, 7, 8, 9, 10, 11]
          }
        }
      },
      {
        displayName: 'Case 5 Value',
        name: 'case5Value',
        type: 'string',
        default: '',
        userExposable: true,
        description: 'Value to match for case 5 (optional)',
        displayOptions: {
          show: {
            _outputCount: [6, 7, 8, 9, 10, 11]
          }
        }
      },
      {
        displayName: 'Case 6 Value',
        name: 'case6Value',
        type: 'string',
        default: '',
        userExposable: true,
        description: 'Value to match for case 6 (optional)',
        displayOptions: {
          show: {
            _outputCount: [7, 8, 9, 10, 11]
          }
        }
      },
      {
        displayName: 'Case 7 Value',
        name: 'case7Value',
        type: 'string',
        default: '',
        userExposable: true,
        description: 'Value to match for case 7 (optional)',
        displayOptions: {
          show: {
            _outputCount: [8, 9, 10, 11]
          }
        }
      },
      {
        displayName: 'Case 8 Value',
        name: 'case8Value',
        type: 'string',
        default: '',
        userExposable: true,
        description: 'Value to match for case 8 (optional)',
        displayOptions: {
          show: {
            _outputCount: [9, 10, 11]
          }
        }
      },
      {
        displayName: 'Case 9 Value',
        name: 'case9Value',
        type: 'string',
        default: '',
        userExposable: true,
        description: 'Value to match for case 9 (optional)',
        displayOptions: {
          show: {
            _outputCount: [10, 11]
          }
        }
      },
      {
        displayName: 'Case 10 Value',
        name: 'case10Value',
        type: 'string',
        default: '',
        userExposable: true,
        description: 'Value to match for case 10 (optional)',
        displayOptions: {
          show: {
            _outputCount: [11]
          }
        }
      },
      {
        displayName: 'Match Mode',
        name: 'matchMode',
        type: 'select',
        options: [
          {
            label: 'Exact Match',
            value: 'exact'
          },
          {
            label: 'Case Insensitive',
            value: 'insensitive'
          },
          {
            label: 'Numeric',
            value: 'numeric'
          }
        ],
        default: 'exact',
        required: true,
        description: 'How to compare input value with case values'
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
    const matchMode = this.getParameter(context.node, 'matchMode', 'exact');
    
    // Build cases array from individual properties
    const outputCount = this.description.outputs.length;
    const caseCount = outputCount - 1; // Last output is default
    const cases = [];
    for (let i = 1; i <= caseCount && i <= 10; i++) {
      const caseValue = this.getParameter(context.node, `case${i}Value`);
      if (caseValue !== undefined && caseValue !== null && caseValue !== '') {
        cases.push({ value: caseValue });
      }
    }
    
    // Get input value
    const inputData = context.getInputValue(0);
    const inputValue = inputData?.value ?? inputData;

    // If no input, send to default
    if (inputValue === null || inputValue === undefined) {
      // Last output is default
      return Array(outputCount).fill(null).map((_, idx) => 
        idx === outputCount - 1 ? { value: null, quality: 192 } : { value: null, quality: 64 }
      );
    }

    // Check each case
    for (let i = 0; i < cases.length; i++) {
      const caseValue = cases[i].value;
      let matches = false;

      switch (matchMode) {
        case 'exact':
          matches = String(inputValue) === String(caseValue);
          break;
          
        case 'insensitive':
          matches = String(inputValue).toLowerCase() === String(caseValue).toLowerCase();
          break;
          
        case 'numeric':
          const inputNum = Number(inputValue);
          const caseNum = Number(caseValue);
          matches = !isNaN(inputNum) && !isNaN(caseNum) && inputNum === caseNum;
          break;
      }

      if (matches) {
        // Send value to matching case output, null to all others
        return Array(outputCount).fill(null).map((_, idx) => 
          idx === i ? { value: inputValue, quality: 0 } : { value: null, quality: 64 }
        );
      }
    }

    // No match found - send to default output (last output)
    return Array(outputCount).fill(null).map((_, idx) => 
      idx === outputCount - 1 ? { value: inputValue, quality: 0 } : { value: null, quality: 64 }
    );
  }

  /**
   * Declarative log messages
   */
  getLogMessages() {
    return {
      info: (result) => {
        // result is the outputs array
        const matchedIndex = result.findIndex(out => out.quality === 0);
        if (matchedIndex === -1) {
          return 'Switch: No match, using default output';
        }
        return `Switch: Matched case ${matchedIndex + 1} with value ${result[matchedIndex].value}`;
      },
      debug: (result) => {
        const matchedIndex = result.findIndex(out => out.quality === 0);
        return `Switch output: ${matchedIndex >= 0 ? `case ${matchedIndex + 1}` : 'default'}`;
      },
      error: (error) => `Switch operation failed: ${error.message}`
    };
  }

  static get help() {
    return {
      overview: "Routes input value to different outputs based on case matching, similar to switch/case statements in programming. Supports 1-10 case outputs plus a default output. Useful for multi-way branching and value-based routing.",
      useCases: [
        "Route production data to different processing chains based on product type",
        "Distribute sensor values to appropriate handlers based on measurement type",
        "Implement state machines by routing based on current state code",
        "Direct alarms to different notification channels based on severity level"
      ],
      examples: [
        {
          title: "Product Type Routing",
          config: { cases: [{ value: "A" }, { value: "B" }], matchMode: "exact" },
          input: { value: "B" },
          output: { case1: null, case2: "B", default: null, matchedCase: 1 }
        },
        {
          title: "Severity Routing",
          config: { cases: [{ value: "critical" }, { value: "warning" }], matchMode: "exact" },
          input: { value: "info" },
          output: { case1: null, case2: null, default: "info", matchedCase: -1 }
        },
        {
          title: "Numeric Routing",
          config: { cases: [{ value: "1" }, { value: "2" }], matchMode: "exact" },
          input: { value: 1 },
          output: { case1: 1, case2: null, default: null, matchedCase: 0 }
        }
      ],
      tips: [
        "All case values are converted to strings for comparison - numeric 1 matches string '1'",
        "Default output fires when no case matches - always connect for fallback handling",
        "Only the matched output receives the value - other outputs remain null",
        "Add/remove case outputs dynamically by adjusting output count",
        "Case values must be unique - duplicate values cause validation errors",
        "Last output is always the default case"
      ],
      relatedNodes: ["GateNode", "RangeCheckNode", "ComparisonNode"]
    };
  }
}

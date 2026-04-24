import { BaseNode } from '../../../base/BaseNode.js';

/**
 * Rate of Change Node
 *
 * Calculates how fast an input value is changing between executions.
 * Supports two modes:
 *   - time-based:   (currentValue - previousValue) / elapsedSeconds * scaleFactor
 *   - sample-based: (currentValue - previousValue) — unit is "change per sample"
 *
 * An optional boolean `enable` input pauses collection when false:
 * state is not updated and output is null.
 */
export class RateOfChangeNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'Rate of Change',
    name: 'rate-of-change',
    version: 1,
    description: 'Calculates how fast a value is changing per sample or per unit of time.',
    category: 'LOGIC_MATH',
    section: 'ADVANCED',
    icon: '📈',
    color: '#E65100',

    inputs: [
      { type: 'number', displayName: 'Value', required: true },
      { type: 'boolean', displayName: 'Enable', required: false, description: 'When false, pauses collection and outputs null' }
    ],

    outputs: [
      { type: 'number', displayName: 'Rate' }
    ],

    ioRules: [
      {
        inputs: {
          definitions: [
            { type: 'number', displayName: 'Value', required: true },
            { type: 'boolean', displayName: 'Enable', required: false }
          ]
        },
        outputs: { count: 1, type: 'number' }
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
          icon: '📈',
          title: 'Rate of Change',
          color: '#E65100',
          badges: ['executionOrder']
        },
        {
          type: 'subtitle',
          text: '{{mode}}{{timeAmount}}{{timeUnit}}',
          visible: '{{mode}}'
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
      }
    },

    properties: [
      {
        displayName: 'Mode',
        name: 'mode',
        type: 'select',
        options: [
          { label: 'Time-based (per time unit)', value: 'time-based' },
          { label: 'Sample-based (per sample)', value: 'sample-based' }
        ],
        default: 'time-based',
        noDataExpression: true,
        description: 'How to calculate the rate of change'
      },
      {
        displayName: 'Time Unit',
        name: 'timeUnit',
        type: 'select',
        options: [
          { label: 'Per second', value: 'second' },
          { label: 'Per minute', value: 'minute' },
          { label: 'Per hour', value: 'hour' }
        ],
        default: 'minute',
        description: 'Output unit for time-based mode',
        displayOptions: {
          show: { mode: ['time-based'] }
        }
      },
      {
        displayName: 'Time Amount',
        name: 'timeAmount',
        type: 'number',
        default: 1,
        description: 'Number of time units for the base period (e.g. 5 with "Per minute" = per 5 minutes)',
        displayOptions: {
          show: { mode: ['time-based'] }
        }
      },
      {
        displayName: 'Output on First Sample',
        name: 'outputOnFirst',
        type: 'boolean',
        default: false,
        description: 'Output 0 on the first execution (no previous value). When false, outputs null.',
        userExposable: true
      },
      {
        displayName: 'Skip Bad Quality Samples',
        name: 'skipOnBadQuality',
        type: 'boolean',
        default: true,
        description: 'When enabled, bad-quality inputs are ignored and do not update the stored previous value.',
        userExposable: true
      },
      {
        displayName: 'Decimal Places',
        name: 'decimalPlaces',
        type: 'number',
        default: -1,
        description: 'Number of decimal places (-1 = no rounding)',
        userExposable: true
      }
    ],

    configUI: {
      sections: [
        { type: 'property-group', title: 'Configuration' }
      ]
    }
  };

  constructor() {
    super();
    // Per-node-instance state: { lastValue, lastTimestamp }
    this.nodeStates = new Map();
  }

  getNodeState(nodeId) {
    if (!this.nodeStates.has(nodeId)) {
      this.nodeStates.set(nodeId, {
        lastValue: null,
        lastTimestamp: null
      });
    }
    return this.nodeStates.get(nodeId);
  }

  /** Scale factor from ms elapsed to the requested time unit */
  _scaleForUnit(timeUnit) {
    switch (timeUnit) {
      case 'second': return 1000;
      case 'minute': return 60_000;
      case 'hour':   return 3_600_000;
      default:       return 60_000;
    }
  }

  _round(value, decimalPlaces) {
    if (decimalPlaces < 0) return value;
    const m = Math.pow(10, decimalPlaces);
    return Math.round(value * m) / m;
  }

  async execute(context) {
    const nodeId = context.node.id;
    const state = this.getNodeState(nodeId);

    const mode              = this.getParameter(context.node, 'mode', 'time-based');
    const timeUnit          = this.getParameter(context.node, 'timeUnit', 'minute');
    const timeAmount        = Math.max(0.001, Number(this.getParameter(context.node, 'timeAmount', 1)) || 1);
    const outputOnFirst     = this.getParameter(context.node, 'outputOnFirst', false);
    const skipOnBadQuality  = this.getParameter(context.node, 'skipOnBadQuality', true);
    const decimalPlaces     = this.getParameter(context.node, 'decimalPlaces', -1);

    // --- Enable input (index 1) ---
    const enableInput = context.getInputValue(1);
    if (enableInput !== null && enableInput !== undefined) {
      const enabled = Boolean(enableInput?.value ?? enableInput);
      if (!enabled) {
        return { value: null, quality: 1 };
      }
    }

    // --- Value input (index 0) ---
    const valueInput = context.getInputValue(0);
    if (valueInput === null || valueInput === undefined) {
      return { value: null, quality: 1 };
    }

    const rawValue  = valueInput?.value ?? valueInput;
    const quality   = valueInput?.quality ?? 0;
    const now       = Date.now();

    const numValue = Number(rawValue);
    if (isNaN(numValue) || !isFinite(numValue)) {
      return { value: null, quality: 1 };
    }

    // Bad quality handling
    if (skipOnBadQuality && quality !== 0) {
      return { value: null, quality };
    }

    // First sample — no previous value yet
    if (state.lastValue === null) {
      state.lastValue = numValue;
      state.lastTimestamp = now;
      const firstValue = outputOnFirst ? 0 : null;
      return { value: firstValue, quality: firstValue === null ? 1 : quality };
    }

    let rate;

    if (mode === 'time-based') {
      const elapsedMs = now - state.lastTimestamp;
      if (elapsedMs <= 0) {
        // Same timestamp — skip this sample, don't update state, don't output a false 0
        return { value: null, quality: 1 };
      }
      // Stale state: if last sample was more than 5 minutes ago (e.g. after redeploy),
      // reset and treat as first sample to avoid a near-zero spurious rate.
      if (elapsedMs > 300_000) {
        state.lastValue = numValue;
        state.lastTimestamp = now;
        const firstValue = outputOnFirst ? 0 : null;
        return { value: firstValue, quality: firstValue === null ? 1 : quality };
      }
      const scale = this._scaleForUnit(timeUnit) * timeAmount;
      rate = (numValue - state.lastValue) / elapsedMs * scale;
    } else {
      // sample-based
      rate = numValue - state.lastValue;
    }

    rate = this._round(rate, decimalPlaces);

    // Update state
    state.lastValue = numValue;
    state.lastTimestamp = now;

    return {
      value: rate,
      quality,
      mode,
      timestamp: new Date().toISOString()
    };
  }

  static get help() {
    return {
      overview: "Calculates how fast a numeric value is changing between executions. Use time-based mode for physically meaningful units (e.g., %RH/min for humidity). Use sample-based mode when you only care about the magnitude of change per execution.",
      useCases: [
        "Detect rapid humidity rise to trigger a bath exhaust fan",
        "Detect rapid pressure drop to trigger an alarm",
        "Measure temperature ramp rate during heat treatment"
      ],
      examples: [
        {
          title: "Humidity rise detection (time-based)",
          config: { mode: "time-based", timeUnit: "minute", outputOnFirst: false },
          note: "Connect output to Comparison node: > 3 to trigger fan ON"
        },
        {
          title: "Sample-based delta",
          config: { mode: "sample-based" },
          note: "Output is raw difference between consecutive samples"
        }
      ],
      tips: [
        "Enable input: connect a boolean to pause collection (outputs null while paused)",
        "skipOnBadQuality: bad sensor readings do not corrupt the stored previous value",
        "State resets on flow redeploy or service restart — first sample produces null (or 0 if outputOnFirst=true)"
      ]
    };
  }
}

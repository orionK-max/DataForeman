import { BaseNode } from '../../../base/BaseNode.js';

const TIME_WINDOW_MAX_SAMPLES = 1000;

/**
 * Rolling Average Node
 *
 * Smooths a numeric signal by averaging over a sliding window.
 * Supports two window modes:
 *   - sample-count: keep the last N samples in a circular buffer
 *   - time-window:  keep all samples within the last T seconds/minutes (capped at 1000)
 *
 * An optional boolean `enable` input pauses collection when false.
 * Behaviour is configurable: output null, freeze last value, or freeze
 * sample collection (time-window only: existing samples age out naturally).
 */
export class RollingAverageNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'Rolling Average',
    name: 'rolling-average',
    version: 1,
    description: 'Smooths a signal by averaging values over a sliding sample window or time window.',
    category: 'LOGIC_MATH',
    section: 'ADVANCED',
    icon: '〰️',
    color: '#1565C0',

    inputs: [
      { type: 'number', displayName: 'Value', required: true },
      { type: 'boolean', displayName: 'Enable', required: false, description: 'When false, behaviour is controlled by the Disable Behaviour property' }
    ],

    outputs: [
      { type: 'number', displayName: 'Average' }
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
          icon: '〰️',
          title: 'Rolling Average',
          color: '#1565C0',
          badges: ['executionOrder']
        },
        {
          type: 'subtitle',
          text: '{{mode}}',
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
          { label: 'Sample count (last N samples)', value: 'sample-count' },
          { label: 'Time window (last T seconds/minutes)', value: 'time-window' }
        ],
        default: 'sample-count',
        noDataExpression: true,
        description: 'How the rolling window is defined'
      },
      {
        displayName: 'Sample Count',
        name: 'sampleCount',
        type: 'number',
        default: 10,
        description: 'Number of samples to keep in the window',
        displayOptions: {
          show: { mode: ['sample-count'] }
        },
        userExposable: true
      },
      {
        displayName: 'Time Window',
        name: 'timeWindow',
        type: 'number',
        default: 60,
        description: 'Duration of the rolling window (in the selected time unit)',
        displayOptions: {
          show: { mode: ['time-window'] }
        },
        userExposable: true
      },
      {
        displayName: 'Time Unit',
        name: 'timeUnit',
        type: 'select',
        options: [
          { label: 'Seconds', value: 'second' },
          { label: 'Minutes', value: 'minute' }
        ],
        default: 'second',
        description: 'Time unit for the time window duration',
        displayOptions: {
          show: { mode: ['time-window'] }
        }
      },
      {
        displayName: 'Partial Buffer Behaviour',
        name: 'partialBuffer',
        type: 'select',
        options: [
          { label: 'Output null (wait until window full)', value: 'output-null' },
          { label: 'Use partial (average what is available)', value: 'use-partial' },
          { label: 'Pass through raw input (until window full)', value: 'output-last' }
        ],
        default: 'output-null',
        description: 'What to output before the window has enough samples',
        userExposable: true
      },
      {
        displayName: 'Disable Behaviour',
        name: 'disableBehaviour',
        type: 'select',
        options: [
          { label: 'Output null', value: 'output-null' },
          { label: 'Freeze last value', value: 'freeze-value' },
          { label: 'Freeze sample collection (samples age out)', value: 'freeze-collection' }
        ],
        default: 'output-null',
        description: 'What to output when Enable is false. "Freeze collection" stops adding samples but keeps computing from existing ones — in time-window mode they will eventually age out and output becomes null.',
        userExposable: true
      },
      {
        displayName: 'Skip Bad Quality Samples',
        name: 'skipOnBadQuality',
        type: 'boolean',
        default: true,
        description: 'When enabled, bad-quality samples are not added to the buffer.',
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
    // Per-node-instance state: { buffer, lastOutput }
    this.nodeStates = new Map();
  }

  getNodeState(nodeId) {
    if (!this.nodeStates.has(nodeId)) {
      this.nodeStates.set(nodeId, { buffer: [], lastOutput: null });
    }
    return this.nodeStates.get(nodeId);
  }

  _timeWindowMs(timeWindow, timeUnit) {
    return timeUnit === 'minute' ? timeWindow * 60_000 : timeWindow * 1000;
  }

  _round(value, decimalPlaces) {
    if (decimalPlaces < 0) return value;
    const m = Math.pow(10, decimalPlaces);
    return Math.round(value * m) / m;
  }

  _computeAverage(buffer) {
    if (buffer.length === 0) return { value: null, quality: 1 };
    const sum = buffer.reduce((acc, s) => acc + s.value, 0);
    const worstQuality = buffer.reduce((worst, s) => Math.max(worst, s.quality), 0);
    return { value: sum / buffer.length, quality: worstQuality };
  }

  async execute(context) {
    const nodeId = context.node.id;
    const state  = this.getNodeState(nodeId);

    const mode             = this.getParameter(context.node, 'mode', 'sample-count');
    const sampleCount      = Math.max(1, this.getParameter(context.node, 'sampleCount', 10));
    const timeWindow       = Math.max(1, this.getParameter(context.node, 'timeWindow', 60));
    const timeUnit         = this.getParameter(context.node, 'timeUnit', 'second');
    const partialBuffer    = this.getParameter(context.node, 'partialBuffer', 'output-null');
    const disableBehaviour = this.getParameter(context.node, 'disableBehaviour', 'output-null');
    const skipOnBadQuality = this.getParameter(context.node, 'skipOnBadQuality', true);
    const decimalPlaces    = this.getParameter(context.node, 'decimalPlaces', -1);

    // --- Enable input (index 1) ---
    const enableInput = context.getInputValue(1);
    if (enableInput !== null && enableInput !== undefined) {
      const enabled = Boolean(enableInput?.value ?? enableInput);
      if (!enabled) {
        if (disableBehaviour === 'freeze-value') {
          return state.lastOutput !== null ? state.lastOutput : { value: null, quality: 1 };
        }
        if (disableBehaviour === 'freeze-collection') {
          // Don't add new samples; compute from existing buffer (samples age out in time-window mode)
          return this._computeFromBuffer(state, mode, sampleCount, timeWindow, timeUnit, partialBuffer, decimalPlaces);
        }
        // output-null (default)
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

    // --- Add sample to buffer ---
    const sample = { value: numValue, quality, timestamp: now };
    state.buffer.push(sample);

    if (mode === 'sample-count') {
      // Trim to last N
      if (state.buffer.length > sampleCount) {
        state.buffer = state.buffer.slice(-sampleCount);
      }

      const windowFull = state.buffer.length >= sampleCount;

      if (!windowFull) {
        if (partialBuffer === 'output-null') {
          return { value: null, quality: 1 };
        }
        if (partialBuffer === 'output-last') {
          return { value: this._round(numValue, decimalPlaces), quality };
        }
        // use-partial — fall through to compute average on what we have
      }
    } else {
      // time-window mode
      const windowMs = this._timeWindowMs(timeWindow, timeUnit);
      const cutoff   = now - windowMs;

      // Prune old samples
      state.buffer = state.buffer.filter(s => s.timestamp >= cutoff);

      // Hard cap
      if (state.buffer.length > TIME_WINDOW_MAX_SAMPLES) {
        state.buffer = state.buffer.slice(-TIME_WINDOW_MAX_SAMPLES);
      }

      const windowFull = state.buffer.length > 0 &&
        (now - state.buffer[0].timestamp) >= windowMs;

      if (!windowFull) {
        if (partialBuffer === 'output-null') {
          return { value: null, quality: 1 };
        }
        if (partialBuffer === 'output-last') {
          return { value: this._round(numValue, decimalPlaces), quality };
        }
        // use-partial — fall through
      }
    }

    const { value: avg, quality: avgQuality } = this._computeAverage(state.buffer);
    if (avg === null) return { value: null, quality: 1 };

    const output = {
      value: this._round(avg, decimalPlaces),
      quality: avgQuality,
      sampleCount: state.buffer.length,
      timestamp: new Date().toISOString()
    };
    state.lastOutput = output;
    return output;
  }

  /** Compute average from existing buffer without adding a new sample (used by freeze-collection) */
  _computeFromBuffer(state, mode, sampleCount, timeWindow, timeUnit, partialBuffer, decimalPlaces) {
    const now = Date.now();

    if (mode === 'time-window') {
      const windowMs = this._timeWindowMs(timeWindow, timeUnit);
      const cutoff   = now - windowMs;
      state.buffer = state.buffer.filter(s => s.timestamp >= cutoff);
    }

    if (state.buffer.length === 0) return { value: null, quality: 1 };

    if (mode === 'sample-count') {
      const windowFull = state.buffer.length >= sampleCount;
      if (!windowFull && partialBuffer === 'output-null') return { value: null, quality: 1 };
    }

    const { value: avg, quality: avgQuality } = this._computeAverage(state.buffer);
    if (avg === null) return { value: null, quality: 1 };

    return {
      value: this._round(avg, decimalPlaces),
      quality: avgQuality,
      sampleCount: state.buffer.length,
      timestamp: new Date().toISOString()
    };
  }

  static get help() {
    return {
      overview: "Smooths a noisy numeric signal by computing a rolling average over a configurable window. Use sample-count mode for simplicity; use time-window mode when you need a predictable time-based average regardless of publish rate.",
      useCases: [
        "Smooth humidity readings before comparing to a threshold for fan OFF control",
        "Filter out sensor spikes from temperature readings",
        "Compute average power consumption over a sliding time window"
      ],
      examples: [
        {
          title: "Sample-count smoothing (10 samples)",
          config: { mode: "sample-count", sampleCount: 10, partialBuffer: "output-null" },
          note: "Outputs null until 10 samples collected, then outputs their average"
        },
        {
          title: "2-minute time window",
          config: { mode: "time-window", timeWindow: 2, timeUnit: "minute", partialBuffer: "use-partial" },
          note: "Outputs average of all samples in last 2 minutes (max 1000 samples)"
        }
      ],
      tips: [
        "Enable input: connect a boolean to pause collection (outputs null while paused)",
        "partialBuffer=output-null is safest for automation triggers — prevents acting on incomplete data",
        "skipOnBadQuality: bad sensor readings do not pollute the buffer",
        "Time-window mode caps at 1000 samples regardless of window size",
        "State resets on flow redeploy or service restart"
      ]
    };
  }
}

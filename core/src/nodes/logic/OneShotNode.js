import { BaseNode } from '../base/BaseNode.js';

/**
 * OneShotNode - Rising-edge pulse generator
 *
 * Outputs a single true on the first execution cycle where the Trigger input
 * transitions to HIGH (or is HIGH after being re-armed). Locks LOW for all
 * subsequent cycles while Trigger stays HIGH. Re-arms automatically when
 * Trigger goes LOW, or immediately when the Reset input is HIGH.
 */
export class OneShotNode extends BaseNode {
  description = {
    schemaVersion: 1,
    displayName: 'One Shot',
    name: 'one-shot',
    version: 1,
    description: 'Outputs a single true pulse on a rising edge, then locks until re-armed',
    category: 'LOGIC_MATH',
    section: 'CONTROL',
    icon: '⚡',
    color: '#E65100',

    inputs: [
      {
        type: 'boolean',
        displayName: 'Trigger',
        required: true,
        skipNodeOnNull: false,
        description: 'Rising edge (false → true) fires one pulse. Node stays LOW while input remains HIGH.'
      },
      {
        type: 'boolean',
        displayName: 'Reset',
        required: false,
        skipNodeOnNull: false,
        description: 'When true, re-arms the one-shot immediately (next HIGH will fire again)'
      }
    ],

    outputs: [
      {
        type: 'boolean',
        displayName: 'Pulse',
        description: 'True for one execution cycle on rising edge, false otherwise'
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
          icon: '⚡',
          title: 'One Shot',
          color: '#E65100',
          badges: ['executionOrder']
        }
      ],
      handles: {
        inputs: [
          { index: 0, position: '33.33%', color: 'auto', label: null, visible: true },
          { index: 1, position: '66.67%', color: 'auto', label: null, visible: true }
        ],
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

    properties: [],

    configUI: {
      sections: []
    },

    help: {
      overview: "Detects a rising edge on the Trigger input and outputs a single true pulse for one execution cycle. While Trigger stays HIGH the output locks LOW — no further pulses. The node re-arms automatically when Trigger goes LOW, or immediately when the Reset input goes HIGH.",
      useCases: [
        "Fire an HTTP Request node exactly once when an alarm condition is first detected",
        "Send a single notification when a sensor crosses a threshold, not on every poll cycle",
        "Trigger a one-time write to a tag output on first detection of a state change",
        "Gate any action so it only executes once per HIGH period"
      ],
      examples: [
        {
          title: "Single HTTP notification on alarm",
          description: "Connect a Comparison node to Trigger. The HTTP Request fires once when the alarm first trips, not on every continuous cycle.",
          configuration: {}
        },
        {
          title: "Re-arm with separate reset button",
          description: "Connect a Manual Trigger node to Reset to allow re-arming on demand without waiting for Trigger to go LOW.",
          configuration: {}
        }
      ],
      tips: [
        "In a continuous flow, Trigger going LOW automatically re-arms the node for the next HIGH",
        "In manual mode, run one cycle with Trigger LOW to re-arm before firing again",
        "Reset is evaluated before the Trigger on each cycle — setting both HIGH in the same cycle will fire a pulse",
        "Restarting or re-deploying the flow resets internal state — first HIGH always fires"
      ],
      relatedNodes: ["gate", "comparison", "http-request", "boolean-logic"]
    }
  };

  constructor() {
    super();
    // Per-node-instance state: Map of nodeId → { fired: boolean }
    this.nodeStates = new Map();
  }

  getNodeState(nodeId) {
    if (!this.nodeStates.has(nodeId)) {
      this.nodeStates.set(nodeId, { fired: false });
    }
    return this.nodeStates.get(nodeId);
  }

  getLogMessages() {
    return {
      info: (result) => result.pulse
        ? 'One Shot fired: output true'
        : result.reArmed
          ? 'One Shot re-armed (trigger LOW)'
          : result.resetApplied
            ? 'One Shot re-armed by Reset input'
            : 'One Shot locked (already fired)',
      debug: (result) => `trigger=${result.trigger} reset=${result.resetApplied} fired=${result.firedAfter} pulse=${result.pulse}`,
      error: (error) => `One Shot execution failed: ${error.message}`
    };
  }

  async execute(context) {
    const nodeId = context.node.id;
    const state = this.getNodeState(nodeId);

    const triggerData = context.getInputValue(0);
    const resetData   = context.getInputValue(1);

    const trigger = triggerData?.value === true;
    const reset   = resetData?.value === true;

    let resetApplied = false;
    let reArmed = false;
    let pulse = false;

    // Reset is evaluated first — re-arms the latch before checking trigger
    if (reset) {
      state.fired = false;
      resetApplied = true;
    }

    if (trigger) {
      if (!state.fired) {
        // First HIGH cycle (or first after re-arm) → fire the pulse
        pulse = true;
        state.fired = true;
      }
      // else: still HIGH but already fired → stay LOW
    } else {
      // Trigger is LOW → re-arm for next rising edge
      if (state.fired) {
        reArmed = true;
      }
      state.fired = false;
    }

    return {
      value: pulse,
      quality: 192,
      pulse,
      trigger,
      resetApplied,
      reArmed,
      firedAfter: state.fired
    };
  }
}

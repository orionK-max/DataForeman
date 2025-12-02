/**
 * Visual Definition Validator for Flow Nodes
 * 
 * Validates visual definitions in node descriptions against the schema specification.
 * Ensures all visual blocks, handles, and rendering configuration are correctly defined.
 * 
 * Schema Version: 1
 * See: docs/flow-node-schema.md - Visual Block Types section
 */

export class VisualDefinitionValidator {
  /**
   * Validate a complete visual definition
   * @param {Object} visual - Visual definition object
   * @param {Object} description - Parent node description (for cross-validation)
   * @returns {Object} { valid: boolean, errors: string[], warnings: string[] }
   */
  static validate(visual, description = {}) {
    const errors = [];
    const warnings = [];

    if (!visual) {
      // Visual definitions are optional
      return { valid: true, errors: [], warnings: [] };
    }

    if (typeof visual !== 'object' || Array.isArray(visual)) {
      errors.push('visual must be an object');
      return { valid: false, errors, warnings };
    }

    // Validate canvas configuration
    if (visual.canvas) {
      const canvasErrors = this.validateCanvas(visual.canvas);
      errors.push(...canvasErrors);
    }

    // Validate layout blocks
    if (visual.layout !== undefined) {
      if (!Array.isArray(visual.layout)) {
        errors.push('visual.layout must be an array');
      } else {
        visual.layout.forEach((block, index) => {
          const blockErrors = this.validateBlock(block, index);
          errors.push(...blockErrors);
        });
        
        // Check for at least one header block (recommended)
        const hasHeader = visual.layout.some(block => block.type === 'header');
        if (!hasHeader) {
          warnings.push('visual.layout should include at least one header block');
        }
      }
    }

    // Validate handles configuration
    if (visual.handles) {
      const handlesErrors = this.validateHandles(visual.handles, description);
      errors.push(...handlesErrors);
    }

    // Validate status configuration
    if (visual.status) {
      const statusErrors = this.validateStatus(visual.status);
      errors.push(...statusErrors);
    }

    // Validate runtime configuration
    if (visual.runtime) {
      const runtimeErrors = this.validateRuntime(visual.runtime);
      errors.push(...runtimeErrors);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate canvas configuration
   * @param {Object} canvas - Canvas configuration object
   * @returns {string[]} Array of error messages
   */
  static validateCanvas(canvas) {
    const errors = [];

    if (typeof canvas !== 'object' || Array.isArray(canvas)) {
      errors.push('visual.canvas must be an object');
      return errors;
    }

    // Validate minWidth
    if (canvas.minWidth !== undefined) {
      if (!Number.isInteger(canvas.minWidth) || canvas.minWidth < 100) {
        errors.push('visual.canvas.minWidth must be an integer >= 100');
      }
    }

    // Validate shape
    const validShapes = ['rounded-rect', 'rectangle', 'circle'];
    if (canvas.shape !== undefined) {
      if (!validShapes.includes(canvas.shape)) {
        errors.push(`visual.canvas.shape must be one of: ${validShapes.join(', ')}`);
      }
    }

    // Validate borderRadius
    if (canvas.borderRadius !== undefined) {
      if (!Number.isInteger(canvas.borderRadius) || canvas.borderRadius < 0) {
        errors.push('visual.canvas.borderRadius must be a non-negative integer');
      }
    }

    // Validate resizable
    if (canvas.resizable !== undefined) {
      if (typeof canvas.resizable !== 'boolean') {
        errors.push('visual.canvas.resizable must be a boolean');
      }
      
      // If resizable, minHeight is required
      if (canvas.resizable && canvas.minHeight === undefined) {
        errors.push('visual.canvas.minHeight is required when resizable is true');
      }
    }

    // Validate minHeight
    if (canvas.minHeight !== undefined) {
      if (!Number.isInteger(canvas.minHeight) || canvas.minHeight < 40) {
        errors.push('visual.canvas.minHeight must be an integer >= 40');
      }
    }

    // Validate aspectRatio
    if (canvas.aspectRatio !== undefined) {
      if (typeof canvas.aspectRatio !== 'number' || canvas.aspectRatio <= 0) {
        errors.push('visual.canvas.aspectRatio must be a positive number');
      }
    }

    return errors;
  }

  /**
   * Validate a layout block
   * @param {Object} block - Block object
   * @param {number} index - Block index for error messages
   * @returns {string[]} Array of error messages
   */
  static validateBlock(block, index) {
    const errors = [];
    const prefix = `visual.layout[${index}]`;

    if (!block || typeof block !== 'object') {
      errors.push(`${prefix}: must be an object`);
      return errors;
    }

    // Validate type (required)
    const validTypes = [
      'header', 'subtitle', 'text', 'values', 'badges', 
      'divider', 'code', 'progress', 'status-text'
    ];
    if (!block.type) {
      errors.push(`${prefix}: type is required`);
      return errors;
    }
    if (!validTypes.includes(block.type)) {
      errors.push(`${prefix}: type "${block.type}" is not valid. Valid types: ${validTypes.join(', ')}`);
      return errors;
    }

    // Validate type-specific fields
    switch (block.type) {
      case 'header':
        errors.push(...this.validateHeaderBlock(block, prefix));
        break;
      case 'subtitle':
        errors.push(...this.validateSubtitleBlock(block, prefix));
        break;
      case 'text':
        errors.push(...this.validateTextBlock(block, prefix));
        break;
      case 'values':
        errors.push(...this.validateValuesBlock(block, prefix));
        break;
      case 'badges':
        errors.push(...this.validateBadgesBlock(block, prefix));
        break;
      case 'divider':
        errors.push(...this.validateDividerBlock(block, prefix));
        break;
      case 'code':
        errors.push(...this.validateCodeBlock(block, prefix));
        break;
      case 'progress':
        errors.push(...this.validateProgressBlock(block, prefix));
        break;
      case 'status-text':
        errors.push(...this.validateStatusTextBlock(block, prefix));
        break;
    }

    // Validate common optional fields
    if (block.visible !== undefined) {
      errors.push(...this.validateTemplate(block.visible, `${prefix}.visible`));
    }

    return errors;
  }

  /**
   * Validate header block
   */
  static validateHeaderBlock(block, prefix) {
    const errors = [];

    if (!block.icon) {
      errors.push(`${prefix}: icon is required for header block`);
    } else {
      errors.push(...this.validateTemplate(block.icon, `${prefix}.icon`));
    }

    if (!block.title) {
      errors.push(`${prefix}: title is required for header block`);
    } else {
      errors.push(...this.validateTemplate(block.title, `${prefix}.title`));
    }

    if (!block.color) {
      errors.push(`${prefix}: color is required for header block`);
    } else {
      errors.push(...this.validateColorTemplate(block.color, `${prefix}.color`));
    }

    if (block.badges !== undefined) {
      if (!Array.isArray(block.badges)) {
        errors.push(`${prefix}.badges must be an array`);
      } else {
        block.badges.forEach((badge, i) => {
          if (typeof badge !== 'string') {
            errors.push(`${prefix}.badges[${i}] must be a string`);
          }
        });
      }
    }

    if (block.fontSize !== undefined && (!Number.isInteger(block.fontSize) || block.fontSize < 8 || block.fontSize > 32)) {
      errors.push(`${prefix}.fontSize must be an integer between 8 and 32`);
    }

    if (block.iconSize !== undefined && (!Number.isInteger(block.iconSize) || block.iconSize < 8 || block.iconSize > 32)) {
      errors.push(`${prefix}.iconSize must be an integer between 8 and 32`);
    }

    return errors;
  }

  /**
   * Validate subtitle block
   */
  static validateSubtitleBlock(block, prefix) {
    const errors = [];

    if (!block.text) {
      errors.push(`${prefix}: text is required for subtitle block`);
    } else {
      errors.push(...this.validateTemplate(block.text, `${prefix}.text`));
    }

    if (block.color !== undefined) {
      errors.push(...this.validateColorTemplate(block.color, `${prefix}.color`));
    }

    if (block.fontSize !== undefined && (!Number.isInteger(block.fontSize) || block.fontSize < 8 || block.fontSize > 32)) {
      errors.push(`${prefix}.fontSize must be an integer between 8 and 32`);
    }

    if (block.fontWeight !== undefined && (!Number.isInteger(block.fontWeight) || block.fontWeight < 100 || block.fontWeight > 900)) {
      errors.push(`${prefix}.fontWeight must be an integer between 100 and 900`);
    }

    return errors;
  }

  /**
   * Validate text block
   */
  static validateTextBlock(block, prefix) {
    const errors = [];

    if (!block.content) {
      errors.push(`${prefix}: content is required for text block`);
    } else {
      errors.push(...this.validateTemplate(block.content, `${prefix}.content`));
    }

    if (block.fontSize !== undefined && (!Number.isInteger(block.fontSize) || block.fontSize < 8 || block.fontSize > 32)) {
      errors.push(`${prefix}.fontSize must be an integer between 8 and 32`);
    }

    if (block.fontWeight !== undefined && (!Number.isInteger(block.fontWeight) || block.fontWeight < 100 || block.fontWeight > 900)) {
      errors.push(`${prefix}.fontWeight must be an integer between 100 and 900`);
    }

    if (block.color !== undefined) {
      errors.push(...this.validateColorTemplate(block.color, `${prefix}.color`));
    }

    const validAlignments = ['left', 'center', 'right'];
    if (block.align !== undefined && !validAlignments.includes(block.align)) {
      errors.push(`${prefix}.align must be one of: ${validAlignments.join(', ')}`);
    }

    if (block.padding !== undefined && (!Number.isInteger(block.padding) || block.padding < 0)) {
      errors.push(`${prefix}.padding must be a non-negative integer`);
    }

    return errors;
  }

  /**
   * Validate values block
   */
  static validateValuesBlock(block, prefix) {
    const errors = [];

    if (!Array.isArray(block.items) || block.items.length === 0) {
      errors.push(`${prefix}: items is required and must be a non-empty array`);
      return errors;
    }

    block.items.forEach((item, i) => {
      if (!item || typeof item !== 'object') {
        errors.push(`${prefix}.items[${i}] must be an object`);
        return;
      }

      if (!item.label) {
        errors.push(`${prefix}.items[${i}].label is required`);
      }

      if (!item.value) {
        errors.push(`${prefix}.items[${i}].value is required`);
      } else {
        errors.push(...this.validateTemplate(item.value, `${prefix}.items[${i}].value`));
      }

      if (item.color !== undefined && item.color !== null) {
        errors.push(...this.validateColorTemplate(item.color, `${prefix}.items[${i}].color`));
      }

      if (item.visible !== undefined) {
        errors.push(...this.validateTemplate(item.visible, `${prefix}.items[${i}].visible`));
      }
    });

    const validLayouts = ['horizontal', 'vertical'];
    if (block.layout !== undefined && !validLayouts.includes(block.layout)) {
      errors.push(`${prefix}.layout must be one of: ${validLayouts.join(', ')}`);
    }

    if (block.spacing !== undefined && (!Number.isInteger(block.spacing) || block.spacing < 0)) {
      errors.push(`${prefix}.spacing must be a non-negative integer`);
    }

    if (block.labelWidth !== undefined && (!Number.isInteger(block.labelWidth) || block.labelWidth < 0)) {
      errors.push(`${prefix}.labelWidth must be a non-negative integer`);
    }

    return errors;
  }

  /**
   * Validate badges block
   */
  static validateBadgesBlock(block, prefix) {
    const errors = [];

    if (!Array.isArray(block.items) || block.items.length === 0) {
      errors.push(`${prefix}: items is required and must be a non-empty array`);
      return errors;
    }

    block.items.forEach((item, i) => {
      if (!item || typeof item !== 'object') {
        errors.push(`${prefix}.items[${i}] must be an object`);
        return;
      }

      if (!item.text) {
        errors.push(`${prefix}.items[${i}].text is required`);
      } else {
        errors.push(...this.validateTemplate(item.text, `${prefix}.items[${i}].text`));
      }

      if (!item.color) {
        errors.push(`${prefix}.items[${i}].color is required`);
      } else {
        errors.push(...this.validateColorTemplate(item.color, `${prefix}.items[${i}].color`));
      }

      if (item.textColor !== undefined) {
        errors.push(...this.validateColorTemplate(item.textColor, `${prefix}.items[${i}].textColor`));
      }

      if (item.visible !== undefined) {
        errors.push(...this.validateTemplate(item.visible, `${prefix}.items[${i}].visible`));
      }
    });

    const validPositions = ['inline', 'stacked'];
    if (block.position !== undefined && !validPositions.includes(block.position)) {
      errors.push(`${prefix}.position must be one of: ${validPositions.join(', ')}`);
    }

    if (block.spacing !== undefined && (!Number.isInteger(block.spacing) || block.spacing < 0)) {
      errors.push(`${prefix}.spacing must be a non-negative integer`);
    }

    const validAlignments = ['left', 'center', 'right'];
    if (block.align !== undefined && !validAlignments.includes(block.align)) {
      errors.push(`${prefix}.align must be one of: ${validAlignments.join(', ')}`);
    }

    return errors;
  }

  /**
   * Validate divider block
   */
  static validateDividerBlock(block, prefix) {
    const errors = [];

    if (block.color !== undefined) {
      errors.push(...this.validateColorTemplate(block.color, `${prefix}.color`));
    }

    if (block.thickness !== undefined && (!Number.isInteger(block.thickness) || block.thickness < 1)) {
      errors.push(`${prefix}.thickness must be a positive integer`);
    }

    if (block.margin !== undefined && (!Number.isInteger(block.margin) || block.margin < 0)) {
      errors.push(`${prefix}.margin must be a non-negative integer`);
    }

    const validStyles = ['solid', 'dashed', 'dotted'];
    if (block.style !== undefined && !validStyles.includes(block.style)) {
      errors.push(`${prefix}.style must be one of: ${validStyles.join(', ')}`);
    }

    return errors;
  }

  /**
   * Validate code block
   */
  static validateCodeBlock(block, prefix) {
    const errors = [];

    const validLanguages = ['javascript', 'python', 'sql', 'json', 'text'];
    if (!block.language) {
      errors.push(`${prefix}: language is required for code block`);
    } else if (!validLanguages.includes(block.language)) {
      errors.push(`${prefix}.language must be one of: ${validLanguages.join(', ')}`);
    }

    if (!block.content) {
      errors.push(`${prefix}: content is required for code block`);
    } else {
      errors.push(...this.validateTemplate(block.content, `${prefix}.content`));
    }

    if (block.maxLines !== undefined && (!Number.isInteger(block.maxLines) || block.maxLines < 1)) {
      errors.push(`${prefix}.maxLines must be a positive integer`);
    }

    if (block.showLineNumbers !== undefined && typeof block.showLineNumbers !== 'boolean') {
      errors.push(`${prefix}.showLineNumbers must be a boolean`);
    }

    if (block.fontSize !== undefined && (!Number.isInteger(block.fontSize) || block.fontSize < 8 || block.fontSize > 32)) {
      errors.push(`${prefix}.fontSize must be an integer between 8 and 32`);
    }

    if (block.wrap !== undefined && typeof block.wrap !== 'boolean') {
      errors.push(`${prefix}.wrap must be a boolean`);
    }

    return errors;
  }

  /**
   * Validate progress block
   */
  static validateProgressBlock(block, prefix) {
    const errors = [];

    if (!block.value) {
      errors.push(`${prefix}: value is required for progress block`);
    } else {
      errors.push(...this.validateTemplate(block.value, `${prefix}.value`));
    }

    if (!block.max) {
      errors.push(`${prefix}: max is required for progress block`);
    } else {
      errors.push(...this.validateTemplate(block.max, `${prefix}.max`));
    }

    if (block.label !== undefined) {
      errors.push(...this.validateTemplate(block.label, `${prefix}.label`));
    }

    if (block.color !== undefined) {
      errors.push(...this.validateColorTemplate(block.color, `${prefix}.color`));
    }

    if (block.backgroundColor !== undefined) {
      errors.push(...this.validateColorTemplate(block.backgroundColor, `${prefix}.backgroundColor`));
    }

    if (block.height !== undefined && (!Number.isInteger(block.height) || block.height < 1)) {
      errors.push(`${prefix}.height must be a positive integer`);
    }

    if (block.showPercentage !== undefined && typeof block.showPercentage !== 'boolean') {
      errors.push(`${prefix}.showPercentage must be a boolean`);
    }

    return errors;
  }

  /**
   * Validate status-text block
   */
  static validateStatusTextBlock(block, prefix) {
    const errors = [];

    if (!block.text) {
      errors.push(`${prefix}: text is required for status-text block`);
    } else {
      errors.push(...this.validateTemplate(block.text, `${prefix}.text`));
    }

    if (block.color !== undefined) {
      errors.push(...this.validateColorTemplate(block.color, `${prefix}.color`));
    }

    if (block.icon !== undefined) {
      errors.push(...this.validateTemplate(block.icon, `${prefix}.icon`));
    }

    if (block.fontSize !== undefined && (!Number.isInteger(block.fontSize) || block.fontSize < 8 || block.fontSize > 32)) {
      errors.push(`${prefix}.fontSize must be an integer between 8 and 32`);
    }

    if (block.fontWeight !== undefined && (!Number.isInteger(block.fontWeight) || block.fontWeight < 100 || block.fontWeight > 900)) {
      errors.push(`${prefix}.fontWeight must be an integer between 100 and 900`);
    }

    const validAlignments = ['left', 'center', 'right'];
    if (block.align !== undefined && !validAlignments.includes(block.align)) {
      errors.push(`${prefix}.align must be one of: ${validAlignments.join(', ')}`);
    }

    return errors;
  }

  /**
   * Validate handles configuration
   */
  static validateHandles(handles, description) {
    const errors = [];

    if (typeof handles !== 'object' || Array.isArray(handles)) {
      errors.push('visual.handles must be an object');
      return errors;
    }

    // Validate inputs
    if (handles.inputs !== undefined) {
      if (!Array.isArray(handles.inputs)) {
        errors.push('visual.handles.inputs must be an array');
      } else {
        handles.inputs.forEach((handle, i) => {
          errors.push(...this.validateHandle(handle, i, 'input', description.inputs));
        });
      }
    }

    // Validate outputs
    if (handles.outputs !== undefined) {
      if (!Array.isArray(handles.outputs)) {
        errors.push('visual.handles.outputs must be an array');
      } else {
        handles.outputs.forEach((handle, i) => {
          errors.push(...this.validateHandle(handle, i, 'output', description.outputs));
        });
      }
    }

    // Validate handle styling
    if (handles.size !== undefined && (!Number.isInteger(handles.size) || handles.size < 8 || handles.size > 20)) {
      errors.push('visual.handles.size must be an integer between 8 and 20');
    }

    if (handles.borderWidth !== undefined && (!Number.isInteger(handles.borderWidth) || handles.borderWidth < 0)) {
      errors.push('visual.handles.borderWidth must be a non-negative integer');
    }

    if (handles.borderColor !== undefined) {
      errors.push(...this.validateColor(handles.borderColor, 'visual.handles.borderColor'));
    }

    return errors;
  }

  /**
   * Validate a single handle
   */
  static validateHandle(handle, index, type, ioArray) {
    const errors = [];
    const prefix = `visual.handles.${type}s[${index}]`;

    if (!handle || typeof handle !== 'object') {
      errors.push(`${prefix}: must be an object`);
      return errors;
    }

    // Validate index
    if (handle.index === undefined) {
      errors.push(`${prefix}: index is required`);
    } else if (!Number.isInteger(handle.index) || handle.index < 0) {
      errors.push(`${prefix}.index must be a non-negative integer`);
    } else if (ioArray && handle.index >= ioArray.length) {
      errors.push(`${prefix}.index ${handle.index} references non-existent ${type} (${type}s.length = ${ioArray.length})`);
    }

    // Validate position
    if (handle.position === undefined) {
      errors.push(`${prefix}: position is required`);
    } else if (handle.position !== 'auto') {
      // Check if it's a valid percentage string
      if (typeof handle.position !== 'string' || !/^\d+(\.\d+)?%$/.test(handle.position)) {
        errors.push(`${prefix}.position must be 'auto' or a percentage string (e.g., '50%', '33.33%')`);
      }
    }

    // Validate color
    if (handle.color === undefined) {
      errors.push(`${prefix}: color is required`);
    } else if (handle.color !== 'auto') {
      errors.push(...this.validateColor(handle.color, `${prefix}.color`));
    }

    // Validate visible
    if (handle.visible !== undefined && typeof handle.visible !== 'boolean') {
      errors.push(`${prefix}.visible must be a boolean`);
    }

    return errors;
  }

  /**
   * Validate status configuration
   */
  static validateStatus(status) {
    const errors = [];

    if (typeof status !== 'object' || Array.isArray(status)) {
      errors.push('visual.status must be an object');
      return errors;
    }

    // Validate execution status
    if (status.execution) {
      errors.push(...this.validateStatusIndicator(status.execution, 'visual.status.execution'));
    }

    // Validate pinned status
    if (status.pinned) {
      errors.push(...this.validateStatusIndicator(status.pinned, 'visual.status.pinned'));
    }

    // Validate execution order
    if (status.executionOrder) {
      errors.push(...this.validateStatusIndicator(status.executionOrder, 'visual.status.executionOrder', true));
    }

    return errors;
  }

  /**
   * Validate a status indicator
   */
  static validateStatusIndicator(indicator, prefix, allowHeader = false) {
    const errors = [];

    if (typeof indicator !== 'object' || Array.isArray(indicator)) {
      errors.push(`${prefix} must be an object`);
      return errors;
    }

    if (indicator.enabled === undefined) {
      errors.push(`${prefix}.enabled is required`);
    } else if (typeof indicator.enabled !== 'boolean') {
      errors.push(`${prefix}.enabled must be a boolean`);
    }

    if (indicator.position !== undefined) {
      const validPositions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
      if (allowHeader) {
        validPositions.push('header');
      }
      if (!validPositions.includes(indicator.position)) {
        errors.push(`${prefix}.position must be one of: ${validPositions.join(', ')}`);
      }
    }

    if (indicator.offset !== undefined) {
      if (typeof indicator.offset !== 'object' || Array.isArray(indicator.offset)) {
        errors.push(`${prefix}.offset must be an object`);
      } else {
        if (!Number.isInteger(indicator.offset.x)) {
          errors.push(`${prefix}.offset.x must be an integer`);
        }
        if (!Number.isInteger(indicator.offset.y)) {
          errors.push(`${prefix}.offset.y must be an integer`);
        }
      }
    }

    return errors;
  }

  /**
   * Validate runtime configuration
   */
  static validateRuntime(runtime) {
    const errors = [];

    if (typeof runtime !== 'object' || Array.isArray(runtime)) {
      errors.push('visual.runtime must be an object');
      return errors;
    }

    // Validate enabled
    if (runtime.enabled === undefined) {
      errors.push('visual.runtime.enabled is required');
    } else if (typeof runtime.enabled !== 'boolean') {
      errors.push('visual.runtime.enabled must be a boolean');
    }

    // Validate updateInterval
    if (runtime.updateInterval !== undefined) {
      if (!Number.isInteger(runtime.updateInterval) || runtime.updateInterval < 100) {
        errors.push('visual.runtime.updateInterval must be an integer >= 100 (milliseconds)');
      }
    }

    // Validate endpoint
    if (runtime.endpoint !== undefined) {
      if (typeof runtime.endpoint !== 'string') {
        errors.push('visual.runtime.endpoint must be a string');
      } else if (!runtime.endpoint.includes('{{nodeId}}')) {
        errors.push('visual.runtime.endpoint should contain {{nodeId}} placeholder');
      }
    }

    // Validate fields
    if (runtime.fields !== undefined) {
      if (!Array.isArray(runtime.fields)) {
        errors.push('visual.runtime.fields must be an array');
      } else {
        runtime.fields.forEach((field, i) => {
          if (typeof field !== 'string') {
            errors.push(`visual.runtime.fields[${i}] must be a string`);
          }
        });
      }
    }

    return errors;
  }

  /**
   * Validate template string syntax
   * Checks for valid {{field}} or {{nested.path}} syntax
   */
  static validateTemplate(template, fieldPath) {
    const errors = [];

    if (typeof template !== 'string') {
      // Template can be a literal value
      return errors;
    }

    // Check for template syntax
    const templatePattern = /\{\{([^}]+)\}\}/g;
    let match;
    
    while ((match = templatePattern.exec(template)) !== null) {
      const field = match[1].trim();
      
      // Validate field name format (alphanumeric, underscore, dot for nested)
      if (!/^[a-zA-Z0-9_.]+$/.test(field)) {
        errors.push(`${fieldPath}: invalid template field name "${field}" (must be alphanumeric with dots for nesting)`);
      }
    }

    return errors;
  }

  /**
   * Validate color (can be hex color or template)
   */
  static validateColorTemplate(color, fieldPath) {
    const errors = [];

    if (typeof color !== 'string') {
      errors.push(`${fieldPath} must be a string`);
      return errors;
    }

    // If it's a template, validate template syntax
    if (color.includes('{{')) {
      return this.validateTemplate(color, fieldPath);
    }

    // Otherwise, validate as hex color
    return this.validateColor(color, fieldPath);
  }

  /**
   * Validate hex color
   */
  static validateColor(color, fieldPath) {
    const errors = [];

    if (typeof color !== 'string') {
      errors.push(`${fieldPath} must be a string`);
      return errors;
    }

    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      errors.push(`${fieldPath} must be a valid hex color (e.g., #RRGGBB)`);
    }

    return errors;
  }

  /**
   * Apply defaults to a visual definition
   */
  static applyDefaults(visual, description = {}) {
    if (!visual) {
      return null;
    }

    const result = { ...visual };

    // Apply canvas defaults
    if (result.canvas) {
      result.canvas = {
        minWidth: 160,
        shape: 'rounded-rect',
        borderRadius: 8,
        resizable: false,
        ...result.canvas
      };
    }

    // Apply handles defaults
    if (result.handles) {
      result.handles = {
        size: 12,
        borderWidth: 2,
        borderColor: '#ffffff',
        ...result.handles,
        inputs: result.handles.inputs || [],
        outputs: result.handles.outputs || []
      };
    }

    // Apply status defaults
    if (result.status) {
      result.status = {
        execution: {
          enabled: true,
          position: 'top-left',
          offset: { x: -10, y: -10 },
          ...result.status.execution
        },
        pinned: {
          enabled: true,
          position: 'top-right',
          offset: { x: -8, y: -8 },
          ...result.status.pinned
        },
        executionOrder: {
          enabled: true,
          position: 'header',
          ...result.status.executionOrder
        },
        ...result.status
      };
    }

    // Apply runtime defaults
    if (result.runtime) {
      result.runtime = {
        enabled: false,
        updateInterval: 1000,
        endpoint: '/api/flows/nodes/{{nodeId}}/runtime',
        fields: [],
        ...result.runtime
      };
    }

    return result;
  }
}

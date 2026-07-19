/**
 * JSON schemas for structured LLM output.
 * Used with provider LLMProviderOptions.responseSchema for stricter parsing.
 */

export const agentActionArraySchema = {
  type: 'object' as const,
  properties: {
    actions: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          action: {
            type: 'string' as const,
            enum: ['CLICK', 'SET_VALUE', 'NAVIGATE', 'TAP'],
          },
          target: { type: 'string' as const },
          value: { type: 'string' as const },
        },
        required: ['action', 'target'],
        additionalProperties: false,
      },
    },
  },
  required: ['actions'],
  additionalProperties: false,
};

export const agentStepSchema = {
  type: 'object' as const,
  properties: {
    reasoning: { type: 'string' as const },
    actions: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          action: {
            type: 'string' as const,
            enum: ['CLICK', 'SET_VALUE', 'NAVIGATE', 'TAP'],
          },
          target: { type: 'string' as const },
          value: { type: 'string' as const },
        },
        required: ['action', 'target'],
        additionalProperties: false,
      },
    },
    done: { type: 'boolean' as const },
  },
  required: ['actions', 'done'],
  additionalProperties: false,
};

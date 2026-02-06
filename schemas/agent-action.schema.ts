/**
 * JSON Schema for AgentAction[] — used with structured output
 * (Ollama `format`, OpenAI `response_format`)
 */
export const agentActionArraySchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['CLICK', 'SET_VALUE', 'NAVIGATE', 'TAP'],
      },
      target: { type: 'string' },
      value: { type: 'string' },
    },
    required: ['action', 'target'],
  },
};

/**
 * JSON Schema for AgentStep — used in agentic loop mode
 * The LLM returns {actions, done, reasoning}
 */
export const agentStepSchema = {
  type: 'object',
  properties: {
    actions: agentActionArraySchema,
    done: { type: 'boolean' },
    reasoning: { type: 'string' },
  },
  required: ['actions', 'done'],
};

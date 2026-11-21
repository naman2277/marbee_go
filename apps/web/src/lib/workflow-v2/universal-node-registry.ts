/**
 * Defines retry policies for nodes.
 */
export type RetryPolicy = {
  maxAttempts: number;
  strategy: 'fixed' | 'linear' | 'exponential' | 'exponential_with_jitter';
  initialDelayMs: number;
  maxDelayMs: number;
  retryableErrors?: string[];
};

/**
 * Defines the capabilities of a node.
 */
export type NodeCapabilities = {
  canPreview: boolean;
  canEstimateCost: boolean;
  hasCompensation: boolean;
  hasSideEffects: boolean;
  isAsync: boolean;
};

/**
 * Definition of a node type.
 */
export type NodeDefinition = {
  type: string;
  version: string;
  displayName: string;
  description: string;
  category: 'trigger' | 'source' | 'transform' | 'action' | 'flow' | 'output';
  icon?: string;
  color?: string;
  retryPolicy: RetryPolicy;
  capabilities: NodeCapabilities;
};

/**
 * Defines schema using a simplified JSON-Schema style.
 */
export type NodeSchema = {
  type: 'object';
  properties: Record<string, {
    type: string;
    description?: string;
    required?: boolean;
    default?: unknown;
    enum?: unknown[];
  }>;
  required?: string[];
};

/**
 * The output result from a node execution.
 */
export type NodeResult = {
  status: 'succeeded' | 'failed' | 'waiting';
  output?: Record<string, unknown>;
  error?: {
    code: string;
    category: string;
    message: string;
    userMessage: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
  waitCondition?: {
    type: 'duration' | 'datetime' | 'approval' | 'webhook' | 'sub_workflow';
    config: Record<string, unknown>;
  };
};

/**
 * Full registration object for a node, containing metadata and execution logic.
 */
export type RegisteredNode = {
  definition: NodeDefinition;
  inputSchema: NodeSchema;
  outputSchema: NodeSchema;
  configSchema: NodeSchema;
  execute: (input: Record<string, unknown>, context: Record<string, unknown>) => Promise<NodeResult>;
  validate?: (config: Record<string, unknown>) => Array<{ code: string; message: string }>;
  preview?: (config: Record<string, unknown>, context: Record<string, unknown>) => Promise<NodeResult>;
};

/**
 * The Universal Node Registry.
 * Every node type in the platform is registered here with its definition,
 * schemas, and executor function.
 */
export class NodeRegistry {
  private nodes = new Map<string, RegisteredNode>();

  /**
   * Register a node type.
   * @param node - The node registration payload.
   */
  register(node: RegisteredNode): void {
    if (this.nodes.has(node.definition.type)) {
      console.warn(`Node type ${node.definition.type} is already registered. Overwriting.`);
    }
    this.nodes.set(node.definition.type, node);
  }

  /**
   * Get a registered node by type.
   * @param type - The node type ID.
   * @returns The registered node, or undefined if not found.
   */
  get(type: string): RegisteredNode | undefined {
    return this.nodes.get(type);
  }

  /**
   * Alias for get(type).
   */
  getNode(type: string): RegisteredNode | undefined {
    return this.get(type);
  }

  /**
   * Check if a node type is registered.
   * @param type - The node type ID.
   * @returns True if registered, false otherwise.
   */
  has(type: string): boolean {
    return this.nodes.has(type);
  }

  /**
   * Get all registered node types.
   * @returns Array of registered nodes.
   */
  getAll(): RegisteredNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get all node definitions (for UI catalog).
   * @returns Array of node definitions.
   */
  getDefinitions(): NodeDefinition[] {
    return this.getAll().map((n) => n.definition);
  }

  /**
   * Validate node configuration.
   * @param type - The node type ID.
   * @param config - The configuration to validate.
   * @returns Array of validation errors.
   */
  validateConfig(type: string, config: Record<string, unknown>): Array<{ code: string; message: string }> {
    const node = this.get(type);
    if (!node) {
      return [{ code: 'NODE_NOT_FOUND', message: `Node type ${type} not found` }];
    }
    if (node.validate) {
      return node.validate(config);
    }
    return [];
  }
}

export const nodeRegistry = new NodeRegistry();

// -----------------------------------------------------------------------------
// HELPER FOR SSRF
// -----------------------------------------------------------------------------
function isSafeHttpUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    
    const hostname = url.hostname;
    
    // Disallow local and private IPs
    const privateIpRegex = /^(?:127\.\d{1,3}\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|0\.\d{1,3}\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3})$/;
    if (privateIpRegex.test(hostname)) {
      return false;
    }
    
    if (hostname.toLowerCase() === 'localhost') {
      return false;
    }
    
    // Basic IPv6 restrictions for common local scopes
    if (hostname.includes('[') && (hostname.includes('[::1]') || hostname.includes('[fd') || hostname.includes('[fc'))) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------------
// CORE NODE REGISTRATIONS
// -----------------------------------------------------------------------------

// 1. Manual Trigger
nodeRegistry.register({
  definition: {
    type: 'trigger.manual',
    version: '1.0.0',
    displayName: 'Manual Trigger',
    description: 'Trigger workflow manually',
    category: 'trigger',
    retryPolicy: { maxAttempts: 0, strategy: 'fixed', initialDelayMs: 0, maxDelayMs: 0 },
    capabilities: { canPreview: false, canEstimateCost: false, hasCompensation: false, hasSideEffects: false, isAsync: false },
  },
  inputSchema: { type: 'object', properties: {} },
  outputSchema: { type: 'object', properties: {} },
  configSchema: { type: 'object', properties: {} },
  execute: async (input) => ({ status: 'succeeded', output: { ...input } }),
});

// 2. Schedule Trigger
nodeRegistry.register({
  definition: {
    type: 'trigger.schedule',
    version: '1.0.0',
    displayName: 'Schedule Trigger',
    description: 'Trigger workflow on a schedule',
    category: 'trigger',
    retryPolicy: { maxAttempts: 0, strategy: 'fixed', initialDelayMs: 0, maxDelayMs: 0 },
    capabilities: { canPreview: false, canEstimateCost: false, hasCompensation: false, hasSideEffects: false, isAsync: false },
  },
  inputSchema: { type: 'object', properties: {} },
  outputSchema: { type: 'object', properties: {} },
  configSchema: { type: 'object', properties: { cron: { type: 'string' } } },
  execute: async (input) => ({ status: 'succeeded', output: { timestamp: new Date().toISOString(), ...input } }),
});

// 3. Wait
nodeRegistry.register({
  definition: {
    type: 'flow.wait',
    version: '1.0.0',
    displayName: 'Wait',
    description: 'Pause execution for a duration or until a date',
    category: 'flow',
    retryPolicy: { maxAttempts: 0, strategy: 'fixed', initialDelayMs: 0, maxDelayMs: 0 },
    capabilities: { canPreview: false, canEstimateCost: false, hasCompensation: false, hasSideEffects: false, isAsync: true },
  },
  inputSchema: { type: 'object', properties: { waitType: { type: 'string' }, durationMs: { type: 'number' }, datetime: { type: 'string' } } },
  outputSchema: { type: 'object', properties: {} },
  configSchema: { type: 'object', properties: {} },
  execute: async (input) => {
    return {
      status: 'waiting',
      waitCondition: {
        type: input.waitType === 'datetime' ? 'datetime' : 'duration',
        config: {
          durationMs: input.durationMs,
          datetime: input.datetime,
        },
      },
    };
  },
});

// 4. Transform (Map)
nodeRegistry.register({
  definition: {
    type: 'transform.map',
    version: '1.0.0',
    displayName: 'Transform Data',
    description: 'Map or transform input data',
    category: 'transform',
    retryPolicy: { maxAttempts: 3, strategy: 'exponential', initialDelayMs: 1000, maxDelayMs: 10000 },
    capabilities: { canPreview: true, canEstimateCost: false, hasCompensation: false, hasSideEffects: false, isAsync: false },
  },
  inputSchema: { type: 'object', properties: {} },
  outputSchema: { type: 'object', properties: {} },
  configSchema: { type: 'object', properties: {} },
  execute: async (input) => {
    // Basic pass-through for placeholder
    return { status: 'succeeded', output: { transformed: input } };
  },
});

// 5. Condition
nodeRegistry.register({
  definition: {
    type: 'flow.condition',
    version: '1.0.0',
    displayName: 'Condition',
    description: 'Branch based on condition',
    category: 'flow',
    retryPolicy: { maxAttempts: 0, strategy: 'fixed', initialDelayMs: 0, maxDelayMs: 0 },
    capabilities: { canPreview: true, canEstimateCost: false, hasCompensation: false, hasSideEffects: false, isAsync: false },
  },
  inputSchema: { type: 'object', properties: { conditionResult: { type: 'boolean' } } },
  outputSchema: { type: 'object', properties: {} },
  configSchema: { type: 'object', properties: {} },
  execute: async (input) => {
    const matched = Boolean(input.conditionResult);
    return { status: 'succeeded', output: { branch: matched ? 'true' : 'false' } };
  },
});

// 6. HTTP Request
nodeRegistry.register({
  definition: {
    type: 'action.http_request',
    version: '1.0.0',
    displayName: 'HTTP Request',
    description: 'Make an outgoing HTTP request safely',
    category: 'action',
    retryPolicy: { maxAttempts: 3, strategy: 'exponential', initialDelayMs: 1000, maxDelayMs: 15000, retryableErrors: ['ETIMEDOUT', 'ECONNRESET'] },
    capabilities: { canPreview: true, canEstimateCost: false, hasCompensation: false, hasSideEffects: true, isAsync: true },
  },
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', required: true },
      method: { type: 'string', default: 'GET' },
      headers: { type: 'object' },
      body: { type: 'string' }
    }
  },
  outputSchema: { type: 'object', properties: {} },
  configSchema: { type: 'object', properties: {} },
  execute: async (input) => {
    const url = input.url as string;
    if (!url || !isSafeHttpUrl(url)) {
      return {
        status: 'failed',
        error: {
          code: 'SSRF_BLOCKED',
          category: 'SECURITY',
          message: 'Target URL is blocked by SSRF policy.',
          userMessage: 'The provided URL is not allowed (e.g. localhost, private IP, or non-http/https).',
          retryable: false,
        }
      };
    }

    try {
      // Create abort controller for 30s timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(url, {
        method: (input.method as string) || 'GET',
        headers: (input.headers as Record<string, string>) || {},
        body: input.body ? (input.body as string) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Check content length to respect 10MB limit (approximate without reading body)
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > 10 * 1024 * 1024) {
         return {
          status: 'failed',
          error: { code: 'RESPONSE_TOO_LARGE', category: 'SYSTEM', message: 'Response exceeds 10MB limit', userMessage: 'The server response is too large.', retryable: false }
        };
      }

      const text = await response.text();
      // Validate string length (fallback check if no header provided)
      if (text.length > 10 * 1024 * 1024) {
         return {
          status: 'failed',
          error: { code: 'RESPONSE_TOO_LARGE', category: 'SYSTEM', message: 'Response exceeds 10MB limit', userMessage: 'The server response is too large.', retryable: false }
        };
      }

      let data: unknown = text;
      if (response.headers.get('content-type')?.includes('application/json')) {
        try {
          data = JSON.parse(text);
        } catch {
          // Keep as text if it fails to parse
        }
      }

      return {
        status: 'succeeded',
        output: {
          statusCode: response.status,
          data,
          headers: Object.fromEntries(response.headers.entries()),
        }
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return {
          status: 'failed',
          error: { code: 'TIMEOUT', category: 'TIMEOUT', message: 'Request timed out after 30s', userMessage: 'The HTTP request timed out.', retryable: true }
        };
      }
      return {
        status: 'failed',
        error: { code: 'HTTP_ERROR', category: 'EXTERNAL_SERVICE', message: err.message, userMessage: 'The HTTP request failed.', retryable: true }
      };
    }
  },
});

// 7. Segment
nodeRegistry.register({
  definition: {
    type: 'source.segment',
    version: '1.0.0',
    displayName: 'Segment Event',
    description: 'Triggered by a Segment event',
    category: 'source',
    retryPolicy: { maxAttempts: 0, strategy: 'fixed', initialDelayMs: 0, maxDelayMs: 0 },
    capabilities: { canPreview: false, canEstimateCost: false, hasCompensation: false, hasSideEffects: false, isAsync: false },
  },
  inputSchema: { type: 'object', properties: {} },
  outputSchema: { type: 'object', properties: {} },
  configSchema: { type: 'object', properties: {} },
  execute: async (input) => ({ status: 'succeeded', output: { segmentEvent: input } }),
});

// 8. Email Send
nodeRegistry.register({
  definition: {
    type: 'action.email',
    version: '1.0.0',
    displayName: 'Send Email',
    description: 'Send an email notification',
    category: 'action',
    retryPolicy: { maxAttempts: 3, strategy: 'exponential', initialDelayMs: 2000, maxDelayMs: 30000 },
    capabilities: { canPreview: true, canEstimateCost: false, hasCompensation: false, hasSideEffects: true, isAsync: false },
  },
  inputSchema: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } } },
  outputSchema: { type: 'object', properties: {} },
  configSchema: { type: 'object', properties: {} },
  execute: async (input) => ({ status: 'succeeded', output: { delivered: true, to: input.to } }),
});

// 9. Webhook
nodeRegistry.register({
  definition: {
    type: 'action.webhook',
    version: '1.0.0',
    displayName: 'Webhook',
    description: 'Trigger a webhook externally',
    category: 'action',
    retryPolicy: { maxAttempts: 3, strategy: 'exponential', initialDelayMs: 1000, maxDelayMs: 30000 },
    capabilities: { canPreview: false, canEstimateCost: false, hasCompensation: false, hasSideEffects: true, isAsync: true },
  },
  inputSchema: { type: 'object', properties: {} },
  outputSchema: { type: 'object', properties: {} },
  configSchema: { type: 'object', properties: {} },
  execute: async (_input) => ({ status: 'succeeded', output: { dispatched: true } }),
});

// 10. Approval
nodeRegistry.register({
  definition: {
    type: 'flow.approval',
    version: '1.0.0',
    displayName: 'Approval',
    description: 'Wait for human approval',
    category: 'flow',
    retryPolicy: { maxAttempts: 0, strategy: 'fixed', initialDelayMs: 0, maxDelayMs: 0 },
    capabilities: { canPreview: false, canEstimateCost: false, hasCompensation: false, hasSideEffects: false, isAsync: true },
  },
  inputSchema: { type: 'object', properties: { approverId: { type: 'string' } } },
  outputSchema: { type: 'object', properties: {} },
  configSchema: { type: 'object', properties: {} },
  execute: async (input) => {
    return {
      status: 'waiting',
      waitCondition: {
        type: 'approval',
        config: {
          approverId: input.approverId,
        },
      },
    };
  },
});

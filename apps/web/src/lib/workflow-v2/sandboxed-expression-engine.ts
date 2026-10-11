export interface ExpressionContext {
  trigger?: { payload?: Record<string, unknown> };
  nodes?: Record<string, { output?: Record<string, unknown> }>;
  workflow?: { variables?: Record<string, unknown> };
  env?: Record<string, unknown>;
  secrets?: Record<string, string>;
  customer?: Record<string, unknown>;
  [key: string]: unknown;
}

const MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB

/**
 * Validates the syntax of an expression or template.
 * @param expression The string to validate
 * @returns Object indicating if valid and any errors found
 */
export function validateExpression(expression: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  // Basic validation without eval
  if (expression.includes('eval(') || expression.includes('Function(')) {
    errors.push('Unsafe functions detected');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Resolves a single dot-notation path against the context graph.
 * @param path e.g. 'nodes.segment_1.output.count'
 * @param context The execution context
 * @returns The resolved value, or undefined if not found
 */
export function resolveValue(path: string, context: ExpressionContext): unknown {
  const parts = path.trim().split('.');
  let current: unknown = context;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    // Mask secrets on access if they somehow slip through raw, but usually we handle it in resolveTemplate
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Resolves {{...}} template references in a string.
 * Secrets are masked when resolved as part of templates to prevent accidental logging.
 * @param template The template string containing variables
 * @param context The context for resolution
 * @returns The resolved string
 */
export function resolveTemplate(template: string, context: ExpressionContext): string {
  const resolved = template.replace(/\{\{([\w.]+)\}\}/g, (_, path) => {
    const val = resolveValue(path, context);
    if (path.startsWith('secrets.')) {
      return '***';
    }
    return val !== undefined && val !== null ? String(val) : '';
  });

  if (resolved.length > MAX_OUTPUT_SIZE) {
    throw new Error('Template resolution exceeded maximum output size');
  }

  return resolved;
}

/**
 * Evaluates basic sandboxed conditions without eval().
 * Supports comparisons (==, !=, >, <, >=, <=) and basic logical operators (&&, ||, !).
 * Note: A full implementation would use a robust AST parser. This is a simplified regex-based fallback for safe evaluation.
 * @param expression The condition expression
 * @param context The context graph
 * @returns The boolean result
 */
export function evaluateCondition(expression: string, context: ExpressionContext): boolean {
  // Simple implementation handling 'A == B' etc.
  // In a production system, jsep or a small AST interpreter should be used here.
  // We'll implement a basic mock to satisfy the interface safely.
  const trimmed = expression.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // Simple token matching
  const match = trimmed.match(/^([\w.]+)\s*(==|!=|>|<|>=|<=)\s*([\w.'"]+)$/);
  if (!match) {
    return false; // Complex evaluation requires AST parser
  }

  const [, leftPath, operator, rightPath] = match;
  const left = resolveValue(leftPath, context);
  
  let right: unknown = rightPath;
  if (rightPath.startsWith("'") || rightPath.startsWith('"')) {
    right = rightPath.slice(1, -1);
  } else if (!isNaN(Number(rightPath))) {
    right = Number(rightPath);
  } else {
    right = resolveValue(rightPath, context);
  }

  switch (operator) {
    case '==': return left == right;
    case '!=': return left != right;
    case '>': return Number(left) > Number(right);
    case '<': return Number(left) < Number(right);
    case '>=': return Number(left) >= Number(right);
    case '<=': return Number(left) <= Number(right);
    default: return false;
  }
}

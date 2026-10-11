export type ErrorCategory = 'VALIDATION' | 'CONFIGURATION' | 'AUTHENTICATION' | 'AUTHORISATION' | 'TIMEOUT' | 'RATE_LIMIT' | 'TRANSIENT' | 'EXTERNAL_SERVICE' | 'DATA' | 'SYSTEM' | 'USER_ACTION_REQUIRED';

export interface WorkflowErrorData {
  code: string;
  category: ErrorCategory;
  message: string;
  userMessage: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

/** Non-retryable error categories */
const NON_RETRYABLE: ErrorCategory[] = ['VALIDATION', 'CONFIGURATION', 'AUTHENTICATION', 'AUTHORISATION'];

/**
 * Structured error class for the workflow engine.
 * Every failure produces a WorkflowError with a machine-readable code,
 * a human-readable message, and classification for retry decisions.
 */
export class WorkflowError extends Error {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly userMessage: string;
  readonly retryable: boolean;
  readonly details: Record<string, unknown>;

  constructor(data: WorkflowErrorData) {
    super(data.message);
    this.name = 'WorkflowError';
    this.code = data.code;
    this.category = data.category;
    this.userMessage = data.userMessage;
    this.retryable = data.retryable;
    this.details = data.details ?? {};
  }

  toJSON(): WorkflowErrorData {
    return {
      code: this.code,
      category: this.category,
      message: this.message,
      userMessage: this.userMessage,
      retryable: this.retryable,
      details: this.details,
    };
  }

  static fromUnknown(err: unknown): WorkflowError {
    if (err instanceof WorkflowError) return err;
    const message = err instanceof Error ? err.message : String(err);
    return new WorkflowError({
      code: 'UNKNOWN_ERROR',
      category: 'SYSTEM',
      message,
      userMessage: 'An unexpected error occurred.',
      retryable: true,
    });
  }

  /** Create validation error */
  static validation(code: string, message: string, details?: Record<string, unknown>): WorkflowError {
    return new WorkflowError({ code, category: 'VALIDATION', message, userMessage: message, retryable: false, details });
  }

  /** Create configuration error */
  static configuration(code: string, message: string, details?: Record<string, unknown>): WorkflowError {
    return new WorkflowError({ code, category: 'CONFIGURATION', message, userMessage: message, retryable: false, details });
  }

  /** Create transient/retryable error */
  static transient(code: string, message: string, details?: Record<string, unknown>): WorkflowError {
    return new WorkflowError({ code, category: 'TRANSIENT', message, userMessage: 'A temporary error occurred. Retrying...', retryable: true, details });
  }

  /** Create timeout error */
  static timeout(code: string, message: string, details?: Record<string, unknown>): WorkflowError {
    return new WorkflowError({ code, category: 'TIMEOUT', message, userMessage: 'The operation timed out.', retryable: true, details });
  }

  /** Create rate limit error */
  static rateLimit(code: string, message: string, details?: Record<string, unknown>): WorkflowError {
    return new WorkflowError({ code, category: 'RATE_LIMIT', message, userMessage: 'Rate limit exceeded. Will retry after cooldown.', retryable: true, details });
  }

  /** Create external service error */
  static externalService(code: string, message: string, retryable = true, details?: Record<string, unknown>): WorkflowError {
    return new WorkflowError({ code, category: 'EXTERNAL_SERVICE', message, userMessage: 'An external service error occurred.', retryable, details });
  }

  /** Create system error */
  static system(code: string, message: string, details?: Record<string, unknown>): WorkflowError {
    return new WorkflowError({ code, category: 'SYSTEM', message, userMessage: 'An internal system error occurred.', retryable: true, details });
  }

  /** Check if an error category is retryable */
  static isRetryable(category: ErrorCategory): boolean {
    return !NON_RETRYABLE.includes(category);
  }
}

export type WorkflowLogLevel = 'info' | 'success' | 'warning' | 'error';

export type WorkflowLogEntry = {
  id: string;
  at: string;
  level: WorkflowLogLevel;
  activity?: string;
  message: string;
  detail?: string;
};

export function createLogEntry(
  level: WorkflowLogLevel,
  message: string,
  activity?: string,
  detail?: string,
): WorkflowLogEntry {
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    level,
    activity,
    message,
    detail,
  };
}

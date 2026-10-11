export type WorkflowErrorHelp = {
  title: string;
  summary: string;
  steps: string[];
};

export type WorkflowErrorContext = {
  message: string;
  detail?: string;
  activity?: string;
  level?: 'info' | 'success' | 'warning' | 'error';
};

type HelpRule = {
  test: (ctx: WorkflowErrorContext) => boolean;
  help: WorkflowErrorHelp;
};

const HELP_RULES: HelpRule[] = [
  {
    test: ({ message }) => /waiting for upstream/i.test(message),
    help: {
      title: 'Complete upstream activities first',
      summary: 'This step is blocked because a previous activity in the thread has not finished yet.',
      steps: [
        'Open the Logs panel and find which upstream activity is listed.',
        'Select that activity on the canvas and run it, or click Start to run the workflow in order.',
        'Confirm the thread line connects from the upstream activity’s right dot to this activity’s left dot.',
      ],
    },
  },
  {
    test: ({ message }) => /no incoming connection|needs an incoming connection|has no incoming thread/i.test(message),
    help: {
      title: 'Connect an upstream activity',
      summary: 'Non-source activities must receive population from an upstream step via a canvas thread.',
      steps: [
        'Drag from the right connection dot of the upstream activity (Query, Audience, etc.).',
        'Drop onto the left dot of this activity.',
        'Run the upstream query or list activity first so population data exists.',
      ],
    },
  },
  {
    test: ({ message }) => /must connect to the next activity|has no outgoing thread|not connected/i.test(message),
    help: {
      title: 'Connect to the next activity',
      summary: 'Every activity in the workflow chain needs an outgoing thread to the next step.',
      steps: [
        'Drag from this activity’s right dot to the next activity’s left dot.',
        'Query and list activities must feed into at least one downstream step.',
        'Use Auto layout if threads are hard to see.',
      ],
    },
  },
  {
    test: ({ message }) => /both branch paths|needs both branch/i.test(message),
    help: {
      title: 'Wire both decision branches',
      summary: 'Split and decision activities require every output branch to be connected.',
      steps: [
        'Identify each branch handle on the decision node.',
        'Connect each branch to a downstream activity or exit path.',
        'Validate the workflow again after both paths are wired.',
      ],
    },
  },
  {
    test: ({ message }) => /add a query|add an email|add at least one channel|canvas is empty/i.test(message),
    help: {
      title: 'Complete the workflow structure',
      summary: 'The campaign needs a source activity and at least one delivery step.',
      steps: [
        'Drag a Query or Read list activity from the palette to start the population.',
        'Add an Email, SMS, or other delivery activity downstream.',
        'Connect activities left-to-right with canvas threads.',
      ],
    },
  },
  {
    test: ({ message, detail }) =>
      /delivery prep failed|delivery send failed|delivery deployment failed/i.test(message + (detail ?? '')),
    help: {
      title: 'Fix delivery configuration',
      summary: 'The delivery step could not prepare or send messages.',
      steps: [
        'Open the delivery activity and confirm a channel account is selected under Sending account.',
        'Ensure message content and subject/body are filled in.',
        'Verify an upstream query has run and returned at least one profile.',
        'Check the Logs panel for the specific API or provider error message.',
      ],
    },
  },
  {
    test: ({ message, detail }) => /workflow blocked|workflow stalled|cannot continue/i.test(message + (detail ?? '')),
    help: {
      title: 'Unblock the workflow',
      summary: 'One or more activities still cannot run — resolve each blocker listed in the logs.',
      steps: [
        'Read each red Workflow blocked line in the Events log.',
        'Fix connections, configuration, or run upstream activities as described.',
        'Click Reset workflow if you need a clean run, then Start again.',
      ],
    },
  },
  {
    test: ({ message, detail }) => /cannot run yet/i.test(detail ?? '') || /already completed/i.test(message),
    help: {
      title: 'Activity not runnable',
      summary: 'This activity is either done or waiting on prerequisites.',
      steps: [
        'If already completed, select the next downstream activity or reset the workflow.',
        'If waiting on upstream, run upstream activities first.',
        'Check the Properties tab for missing required configuration.',
      ],
    },
  },
  {
    test: ({ message, detail }) =>
      /schema|audience|filter|query source|targeting dimension|segment code/i.test(message + (detail ?? '')),
    help: {
      title: 'Fix query configuration',
      summary: 'The query activity is missing required setup.',
      steps: [
        'Open the Query activity Properties tab.',
        'Choose a database schema or saved audience under Target selection.',
        'Click Edit query… to define filters, or Add data… for work-table columns.',
        'Set the targeting dimension (primary key) under the Advanced tab.',
      ],
    },
  },
  {
    test: ({ message, detail }) =>
      /channel provider|template|content_template|delivery_name/i.test(message + (detail ?? '')),
    help: {
      title: 'Complete delivery setup',
      summary: 'Required delivery fields are missing or invalid.',
      steps: [
        'Set a delivery name and choose a sending account in Channels settings.',
        'Add message content or load from a published template.',
        'Confirm the upstream query has produced a population to send to.',
      ],
    },
  },
  {
    test: ({ message, detail }) =>
      /permission denied|permission|access|delete is disabled/i.test(message + (detail ?? '')),
    help: {
      title: 'Insufficient permissions',
      summary: 'Your role or instance access does not allow this action.',
      steps: [
        'Ask a workspace admin to grant the required role permission.',
        'For delete actions, ensure Delete is enabled for your account in this environment.',
        'Go to Settings → Access management to review your role and instance access.',
      ],
    },
  },
  {
    test: ({ detail }) => detail === 'Activity validation',
    help: {
      title: 'Fix activity validation errors',
      summary: 'Configuration or connections for this activity are incomplete.',
      steps: [
        'Read the error message above for the specific issue.',
        'Open the activity Properties tab and complete required fields.',
        'Ensure canvas threads connect this activity to its upstream and downstream steps.',
      ],
    },
  },
  {
    test: ({ detail }) => detail === 'Campaign validation',
    help: {
      title: 'Fix campaign validation',
      summary: 'The workflow structure does not meet requirements to run.',
      steps: [
        'Click Validate on the toolbar to list all issues.',
        'Add missing activities and connect threads between them.',
        'Resolve each issue listed, then try Start again.',
      ],
    },
  },
  {
    test: ({ detail }) => detail === 'Step failed' || detail === 'Step execution',
    help: {
      title: 'Activity execution failed',
      summary: 'The step threw an error while running.',
      steps: [
        'Read the error message for database, API, or configuration details.',
        'Verify upstream data exists (run query activities first).',
        'Check Supabase connection and tenant/environment settings.',
        'Reset the workflow and retry after fixing the root cause.',
      ],
    },
  },
];

const DEFAULT_HELP: WorkflowErrorHelp = {
  title: 'How to fix this error',
  summary: 'Review the error message and check activity configuration, connections, and upstream data.',
  steps: [
    'Select the activity mentioned in the log and open its Properties tab.',
    'Confirm all required fields are filled and threads are connected.',
    'Run upstream activities before downstream delivery or split steps.',
    'Expand the Logs panel and resolve earlier errors first.',
    'Use Reset workflow if the run state is inconsistent, then Start again.',
  ],
};

export function resolveWorkflowErrorHelp(ctx: WorkflowErrorContext): WorkflowErrorHelp {
  for (const rule of HELP_RULES) {
    if (rule.test(ctx)) return rule.help;
  }
  return DEFAULT_HELP;
}

export function helpForValidationMessage(message: string): WorkflowErrorHelp {
  return resolveWorkflowErrorHelp({ message, level: 'error', detail: 'Campaign validation' });
}

export type ChannelTestCheck = {
  label: string;
  ok: boolean;
  detail?: string;
};

export type ChannelTestResult = {
  ok: boolean;
  message: string;
  latencyMs: number;
  checks: ChannelTestCheck[];
  details?: Record<string, unknown>;
};

function cleanString(val?: string): string {
  if (!val) return '';
  return val.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '').trim();
}

export async function testMailjetConnection(params: {
  apiKey: string;
  secretKey: string;
  fromEmail: string;
  fromName?: string;
  recipientEmail: string;
  sandboxMode?: string;
  customCampaign?: string;
  subject?: string;
  htmlBody?: string;
  textBody?: string;
}): Promise<ChannelTestResult> {
  const start = Date.now();
  const checks: ChannelTestCheck[] = [];

  const cleanKey = cleanString(params.apiKey);
  const cleanSecret = cleanString(params.secretKey);
  const cleanFrom = cleanString(params.fromEmail);
  const cleanFromName = cleanString(params.fromName) || 'Marbee';
  const cleanTo = cleanString(params.recipientEmail);
  const isSandbox = params.sandboxMode === 'true';
  const cleanCampaign = cleanString(params.customCampaign) || 'Marbee-Campaign';
  const cleanSubject = params.subject?.trim() || 'Marbee Test Email - Mailjet Connection Successful 🎉';
  const cleanHtml =
    params.htmlBody?.trim() ||
    `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
            <h2 style="color: #0284c7; margin: 0; font-size: 20px;">Mailjet Connected Successfully 🎉</h2>
          </div>
          <p style="color: #334155; font-size: 14px; line-height: 1.6;">
            This test message confirms that your <strong>Mailjet Send API v3.1</strong> credentials and sender address (<code>${cleanFrom}</code>) are authenticated and functioning properly in Marbee.
          </p>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 16px; margin: 20px 0; font-size: 12px; color: #475569;">
            <p style="margin: 0 0 4px 0;"><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
            <p style="margin: 0 0 4px 0;"><strong>Sender:</strong> ${cleanFrom}</p>
            <p style="margin: 0;"><strong>Sandbox Mode:</strong> ${isSandbox ? 'Enabled' : 'Disabled (Live Send)'}</p>
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 11px; color: #94a3b8; margin: 0;">
            Sent from Marbee Marketing Cloud · Mailjet Send API v3.1
          </p>
        </div>
      `;
  const cleanText =
    params.textBody?.trim() ||
    'Congratulations! Your Mailjet email account is connected and ready to send emails from Marbee.';

  // Check 1: Credentials present
  if (!cleanKey || !cleanSecret) {
    return {
      ok: false,
      message: 'Mailjet API Key and Secret Key are required to authenticate with Mailjet.',
      latencyMs: Date.now() - start,
      checks: [
        { label: 'API Credentials check', ok: false, detail: 'API Key or Secret Key is missing' },
      ],
    };
  }
  checks.push({ label: 'API Credentials format', ok: true, detail: 'API Key & Secret formatted' });

  // Check 2: Sender email format
  if (!cleanFrom || !cleanFrom.includes('@')) {
    return {
      ok: false,
      message: 'A valid Verified Sender Email is required (e.g. sender configured in Mailjet).',
      latencyMs: Date.now() - start,
      checks: [
        ...checks,
        { label: 'Sender Email format', ok: false, detail: 'Invalid sender email address' },
      ],
    };
  }
  checks.push({ label: 'Sender Email format', ok: true, detail: `From: ${cleanFrom}` });

  // Check 3: Recipient email
  if (!cleanTo || !cleanTo.includes('@')) {
    return {
      ok: false,
      message: 'Please provide a valid recipient email address to receive the test message.',
      latencyMs: Date.now() - start,
      checks: [
        ...checks,
        { label: 'Recipient Email check', ok: false, detail: 'Invalid test recipient' },
      ],
    };
  }
  checks.push({ label: 'Recipient Email check', ok: true, detail: `To: ${cleanTo}` });

  let authHeader = '';
  try {
    authHeader = `Basic ${btoa(`${cleanKey}:${cleanSecret}`)}`;
  } catch (err: any) {
    return {
      ok: false,
      message: 'Could not encode API credentials. Please ensure they contain valid ASCII characters.',
      latencyMs: Date.now() - start,
      checks: [
        ...checks,
        { label: 'Credentials encoding', ok: false, detail: err?.message || 'Encoding failed' },
      ],
    };
  }

  try {
    const messageObject: Record<string, unknown> = {
      From: {
        Email: cleanFrom,
        Name: cleanFromName,
      },
      To: [
        {
          Email: cleanTo,
          Name: 'Recipient',
        },
      ],
      Subject: cleanSubject,
      TextPart: cleanText,
      HTMLPart: cleanHtml,
      CustomCampaign: cleanCampaign,
    };

    if (isSandbox) {
      messageObject.SandboxMode = true;
    }

    const payload = {
      Messages: [messageObject],
    };

    // Route through local proxy in development to bypass browser CORS preflight
    const isLocal =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const targetUrl = isLocal ? '/mailjet-api/v3.1/send' : 'https://api.mailjet.com/v3.1/send';

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify(payload),
    });

    const latencyMs = Date.now() - start;

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      const msgResult = data?.Messages?.[0];
      const status = msgResult?.Status ?? 'success';

      if (status === 'error') {
        const errorInfo =
          msgResult?.Errors?.[0]?.ErrorMessage ||
          data?.ErrorMessage ||
          'Mailjet rejected message dispatch.';
        checks.push({ label: 'Mailjet API Dispatch', ok: false, detail: errorInfo });
        return {
          ok: false,
          message: `Mailjet returned: ${errorInfo}. Please check that "${cleanFrom}" is verified under Senders & Domains in Mailjet.`,
          latencyMs,
          checks,
          details: data,
        };
      }

      checks.push({
        label: 'Mailjet API Authentication',
        ok: true,
        detail: 'HTTP 200 OK — Authorized',
      });
      checks.push({
        label: 'Live Message Dispatch',
        ok: true,
        detail: isSandbox ? 'Sandbox validated successfully' : `Dispatched to ${cleanTo}`,
      });

      return {
        ok: true,
        message: isSandbox
          ? 'Mailjet sandbox validation passed! Payload accepted.'
          : `Test email successfully sent to ${cleanTo} via Mailjet!`,
        latencyMs,
        checks,
        details: data,
      };
    }

    // Handle HTTP error responses
    const errorBody = await response.json().catch(() => null);
    let errorMessage =
      errorBody?.Messages?.[0]?.Errors?.[0]?.ErrorMessage ||
      errorBody?.ErrorMessage ||
      errorBody?.message;

    if (!errorMessage) {
      if (response.status === 401) {
        errorMessage = 'Invalid API Key or Secret Key. Please double-check your keys from Mailjet Account Settings → REST API.';
      } else if (response.status === 403) {
        errorMessage = `Sender address "${cleanFrom}" is unverified or your Mailjet account is restricted.`;
      } else {
        errorMessage = `Mailjet API returned HTTP ${response.status}.`;
      }
    }

    checks.push({
      label: 'Mailjet API Status',
      ok: false,
      detail: `HTTP ${response.status}: ${errorMessage}`,
    });

    return {
      ok: false,
      message: errorMessage,
      latencyMs,
      checks,
      details: errorBody ?? undefined,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const msg = err?.message || 'Network error';
    checks.push({
      label: 'Network Connection',
      ok: false,
      detail: msg,
    });

    return {
      ok: false,
      message: `Failed to connect: ${msg}. If testing locally, ensure your dev server is running with the proxy.`,
      latencyMs,
      checks,
    };
  }
}

export async function testResendConnection(params: {
  apiKey: string;
  fromEmail: string;
  fromName?: string;
  replyTo?: string;
  recipientEmail: string;
  tags?: string;
  useBatchEndpoint?: boolean;
  subject?: string;
  htmlBody?: string;
  textBody?: string;
}): Promise<ChannelTestResult> {
  const start = Date.now();
  const checks: ChannelTestCheck[] = [];

  const cleanKey = cleanString(params.apiKey);
  const cleanFrom = cleanString(params.fromEmail);
  const cleanFromName = cleanString(params.fromName) || 'Marbee';
  const cleanReplyTo = cleanString(params.replyTo);
  const cleanTo = cleanString(params.recipientEmail);
  const cleanTag = cleanString(params.tags);
  const useBatch = Boolean(params.useBatchEndpoint);
  const cleanSubject = params.subject?.trim() || 'Marbee Test Email - Resend Connection Successful 🎉';
  const cleanHtml =
    params.htmlBody?.trim() ||
    `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
            <h2 style="color: #000000; margin: 0; font-size: 20px;">Resend Connected Successfully 🎉</h2>
          </div>
          <p style="color: #334155; font-size: 14px; line-height: 1.6;">
            This test message confirms that your <strong>Resend API</strong> credentials and sender address (<code>${cleanFrom}</code>) are authenticated and functioning properly in Marbee.
          </p>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 16px; margin: 20px 0; font-size: 12px; color: #475569;">
            <p style="margin: 0 0 4px 0;"><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
            <p style="margin: 0 0 4px 0;"><strong>Sender:</strong> ${cleanFromName ? `${cleanFromName} <${cleanFrom}>` : cleanFrom}</p>
            <p style="margin: 0 0 4px 0;"><strong>Mode:</strong> ${useBatch ? 'Batch Send API (Bulk Mode)' : 'Standard Email API'}</p>
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 11px; color: #94a3b8; margin: 0;">
            Sent from Marbee Marketing Cloud · Resend API
          </p>
        </div>
      `;
  const cleanText =
    params.textBody?.trim() ||
    'Congratulations! Your Resend email account is connected and ready to send emails from Marbee.';

  // Check 1: API Key present
  if (!cleanKey) {
    return {
      ok: false,
      message: 'Resend API Key is required (starts with re_).',
      latencyMs: Date.now() - start,
      checks: [
        { label: 'Resend API Key check', ok: false, detail: 'API key is missing' },
      ],
    };
  }
  checks.push({
    label: 'Resend API Key format',
    ok: true,
    detail: cleanKey.startsWith('re_') ? 'Valid re_ key format' : 'Key provided',
  });

  // Check 2: Sender email format
  if (!cleanFrom || !cleanFrom.includes('@')) {
    return {
      ok: false,
      message: 'A valid Verified Sender Email is required (e.g. onboarding@resend.dev or your domain).',
      latencyMs: Date.now() - start,
      checks: [
        ...checks,
        { label: 'Sender Email format', ok: false, detail: 'Invalid sender email' },
      ],
    };
  }
  checks.push({ label: 'Sender Email format', ok: true, detail: `From: ${cleanFrom}` });

  // Check 3: Recipient email
  if (!cleanTo || !cleanTo.includes('@')) {
    return {
      ok: false,
      message: 'Please provide a valid recipient email address to receive the test email.',
      latencyMs: Date.now() - start,
      checks: [
        ...checks,
        { label: 'Recipient Email check', ok: false, detail: 'Invalid test recipient' },
      ],
    };
  }
  checks.push({ label: 'Recipient Email check', ok: true, detail: `To: ${cleanTo}` });

  try {
    const formattedFrom = cleanFromName ? `${cleanFromName} <${cleanFrom}>` : cleanFrom;
    const emailBody = {
      from: formattedFrom,
      to: [cleanTo],
      subject: cleanSubject,
      text: cleanText,
      html: cleanHtml,
      ...(cleanReplyTo ? { reply_to: cleanReplyTo } : {}),
      ...(cleanTag ? { tags: [{ name: 'category', value: cleanTag }] } : {}),
    };

    const isLocal =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    const targetUrl = isLocal
      ? useBatch
        ? '/resend-api/emails/batch'
        : '/resend-api/emails'
      : useBatch
      ? 'https://api.resend.com/emails/batch'
      : 'https://api.resend.com/emails';

    const payload = useBatch ? [emailBody] : emailBody;

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cleanKey}`,
      },
      body: JSON.stringify(payload),
    });

    const latencyMs = Date.now() - start;

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      const emailId = Array.isArray(data?.data) ? data.data[0]?.id : data?.id;

      checks.push({
        label: 'Resend API Authentication',
        ok: true,
        detail: 'HTTP 200 OK — Bearer Authorized',
      });
      checks.push({
        label: 'Live Message Dispatch',
        ok: true,
        detail: emailId ? `Dispatched (ID: ${emailId})` : `Dispatched to ${cleanTo}`,
      });

      return {
        ok: true,
        message: `Test email successfully sent to ${cleanTo} via Resend! (ID: ${emailId || 'OK'})`,
        latencyMs,
        checks,
        details: data,
      };
    }

    // Handle HTTP error responses
    const errorBody = await response.json().catch(() => null);
    let errorMessage =
      errorBody?.message ||
      errorBody?.error?.message ||
      errorBody?.name;

    if (!errorMessage) {
      if (response.status === 401 || response.status === 403) {
        errorMessage = 'Invalid Resend API Key. Please verify your key at resend.com/api-keys.';
      } else if (response.status === 422) {
        errorMessage = `Unverified domain: "${cleanFrom}". To test freely, use "onboarding@resend.dev" or verify your domain at resend.com/domains.`;
      } else {
        errorMessage = `Resend API returned HTTP ${response.status}.`;
      }
    }

    checks.push({
      label: 'Resend API Status',
      ok: false,
      detail: `HTTP ${response.status}: ${errorMessage}`,
    });

    return {
      ok: false,
      message: errorMessage,
      latencyMs,
      checks,
      details: errorBody ?? undefined,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const msg = err?.message || 'Network error';
    checks.push({
      label: 'Network Connection',
      ok: false,
      detail: msg,
    });

    return {
      ok: false,
      message: `Failed to connect: ${msg}. If testing locally, ensure your dev server is running with the proxy.`,
      latencyMs,
      checks,
    };
  }
}

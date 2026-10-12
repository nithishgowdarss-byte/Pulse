// src/lib/errors.ts

export const ERROR_CODES: Record<string, string> = {
  AUTH_SESSION_MISSING: 'Session expired — please sign in again',
  FORBIDDEN: 'You do not have permission for this action',
  FORBIDDEN_BRANCH: 'Wrong branch — switch branch or contact Super Owner',
  INVALID_MSG91_KEY: 'MSG91 auth key looks invalid (min 8 chars)',
  INVALID_AMOUNT: 'Enter a valid amount',
  INVALID_MONTHS: 'Months must be at least 1',
  MEMBER_NOT_FOUND: 'Member not found',
  MEMBER_ARCHIVED: 'Member is archived',
  ALREADY_CHECKED_IN: 'Already checked in today',
  MEMBERSHIP_EXPIRED: 'Membership expired',
  FREEZE_ANNUAL_ONLY: 'Membership freeze is strictly reserved for 12-month / Annual members only',
  CANNOT_FREEZE_INACTIVE: 'Cannot freeze an inactive or non-member account',
  CANNOT_FREEZE_EXPIRED: 'Cannot freeze an expired membership — please renew instead',
  BALANCE_DUE: 'Entry blocked — outstanding dues',
  DLT_TEMPLATE_MISSING: 'SMS DLT template not configured for this branch / purpose',
  MSG91_NOT_CONFIGURED: 'SMS is not configured — add MSG91 key in branch settings',
  MSG91_HTTP_ERROR: 'SMS provider rejected the request',
  MSG91_AUTH_FAILED: 'MSG91 authentication failed — key invalid or expired',
  VAULT_READ_FAILED: 'Could not read SMS credentials from Vault',
  NETWORK: 'Network error — check connection and try again',
  RATE_LIMITED: 'Too many requests — please wait a moment',
  VALIDATION: 'Please check the form fields',
  CONFLICT: 'Already exists or duplicate request',
  UNKNOWN: 'Something went wrong — try again',
};

export type AppErrorShape = {
  code: string;
  message: string;
  status?: number;
  details?: unknown;
  reauth?: boolean;
  retryable?: boolean;
};

export function toAppError(err: unknown, fallbackCode = 'UNKNOWN'): AppErrorShape {
  const e = err as any;
  const raw = String(e?.message || e || '');
  const status = Number(e?.status || e?.statusCode || 0) || undefined;
  const codeFromPg =
    e?.code ||
    raw.match(/\b([A-Z][A-Z0-9_]{3,})\b/)?.[1] ||
    '';

  // PostgREST / RPC Auth Session
  if (status === 401 || /jwt|session|auth.?session/i.test(raw) || e?.name === 'AuthSessionMissingError') {
    return {
      code: 'AUTH_SESSION_MISSING',
      message: ERROR_CODES.AUTH_SESSION_MISSING,
      status: 401,
      reauth: true,
      retryable: false,
    };
  }

  if (status === 403 || codeFromPg === '42501' || /FORBIDDEN/i.test(raw)) {
    return {
      code: 'FORBIDDEN',
      message: ERROR_CODES.FORBIDDEN,
      status: 403,
      retryable: false,
    };
  }

  if (codeFromPg === '23505' || /duplicate|unique/i.test(raw)) {
    return {
      code: 'CONFLICT',
      message: ERROR_CODES.CONFLICT,
      status: 409,
      retryable: false,
    };
  }

  if (status === 429 || /RATE_LIMITED|too many/i.test(raw)) {
    return {
      code: 'RATE_LIMITED',
      message: ERROR_CODES.RATE_LIMITED,
      status: 429,
      retryable: true,
    };
  }

  if (/load failed|failed to fetch|networkerror|TypeError/i.test(raw)) {
    return {
      code: 'NETWORK',
      message: ERROR_CODES.NETWORK,
      retryable: true,
    };
  }

  // Explicit app codes raised from SQL RAISE EXCEPTION 'CODE'
  for (const code of Object.keys(ERROR_CODES)) {
    if (raw.includes(code) || codeFromPg === code) {
      return {
        code,
        message: ERROR_CODES[code] || raw,
        status,
        retryable: ['NETWORK', 'MSG91_HTTP_ERROR', 'VAULT_READ_FAILED', 'RATE_LIMITED'].includes(code),
        details: e?.details,
      };
    }
  }

  // Attendance-style embeds
  if (/already_checked_in/i.test(raw)) {
    return { code: 'ALREADY_CHECKED_IN', message: ERROR_CODES.ALREADY_CHECKED_IN, retryable: false };
  }

  return {
    code: fallbackCode,
    message: raw || ERROR_CODES.UNKNOWN,
    status,
    retryable: false,
    details: e,
  };
}

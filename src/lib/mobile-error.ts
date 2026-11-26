export type MobileErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "LOCKED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class HttpStatusError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
    public readonly code?: MobileErrorCode,
  ) {
    super(message);
    this.name = "HttpStatusError";
  }
}

const UNSAFE_TECHNICAL_PATTERNS: RegExp[] = [
  /sqlite[_-]?error/i,
  /sqlite[_-]?constraint/i,
  /sqlite[_-]?busy/i,
  /libsql/i,
  /sqlstate/i,
  /postgresql/i,
  /\bpg::/i,
  /\bknex[:\s]/i,
  /no such table/i,
  /no such column/i,
  /unique constraint/i,
  /foreign key constraint/i,
  /not null constraint/i,
  /constraint failed/i,
  /database is locked/i,
  /\bsqlcipher\b/i,
  /\b(?:select\s+[^;\n]{1,120}\s+from\s+|insert\s+into\s+|update\s+\S+\s+set\s+|delete\s+from\s+)/i,
  /\b(?:typeerror|referenceerror|syntaxerror|rangeerror)\b/i,
  /cannot read propert/i,
  /cannot set propert/i,
  /is not a function/i,
  /\b(?:enoent|econnrefused|etimedout|enotfound|eai_again|econnreset|epipe)\b/i,
  /\berr_[a-z0-9_]+\b/,
  /\bat\s+[^\n]+\([^\n]+:\d+:\d+\)/,
  /<!doctype\s+html/i,
  /<html[\s>]/i,
  /<body[\s>]/i,
  /\b(?:jwt_secret|encryption_key|turso_|firebase_|database_url|smtp_password)\b/i,
  /process\.env/i,
  /(?:^|\s)\/(?:app|var|usr|home|Users|tmp)\/\S+/i,
  /[A-Z]:\\[^\s]+/,
  /sms provider error\s*\(/i,
  /invalid login:\s*\d{3}/i,
];

const SERVICE_UNAVAILABLE_PATTERNS: RegExp[] = [
  /econnrefused/i,
  /etimedout/i,
  /enotfound/i,
  /eai_again/i,
  /econnreset/i,
  /database is locked/i,
  /sqlite_busy/i,
  /fetch failed/i,
  /network error/i,
  /socket hang up/i,
];

export function defaultCodeForStatus(status: number): MobileErrorCode {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 423) return "LOCKED";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "SERVICE_UNAVAILABLE";
  if (status >= 500) return "INTERNAL_ERROR";
  return "VALIDATION_ERROR";
}

export function defaultMessageForStatus(status: number): string {
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You do not have permission to perform this action.";
  if (status === 404) return "The requested item could not be found.";
  if (status === 409) {
    return "This record changed recently. Refresh and try again.";
  }
  if (status === 423) {
    return "This account is temporarily locked. Please try again later.";
  }
  if (status === 429) {
    return "Too many requests. Please wait a moment and try again.";
  }
  if (status === 503) {
    return "Service is temporarily unavailable. Please try again shortly.";
  }
  if (status >= 500) {
    return "Something went wrong on the server. Please try again.";
  }
  return "Unable to complete your request. Please check your entries and try again.";
}

export function isUnsafeTechnicalMessage(message: unknown): boolean {
  if (typeof message !== "string") return false;
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (trimmed.length > 260) return true;
  if (/[\r\n]/.test(trimmed) && /\bat\s+/.test(trimmed)) return true;
  return UNSAFE_TECHNICAL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function sanitizeServerMessage(
  message: unknown,
  fallback: string,
): string {
  if (typeof message !== "string") return fallback;
  const trimmed = message.trim();
  if (!trimmed) return fallback;
  if (isUnsafeTechnicalMessage(trimmed)) return fallback;
  return trimmed;
}

export function sanitizeMobileServerError(
  err: unknown,
  options?: {
    fallbackMessage?: string;
    context?: string;
  },
): {
  status: number;
  message: string;
  code: MobileErrorCode;
} {
  const context = options?.context || "mobile-api";
  const fallback500 =
    options?.fallbackMessage ||
    "Something went wrong on the server. Please try again.";

  if (err instanceof HttpStatusError) {
    const status = Number.isFinite(err.status) ? err.status : 400;
    const code = err.code ?? defaultCodeForStatus(status);
    if (status >= 500 || isUnsafeTechnicalMessage(err.message)) {
      console.error(`[${context}] Sanitized HttpStatusError (${status}):`, err);
      const safeStatus = status >= 500 ? status : 500;
      return {
        status: safeStatus,
        message:
          safeStatus >= 500
            ? fallback500
            : defaultMessageForStatus(safeStatus),
        code: safeStatus >= 500 ? defaultCodeForStatus(safeStatus) : code,
      };
    }

    return {
      status,
      message: err.message.trim() || defaultMessageForStatus(status),
      code,
    };
  }

  console.error(`[${context}] Unhandled server error:`, err);

  const rawMsg = err instanceof Error ? err.message : String(err ?? "");

  if (
    SERVICE_UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(rawMsg))
  ) {
    return {
      status: 503,
      message: "Service is temporarily unavailable. Please try again shortly.",
      code: "SERVICE_UNAVAILABLE",
    };
  }

  if (err instanceof SyntaxError && /json/i.test(rawMsg)) {
    return {
      status: 400,
      message: "The request data could not be processed. Please try again.",
      code: "VALIDATION_ERROR",
    };
  }

  if (err instanceof Error && !isUnsafeTechnicalMessage(rawMsg)) {
    const lower = rawMsg.toLowerCase();
    if (
      lower.includes("insufficient stock") ||
      lower.includes("already refunded") ||
      lower.includes("already settled") ||
      lower.includes("already exists") ||
      lower.includes("already in use")
    ) {
      return {
        status: 409,
        message: rawMsg.trim(),
        code: "CONFLICT",
      };
    }
    if (lower.includes("not found")) {
      return {
        status: 404,
        message: rawMsg.trim(),
        code: "NOT_FOUND",
      };
    }
    if (lower.includes("not authorized") || lower.includes("admin privileges")) {
      return {
        status: 403,
        message: rawMsg.trim(),
        code: "FORBIDDEN",
      };
    }
    if (lower === "unauthorized") {
      return {
        status: 401,
        message: "Your session has expired. Please sign in again.",
        code: "UNAUTHORIZED",
      };
    }
  }

  return {
    status: 500,
    message: fallback500,
    code: "INTERNAL_ERROR",
  };
}

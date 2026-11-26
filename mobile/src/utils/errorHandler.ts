export type MobileErrorCategory =
  | "network"
  | "timeout"
  | "session"
  | "forbidden"
  | "conflict"
  | "validation"
  | "not_found"
  | "rate_limited"
  | "server"
  | "unknown";

export interface NormalizedAppError {
  userMessage: string;
  category: MobileErrorCategory;
  status?: number;
  code?: string;
  retryable: boolean;
  requiresSignIn: boolean;
}

const TECHNICAL_LEAK_PATTERNS: RegExp[] = [
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
  /\b(?:select|insert\s+into|update\s+\S+\s+set|delete\s+from)\b/i,
  /\b(?:typeerror|referenceerror|syntaxerror|rangeerror)\b/i,
  /cannot read propert/i,
  /cannot set propert/i,
  /is not a function/i,
  /json parse error/i,
  /unexpected token/i,
  /unexpected end of json/i,
  /network request failed/i,
  /failed to fetch/i,
  /load failed/i,
  /aborterror/i,
  /\b(?:enoent|econnrefused|etimedout|enotfound|eai_again|econnreset|epipe|err_network)\b/i,
  /\berr_[a-z0-9_]+\b/,
  /\bat\s+[^\n]+\([^\n]+:\d+:\d+\)/,
  /<!doctype\s+html/i,
  /<\/?(?:html|head|body|title|h1|p|div|script|style)[\s>]/i,
  /\b(?:bad gateway|gateway time-out|internal server error|service unavailable)\b/i,
  /\brequest failed\s*\(http\s*\d+\)/i,
  /\bsync stream error\s*\(\d+\)/i,
  /\bsms provider error\b/i,
  /\b(?:jwt_secret|encryption_key|turso_|firebase_|database_url|smtp_password)\b/i,
  /process\.env/i,
  /(?:^|\s)\/(?:app|var|usr|home|Users|tmp)\/\S+/i,
  /[A-Z]:\\[^\s]+/,
  /https?:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2)(?::\d+)?/i,
  /invalid login:\s*\d{3}/i,
];

const NETWORK_PATTERNS: RegExp[] = [
  /network request failed/i,
  /failed to fetch/i,
  /load failed/i,
  /networkerror/i,
  /network error/i,
  /econnrefused/i,
  /enotfound/i,
  /eai_again/i,
  /econnreset/i,
  /err_network/i,
  /internet connection appears to be offline/i,
  /could not connect to the server/i,
];

const TIMEOUT_PATTERNS: RegExp[] = [
  /timed out/i,
  /timeout/i,
  /etimedout/i,
  /aborterror/i,
];

export function logDevError(context: string, err: unknown): void {
  if ((globalThis as { __DEV__?: boolean }).__DEV__) {
    console.debug(`[${context}]`, err);
  }
}

export function isTechnicalErrorText(message: unknown): boolean {
  if (typeof message !== "string") return false;
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (trimmed.length > 260) return true;
  if (/[\r\n]/.test(trimmed) && /\bat\s+/.test(trimmed)) return true;
  return TECHNICAL_LEAK_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function sanitizeClientErrorMessage(
  rawMessage: unknown,
  fallback: string,
): string {
  if (typeof rawMessage !== "string") return fallback;
  const trimmed = rawMessage.trim();
  if (!trimmed) return fallback;
  if (isTechnicalErrorText(trimmed)) return fallback;
  return trimmed;
}

export function getFriendlyMessageForStatus(
  status: number,
  rawMessage?: unknown,
  fallback?: string,
): string {
  if (status === 0) {
    return "Couldn't reach the store server. Check your internet connection and try again.";
  }
  if (status === 408) {
    return "The server took too long to respond. Check your connection and try again.";
  }
  if (status === 401) {
    const clean = sanitizeClientErrorMessage(rawMessage, "");
    const lower = clean.toLowerCase();
    if (
      clean &&
      lower !== "unauthorized" &&
      !lower.includes("http 401") &&
      (lower.includes("password") ||
        lower.includes("username") ||
        lower.includes("attempt") ||
        lower.includes("verification code"))
    ) {
      return clean;
    }
    return "Your session has expired. Please sign in again.";
  }
  if (status === 403) {
    return sanitizeClientErrorMessage(
      rawMessage,
      "You do not have permission to perform this action.",
    );
  }
  if (status === 404) {
    return sanitizeClientErrorMessage(
      rawMessage,
      "The requested item could not be found.",
    );
  }
  if (status === 409) {
    return sanitizeClientErrorMessage(
      rawMessage,
      "This record was updated elsewhere. Refresh and try again.",
    );
  }
  if (status === 413) {
    return sanitizeClientErrorMessage(
      rawMessage,
      "This file is too large. Choose a smaller one and try again.",
    );
  }
  if (status === 415) {
    return sanitizeClientErrorMessage(
      rawMessage,
      "Unsupported file format. Please choose a valid image.",
    );
  }
  if (status === 423) {
    return sanitizeClientErrorMessage(
      rawMessage,
      "This account is temporarily locked. Please try again later.",
    );
  }
  if (status === 429) {
    return "Too many requests right now. Wait a moment and try again.";
  }
  if (status >= 500) {
    return (
      fallback ||
      "The store server is temporarily unavailable. Please try again."
    );
  }

  return sanitizeClientErrorMessage(
    rawMessage,
    fallback || "Something went wrong. Please try again.",
  );
}

interface ErrorLike {
  message?: unknown;
  status?: unknown;
  code?: unknown;
  category?: unknown;
  retryable?: unknown;
  requiresSignIn?: unknown;
  name?: unknown;
}

export function normalizeError(
  err: unknown,
  options?: {
    fallback?: string;
    context?: string;
    status?: number;
    code?: string;
    silent?: boolean;
  },
): NormalizedAppError {
  if (!options?.silent && options?.context && err !== undefined && err !== null) {
    logDevError(options.context, err);
  }

  const obj =
    err && typeof err === "object" ? (err as ErrorLike) : undefined;
  const rawMessage =
    typeof err === "string"
      ? err
      : typeof obj?.message === "string"
        ? obj.message
        : "";
  const status =
    typeof options?.status === "number"
      ? options.status
      : typeof obj?.status === "number"
        ? obj.status
        : undefined;
  const code =
    options?.code ??
    (typeof obj?.code === "string" ? obj.code : undefined);

  if (
    status === 0 ||
    (status === undefined &&
      NETWORK_PATTERNS.some((pattern) => pattern.test(rawMessage)))
  ) {
    return {
      userMessage:
        "Couldn't reach the store server. Check your internet connection and try again.",
      category: "network",
      status: 0,
      code: code ?? "NETWORK_ERROR",
      retryable: true,
      requiresSignIn: false,
    };
  }

  if (
    status === 408 ||
    obj?.name === "AbortError" ||
    (status === undefined &&
      TIMEOUT_PATTERNS.some((pattern) => pattern.test(rawMessage)))
  ) {
    return {
      userMessage:
        "The server took too long to respond. Check your connection and try again.",
      category: "timeout",
      status: 408,
      code: code ?? "TIMEOUT",
      retryable: true,
      requiresSignIn: false,
    };
  }

  if (status === 401 || code === "UNAUTHORIZED") {
    const userMessage = getFriendlyMessageForStatus(
      401,
      rawMessage,
      options?.fallback,
    );
    const isCredentialFailure =
      userMessage.toLowerCase().includes("password") ||
      userMessage.toLowerCase().includes("attempt");
    return {
      userMessage,
      category: isCredentialFailure ? "validation" : "session",
      status: 401,
      code: code ?? "UNAUTHORIZED",
      retryable: false,
      requiresSignIn: !isCredentialFailure,
    };
  }

  if (status === 403 || status === 423 || code === "FORBIDDEN" || code === "LOCKED") {
    const resolvedStatus = status ?? (code === "LOCKED" ? 423 : 403);
    return {
      userMessage: getFriendlyMessageForStatus(
        resolvedStatus,
        rawMessage,
        options?.fallback,
      ),
      category: "forbidden",
      status: resolvedStatus,
      code,
      retryable: false,
      requiresSignIn: false,
    };
  }

  if (status === 404 || code === "NOT_FOUND") {
    return {
      userMessage: getFriendlyMessageForStatus(404, rawMessage, options?.fallback),
      category: "not_found",
      status: 404,
      code,
      retryable: false,
      requiresSignIn: false,
    };
  }

  if (status === 409 || code === "CONFLICT") {
    return {
      userMessage: getFriendlyMessageForStatus(409, rawMessage, options?.fallback),
      category: "conflict",
      status: 409,
      code,
      retryable: true,
      requiresSignIn: false,
    };
  }

  if (status === 429 || code === "RATE_LIMITED") {
    return {
      userMessage: getFriendlyMessageForStatus(429, rawMessage, options?.fallback),
      category: "rate_limited",
      status: 429,
      code,
      retryable: true,
      requiresSignIn: false,
    };
  }

  if (
    (typeof status === "number" && status >= 500) ||
    code === "INTERNAL_ERROR" ||
    code === "SERVICE_UNAVAILABLE"
  ) {
    const resolvedStatus = typeof status === "number" && status >= 500 ? status : 500;
    return {
      userMessage: getFriendlyMessageForStatus(
        resolvedStatus,
        rawMessage,
        options?.fallback,
      ),
      category: "server",
      status: resolvedStatus,
      code,
      retryable: true,
      requiresSignIn: false,
    };
  }

  if (typeof status === "number" && status >= 400 && status < 500) {
    return {
      userMessage: getFriendlyMessageForStatus(
        status,
        rawMessage,
        options?.fallback,
      ),
      category: "validation",
      status,
      code,
      retryable: false,
      requiresSignIn: false,
    };
  }

  const fallback =
    options?.fallback || "Something went wrong. Please try again.";
  const safeMsg = sanitizeClientErrorMessage(rawMessage, fallback);
  const wasScrubbed = Boolean(rawMessage.trim()) && safeMsg === fallback && isTechnicalErrorText(rawMessage);

  return {
    userMessage: safeMsg,
    category: wasScrubbed ? "server" : "unknown",
    status,
    code,
    retryable: wasScrubbed,
    requiresSignIn: false,
  };
}

export function getUserErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
  context?: string,
): string {
  return normalizeError(err, { fallback, context }).userMessage;
}

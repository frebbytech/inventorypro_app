import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import {
  HttpStatusError,
  isUnsafeTechnicalMessage,
  sanitizeMobileServerError,
  sanitizeServerMessage,
} from "@/lib/mobile-error";
import { withMobileAuth } from "@/lib/mobile-api";
import {
  getFriendlyMessageForStatus,
  getUserErrorMessage,
  isTechnicalErrorText,
  normalizeError,
  sanitizeClientErrorMessage,
} from "../mobile/src/utils/errorHandler";

vi.mock("../mobile/src/utils/productImage", () => ({
  inferProductImageUploadMeta: vi.fn(() => ({
    mimeType: "image/jpeg",
    fileName: "product.jpg",
  })),
}));

type HttpApiErrorInstance = Error & {
  status: number;
  code?: string;
  category: string;
  retryable: boolean;
  requiresSignIn: boolean;
};

type HttpApiErrorCtor = new (
  message: string,
  status?: number,
  code?: string,
  details?: unknown,
) => HttpApiErrorInstance;

type HttpApiClientInstance = {
  rawRequest: <T>(
    path: string,
    init?: RequestInit & { timeoutMs?: number },
  ) => Promise<T>;
};

type HttpApiClientCtor = new (config: {
  baseUrl?: string;
  getAccessToken?: () => string | null;
  onUnauthorized?: () => void;
}) => HttpApiClientInstance;

async function loadHttpAdapter(): Promise<{
  ApiError: HttpApiErrorCtor;
  HttpApiClient: HttpApiClientCtor;
}> {
  const adapterSpecifier = ["..", "mobile", "src", "api", "httpAdapter"].join(
    "/",
  );
  return (await import(adapterSpecifier)) as {
    ApiError: HttpApiErrorCtor;
    HttpApiClient: HttpApiClientCtor;
  };
}

describe("Server mobile error sanitization (src/lib/mobile-error.ts)", () => {
  it("flags SQL, stack traces, paths, env secrets, HTML, and provider details as unsafe", () => {
    const unsafeSamples = [
      "SQLITE_CONSTRAINT: UNIQUE constraint failed: products.sku",
      "LibsqlError: SQLITE_BUSY: database is locked",
      "SQLSTATE[23505]: duplicate key value violates unique constraint",
      "Knex: select * from `products` where `id` = '1'",
      "TypeError: Cannot read properties of undefined (reading 'tenant_id')",
      "Error: boom\n    at POST (/app/applet/src/app/api/mobile/v1/sales/route.ts:44:12)",
      "ENOENT: no such file or directory, open '/var/data/inventory.db'",
      "Read C:\\Users\\admin\\secrets.txt failed",
      "Missing JWT_SECRET or TURSO_AUTH_TOKEN in process.env",
      "<!DOCTYPE html><html><body><h1>502 Bad Gateway</h1></body></html>",
      "SMS provider error (502): upstream gateway timeout",
      "Invalid login: 535-5.7.8 Username and Password not accepted",
    ];

    for (const sample of unsafeSamples) {
      expect(isUnsafeTechnicalMessage(sample)).toBe(true);
      expect(sanitizeServerMessage(sample, "Safe fallback.")).toBe(
        "Safe fallback.",
      );
    }
  });

  it("maps network/DB lock driver failures to 503 SERVICE_UNAVAILABLE without internals", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = sanitizeMobileServerError(
      new Error("connect ECONNREFUSED 127.0.0.1:5432"),
      { context: "test.econnrefused" },
    );
    expect(res.status).toBe(503);
    expect(res.code).toBe("SERVICE_UNAVAILABLE");
    expect(res.message).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|5432/);

    const busyRes = sanitizeMobileServerError(
      new Error("SQLITE_BUSY: database is locked"),
      { context: "test.sqlite_busy" },
    );
    expect(busyRes.status).toBe(503);
    expect(busyRes.code).toBe("SERVICE_UNAVAILABLE");
    expect(busyRes.message).not.toMatch(/SQLITE_BUSY|database is locked/i);

    errorSpy.mockRestore();
  });

  it("preserves safe 4xx HttpStatusError business messages and scrubs unsafe ones", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const safeConflict = sanitizeMobileServerError(
      new HttpStatusError("Insufficient stock for Milo 400g.", 409, "CONFLICT"),
    );
    expect(safeConflict).toEqual({
      status: 409,
      message: "Insufficient stock for Milo 400g.",
      code: "CONFLICT",
    });

    const unsafeHttp = sanitizeMobileServerError(
      new HttpStatusError("SQLITE_ERROR: no such column: foo", 400),
      { fallbackMessage: "Unable to save record." },
    );
    expect(unsafeHttp.status).toBe(500);
    expect(unsafeHttp.code).toBe("INTERNAL_ERROR");
    expect(unsafeHttp.message).toBe("Unable to save record.");

    errorSpy.mockRestore();
  });

  it("sanitizes unhandled errors thrown inside withMobileAuth routes", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const unauthReq = new Request("http://localhost:3000/api/mobile/v1/sales", {
      method: "GET",
    });
    const unauthRes = await withMobileAuth(unauthReq, async () =>
      NextResponse.json({ ok: true }),
    );
    expect(unauthRes.status).toBe(401);
    const unauthBody = (await unauthRes.json()) as {
      error: string;
      code: string;
    };
    expect(unauthBody.code).toBe("UNAUTHORIZED");
    expect(unauthBody.error).toBe(
      "Your session has expired. Please sign in again.",
    );

    errorSpy.mockRestore();
  });
});

describe("Mobile client error normalizer (mobile/src/utils/errorHandler.ts)", () => {
  it("detects and scrubs technical leaks including localhost URLs, HTML, and SQL errors", () => {
    const technicalInputs = [
      "SQLITE_CONSTRAINT: UNIQUE constraint failed: customers.phone",
      "Request failed (HTTP 500)",
      "Sync stream error (502)",
      "http://127.0.0.1:3000/api/mobile/v1/sales failed",
      "<html><head><title>502 Bad Gateway</title></head><body><h1>Bad Gateway</h1></body></html>",
      "TypeError: Network request failed",
      "ReferenceError: foo is not defined\n    at Bar (/Users/dev/app.tsx:10:2)",
    ];

    for (const input of technicalInputs) {
      expect(isTechnicalErrorText(input)).toBe(true);
      expect(sanitizeClientErrorMessage(input, "Friendly fallback.")).toBe(
        "Friendly fallback.",
      );
    }

    expect(
      sanitizeClientErrorMessage(
        "Product name is required.",
        "Friendly fallback.",
      ),
    ).toBe("Product name is required.");
  });

  it("normalizes network, timeout, session, credential 401, and server status errors", () => {
    const netErr = normalizeError(new TypeError("Network request failed"), {
      silent: true,
    });
    expect(netErr.category).toBe("network");
    expect(netErr.status).toBe(0);
    expect(netErr.retryable).toBe(true);
    expect(netErr.requiresSignIn).toBe(false);
    expect(netErr.userMessage).toContain("internet connection");

    const timeoutErr = normalizeError(
      Object.assign(new Error("The operation was aborted"), {
        name: "AbortError",
      }),
      { silent: true },
    );
    expect(timeoutErr.category).toBe("timeout");
    expect(timeoutErr.status).toBe(408);
    expect(timeoutErr.retryable).toBe(true);

    const sessionErr = normalizeError(
      { status: 401, message: "Invalid JWT token" },
      { silent: true },
    );
    expect(sessionErr.category).toBe("session");
    expect(sessionErr.requiresSignIn).toBe(true);
    expect(sessionErr.retryable).toBe(false);
    expect(sessionErr.userMessage).toBe(
      "Your session has expired. Please sign in again.",
    );

    const credentialErr = normalizeError(
      {
        status: 401,
        message: "Invalid username or password. 2 attempts remaining.",
      },
      { silent: true },
    );
    expect(credentialErr.category).toBe("validation");
    expect(credentialErr.requiresSignIn).toBe(false);
    expect(credentialErr.userMessage).toBe(
      "Invalid username or password. 2 attempts remaining.",
    );

    const serverErr = normalizeError(
      { status: 500, message: "SQLITE_ERROR: syntax error near WHERE" },
      { silent: true },
    );
    expect(serverErr.category).toBe("server");
    expect(serverErr.retryable).toBe(true);
    expect(serverErr.userMessage).not.toMatch(/SQLITE_ERROR/i);

    expect(
      getFriendlyMessageForStatus(429, "Too many requests from 192.168.1.1"),
    ).toBe("Too many requests right now. Wait a moment and try again.");
    expect(
      getUserErrorMessage("SQLITE_BUSY: database is locked", "Try again later."),
    ).toBe("Try again later.");
  });
});

describe("Mobile HttpApiClient error sanitization (mobile/src/api/httpAdapter.ts)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  async function createClient(onUnauthorized = vi.fn()) {
    const { ApiError, HttpApiClient } = await loadHttpAdapter();
    return {
      ApiError,
      onUnauthorized,
      client: new HttpApiClient({
        baseUrl: "https://store.example.com",
        getAccessToken: () => "test-token",
        onUnauthorized,
      }),
    };
  }

  it("maps fetch network failure to ApiError(0, network, retryable)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      new TypeError("Network request failed"),
    ) as unknown as typeof fetch;

    const { client } = await createClient();
    await expect(client.rawRequest("/api/mobile/v1/products")).rejects.toMatchObject({
      name: "ApiError",
      status: 0,
      category: "network",
      retryable: true,
      requiresSignIn: false,
    });
  });

  it("maps internal timeout abort to ApiError(408, timeout, retryable)", async () => {
    globalThis.fetch = vi.fn().mockImplementation(
      (_url: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(
              Object.assign(new Error("The operation was aborted."), {
                name: "AbortError",
              }),
            );
          });
        }),
    ) as unknown as typeof fetch;

    const { client } = await createClient();
    await expect(
      client.rawRequest("/api/mobile/v1/products", { timeoutMs: 15 }),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 408,
      category: "timeout",
      retryable: true,
    });
  });

  it("strips HTML 502 gateway pages into a friendly retryable server ApiError", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("<!DOCTYPE html><html><body>502 Bad Gateway</body></html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      }),
    ) as unknown as typeof fetch;

    const { ApiError, client } = await createClient();
    let caught: unknown;
    try {
      await client.rawRequest("/api/mobile/v1/sales");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const apiErr = caught as HttpApiErrorInstance;
    expect(apiErr.status).toBe(502);
    expect(apiErr.category).toBe("server");
    expect(apiErr.retryable).toBe(true);
    expect(apiErr.message).not.toMatch(/<!doctype|<html|bad gateway/i);
  });

  it("invokes onUnauthorized on 401 and sets requiresSignIn = true", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Token expired", code: "UNAUTHORIZED" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const { client, onUnauthorized } = await createClient();
    await expect(client.rawRequest("/api/mobile/v1/me")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      category: "session",
      requiresSignIn: true,
      retryable: false,
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("scrubs unsafe SQLite text returned in 500 JSON responses", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "SQLITE_ERROR: no such table: broken_table",
          code: "INTERNAL_ERROR",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      ),
    ) as unknown as typeof fetch;

    const { ApiError, client } = await createClient();
    let caught: unknown;
    try {
      await client.rawRequest("/api/mobile/v1/products");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const apiErr = caught as HttpApiErrorInstance;
    expect(apiErr.status).toBe(500);
    expect(apiErr.category).toBe("server");
    expect(apiErr.message).not.toMatch(/sqlite_error|broken_table/i);
  });

  it("handles 200 OK responses containing invalid HTML/non-JSON payloads cleanly", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("<html><body>Unexpected proxy page</body></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    ) as unknown as typeof fetch;

    const { client } = await createClient();
    await expect(client.rawRequest("/api/mobile/v1/products")).rejects.toMatchObject({
      name: "ApiError",
      category: "server",
      retryable: true,
    });
  });
});

import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestSessionContext {
  id: string;
  tenant_id: string;
  tenant_name?: string;
  tenant_slug?: string;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  role: "admin" | "member";
  phonenumber?: string;
  last_login_at?: string | null;
}

interface RequestContextStore {
  session: RequestSessionContext | null;
}

const globalForContext = globalThis as typeof globalThis & {
  __inventoryProRequestCtx?: AsyncLocalStorage<RequestContextStore>;
};

const requestStorage =
  globalForContext.__inventoryProRequestCtx ||
  new AsyncLocalStorage<RequestContextStore>();

if (!globalForContext.__inventoryProRequestCtx) {
  globalForContext.__inventoryProRequestCtx = requestStorage;
}

export function runWithAuthContext<T>(
  session: RequestSessionContext | null,
  fn: () => Promise<T>,
): Promise<T> {
  return requestStorage.run({ session }, fn);
}

export function getAuthContextSession(): RequestSessionContext | null {
  return requestStorage.getStore()?.session ?? null;
}

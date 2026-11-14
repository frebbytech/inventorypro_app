/**
 * electron/eod-scheduler.ts
 *
 * Runs in the Electron MAIN process (not the renderer, not the Next.js
 * child). Two trigger paths, working together:
 *
 *   1. A real cron schedule (node-cron) that fires every 15 min while the
 *      app is open — same cadence as the web version.
 *   2. A "before-quit" check — if the app is closing after closing time and
 *      today's report hasn't gone out yet, make one last attempt before the
 *      window actually closes. This is the safety net a desktop app needs
 *      that a hosted server doesn't: the app closing IS the most common
 *      real-world trigger for "the store just closed."
 *
 * Prereqs:
 *   npm install node-cron
 *   npm install --save-dev @types/node-cron
 */

import cron from "node-cron";
import { app } from "electron";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ── A per-install secret, generated once, stored alongside app data. ──
// Not protecting against a remote attacker here (nothing external can
// reach localhost) — this guards against other local processes on the
// same machine hitting the port, same defense-in-depth reasoning as any
// localhost-bound admin endpoint.
function getOrCreateCronSecret(): string {
  const configPath = join(app.getPath("userData"), "cron-secret.json");
  if (existsSync(configPath)) {
    return JSON.parse(readFileSync(configPath, "utf-8")).secret;
  }
  const secret = randomBytes(32).toString("hex");
  writeFileSync(configPath, JSON.stringify({ secret }));
  return secret;
}

async function pingEodRouteOnce(
  port: number,
  secret: string,
): Promise<boolean> {
  const isDev = !app.isPackaged;

  const baseURL = isDev
    ? `https://localhost:${port}/api/cron/eod-report`
    : `http://localhost:${port}/api/cron/eod-report`;

  const res = await fetch(baseURL, {
    headers: {
      Authorization: `Bearer ${secret}`,
      // Force a fresh TCP connection instead of letting undici reuse a
      // pooled keep-alive socket. Against `next dev` in particular, the
      // dev server can recycle its HTTP listener (Fast Refresh, a
      // file-watch restart) between cron ticks; a pooled socket left
      // pointing at the old listener fails with "other side closed" the
      // next time it's reused, which is a stale-connection symptom, not a
      // real server-down condition. This should be unnecessary against a
      // packaged `next start` process, which doesn't cycle its listener —
      // worth confirming this error doesn't reproduce there too.
      Connection: "close",
    },
    // Keep this bounded — you don't want a hung network call (e.g. a
    // stalled SMS provider) to delay app quit indefinitely.
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(
      `EOD report check failed: ${res.status} ${await res.text()}`,
    );
  }
  const body = await res.json();
  if (body) {
    console.log("EOD report dispatched:", body);
  }
  return true;
}

async function pingEodRoute(
  port: number,
  secret: string,
  retries = 2,
): Promise<boolean> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await pingEodRouteOnce(port, secret);
    } catch (err) {
      const isLastAttempt = attempt === retries;
      console.error(
        `EOD report check errored (attempt ${attempt + 1}/${retries + 1}):`,
        err,
      );
      if (isLastAttempt) return false;
      // Brief backoff — most causes of this (a dev-server restart in
      // progress, a socket mid-teardown) resolve within a second or two.
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return false;
}

/**
 * Wait until the Next.js child can actually serve a request, not just
 * until its port is accepting TCP connections — a socket can accept a
 * connection during a brief window mid-startup (or mid-restart) and then
 * drop it before the app is truly ready, which is the same failure mode
 * pingEodRoute's retry logic exists to survive. Call this before
 * startEodScheduler() instead of a fixed delay or a raw port check.
 */
export async function waitForNextServerReady(
  port: number,
  timeoutMs = 30_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/`, {
        headers: { Connection: "close" },
        signal: AbortSignal.timeout(3_000),
      });
      if (res.ok || res.status < 500) return true;
    } catch {
      // not ready yet — fall through to retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export function startEodScheduler(nextServerPort: number) {
  const secret = getOrCreateCronSecret();
  let lastCheckOk = true;

  // ── Path 1: periodic check while the app is running ──
  const task = cron.schedule("*/15 * * * *", async () => {
    lastCheckOk = await pingEodRoute(nextServerPort, secret);
  });

  // Run one check immediately on startup too — covers the case where the
  // app is opened *after* closing time (e.g. someone opens it the next
  // morning and yesterday's report never went out).
  pingEodRoute(nextServerPort, secret);

  // ── Path 2: last-chance check before the app actually quits ──
  // Electron's 'before-quit' lets you delay quitting with
  // event.preventDefault() + app.quit() once your work is done.
  let quitCheckDone = false;
  app.on("before-quit", (event) => {
    if (quitCheckDone) return; // don't loop forever once we've checked
    event.preventDefault();
    quitCheckDone = true;

    pingEodRoute(nextServerPort, secret).finally(() => {
      task.stop();
      app.quit();
    });
  });
}

// /**
//  * electron/eod-scheduler.ts
//  *
//  * Runs in the Electron MAIN process (not the renderer, not the Next.js
//  * child). Two trigger paths, working together:
//  *
//  *   1. A real cron schedule (node-cron) that fires every 15 min while the
//  *      app is open — same cadence as the web version.
//  *   2. A "before-quit" check — if the app is closing after closing time and
//  *      today's report hasn't gone out yet, make one last attempt before the
//  *      window actually closes. This is the safety net a desktop app needs
//  *      that a hosted server doesn't: the app closing IS the most common
//  *      real-world trigger for "the store just closed."
//  *
//  * Prereqs:
//  *   npm install node-cron
//  *   npm install --save-dev @types/node-cron
//  */

// import cron from "node-cron";
// import { app } from "electron";
// import { randomBytes } from "node:crypto";
// import { readFileSync, writeFileSync, existsSync } from "node:fs";
// import { join } from "node:path";

// // ── A per-install secret, generated once, stored alongside app data. ──
// // Not protecting against a remote attacker here (nothing external can
// // reach localhost) — this guards against other local processes on the
// // same machine hitting the port, same defense-in-depth reasoning as any
// // localhost-bound admin endpoint.
// function getOrCreateCronSecret(): string {
//   const configPath = join(app.getPath("userData"), "cron-secret.json");
//   if (existsSync(configPath)) {
//     return JSON.parse(readFileSync(configPath, "utf-8")).secret;
//   }
//   const secret = randomBytes(32).toString("hex");
//   writeFileSync(configPath, JSON.stringify({ secret }));
//   return secret;
// }

// async function pingEodRoute(port: number, secret: string): Promise<boolean> {
//   const isDev = process.env.NODE_ENV === "development";

//   const baseURL = isDev
//     ? `http://localhost:${port}/api/cron/eod-report`
//     : `http://localhost:${port}/api/cron/eod-report`;

//   try {
//     const res = await fetch(baseURL, {
//       headers: { Authorization: `Bearer ${secret}` },
//       // Keep this bounded — you don't want a hung network call (e.g. a
//       // stalled SMS provider) to delay app quit indefinitely.
//       signal: AbortSignal.timeout(20_000),
//     });
//     if (!res.ok) {
//       console.error(
//         `EOD report check failed: ${res.status} ${await res.text()}`,
//       );
//       return false;
//     }
//     const body = await res.json();
//     console.log(body);

//     if (body) {
//       console.log("EOD report dispatched:");
//     }
//     return true;
//   } catch (err) {
//     console.error("EOD report check errored:", err);
//     return false;
//   }
// }

// export function startEodScheduler(nextServerPort: number) {
//   const secret = getOrCreateCronSecret();
//   let lastCheckOk = true;

//   // ── Path 1: periodic check while the app is running ──
//   const task = cron.schedule("*/15 * * * *", async () => {
//     lastCheckOk = await pingEodRoute(nextServerPort, secret);
//   });

//   // Run one check immediately on startup too — covers the case where the
//   // app is opened *after* closing time (e.g. someone opens it the next
//   // morning and yesterday's report never went out).
//   pingEodRoute(nextServerPort, secret);

//   // ── Path 2: last-chance check before the app actually quits ──
//   // Electron's 'before-quit' lets you delay quitting with
//   // event.preventDefault() + app.quit() once your work is done.
//   let quitCheckDone = false;
//   app.on("before-quit", (event) => {
//     if (quitCheckDone) return; // don't loop forever once we've checked
//     event.preventDefault();
//     quitCheckDone = true;

//     pingEodRoute(nextServerPort, secret).finally(() => {
//       task.stop();
//       app.quit();
//     });
//   });
// }

// /**
//  * In your main.ts, after the Next.js child process reports it's actually
//  * listening (don't start the scheduler against a port nothing is bound to
//  * yet):
//  *
//  *   const port = await startNextServer(); // however you already do this
//  *   startEodScheduler(port);
//  *
//  * ── Multi-terminal caveat ──
//  * If more than one machine runs this app against its OWN local SQLite
//  * file (not a shared DB), don't call startEodScheduler() unconditionally
//  * on every install — gate it behind a setting (e.g. a
//  * `is_report_terminal` flag in your app settings table, toggled true on
//  * exactly one register) so only one terminal is ever attempting the
//  * dispatch. If instead all terminals share one central database, the
//  * eod_dispatch_locks atomic claim from the web version already prevents
//  * duplicate sends regardless of how many terminals are polling.
//  */

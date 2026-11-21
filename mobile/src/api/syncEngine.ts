import { eq } from "drizzle-orm";
import { AppState, type AppStateStatus } from "react-native";
import { ensureDbReady } from "@/db/client";
import { products } from "@/db/schema";
import {
  applyRemoteSyncEvent,
  clearFailedOutboxItems,
  exportLocalDataForMerge,
  getOutboxCounts,
  getSyncMetaValue,
  listPendingOutboxItems,
  markOutboxItemState,
  removeOutboxItem,
  replaceLocalSnapshotWithCloud,
  setSyncMetaValue,
  type ApplySyncEventResult,
} from "@/db/syncStore";
import {
  deleteLocalProductImageIfManaged,
  isLocalDeviceImageUri,
} from "@/utils/productImage";
import { ApiError, type HttpApiClient } from "./httpAdapter";
import {
  getStoredSyncCursor,
  setStoredSyncCursor,
} from "./tokenStorage";
import type {
  SyncBootstrapResponse,
  SyncEventDto,
  SyncMergeResponse,
  SyncStatus,
} from "@/types/domain";

export interface SyncStateSnapshot {
  status: SyncStatus;
  lastCursor: number;
  lastSyncedAt: string | null;
  pendingOutboxCount: number;
  conflictOutboxCount: number;
  lastError: string | null;
}

type SyncListener = (state: SyncStateSnapshot, event?: SyncEventDto) => void;

export class SyncEngine {
  private started = false;
  private destroyed = false;
  private abortController: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private appStateSub: { remove: () => void } | null = null;
  private reconnectAttempts = 0;
  private flushing = false;
  private catchingUp = false;
  private listeners = new Set<SyncListener>();

  private state: SyncStateSnapshot = {
    status: "connecting",
    lastCursor: 0,
    lastSyncedAt: null,
    pendingOutboxCount: 0,
    conflictOutboxCount: 0,
    lastError: null,
  };

  constructor(
    private readonly httpClient: HttpApiClient,
    private readonly getAccessToken: () => string | null,
    private readonly onBootstrapSynced?: (snapshot: SyncBootstrapResponse) => void,
    private readonly getCurrentUserId?: () => string | null,
    private readonly onDeltaApplied?: (
      result: ApplySyncEventResult,
      event: SyncEventDto,
    ) => void,
  ) {}

  getState(): SyncStateSnapshot {
    return { ...this.state };
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event?: SyncEventDto): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(snapshot, event);
      } catch {
        // ignore listener errors
      }
    }
  }

  private setState(patch: Partial<SyncStateSnapshot>, event?: SyncEventDto): void {
    this.state = { ...this.state, ...patch };
    this.emit(event);
  }

  async refreshOutboxCounts(): Promise<void> {
    try {
      const db = await ensureDbReady();
      const counts = getOutboxCounts(db);
      this.setState({
        pendingOutboxCount: counts.pending,
        conflictOutboxCount: counts.conflict,
      });
    } catch {
      // ignore
    }
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.destroyed = false;

    const db = await ensureDbReady();
    const storedCursor = await getStoredSyncCursor();
    const metaCursor = Number(getSyncMetaValue(db, "last_sync_cursor") ?? "0");
    const lastCursor = Math.max(storedCursor, Number.isFinite(metaCursor) ? metaCursor : 0);
    const lastSyncedAt = getSyncMetaValue(db, "last_synced_at");
    const counts = getOutboxCounts(db);

    this.setState({
      lastCursor,
      lastSyncedAt,
      pendingOutboxCount: counts.pending,
      conflictOutboxCount: counts.conflict,
      status: "connecting",
    });

    this.appStateSub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active" && this.started && !this.destroyed) {
        void this.catchUpNow();
      }
    });

    if (lastCursor === 0 && !lastSyncedAt) {
      await this.bootstrapAndHydrate().catch(() => {});
    } else {
      await this.flushOutbox().catch(() => {});
      await this.catchUpDelta().catch(() => {});
    }

    this.connectStream();
  }

  stop(): void {
    this.started = false;
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.appStateSub) {
      this.appStateSub.remove();
      this.appStateSub = null;
    }
  }

  private scheduleRefreshFromCloud(): void {
    if (this.destroyed || !this.started || this.refreshTimer) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      if (!this.destroyed && this.started) {
        void this.bootstrapAndHydrate().catch(() => {});
      }
    }, 350);
  }

  async bootstrapAndHydrate(): Promise<SyncBootstrapResponse> {
    this.setState({ status: "syncing", lastError: null });
    const accessToken = this.getAccessToken() ?? undefined;
    const snapshot = await this.httpClient.syncBootstrap(accessToken);
    const db = await ensureDbReady();
    replaceLocalSnapshotWithCloud(db, snapshot);
    await setStoredSyncCursor(snapshot.latestCursor || 0);
    const counts = getOutboxCounts(db);

    this.setState({
      status: "live",
      lastCursor: snapshot.latestCursor || 0,
      lastSyncedAt: snapshot.syncedAt || new Date().toISOString(),
      pendingOutboxCount: counts.pending,
      conflictOutboxCount: counts.conflict,
      lastError: null,
    });
    this.onBootstrapSynced?.(snapshot);
    return snapshot;
  }

  async mergeLocalAndBootstrap(): Promise<{
    merge: SyncMergeResponse;
    snapshot: SyncBootstrapResponse;
  }> {
    this.setState({ status: "syncing", lastError: null });
    const db = await ensureDbReady();
    const payload = exportLocalDataForMerge(db);

    for (const product of payload.products) {
      if (product.photoUrl && isLocalDeviceImageUri(product.photoUrl)) {
        const localUri = product.photoUrl;
        try {
          product.photoUrl = await this.httpClient.uploadProductImage(localUri);
          deleteLocalProductImageIfManaged(localUri);
        } catch {
          // Skip unuploadable local URI rather than aborting merge
          product.photoUrl = undefined;
        }
      }
    }

    const accessToken = this.getAccessToken() ?? undefined;
    const mutationId = `merge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const merge = await this.httpClient.syncMerge(payload, mutationId, accessToken);
    const snapshot = await this.bootstrapAndHydrate();
    return { merge, snapshot };
  }

  async catchUpNow(): Promise<void> {
    await this.flushOutbox();
    await this.catchUpDelta();
    if (!this.abortController && !this.pollTimer && this.started && !this.destroyed) {
      this.connectStream();
    }
  }

  async discardConflicts(): Promise<void> {
    const db = await ensureDbReady();
    clearFailedOutboxItems(db);
    await this.refreshOutboxCounts();
    await this.bootstrapAndHydrate();
  }

  async flushOutbox(): Promise<void> {
    if (this.flushing || !this.getAccessToken()) return;
    this.flushing = true;

    try {
      const db = await ensureDbReady();
      const items = listPendingOutboxItems(db);
      if (items.length === 0) {
        await this.refreshOutboxCounts();
        return;
      }

      this.setState({ status: "syncing" });

      for (const item of items) {
        markOutboxItemState(db, item.id, "processing");
        try {
          let bodyToSend = item.payloadJson;
          let uploadedPhotoUrl: string | null = null;
          let originalLocalPhotoUri: string | null = null;

          if (
            item.entityType === "product" &&
            (item.operation === "create" || item.operation === "update")
          ) {
            try {
              const parsed = JSON.parse(item.payloadJson) as Record<string, unknown>;
              if (
                typeof parsed?.photoUrl === "string" &&
                isLocalDeviceImageUri(parsed.photoUrl)
              ) {
                originalLocalPhotoUri = parsed.photoUrl;
                uploadedPhotoUrl = await this.httpClient.uploadProductImage(
                  originalLocalPhotoUri,
                );
                parsed.photoUrl = uploadedPhotoUrl;
                bodyToSend = JSON.stringify(parsed);
              }
            } catch (uploadOrParseErr) {
              if (originalLocalPhotoUri) {
                throw uploadOrParseErr;
              }
            }
          }

          await this.httpClient.rawRequest(item.endpoint, {
            method: item.method,
            body: bodyToSend,
            clientMutationId: item.clientMutationId,
            tokenOverride: this.getAccessToken() ?? undefined,
          });

          if (uploadedPhotoUrl && originalLocalPhotoUri) {
            db.update(products)
              .set({ photoUrl: uploadedPhotoUrl })
              .where(eq(products.photoUrl, originalLocalPhotoUri))
              .run();
            deleteLocalProductImageIfManaged(originalLocalPhotoUri);
          }

          removeOutboxItem(db, item.id);
        } catch (err) {
          if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) {
            markOutboxItemState(db, item.id, "conflict", {
              error: err.message,
              incrementRetry: true,
            });
            this.setState({
              status: "conflict",
              lastError: err.message,
            });
            continue;
          }

          markOutboxItemState(db, item.id, "pending", {
            error: err instanceof Error ? err.message : "Network error",
            incrementRetry: true,
          });
          this.setState({
            status: "offline",
            lastError: err instanceof Error ? err.message : "Offline",
          });
          break;
        }
      }

      await this.refreshOutboxCounts();
    } finally {
      this.flushing = false;
    }
  }

  async catchUpDelta(): Promise<void> {
    if (this.catchingUp || !this.getAccessToken()) return;
    this.catchingUp = true;

    try {
      const accessToken = this.getAccessToken() ?? undefined;
      const delta = await this.httpClient.syncDelta(
        this.state.lastCursor,
        accessToken,
      );
      if (delta.resetRequired) {
        await this.bootstrapAndHydrate();
        return;
      }

      const db = await ensureDbReady();
      const currentUserId = this.getCurrentUserId?.() ?? null;
      let maxCursor = this.state.lastCursor;
      let needsFullRefresh = false;

      for (const evt of delta.events) {
        const res = applyRemoteSyncEvent(db, evt, currentUserId);
        if (res.requiresRefresh) {
          needsFullRefresh = true;
        }
        if (evt.cursor > maxCursor) maxCursor = evt.cursor;
        this.onDeltaApplied?.(res, evt);
        this.emit(evt);
      }

      if (needsFullRefresh) {
        await this.bootstrapAndHydrate();
        return;
      }

      const latest = Math.max(maxCursor, delta.latestCursor || 0);
      const nowIso = new Date().toISOString();
      setSyncMetaValue(db, "last_sync_cursor", String(latest));
      setSyncMetaValue(db, "last_synced_at", nowIso);
      await setStoredSyncCursor(latest);

      this.setState({
        lastCursor: latest,
        lastSyncedAt: nowIso,
        status:
          this.state.conflictOutboxCount > 0 ? "conflict" : "live",
        lastError: null,
      });
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        this.setState({
          status: "offline",
          lastError: err instanceof Error ? err.message : "Sync unavailable",
        });
      }
    } finally {
      this.catchingUp = false;
    }
  }

  private connectStream(): void {
    if (this.destroyed || !this.started) return;
    const token = this.getAccessToken();
    if (!token) return;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    const controller = new AbortController();
    this.abortController = controller;

    const baseUrl = this.httpClient.getResolvedBaseUrl();
    const url = `${baseUrl}/api/mobile/v1/sync/stream?sinceCursor=${this.state.lastCursor}`;

    this.setState({
      status: this.reconnectAttempts > 0 ? "reconnecting" : "connecting",
    });

    void this.runSseStream(url, token, controller);
  }

  private async runSseStream(
    url: string,
    token: string,
    controller: AbortController,
  ): Promise<void> {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ApiError(`Sync stream error (${response.status})`, response.status);
      }

      const reader = response.body?.getReader?.();
      if (!reader) {
        // React Native JS engines without ReadableStream body: clean delta polling fallback
        this.reconnectAttempts = 0;
        this.setState({ status: "live", lastError: null });
        this.pollTimer = setInterval(() => {
          if (this.started && !this.destroyed) {
            void this.catchUpDelta();
          }
        }, 4000);
        return;
      }

      this.reconnectAttempts = 0;
      this.setState({
        status: this.state.conflictOutboxCount > 0 ? "conflict" : "live",
        lastError: null,
      });

      const decoder = new TextDecoder();
      let buffer = "";

      while (!controller.signal.aborted && !this.destroyed) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const rawFrame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          await this.handleSseFrame(rawFrame);
          boundary = buffer.indexOf("\n\n");
        }
      }

      if (!controller.signal.aborted && !this.destroyed) {
        this.scheduleReconnect();
      }
    } catch (err) {
      if (controller.signal.aborted || this.destroyed) return;
      if (err instanceof ApiError && err.status === 401) return;
      this.setState({
        status: "reconnecting",
        lastError: err instanceof Error ? err.message : "Stream disconnected",
      });
      this.scheduleReconnect();
    }
  }

  private async handleSseFrame(frame: string): Promise<void> {
    const lines = frame.split(/\r?\n/);
    let eventName = "message";
    const dataLines: string[] = [];

    for (const line of lines) {
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length === 0) return;
    const rawJson = dataLines.join("\n");
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(rawJson) as Record<string, unknown>;
    } catch {
      return;
    }

    if (eventName === "connected") {
      const resetRequired = Boolean(parsed?.resetRequired);
      const latestCursor = Number(parsed?.latestCursor ?? 0);
      if (resetRequired) {
        await this.bootstrapAndHydrate().catch(() => {});
      } else if (latestCursor > this.state.lastCursor) {
        await this.catchUpDelta().catch(() => {});
      } else {
        this.setState({
          status: this.state.conflictOutboxCount > 0 ? "conflict" : "live",
          lastError: null,
        });
      }
      return;
    }

    if (eventName === "sync" && parsed) {
      const evt = parsed as unknown as SyncEventDto;
      const db = await ensureDbReady();
      const res = applyRemoteSyncEvent(
        db,
        evt,
        this.getCurrentUserId?.() ?? null,
      );
      const nextCursor = Math.max(this.state.lastCursor, Number(evt.cursor || 0));
      const nowIso = new Date().toISOString();
      await setStoredSyncCursor(nextCursor);
      this.onDeltaApplied?.(res, evt);
      if (res.requiresRefresh) {
        this.scheduleRefreshFromCloud();
      }
      this.setState(
        {
          lastCursor: nextCursor,
          lastSyncedAt: nowIso,
          status: this.state.conflictOutboxCount > 0 ? "conflict" : "live",
        },
        evt,
      );
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed || !this.started || this.reconnectTimer) return;
    const delay = Math.min(20000, 1500 * Math.pow(2, this.reconnectAttempts));
    this.reconnectAttempts = Math.min(this.reconnectAttempts + 1, 5);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed && this.started) {
        void this.flushOutbox().catch(() => {});
        void this.catchUpDelta().catch(() => {});
        this.connectStream();
      }
    }, delay);
  }
}

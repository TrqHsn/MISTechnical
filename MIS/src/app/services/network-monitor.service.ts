import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { catchError, exhaustMap, interval, map, of, startWith, Subject, Subscription, tap } from 'rxjs';

export interface NetworkLogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'warning' | 'alert';
}

export interface NetworkServer {
  id: string;
  name: string;
  host: string;
  maintenance: boolean;
  status: 'green' | 'yellow' | 'red' | 'maintenance' | 'unknown';
  averageLatencyMs: number | null;
  packetLossPercent: number | null;
  lastCheckTime: string | null;
  lastDownTime: string | null;
  lastPingStatus: string | null;
  logs: NetworkLogEntry[];
  recentCycles: Array<{ timestamp: number; packetLossPercent: number; averageLatencyMs: number | null }>;
  redSince: number | null;
  alertCooldownUntil: number | null;
}

interface PingResponse {
  success: boolean;
  latency: number | null;
  status?: string;
}

interface StoredNetworkServer {
  id: string;
  name: string;
  host: string;
  maintenance: boolean;
  lastDownTime: string | null;
}

interface CreateServerRequest {
  name: string;
  host: string;
}

interface UpdateMaintenanceRequest {
  maintenance: boolean;
}

interface LivePingState {
  active: boolean;
  visible: boolean;
  output: string;
  status: 'starting' | 'running' | 'stopped' | 'error';
}

const LATENCY_THRESHOLD_MS = 100;
const POLL_INTERVAL_MS = 8000;
const RED_DELAY_MS = 30_000;
const ALERT_COOLDOWN_MS = 300_000;

const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    return `http://${hostname}:5001/api`;
  }
  return 'http://localhost:5001/api';
};

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `server-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
};

@Injectable({
  providedIn: 'root',
})
export class NetworkMonitorService {
  readonly servers = signal<NetworkServer[]>([]);
  readonly livePing = signal<Record<string, LivePingState>>({});
  private readonly livePingControllers = new Map<string, { controller: AbortController; sessionId: string }>();
  private readonly apiBaseUrl = getApiBaseUrl();
  private readonly isBrowser = typeof window !== 'undefined';
  private readonly destroy$ = new Subject<void>();
  private readonly subs = new Map<string, Subscription>();

  constructor(private http: HttpClient) {
    this.loadServers();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.subs.forEach((sub) => sub.unsubscribe());
    this.subs.clear();
  }

  addServer(name: string, host: string): void {
    const request: CreateServerRequest = {
      name,
      host,
    };

    this.http.post<StoredNetworkServer>(`${this.apiBaseUrl}/network/servers`, request).pipe(
      catchError((error) => {
        console.error('Unable to add server', error);
        return of(null);
      })
    ).subscribe((server) => {
      if (!server) {
        return;
      }

      const newServer: NetworkServer = {
        id: server.id,
        name: server.name,
        host: server.host,
        maintenance: server.maintenance,
        status: 'unknown',
        averageLatencyMs: null,
        packetLossPercent: null,
        lastCheckTime: null,
        lastDownTime: server.lastDownTime,
        lastPingStatus: null,
        logs: [],
        recentCycles: [],
        redSince: null,
        alertCooldownUntil: null,
      };

      this.servers.update((items: NetworkServer[]) => [...items, newServer]);
      this.startMonitoring(newServer.id);
    });
  }

  removeServer(serverId: string): void {
    this.http.delete(`${this.apiBaseUrl}/network/servers/${encodeURIComponent(serverId)}`).pipe(
      catchError((error) => {
        console.error('Unable to remove server', error);
        return of(null);
      })
    ).subscribe(() => {
      this.stopMonitoring(serverId);
      this.stopLivePing(serverId);
      this.servers.update((items: NetworkServer[]) => items.filter((item) => item.id !== serverId));
    });
  }

  toggleMaintenance(serverId: string): void {
    const server = this.servers().find((item) => item.id === serverId);
    if (!server) {
      return;
    }

    const request: UpdateMaintenanceRequest = {
      maintenance: !server.maintenance,
    };

    this.http.patch<StoredNetworkServer>(`${this.apiBaseUrl}/network/servers/${encodeURIComponent(serverId)}/maintenance`, request).pipe(
      catchError((error) => {
        console.error('Unable to update maintenance', error);
        return of(null);
      })
    ).subscribe((updated) => {
      if (!updated) {
        return;
      }

      this.servers.update((items: NetworkServer[]) =>
        items.map((item: NetworkServer) =>
          item.id !== serverId
            ? item
            : {
                ...item,
                maintenance: updated.maintenance,
                status: updated.maintenance ? 'maintenance' : 'unknown',
              }
        )
      );
    });
  }

  getLivePingState(serverId: string): LivePingState {
    return this.livePing()[serverId] ?? { active: false, visible: false, output: '', status: 'stopped' };
  }

  getLivePingOutput(serverId: string): string {
    return this.getLivePingState(serverId).output;
  }

  startLivePing(serverId: string): void {
    if (this.livePingControllers.has(serverId)) {
      return;
    }

    const server = this.servers().find((item) => item.id === serverId);
    if (!server) {
      return;
    }

    const controller = new AbortController();
    this.livePingControllers.set(serverId, { controller, sessionId: '' });
    this.setLivePingState(serverId, { active: true, visible: true, output: '🔄 Starting live ping...', status: 'starting' });

    fetch(`${this.apiBaseUrl}/network/ping/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address: server.host }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.body) {
          throw new Error('Live ping stream unavailable');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending = '';

        const processLine = (line: string) => {
          if (!line) {
            return;
          }

          let data = '';
          if (line.startsWith('data: ')) {
            data = line.substring(6);
          } else if (line.startsWith('data:')) {
            data = line.substring(5);
          } else {
            return;
          }

          if (data.startsWith('SESSION:')) {
            const sessionId = data.substring(8).trim();
            const saved = this.livePingControllers.get(serverId);
            if (saved) {
              saved.sessionId = sessionId;
            }
            return;
          }

          if (this.getLivePingState(serverId).status === 'starting') {
            this.setLivePingState(serverId, { status: 'running' });
          }

          this.appendLivePingOutput(serverId, `${data}\n`);
        };

        const read = (): Promise<void> =>
          reader.read().then(({ done, value }) => {
            if (done) {
              this.completeLivePing(serverId, 'stopped');
              return;
            }

            pending += decoder.decode(value, { stream: true });
            const lines = pending.split('\n');
            pending = lines.pop() ?? '';
            lines.forEach(processLine);
            return read();
          });

        return read();
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          this.completeLivePing(serverId, 'stopped');
          return;
        }

        this.appendLivePingOutput(serverId, `\n❌ Error: ${error.message}`);
        this.completeLivePing(serverId, 'error');
      });
  }

  stopLivePing(serverId: string): void {
    const active = this.livePingControllers.get(serverId);
    if (!active) {
      return;
    }

    active.controller.abort();
    this.livePingControllers.delete(serverId);

    if (active.sessionId) {
      this.http.post(`${this.apiBaseUrl}/network/ping/stop`, { sessionId: active.sessionId }).pipe(
        catchError(() => of(null))
      ).subscribe();
    }

    this.setLivePingState(serverId, { active: false, status: 'stopped' });
  }

  clearLivePing(serverId: string): void {
    const state = this.getLivePingState(serverId);
    if (!state.active && !state.visible) {
      return;
    }

    this.setLivePingState(serverId, { output: '', visible: false, status: state.active ? state.status : 'stopped' });
  }

  private setLivePingState(serverId: string, changes: Partial<LivePingState>): void {
    this.livePing.update((state) => ({
      ...state,
      [serverId]: {
        ...(state[serverId] ?? {
          active: false,
          visible: false,
          output: '',
          status: 'stopped',
        }),
        ...changes,
      },
    }));
  }

  private appendLivePingOutput(serverId: string, text: string): void {
    const current = this.getLivePingState(serverId);
    this.setLivePingState(serverId, { output: current.output + text });
  }

  private completeLivePing(serverId: string, status: 'stopped' | 'error'): void {
    this.livePingControllers.delete(serverId);
    this.setLivePingState(serverId, { active: false, status });
  }

  private parseTimestamp(value: string | null): Date | null {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  formatDate(value: string | null): string {
    const date = this.parseTimestamp(value);
    if (!date) {
      return '—';
    }
    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'long' });
    return `${day}-${month}-${date.getFullYear()}`;
  }

  formatTime(value: string | null): string {
    const date = this.parseTimestamp(value);
    if (!date) {
      return '—';
    }
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }

  formatUtcOffset(value: string | null): string {
    const date = this.parseTimestamp(value);
    if (!date) {
      return '—';
    }
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const hours = Math.floor(Math.abs(offset) / 60);
    const minutes = Math.abs(offset) % 60;
    return `UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`;
  }

  private loadServers(): void {
    if (!this.isBrowser) {
      this.servers.set([]);
      return;
    }

    this.http.get<StoredNetworkServer[]>(`${this.apiBaseUrl}/network/servers`).pipe(
      catchError((error) => {
        console.error('Unable to load server list from backend', error);
        return of([] as StoredNetworkServer[]);
      })
    ).subscribe((saved) => {
      const servers = saved.map((item) => ({
        id: item.id,
        name: item.name,
        host: item.host,
        maintenance: item.maintenance,
        status: 'unknown' as const,
        averageLatencyMs: null,
        packetLossPercent: null,
        lastCheckTime: null,
        lastDownTime: item.lastDownTime ?? null,
        lastPingStatus: null,
        logs: [],
        recentCycles: [],
        redSince: null,
        alertCooldownUntil: null,
      }));

      this.servers.set(servers);
      servers.forEach((server) => this.startMonitoring(server.id));
    });
  }

  private startMonitoring(serverId: string): void {
    if (this.subs.has(serverId)) {
      return;
    }

    const sub = interval(POLL_INTERVAL_MS)
      .pipe(startWith(0), exhaustMap(() => this.performCycle(serverId)))
      .subscribe({
        error: (error) => console.error('Network monitor error', error),
      });

    this.subs.set(serverId, sub);
  }

  private stopMonitoring(serverId: string): void {
    const sub = this.subs.get(serverId);
    if (sub) {
      sub.unsubscribe();
      this.subs.delete(serverId);
    }
  }

  private performCycle(serverId: string) {
    const server = this.servers().find((item) => item.id === serverId);
    if (!server) {
      return of(void 0);
    }

    if (server.maintenance) {
      this.updateServer(serverId, {
        lastCheckTime: new Date().toISOString(),
        status: 'maintenance',
      });
      return of(void 0);
    }

    const request = this.http.get<PingResponse>(`${this.apiBaseUrl}/network/ping?host=${encodeURIComponent(server.host)}`).pipe(
      catchError((error) => {
        console.error('Ping request failed for', server.host, error);
        return of({ success: false, latency: null, status: 'Error' });
      })
    );

    return request.pipe(
      map((result) => this.applyPingResults(serverId, [result])),
      catchError((error) => {
        console.error('Ping cycle failed', error);
        return of(void 0);
      })
    );
  }

  private applyPingResults(serverId: string, results: PingResponse[]): void {
    this.servers.update((items: NetworkServer[]) =>
      items.map((item: NetworkServer) => {
        if (item.id !== serverId) {
          return item;
        }

        const now = Date.now();
        const successful = results.filter((result) => result.success && typeof result.latency === 'number');
        const loss = results.length
          ? Math.round(((results.length - successful.length) / results.length) * 100)
          : 100;
        const averageLatency = successful.length
          ? Math.round(successful.reduce((sum, result) => sum + (result.latency ?? 0), 0) / successful.length)
          : null;

        const recentCycles = [
          ...item.recentCycles,
          {
            timestamp: now,
            packetLossPercent: loss,
            averageLatencyMs: averageLatency,
          },
        ].filter((cycle) => now - cycle.timestamp <= 60_000);

        const hasFull60SecondWindow = recentCycles.length > 0 && now - recentCycles[0].timestamp >= 60_000;
        const allGoodFor60Seconds = hasFull60SecondWindow && recentCycles.every(
          (cycle) => cycle.packetLossPercent === 0 && (cycle.averageLatencyMs ?? 0) < LATENCY_THRESHOLD_MS
        );

        const lossIsFull = loss === 100;
        const redSince = lossIsFull ? item.redSince ?? now : null;

        let nextStatus: NetworkServer['status'] = 'unknown';
        if (item.maintenance) {
          nextStatus = 'maintenance';
        } else if (lossIsFull && redSince && now - redSince >= RED_DELAY_MS) {
          nextStatus = 'red';
        } else if (lossIsFull) {
          nextStatus = 'yellow';
        } else if (allGoodFor60Seconds) {
          nextStatus = 'green';
        } else if (loss > 0 || (averageLatency !== null && averageLatency >= LATENCY_THRESHOLD_MS)) {
          nextStatus = 'yellow';
        } else if (averageLatency !== null) {
          nextStatus = 'green';
        }

        const logs = [...item.logs];
        let lastDownTime = item.lastDownTime;
        if (nextStatus === 'red' && item.status !== 'red') {
          lastDownTime = item.lastDownTime ?? new Date(now).toISOString();
          logs.unshift({
            timestamp: new Date(now).toLocaleString(),
            message: 'Server is DOWN',
            type: 'alert' as const,
          });
          this.sendAlert(item, `DOWN: ${item.name} (${item.host})`, 'Server entered RED state');
        }

        if (nextStatus === 'green' && item.status !== 'green') {
          logs.unshift({
            timestamp: new Date(now).toLocaleString(),
            message: 'Server recovered to GREEN',
            type: 'info' as const,
          });
          this.sendAlert(item, `RECOVERED: ${item.name}`, 'Server returned to GREEN');
        }

        if (logs.length > 10) {
          logs.length = 10;
        }

        return {
          ...item,
          recentCycles,
          redSince,
          packetLossPercent: loss,
          averageLatencyMs: averageLatency,
          lastCheckTime: new Date(now).toISOString(),
          lastDownTime,
          lastPingStatus: results[0]?.status ?? (successful.length ? 'Success' : 'No response'),
          status: nextStatus,
          logs,
        };
      })
    );
  }

  private updateServer(serverId: string, changes: Partial<NetworkServer>): void {
    this.servers.update((items: NetworkServer[]) =>
      items.map((item: NetworkServer) =>
        item.id === serverId ? { ...item, ...changes } : item
      )
    );
  }

  private sendAlert(server: NetworkServer, title: string, body: string): void {
    const now = Date.now();
    if (server.alertCooldownUntil && server.alertCooldownUntil > now) {
      return;
    }

    server.alertCooldownUntil = now + ALERT_COOLDOWN_MS;

    if (this.isBrowser && typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((permission) => {
          if (permission === 'granted') {
            new Notification(title, { body });
          } else {
            console.log(`${title}: ${body}`);
          }
        });
      } else {
        console.log(`${title}: ${body}`);
      }
    } else {
      console.log(`${title}: ${body}`);
    }
  }
}

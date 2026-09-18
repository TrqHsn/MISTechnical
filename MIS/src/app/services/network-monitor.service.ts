import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { catchError, of, tap } from 'rxjs';

export interface NetworkLogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'warning' | 'alert';
}

export interface NetworkServer {
  id: string;
  name: string;
  host: string;
  status: 'CHECKING' | 'ONLINE' | 'DEGRADE' | 'OFFLINE' | 'unknown';
  lastCheckTime: string | null;
  lastDownTime: string | null;
  lastPingStatus: string | null;
  logs: NetworkLogEntry[];
  redSince: number | null;
  alertCooldownUntil: number | null;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  silent: boolean;
}

interface StoredNetworkServer {
  id: number | string;
  name: string;
  host: string;
  status?: 'CHECKING' | 'ONLINE' | 'DEGRADE' | 'OFFLINE' | 'unknown';
  lastDownTime?: string | null;
  lastCheckTime?: string | null;
  lastPingStatus?: string | null;
}

interface CreateServerRequest {
  name: string;
  host: string;
}

interface LivePingState {
  active: boolean;
  visible: boolean;
  output: string;
  status: 'starting' | 'running' | 'stopped' | 'error';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function colorizeLineHtml(line: string): string {
  const escaped = escapeHtml(line);
  if (line.includes('Reply from') && line.includes('bytes=') && line.includes('time=')) {
    return `<span class="ping-success">${escaped}</span>\n`;
  }

  if (
    line.includes('Request timed out') ||
    line.includes('Destination host unreachable') ||
    line.includes('could not find host') ||
    line.includes('100% loss') ||
    line.includes('0 received')
  ) {
    return `<span class="ping-fail">${escaped}</span>\n`;
  }

  return `<span>${escaped}</span>\n`;
}

const ALERT_COOLDOWN_MS = 300_000;

const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    return `http://${hostname}:5001/api`;
  }
  return 'http://localhost:5001/api';
};

const getHubUrl = (): string => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    return `http://${hostname}:5001/hubs/network-dashboard`;
  }
  return 'http://localhost:5001/hubs/network-dashboard';
};

@Injectable({
  providedIn: 'root',
})
export class NetworkMonitorService {
  readonly servers = signal<NetworkServer[]>([]);
  readonly livePing = signal<Record<string, LivePingState>>({});
  private readonly livePingControllers = new Map<string, { controller: AbortController; sessionId: string }>();
  private readonly apiBaseUrl = getApiBaseUrl();
  private readonly hubUrl = getHubUrl();
  private readonly isBrowser = typeof window !== 'undefined';
  private hubConnection: HubConnection | null = null;
  private monitoringStarted = false;
  private readonly localSilentMap = new Map<string, boolean>();

  constructor(private http: HttpClient) {
    this.connectRealtimeMonitoring();
  }

  ngOnDestroy(): void {
    this.hubConnection?.stop().catch(() => undefined);
    this.stopAllLivePings();
  }

  private connectRealtimeMonitoring(): void {
    if (!this.isBrowser || this.hubConnection) {
      return;
    }

    this.hubConnection = new HubConnectionBuilder()
      .withUrl(this.hubUrl, { withCredentials: true })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    this.hubConnection.on('ServersUpdated', (snapshot: StoredNetworkServer[]) => {
      this.applyServerSnapshot(snapshot);
    });

    this.hubConnection.start()
      .then(() => this.refreshServers().subscribe())
      .catch((error) => {
        console.error('Unable to connect to network dashboard hub', error);
      });
  }

  addServer(name: string, host: string): void {
    const request: CreateServerRequest = { name, host };

    this.http.post<StoredNetworkServer>(`${this.apiBaseUrl}/network/servers`, request).pipe(
      catchError((error) => {
        console.error('Unable to add server', error);
        return of(null);
      })
    ).subscribe((server) => {
      if (!server) {
        return;
      }

      this.refreshServers().subscribe();
    });
  }

  removeServer(serverId: string): void {
    this.http.delete(`${this.apiBaseUrl}/network/servers/${encodeURIComponent(serverId)}`).pipe(
      catchError((error) => {
        console.error('Unable to remove server:', serverId, error);
        alert(`Failed to remove server: ${error.status} ${error.statusText || error.message}`);
        return of(null);
      })
    ).subscribe(() => {
      this.localSilentMap.delete(serverId);
      this.stopLivePing(serverId);
      this.refreshServers().subscribe();
    });
  }

  clearAllServers(): void {
    const serverIds = this.servers().map((server) => server.id);
    serverIds.forEach((id) => this.removeServer(id));
  }

  toggleSilent(serverId: string): void {
    const current = this.localSilentMap.get(serverId) ?? false;
    const next = !current;
    this.localSilentMap.set(serverId, next);

    this.servers.update((items) =>
      items.map((item) =>
        item.id !== serverId
          ? item
          : {
              ...item,
              silent: next,
            }
      )
    );
  }

  getLivePingState(serverId: string): LivePingState {
    return this.livePing()[serverId] ?? { active: false, visible: false, output: '', status: 'stopped' };
  }

  getLivePingOutput(serverId: string): string {
    return this.getLivePingState(serverId).output;
  }

  getLivePingHtml(serverId: string): string {
    const out = this.getLivePingOutput(serverId) || '';
    if (!out) return '';
    const lines = out.split('\n');
    return lines.map((line) => colorizeLineHtml(line)).join('');
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
      headers: { 'Content-Type': 'application/json' },
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

  private stopAllLivePings(): void {
    [...this.livePingControllers.keys()].forEach((serverId) => this.stopLivePing(serverId));
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

  startMonitoring(): void {
    if (this.monitoringStarted) {
      return;
    }

    this.monitoringStarted = true;
    this.refreshServers().subscribe();
  }

  moveServerToTop(serverId: string): void {
    this.servers.update((items) => {
      const index = items.findIndex((item) => item.id === serverId);
      if (index <= 0) {
        return items;
      }
      const server = items[index];
      const next = [...items.slice(0, index), ...items.slice(index + 1)];
      return [server, ...next];
    });
  }

  refreshServers() {
    return this.http.get<StoredNetworkServer[]>(`${this.apiBaseUrl}/network/servers`).pipe(
      tap((saved) => this.applyServerSnapshot(saved)),
      catchError((error) => {
        console.error('Unable to refresh server statuses', error);
        return of([] as StoredNetworkServer[]);
      })
    );
  }

  private applyServerSnapshot(snapshot: StoredNetworkServer[]): void {
    const currentServers = new Map(this.servers().map((server) => [server.id, server]));
    const servers = snapshot.map((item) => {
      const existing = currentServers.get(String(item.id)) ?? {
        logs: [],
        redSince: null,
        alertCooldownUntil: null,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        silent: false,
      };

      return {
        id: String(item.id),
        name: item.name,
        host: item.host,
        status: item.status ?? 'unknown',
        lastCheckTime: item.lastCheckTime ?? null,
        lastDownTime: item.lastDownTime ?? null,
        lastPingStatus: item.lastPingStatus ?? null,
        logs: existing.logs,
        redSince: existing.redSince,
        alertCooldownUntil: existing.alertCooldownUntil,
        consecutiveFailures: existing.consecutiveFailures,
        consecutiveSuccesses: existing.consecutiveSuccesses,
        silent: this.localSilentMap.get(String(item.id)) ?? existing.silent ?? false,
      } satisfies NetworkServer;
    });

    this.servers.set(servers);
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

import { Component, ViewChildren, QueryList, ElementRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NetworkMonitorService } from '../../services/network-monitor.service';

@Component({
  selector: 'app-network-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './network-dashboard.html',
  styleUrls: ['./network-dashboard.css'],
})
export class NetworkDashboardComponent {
  @ViewChildren('livePingOutput') livePingOutputs?: QueryList<ElementRef<HTMLElement>>;

  private lastLivePingOutput = new Map<string, string>();
  private livePingScrollLocked = new Map<string, boolean>();

  serverName = '';
  serverHost = '';
  errorMessage = '';
  showAddDialog = false;

  get servers() {
    return this.networkMonitor.servers;
  }

  constructor(public networkMonitor: NetworkMonitorService) {
    effect(() => {
      const livePing = this.networkMonitor.livePing();
      const changedServerIds = new Set<string>();

      const visibleOutputs = Object.entries(livePing)
        .filter(([, state]) => state.visible)
        .map(([serverId, state]) => ({ serverId, output: state.output }));

      visibleOutputs.forEach(({ serverId, output }) => {
        if (this.lastLivePingOutput.get(serverId) !== output) {
          changedServerIds.add(serverId);
          this.lastLivePingOutput.set(serverId, output);
        }
      });

      const activeServerIds = new Set(visibleOutputs.map((item) => item.serverId));
      this.lastLivePingOutput.forEach((_, serverId) => {
        if (!activeServerIds.has(serverId)) {
          this.lastLivePingOutput.delete(serverId);
        }
      });

      if (changedServerIds.size > 0 && typeof window !== 'undefined') {
        setTimeout(() => this.scrollLivePingOutputsToBottom(changedServerIds), 0);
      }
    });
  }

  onLivePingScroll(serverId: string, event: Event): void {
    const target = event.target as HTMLElement;
    const distanceFromBottom = target.scrollHeight - target.clientHeight - target.scrollTop;
    const locked = distanceFromBottom > 24;
    this.livePingScrollLocked.set(serverId, locked);
  }

  private scrollLivePingOutputsToBottom(changedServerIds: Set<string>): void {
    this.livePingOutputs?.forEach((output) => {
      const el = output.nativeElement;
      const serverId = el.dataset['serverId'];
      if (!serverId || !changedServerIds.has(serverId)) {
        return;
      }

      const isLocked = this.livePingScrollLocked.get(serverId);
      if (isLocked) {
        return;
      }

      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    });
  }

  openAddDialog(): void {
    this.errorMessage = '';
    this.serverName = '';
    this.serverHost = '';
    this.showAddDialog = true;
  }

  closeAddDialog(): void {
    this.showAddDialog = false;
    this.errorMessage = '';
  }

  addServer(): void {
    const name = this.serverName.trim();
    const host = this.serverHost.trim();
    if (!name || !host) {
      this.errorMessage = 'Name and hostname/IP must be provided.';
      return;
    }

    this.networkMonitor.addServer(name, host);
    this.errorMessage = '';
    this.serverName = '';
    this.serverHost = '';
    this.showAddDialog = false;
  }

  removeServer(serverId: string): void {
    this.networkMonitor.removeServer(serverId);
  }

  toggleMaintenance(serverId: string): void {
    this.networkMonitor.toggleMaintenance(serverId);
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'green':
        return 'ONLINE';
      case 'yellow':
        return 'DEGRADED';
      case 'red':
        return 'OFFLINE';
      case 'maintenance':
        return 'MAINTENANCE';
      default:
        return 'UNKNOWN';
    }
  }
}

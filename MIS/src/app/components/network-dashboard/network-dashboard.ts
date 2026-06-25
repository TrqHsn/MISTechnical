import { Component, ViewChildren, QueryList, ElementRef, effect, OnDestroy, afterNextRender } from '@angular/core';
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
export class NetworkDashboardComponent implements OnDestroy {
  @ViewChildren('livePingOutput') livePingOutputs?: QueryList<ElementRef<HTMLElement>>;

  private lastLivePingOutput = new Map<string, string>();
  private livePingScrollLocked = new Map<string, boolean>();
  private openEventModals = new Map<string, boolean>();
  private offlineAlertIntervalId: number | null = null;
  private alertAudio: HTMLAudioElement | null = null;
  private alertAudioUnlocked = false;
  private pendingOfflineAlert = false;
  private autoStartedServers = new Set<string>();

  serverName = '';
  serverHost = '';
  errorMessage = '';
  showAddDialog = false;
  isUploadMode = false;
  csvFileContent = '';
  csvFileName = '';
  private hydrationComplete = false;

  get servers() {
    return this.networkMonitor.servers;
  }

  constructor(public networkMonitor: NetworkMonitorService) {
    if (typeof window !== 'undefined') {
      this.alertAudio = new Audio('/ping-beep.mp3');
      this.alertAudio.preload = 'auto';
      this.alertAudio.volume = 0.8;
      this.registerAudioGestureUnlock();
    }

    afterNextRender(() => {
      this.hydrationComplete = true;

      effect(() => {
        if (this.hydrationComplete) {
          this.autoStartLivePing();
        }
      });

      effect(() => {
        if (!this.hydrationComplete) return;
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

      effect(() => {
        if (this.hydrationComplete) {
          this.updateOfflineAlertState();
        }
      });
    });
  }

  ngOnDestroy(): void {
    this.stopOfflineAlert();
  }

  private autoStartLivePing(): void {
    this.servers().forEach((server) => {
      if (!this.autoStartedServers.has(server.id) && !server.maintenance) {
        this.autoStartedServers.add(server.id);
        this.networkMonitor.startLivePing(server.id);
      }
    });
  }

  private updateOfflineAlertState(): void {
    const hasOffline = this.servers().some((server) => server.status === 'red');
    if (hasOffline) {
      this.startOfflineAlert();
    } else {
      this.stopOfflineAlert();
    }
  }

  private startOfflineAlert(): void {
    if (this.offlineAlertIntervalId !== null) {
      return;
    }

    this.playAlertTone();
    this.offlineAlertIntervalId = window.setInterval(() => this.playAlertTone(), 5000);
  }

  private stopOfflineAlert(): void {
    if (this.offlineAlertIntervalId !== null) {
      window.clearInterval(this.offlineAlertIntervalId);
      this.offlineAlertIntervalId = null;
    }
  }

  private playAlertTone(): void {
    if (!this.alertAudio) {
      return;
    }

    if (!this.alertAudioUnlocked) {
      this.pendingOfflineAlert = true;
      return;
    }

    this.alertAudio.pause();
    this.alertAudio.currentTime = 0;
    this.alertAudio.play().catch(() => {
      // Playback may be blocked until the user interacts with the page.
      this.pendingOfflineAlert = true;
    });
  }

  private registerAudioGestureUnlock(): void {
    const unlock = (): void => {
      if (!this.alertAudio) {
        return;
      }

      this.alertAudio.play()
        .then(() => {
          this.alertAudio?.pause();
          if (this.alertAudio) {
            this.alertAudio.currentTime = 0;
          }
          this.alertAudioUnlocked = true;
          if (this.pendingOfflineAlert) {
            this.pendingOfflineAlert = false;
            this.playAlertTone();
          }
        })
        .catch(() => {
          this.pendingOfflineAlert = true;
        });
    };

    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true, passive: true });
    window.addEventListener('touchstart', unlock, { once: true, passive: true });
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
    this.isUploadMode = false;
    this.csvFileContent = '';
    this.csvFileName = '';
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

  openEventsModal(serverId: string): void {
    this.openEventModals.set(serverId, true);
  }

  closeEventsModal(serverId: string): void {
    this.openEventModals.delete(serverId);
  }

  isEventsModalOpen(serverId: string): boolean {
    return this.openEventModals.has(serverId);
  }

  handleCsvUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    // Clear previous file data
    this.csvFileContent = '';
    this.csvFileName = '';
    this.errorMessage = '';

    this.csvFileName = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.csvFileContent = e.target?.result as string;
    };
    reader.readAsText(file);
  }

  processCsvUpload(): void {
    if (!this.csvFileContent) {
      this.errorMessage = 'Please select a CSV file.';
      return;
    }

    const lines = this.csvFileContent.trim().split('\n');
    if (lines.length < 2) {
      this.errorMessage = 'CSV file must have at least a header row and one data row.';
      return;
    }

    // Clear all existing servers before loading CSV
    this.networkMonitor.clearAllServers();

    // Skip the first row (header)
    const dataRows = lines.slice(1);
    const addedServers: string[] = [];
    const failedRows: string[] = [];

    dataRows.forEach((line, index) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        return; // Skip empty lines
      }

      const columns = trimmedLine.split(',').map((col) => col.trim());
      if (columns.length < 2) {
        failedRows.push(`Row ${index + 2}: Missing hostname/IP`);
        return;
      }

      const name = columns[0];
      const host = columns[1];

      if (!name || !host) {
        failedRows.push(`Row ${index + 2}: Name or hostname/IP is empty`);
        return;
      }

      this.networkMonitor.addServer(name, host);
      addedServers.push(`${name} (${host})`);
    });

    if (failedRows.length > 0) {
      this.errorMessage = `Added ${addedServers.length} server(s). Failed rows: ${failedRows.join('; ')}`;
    } else {
      this.errorMessage = '';
    }

    // Reset and close
    this.csvFileContent = '';
    this.csvFileName = '';
    this.isUploadMode = false;
    this.showAddDialog = false;
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

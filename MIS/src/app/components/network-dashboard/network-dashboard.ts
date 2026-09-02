import { Component, effect, OnDestroy, afterNextRender, signal, ViewChildren, QueryList, ElementRef } from '@angular/core';
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
  @ViewChildren('livePingOutput') livePingOutputs?: QueryList<ElementRef<HTMLPreElement>>;
  private openEventModals = new Map<string, boolean>();
  private livePingAutoScrollIntervalId: number | null = null;
  private offlineAlertIntervalId: number | null = null;
  private alertAudio: HTMLAudioElement | null = null;
  private autoStartedServers = new Set<string>();
  private lastYellowAlertAt = 0;
  private lastRedAlertAt = 0;

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
      this.alertAudio.load();
    }

    afterNextRender(() => {
      this.hydrationComplete = true;

      effect(() => {
        if (this.hydrationComplete) {
          this.autoStartLivePing();
        }
      });

      effect(() => {
        if (this.hydrationComplete) {
          this.updateOfflineAlertState();
        }
      });

      this.livePingAutoScrollIntervalId = window.setInterval(() => {
        this.scrollLivePingOutputsToBottom();
      }, 1000);
    });
  }

  ngOnDestroy(): void {
    this.stopOfflineAlert();
    if (this.livePingAutoScrollIntervalId !== null) {
      window.clearInterval(this.livePingAutoScrollIntervalId);
      this.livePingAutoScrollIntervalId = null;
    }
  }

  private autoStartLivePing(): void {
    this.servers().forEach((server) => {
      if (!this.autoStartedServers.has(server.id) && !server.maintenance) {
        this.autoStartedServers.add(server.id);
        this.networkMonitor.startLivePing(server.id);
      }
    });
  }

  startLivePing(serverId: string): void {
    this.networkMonitor.moveServerToTop(serverId);
    this.networkMonitor.startLivePing(serverId);
  }

  trackByServerId(index: number, server: { id: string }): string {
    return server.id;
  }

  private updateOfflineAlertState(): void {
    const hasOffline = this.servers().some((server) => server.status === 'red');
    const hasDegraded = this.servers().some((server) => server.status === 'yellow');

    if (hasOffline) {
      this.startOfflineAlert();
    } else {
      this.stopOfflineAlert();
    }

    if (hasDegraded && !hasOffline) {
      const now = Date.now();
      if (now - this.lastYellowAlertAt >= 5000) {
        this.lastYellowAlertAt = now;
        this.playAlertTone();
      }
    }
  }

  private startOfflineAlert(): void {
    if (this.offlineAlertIntervalId !== null) {
      return;
    }

    this.lastRedAlertAt = Date.now();
    this.playAlertTone();
    this.offlineAlertIntervalId = window.setInterval(() => {
      this.lastRedAlertAt = Date.now();
      this.playAlertTone();
    }, 2000);
  }

  private stopOfflineAlert(): void {
    if (this.offlineAlertIntervalId !== null) {
      window.clearInterval(this.offlineAlertIntervalId);
      this.offlineAlertIntervalId = null;
    }
  }

  private playAlertTone(): void {
    if (!this.alertAudio) {
      console.warn('playAlertTone called but alertAudio is not initialized');
      return;
    }

    this.alertAudio.pause();
    this.alertAudio.currentTime = 0;
    this.alertAudio.play().catch((error) => {
      console.warn('Alert sound failed to play:', error);
    });
  }

  private scrollLivePingOutputsToBottom(): void {
    try {
      if (!this.livePingOutputs) return;
      this.livePingOutputs.forEach((el) => {
        try {
          const node = el.nativeElement;
          node.scrollTop = Math.max(0, node.scrollHeight - node.clientHeight);
        } catch (e) {
          // ignore per-element errors
        }
      });
    } catch (e) {
      // swallow; not critical
    }
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

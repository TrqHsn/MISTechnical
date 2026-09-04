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
  private yellowAlertAudio: HTMLAudioElement | null = null;
  private redAlertAudio: HTMLAudioElement | null = null;
  private lastYellowAlertAt = 0;
  private lastRedAlertAt = 0;
  private audioInteractionHandler: (() => void) | null = null;
  private latchedAlertLevels = new Map<string, 'yellow' | 'red'>();
  private monitoringStarted = signal(false);
  menuOpen = false;
  showAudioModeDialog = true;
  alertMode: 'ringer' | 'silent' | null = null;

  serverName = '';
  serverHost = '';
  errorMessage = '';
  showAddDialog = false;
  isUploadMode = false;
  csvFileContent = '';
  csvFileName = '';
  private hydrationComplete = signal(false);

  get servers() {
    return this.networkMonitor.servers;
  }

  constructor(public networkMonitor: NetworkMonitorService) {
    if (typeof window !== 'undefined') {
      this.yellowAlertAudio = this.createAlertAudio('/Sounds/yellow%20warning.mp3');
      this.redAlertAudio = this.createAlertAudio('/Sounds/red%20warning.mp3');
      this.audioInteractionHandler = () => this.primeAlertAudio();
      window.addEventListener('pointerdown', this.audioInteractionHandler, { once: true });
      window.addEventListener('keydown', this.audioInteractionHandler, { once: true });
    }

    effect(() => {
      if (this.hydrationComplete()) {
        this.updateOfflineAlertState();
      }
    });

    afterNextRender(() => {
      this.hydrationComplete.set(true);

      this.livePingAutoScrollIntervalId = window.setInterval(() => {
        this.scrollLivePingOutputsToBottom();
      }, 1000);
    });
  }

  ngOnDestroy(): void {
    this.stopOfflineAlert();
    this.yellowAlertAudio?.pause();
    this.redAlertAudio?.pause();
    if (this.audioInteractionHandler !== null) {
      window.removeEventListener('pointerdown', this.audioInteractionHandler);
      window.removeEventListener('keydown', this.audioInteractionHandler);
      this.audioInteractionHandler = null;
    }
    if (this.livePingAutoScrollIntervalId !== null) {
      window.clearInterval(this.livePingAutoScrollIntervalId);
      this.livePingAutoScrollIntervalId = null;
    }
  }

  private startMonitoringAfterAudioChoice(): void {
    if (this.monitoringStarted()) {
      return;
    }

    this.monitoringStarted.set(true);
    this.networkMonitor.startMonitoring();
  }

  startLivePing(serverId: string): void {
    this.networkMonitor.moveServerToTop(serverId);
    this.networkMonitor.startLivePing(serverId);
  }

  trackByServerId(index: number, server: { id: string }): string {
    return server.id;
  }

  private updateOfflineAlertState(): void {
    this.servers().forEach((server) => {
      if (!server.maintenance && (server.status === 'yellow' || server.status === 'red')) {
        this.latchedAlertLevels.set(server.id, server.status === 'red' ? 'red' : 'yellow');
      } else {
        this.latchedAlertLevels.delete(server.id);
      }
    });

    const hasOffline = [...this.latchedAlertLevels.values()].some((level) => level === 'red');
    const hasDegraded = [...this.latchedAlertLevels.values()].some((level) => level === 'yellow');

    if (this.alertMode !== 'ringer') {
      this.stopOfflineAlert();
      return;
    }

    if (hasOffline) {
      this.startOfflineAlert();
      return;
    }

    this.stopOfflineAlert();

    if (hasDegraded) {
      const now = Date.now();
      if (now - this.lastYellowAlertAt >= 5000) {
        this.lastYellowAlertAt = now;
        this.playAlertTone('yellow');
      }
    } else {
      this.stopOfflineAlert();
    }
  }

  private startOfflineAlert(): void {
    if (this.offlineAlertIntervalId !== null) {
      return;
    }

    this.lastRedAlertAt = Date.now();
    this.playAlertTone('red');
    this.offlineAlertIntervalId = window.setInterval(() => {
      this.lastRedAlertAt = Date.now();
      this.playAlertTone('red');
    }, 2000);
  }

  private stopOfflineAlert(): void {
    if (this.offlineAlertIntervalId !== null) {
      window.clearInterval(this.offlineAlertIntervalId);
      this.offlineAlertIntervalId = null;
    }

    [this.yellowAlertAudio, this.redAlertAudio].forEach((audio) => {
      audio?.pause();
      if (audio) {
        audio.currentTime = 0;
      }
    });
  }

  private createAlertAudio(source: string): HTMLAudioElement {
    const audio = new Audio(source);
    audio.preload = 'auto';
    audio.volume = 0.8;
    audio.load();
    return audio;
  }

  private playAlertTone(level: 'yellow' | 'red'): void {
    if (this.alertMode !== 'ringer') {
      return;
    }

    const audio = level === 'red' ? this.redAlertAudio : this.yellowAlertAudio;
    const otherAudio = level === 'red' ? this.yellowAlertAudio : this.redAlertAudio;
    if (!audio) {
      console.warn(`${level} alert audio is not initialized`);
      return;
    }

    otherAudio?.pause();
    audio.pause();
    audio.currentTime = 0;
    audio.play().catch((error) => {
      console.warn(`${level} alert sound failed to play:`, error);
    });
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  openAddServerDialog(): void {
    this.menuOpen = false;
    this.openAddDialog();
  }

  async toggleMute(): Promise<void> {
    this.menuOpen = false;
    if (this.alertMode === 'ringer') {
      this.alertMode = 'silent';
      this.stopOfflineAlert();
      this.yellowAlertAudio?.pause();
      this.redAlertAudio?.pause();
      return;
    }

    this.alertMode = 'ringer';
    await this.primeAlertAudio();
    this.updateOfflineAlertState();
  }

  async selectAlertMode(mode: 'ringer' | 'silent'): Promise<void> {
    this.alertMode = mode;
    this.showAudioModeDialog = false;
    this.startMonitoringAfterAudioChoice();

    if (mode === 'silent') {
      this.stopOfflineAlert();
      return;
    }

    await this.primeAlertAudio();
    this.updateOfflineAlertState();
  }

  private async primeAlertAudio(): Promise<void> {
    const priming = [this.yellowAlertAudio, this.redAlertAudio]
      .filter((audio): audio is HTMLAudioElement => audio !== null)
      .map(async (audio) => {
        audio.muted = true;
        audio.currentTime = 0;

        try {
          await audio.play();
        } catch {
          return;
        } finally {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        }
      });

    await Promise.all(priming);
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
    const server = this.servers().find((item) => item.id === serverId);
    if (server && !server.maintenance) {
      this.latchedAlertLevels.delete(serverId);
      this.stopOfflineAlert();
    }

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

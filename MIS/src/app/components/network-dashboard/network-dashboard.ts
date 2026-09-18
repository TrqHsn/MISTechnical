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
  private alertModeTimeoutId: number | null = null;
  private audioInteractionHandler: (() => void) | null = null;
  private audioUnlocked = false;
  private latchedAlertLevels = new Map<string, 'yellow' | 'red'>();
  private monitoringStarted = signal(false);
  menuOpen = false;
  showAudioModeDialog = true;
  alertMode: 'ringer' | 'silent' | null = null;

  serverName = '';
  serverHost = '';
  errorMessage = '';
  showAddDialog = false;
  private hydrationComplete = signal(false);

  get servers() {
    return this.networkMonitor.servers;
  }

  constructor(public networkMonitor: NetworkMonitorService) {
    if (typeof window !== 'undefined') {
      this.yellowAlertAudio = this.createAlertAudio('/Sounds/degrade_warning.mp3');
      this.redAlertAudio = this.createAlertAudio('/Sounds/ofline_warning.mp3');
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

      this.alertModeTimeoutId = window.setTimeout(() => {
        if (this.alertMode === null) {
          this.selectAlertMode('ringer');
        }
      }, 5000);
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
    if (this.alertModeTimeoutId !== null) {
      window.clearTimeout(this.alertModeTimeoutId);
      this.alertModeTimeoutId = null;
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
    this.latchedAlertLevels.clear();

    this.servers().forEach((server) => {
      if (server.silent) {
        return;
      }

      if (server.status === 'OFFLINE') {
        this.latchedAlertLevels.set(server.id, 'red');
      } else if (server.status === 'DEGRADE') {
        this.latchedAlertLevels.set(server.id, 'yellow');
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
    }
  }

  private startOfflineAlert(): void {
    if (this.offlineAlertIntervalId !== null) {
      return;
    }

    this.playAlertTone('red');
    this.offlineAlertIntervalId = window.setInterval(() => {
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

  private async ensureAudioUnlocked(): Promise<void> {
    if (this.audioUnlocked) {
      return;
    }

    const audios = [this.yellowAlertAudio, this.redAlertAudio].filter(
      (audio): audio is HTMLAudioElement => audio !== null
    );

    for (const audio of audios) {
      audio.muted = true;
      audio.currentTime = 0;
      try {
        await audio.play();
      } catch {
        continue;
      } finally {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      }
    }

    this.audioUnlocked = true;
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

    if (!this.audioUnlocked) {
      this.ensureAudioUnlocked().catch(() => undefined);
    }

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
    if (this.alertModeTimeoutId !== null) {
      window.clearTimeout(this.alertModeTimeoutId);
      this.alertModeTimeoutId = null;
    }

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
    await this.ensureAudioUnlocked();
  }

  private scrollLivePingOutputsToBottom(): void {
    try {
      if (!this.livePingOutputs) return;
      this.livePingOutputs.forEach((el) => {
        try {
          const node = el.nativeElement;
          node.scrollTop = Math.max(0, node.scrollHeight - node.clientHeight);
        } catch {
          // ignore per-element errors
        }
      });
    } catch {
      // swallow; not critical
    }
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

  toggleSilent(serverId: string): void {
    this.networkMonitor.toggleSilent(serverId);
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

  getStatusLabel(status: string): string {
    switch (status) {
      case 'ONLINE':
        return 'ONLINE';
      case 'DEGRADE':
        return 'DEGRADED';
      case 'OFFLINE':
        return 'OFFLINE';
      case 'CHECKING':
        return 'CHECKING';
      default:
        return 'UNKNOWN';
    }
  }

  getStatusCss(status: string): string {
    switch (status) {
      case 'ONLINE':
        return 'green';
      case 'DEGRADE':
        return 'yellow';
      case 'OFFLINE':
        return 'red';
      case 'CHECKING':
        return 'unknown';
      default:
        return 'unknown';
    }
  }

  getCardCssClass(server: { status: string; silent: boolean }): string {
    return [server.status, server.silent ? 'silent' : ''].filter(Boolean).join(' ');
  }
}

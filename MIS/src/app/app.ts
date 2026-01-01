import { Component, signal, OnDestroy } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { ApiService } from './services/api';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('MIS');

  buttons = [
    { name: 'Sticker', id: 'sticker' },
    { name: 'Warranty', id: 'wranty' },
    { name: 'Jobsheet', id: 'jobsheet' },
    { name: 'OS form', id: 'oif' },
    { name: 'AD Tools', id: 'testapi' },
    { name: 'Update', id: 'update' },
    { name: 'Unlock', id: 'unlock' }
  ];

  // Work timer (7:30 -> 16:30 local time)
  timerLabel = signal('');       // e.g., "Time left" / "Starts in"
  timerValue = signal('00:00:00');
  timerState = signal('inactive'); // 'inactive'|'running'|'next'
  private _timerInterval: any;

  // Unlock modal state
  unlockDialogVisible = signal(false);
  isUnlocking = signal(false);
  unlocked = signal<string[]>([]);
  failed = signal<{ samAccountName: string; reason: string }[]>([]);

  constructor(private apiService: ApiService) {
    this.startWorkTimer();
  }

  onTopButtonClick(id: string) {
    if (id === 'unlock') {
      this.openUnlockDialog();
    }
  }

  openUnlockDialog() {
    this.unlockDialogVisible.set(true);
    this.unlocked.set([]);
    this.failed.set([]);
    this.performUnlock();
  }

  closeUnlockDialog() {
    this.unlockDialogVisible.set(false);
    this.isUnlocking.set(false);
  }

  performUnlock() {
    this.isUnlocking.set(true);
    this.apiService.unlockAllUsers().subscribe(
      (res) => {
        this.unlocked.set(res.unlocked || []);
        this.failed.set((res.failed || []).map(f => ({ samAccountName: (f as any).samAccountName || (f as any).SamAccountName || '<unknown>', reason: (f as any).reason || (f as any).Reason || 'Unknown' })));
        this.isUnlocking.set(false);
      },
      (err) => {
        console.error('Unlock failed', err);
        this.failed.set([{ samAccountName: '<error>', reason: err.error?.message || err.message || 'Unknown error' }]);
        this.isUnlocking.set(false);
      }
    );
  }

  ngOnDestroy(): void {
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
    }
  }

  private startWorkTimer() {
    const update = () => {
      const now = new Date();
      const start = new Date(now);
      start.setHours(7, 30, 0, 0);
      const end = new Date(now);
      end.setHours(16, 30, 0, 0);

      let label = '';
      let remainingMs = 0;

      if (now < start) {
        label = 'Starts in';
        remainingMs = start.getTime() - now.getTime();
        this.timerState.set('next');
      } else if (now >= start && now <= end) {
        label = 'Time left';
        remainingMs = end.getTime() - now.getTime();
        this.timerState.set('running');
      } else {
        // after end: show next day's start countdown
        const nextStart = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        label = 'Next start in';
        remainingMs = nextStart.getTime() - now.getTime();
        this.timerState.set('inactive');
      }

      if (remainingMs < 0) remainingMs = 0;

      this.timerLabel.set(label);
      this.timerValue.set(this.formatDuration(remainingMs));
    };

    update();
    this._timerInterval = setInterval(update, 1000);
  }

  private formatDuration(ms: number) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }
}

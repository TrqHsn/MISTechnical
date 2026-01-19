import { Component, signal, OnDestroy, ViewChild, HostListener } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { ApiService } from './services/api';
import { ToastComponent } from './components/toast/toast.component';
import { UniversalSearchComponent } from './components/universal-search/universal-search';
import { NavigationService } from './services/navigation.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, ToastComponent, UniversalSearchComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('MIS');

  @ViewChild(UniversalSearchComponent) universalSearch?: UniversalSearchComponent;

  buttons = [
    { name: 'AD Tools', id: 'testapi' },
    { name: 'Print', id: 'print' },
    { name: 'Forms', id: 'oif' },
    { name: 'Device Tool', id: 'devicetool' },
    { name: 'Inventory', id: 'inventory' },
    { name: 'Network', id: 'network' },
    { name: 'Display', id: 'kiosk' },
    { name: 'Links', id: 'links' },
    { name: 'Unlock', id: 'unlock' },
  ];

  // Work timer (7:30 -> 16:30 local time)
  timerLabel = signal('');       // e.g., "Time left" / "Starts in"
  timerValue = signal('00:00:00');
  timerState = signal('inactive'); // 'inactive'|'running'|'next'
  private _timerInterval: any;

  // Digital clock
  clockHours = signal<string[]>(['0', '0']);
  clockMinutes = signal<string[]>(['0', '0']);
  clockSeconds = signal<string[]>(['0', '0']);
  clockAmPm = signal('AM');
  clockWeekday = signal(0);
  private _clockInterval: any;

  // Unlock modal state
  unlockDialogVisible = signal(false);
  isUnlocking = signal(false);
  unlocked = signal<string[]>([]);
  failed = signal<{ samAccountName: string; reason: string }[]>([]);

  constructor(
    private apiService: ApiService,
    public navService: NavigationService
  ) {
    this.startWorkTimer();
    this.startClock();
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Ctrl+Space to open universal search (easy left-hand shortcut)
    if (event.ctrlKey && event.code === 'Space') {
      event.preventDefault();
      this.universalSearch?.open();
    }
  }

  handleUniversalSearchAction(actionId: string) {
    switch (actionId) {
      case 'unlock-accounts':
        this.openUnlockDialog();
        break;
      // Add more action handlers here as needed
    }
  }

  onTopButtonClick(evt: Event, id: string) {
    if (id === 'unlock') {
      this.openUnlockDialog();
      evt.preventDefault();
      return;
    }
  }

  getButtonRoute(buttonId: string): string | null {
    return this.navService.getRoute(buttonId);
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
    if (this._clockInterval) {
      clearInterval(this._clockInterval);
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

  private startClock() {
    const digitNames = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

    const updateClock = () => {
      const now = new Date();
      let hours = now.getHours();
      const minutes = now.getMinutes();
      const seconds = now.getSeconds();
      const isAM = hours < 12;

      // Convert to 12-hour format
      if (hours === 0) hours = 12;
      else if (hours > 12) hours -= 12;

      const h1 = digitNames[Math.floor(hours / 10)];
      const h2 = digitNames[hours % 10];
      const m1 = digitNames[Math.floor(minutes / 10)];
      const m2 = digitNames[minutes % 10];
      const s1 = digitNames[Math.floor(seconds / 10)];
      const s2 = digitNames[seconds % 10];

      this.clockHours.set([h1, h2]);
      this.clockMinutes.set([m1, m2]);
      this.clockSeconds.set([s1, s2]);
      this.clockAmPm.set(isAM ? 'AM' : 'PM');

      // Weekday: SAT=0, SUN=1, MON=2, TUE=3, WED=4, THU=5, FRI=6
      // JavaScript getDay(): Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
      const dow = (now.getDay() + 1) % 7;
      this.clockWeekday.set(dow);
    };

    updateClock();
    this._clockInterval = setInterval(updateClock, 1000);
  }
}

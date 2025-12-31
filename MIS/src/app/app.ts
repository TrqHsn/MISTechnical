import { Component, signal, OnDestroy } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('MIS');

  buttons = [
    { name: 'Label Sticker', id: 'sticker' },
    { name: 'WRANTY', id: 'wranty' },
    { name: 'Jobsheet', id: 'jobsheet' },
    { name: 'OS form', id: 'oif' },
    { name: 'AD Tools', id: 'testapi' }
  ];

  // Work timer (7:30 -> 16:30 local time)
  timerLabel = signal('');       // e.g., "Time left" / "Starts in"
  timerValue = signal('00:00:00');
  timerState = signal('inactive'); // 'inactive'|'running'|'next'
  private _timerInterval: any;

  constructor() {
    this.startWorkTimer();
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

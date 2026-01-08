import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

type KeyRow = ReadonlyArray<string>;

@Component({
  selector: 'app-keyboard-tester',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './keyboard-tester.component.html',
  styleUrl: './keyboard-tester.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyboardTesterComponent implements OnInit, OnDestroy {
  readonly KEY_ROWS: ReadonlyArray<KeyRow> = [
    ['Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'],
    ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace'],
    ['Tab', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
    ['CapsLock', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", 'Enter'],
    ['Shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', 'Shift'],
    ['Control', 'Meta', 'Alt', ' ', 'Alt', 'Meta', 'Control'],
    ['ArrowUp'],
    ['ArrowLeft', 'ArrowDown', 'ArrowRight']
  ] as const;

  readonly SPECIAL_KEYS = new Set<string>([
    'Escape','F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12',
    'Tab','CapsLock','Shift','Control','Meta','Alt','Enter','Backspace',
    'ArrowUp','ArrowLeft','ArrowDown','ArrowRight'
  ]);

  readonly KEY_DISPLAY_NAMES: Readonly<Record<string, string>> = {
    '`': '~ `','1': '! 1','2': '@ 2','3': '# 3','4': '$ 4','5': '% 5','6': '^ 6','7': '& 7','8': '* 8','9': '( 9','0': ') 0','-': '_ -','=': '+ =',
    '[': '{ [',']': '} ]','\\': '| \\\n',';': ': ;',"'": '" \'' , ',': '< ,','.' : '> .','/': '? /',' ': 'Space','ArrowUp': '↑','ArrowLeft': '←','ArrowDown': '↓','ArrowRight': '→'
  } as const as Readonly<Record<string, string>>;

  readonly KEY_CODE_MAP: Readonly<Record<string, string>> = {
    'Escape': 'Esc','Backspace': 'Backspace','Tab': 'Tab','Enter': 'Enter','Shift': 'Shift','Control': 'Ctrl','Meta': 'Meta','Alt': 'Alt','CapsLock': 'Caps',' ': 'Space','ArrowUp': '↑','ArrowLeft': '←','ArrowDown': '↓','ArrowRight': '→'
  } as const;

  // UI state
  keysPressed = 0;
  lastKey = 'None';
  lastKeyCode = '-';
  keyHistory: string[] = [];
  kpm = 0;
  soundEnabled = false;
  testAreaFocused = false;

  private audioContext?: AudioContext;
  private keyPressTimestamps: number[] = [];
  private activeKeys = new Set<string>();
  private activeTimeouts = new Map<string, any>();

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {}

  ngOnDestroy(): void {
    // Clear any pending key highlight timeouts
    this.activeTimeouts.forEach(handle => clearTimeout(handle));
    this.activeTimeouts.clear();
    if (this.audioContext) {
      try { this.audioContext.close(); } catch {}
    }
  }

  isSpecial(key: string): boolean {
    return this.SPECIAL_KEYS.has(key);
  }

  labelFor(key: string): string {
    return this.KEY_DISPLAY_NAMES[key] ? this.KEY_DISPLAY_NAMES[key].split(' ')[0] : key;
  }

  codeLabelFor(key: string): string {
    return this.KEY_CODE_MAP[key] || key;
  }

  isActive(key: string): boolean {
    return this.activeKeys.has(key);
  }

  onToggleSound(enabled: boolean): void {
    this.soundEnabled = enabled;
    // Lazy init audio context on first toggle to satisfy user gesture constraints
    if (this.soundEnabled && !this.audioContext) {
      try { this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch {}
    }
    this.cdr.markForCheck();
  }

  onTextareaFocus(): void { this.testAreaFocused = true; }
  onTextareaBlur(): void { this.testAreaFocused = false; }

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(ev: KeyboardEvent): void {
    if (this.testAreaFocused) return; // Let textarea handler manage when focused
    ev.preventDefault();
    this.handleKey(ev);
  }

  onTextareaKeydown(ev: KeyboardEvent): void {
    // Don't prevent default so typing works
    this.handleKey(ev);
  }

  private handleKey(event: KeyboardEvent): void {
    const key = event.key;
    const code = event.code;

    // Update counters
    this.keysPressed++;
    const displayKey = key === ' ' ? 'Space' : key;
    this.lastKey = displayKey;
    this.lastKeyCode = code;

    // Update history (max 20)
    this.keyHistory.unshift(displayKey);
    if (this.keyHistory.length > 20) this.keyHistory.pop();

    // Update KPM timestamps (last 10s)
    const now = Date.now();
    this.keyPressTimestamps.push(now);
    this.keyPressTimestamps = this.keyPressTimestamps.filter(ts => now - ts <= 10000);
    this.kpm = Math.round((this.keyPressTimestamps.length / 10) * 60);

    // Highlight keys
    this.highlightMatchingKeys(key, code);

    // Play sound
    this.playKeySound();

    this.cdr.markForCheck();
  }

  private highlightMatchingKeys(key: string, code: string): void {
    const candidates: string[] = [];
    if (key === ' ') {
      candidates.push(' ');
    } else {
      candidates.push(code);
      candidates.push(key);
      if (key.length === 1) {
        const lower = key.toLowerCase();
        if (lower !== key) candidates.push(lower);
      }
    }

    // Activate any layout key matching candidates
    this.KEY_ROWS.forEach(row => {
      row.forEach(k => {
        if (candidates.includes(k)) this.activateKey(k);
      });
    });
  }

  private activateKey(k: string): void {
    this.activeKeys.add(k);
    // Reset any existing timeout
    const prev = this.activeTimeouts.get(k);
    if (prev) clearTimeout(prev);
    const handle = setTimeout(() => {
      this.activeKeys.delete(k);
      this.activeTimeouts.delete(k);
      this.cdr.markForCheck();
    }, 200);
    this.activeTimeouts.set(k, handle);
  }

  private playKeySound(): void {
    if (!this.soundEnabled) return;
    if (!this.audioContext) {
      try { this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return; }
    }
    const ctx = this.audioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 800 + Math.random() * 400;
    gain.gain.value = 0.1;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.stop(ctx.currentTime + 0.1);
  }
}

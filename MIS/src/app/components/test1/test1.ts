import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-test1',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './test1.html',
  styleUrls: ['./test1.css'],
})
export class Test1Component {
  // Two editable text boxes (shared settings affect both)
  text1 = signal('');
  text2 = signal('');

  // Settings that apply to both text boxes / preview / print
  fontFamily = signal('Arial');
  fontSizePt = signal(8); // Font size in points for API
  bold = signal(true);
  caps = signal(true);

  // Print status
  printStatus = signal('');
  isPrinting = signal(false);

  constructor(private http: HttpClient) {}

  // Quick setters used from template
  setText1(value: string) {
    this.text1.set(this.caps() ? value.toUpperCase() : value);
  }
  
  setText2(value: string) {
    this.text2.set(this.caps() ? value.toUpperCase() : value);
  }

  // When toggling caps, update both fields to match new state
  toggleCaps() {
    const t1 = this.text1();
    const t2 = this.text2();
    const capsOn = !this.caps();
    this.caps.set(capsOn);
    this.text1.set(capsOn ? t1.toUpperCase() : t1.toLowerCase());
    this.text2.set(capsOn ? t2.toUpperCase() : t2.toLowerCase());
  }

  setFontFamily(value: string) { this.fontFamily.set(value); }
  setFontSizePt(value: number) { this.fontSizePt.set(Number(value)); }
  setBold(value: boolean) { this.bold.set(!!value); }
  setCaps(value: boolean) { this.caps.set(!!value); }

  // Word-like increment/decrement
  increaseFont() { this.fontSizePt.set(this.fontSizePt() + 1); }
  decreaseFont() { this.fontSizePt.set(Math.max(1, this.fontSizePt() - 1)); }

  // Toggle bold state (used by the Bold button)
  toggleBold() { this.bold.set(!this.bold()); }

  // Print via ASP.NET API
  print() {
    this.isPrinting.set(true);
    this.printStatus.set('Sending to printer...');

    const request = {
      text1: this.text1(),
      text2: this.text2(),
      fontFamily: this.fontFamily(),
      fontSize: this.fontSizePt(),
      bold: this.bold(),
      caps: this.caps()
    };

    this.http.post('http://localhost:5001/api/print/label', request)
      .subscribe({
        next: () => {
          this.printStatus.set('✅ Printed successfully!');
          this.isPrinting.set(false);
          setTimeout(() => this.printStatus.set(''), 3000);
        },
        error: (err) => {
          this.printStatus.set(`❌ Print failed: ${err.error?.message || err.message}`);
          this.isPrinting.set(false);
          setTimeout(() => this.printStatus.set(''), 5000);
        }
      });
  }
}

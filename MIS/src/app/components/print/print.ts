import { Component, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-print',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './print.html',
  styleUrl: './print.css',
})
export class Print {
  // Tab management
  activeTab = signal<'label' | 'service-tag'>('label');

  // Label Print Tab - properties
  text1 = signal('');
  text2 = signal('');
  fontFamily = signal('Calibri, Courier New, Courier, monospace');
  fontSizePt = signal(24);
  bold = signal(true);
  caps = signal(true);

  // Print status for server-side printing
  printStatus = signal('');
  isPrinting = signal(false);

  constructor(private http: HttpClient) {}

  // Label Print Tab - methods
  setText1(value: string) {
    this.text1.set(this.caps() ? value.toUpperCase() : value);
  }
  setText2(value: string) {
    this.text2.set(this.caps() ? value.toUpperCase() : value);
  }
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
  increaseFont() { this.fontSizePt.set(this.fontSizePt() + 1); }
  decreaseFont() { this.fontSizePt.set(Math.max(1, this.fontSizePt() - 1)); }
  toggleBold() { this.bold.set(!this.bold()); }

  private escapeHtml(s: string) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  printLabel() {
    if (typeof window === 'undefined') return;

    const raw1 = this.text1();
    const raw2 = this.text2();
    const t1 = this.escapeHtml(this.caps() ? raw1.toUpperCase() : raw1);
    const t2 = this.escapeHtml(this.caps() ? raw2.toUpperCase() : raw2);
    const fontFamily = this.fontFamily();
    const fontSizePt = this.fontSizePt();
    const fontSizeMm = +(fontSizePt * 0.352777778).toFixed(3);
    const weight = this.bold() ? 700 : 400;

    const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Print Stickers</title>
          <style>
            @page { size: 61mm 16mm; margin: 0; }
            html,body { margin:0; padding:0; }
            body { -webkit-print-color-adjust: exact; }
            .sticker { width:61mm; height:16mm; display:flex; align-items:center; justify-content:center; font-family: ${fontFamily}; font-size: ${fontSizeMm}mm; font-weight:${weight}; box-sizing:border-box; page-break-after: always; }
            .line { line-height:1; }
          </style>
        </head>
        <body>
          <div class="sticker"><div class="line">${t1 || '&nbsp;'}</div></div>
          <div class="sticker"><div class="line">${t2 || '&nbsp;'}</div></div>
        </body>
      </html>`;

    let newWin: Window | null = null;
    try { newWin = window.open('', '_blank'); } catch (e) { newWin = null; }

    const cleanupIframe = (iframe: HTMLIFrameElement | null) => {
      if (!iframe) return;
      try { document.body.removeChild(iframe); } catch {}
    };

    const printFromWindow = (win: Window) => {
      try {
        win.document.open();
        win.document.write(html);
        win.document.close();
      } catch (e) {
        return false;
      }

      const doPrint = () => {
        try { (win as any).onafterprint = () => { try { win.close(); } catch {} }; } catch {}
        try { win.focus(); } catch {}
        try { win.print(); } catch (e) {}
      };

      try { (win as any).onload = doPrint; } catch {}

      const poll = setInterval(() => {
        try {
          if (win.document && win.document.readyState === 'complete') {
            clearInterval(poll);
            doPrint();
          }
        } catch (e) {}
      }, 50);

      setTimeout(() => { clearInterval(poll); doPrint(); }, 2000);
      return true;
    };

    if (newWin) {
      const ok = printFromWindow(newWin);
      if (ok) return;
    }

    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc) { cleanupIframe(iframe); try { alert('Unable to create print frame. Allow popups or print manually.'); } catch {} ; return; }

      doc.open();
      doc.write(html);
      doc.close();

      const tryIframePrint = () => {
        try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch (e) {}
        setTimeout(() => cleanupIframe(iframe), 1500);
      };

      const p = setInterval(() => {
        try {
          if (doc.readyState === 'complete') {
            clearInterval(p);
            tryIframePrint();
          }
        } catch (e) {}
      }, 50);

      setTimeout(() => { clearInterval(p); tryIframePrint(); }, 2000);
    } catch (e) {
      try { alert('Printing failed. Please use the browser print dialog.'); } catch {}
    }
  }

  // Server-side printing via ASP.NET API
  printLabelServer() {
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

  // Service Tag Tab - ViewChild references
  @ViewChild('whereToClaim') whereToClaim!: ElementRef;
  @ViewChild('hostName') hostName!: ElementRef;
  @ViewChild('deviceModel') deviceModel!: ElementRef;
  @ViewChild('sendingDate') sendingDate!: ElementRef;
  @ViewChild('currentCondition') currentCondition!: ElementRef;
  @ViewChild('problemDetails') problemDetails!: ElementRef;
  @ViewChild('printSection') printSection!: ElementRef;

  // Service Tag Tab - methods
  clearAll(): void {
    const inputs = [
      this.whereToClaim,
      this.hostName,
      this.deviceModel,
      this.sendingDate,
      this.currentCondition,
      this.problemDetails
    ];
    
    inputs.forEach(input => {
      if (input && input.nativeElement) {
        input.nativeElement.value = '';
      }
    });
  }

  printServiceTag(): void {
    const inputs = [
      this.whereToClaim,
      this.hostName,
      this.deviceModel,
      this.sendingDate,
      this.currentCondition,
      this.problemDetails
    ];

    inputs.forEach(ref => {
      if (!ref || !ref.nativeElement) return;
      const el = ref.nativeElement as HTMLElement & { value?: string };
      const tag = el.tagName?.toUpperCase();
      if (tag === 'INPUT') {
        (el as HTMLInputElement).setAttribute('value', (el as HTMLInputElement).value || '');
      } else if (tag === 'TEXTAREA') {
        (el as HTMLTextAreaElement).textContent = (el as HTMLTextAreaElement).value || '';
      }
    });

    const printContent = this.printSection.nativeElement.innerHTML;
    const originalContent = document.body.innerHTML;

    document.body.innerHTML = printContent;
    window.print();
    document.body.innerHTML = originalContent;

    window.location.reload();
  }
}

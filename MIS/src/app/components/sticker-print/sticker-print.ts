import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-sticker-print',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sticker-print.html',
  styleUrls: ['./sticker-print.css'],
})
export class StickerPrint {
  // Two editable text boxes (shared settings affect both)
  text1 = signal('');
  text2 = signal('');

  // Settings that apply to both text boxes / preview / print
  fontFamily = signal('Calibri, Courier New, Courier, monospace');
  // Use font size in points (pt) for Word-like control; convert to mm when printing
  fontSizePt = signal(24); // default 24pt
  bold = signal(true);
  // Caps toggle (acts like CapsLock) — apply uppercase when printing; default ON
  caps = signal(true);

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

  // Escape HTML to safely write into print document
  private escapeHtml(s: string) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Print each text box on its own page (61mm x 16mm) with iframe fallback
  print() {
    if (typeof window === 'undefined') return;

    // Apply caps toggle before escaping
    const raw1 = this.text1();
    const raw2 = this.text2();
    const t1 = this.escapeHtml(this.caps() ? raw1.toUpperCase() : raw1);
    const t2 = this.escapeHtml(this.caps() ? raw2.toUpperCase() : raw2);
    const fontFamily = this.fontFamily();
    // convert points to millimeters (1pt = 0.352777778 mm)
    const fontSizePt = this.fontSizePt();
    const fontSizeMm = +(fontSizePt * 0.352777778).toFixed(3);
    const weight = this.bold() ? 700 : 400;

    // HTML containing two pages; each .sticker will be a separate printed page
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

    // Try to open a new window for printing.
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

    // Fallback: hidden iframe
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
}

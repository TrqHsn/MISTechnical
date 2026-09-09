import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import * as XLSX from 'xlsx';

interface InventoryRow {
  [key: string]: unknown;
}

@Component({
  selector: 'app-print',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './print.html',
  styleUrl: './print.css',
})
export class Print implements OnInit {
  // Tab management
  activeTab = signal<'label' | 'service-tag' | 'forms'>('label');

  // Forms Tab - PDF list
  pdfForms = [
    { name: 'Asset Transfer Form', file: 'Asset Transfar Form.pdf' },
    { name: 'Desktop User Policy', file: 'Desktop User Policy.pdf' },
    { name: 'Laptop User Policy', file: 'Laptop User Policy.pdf' },
    { name: 'Mobile WiFi Access', file: 'Mobile WiFi Access.pdf' }
  ];

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
  inventoryLoading = signal(false);
  inventoryError = signal('');

  serviceTagForm: FormGroup;
  private inventoryRows: InventoryRow[] = [];
  sentByOptions = ['TH', 'NM', 'PM'];
  itContactNumbersFixed = 'Piyer Mollah - +8801752800084, Ridoan Zahan - +8801712158121';

  get assetNumber() { return this.serviceTagForm.get('assetNumber'); }
  get deviceTypeModel() { return this.serviceTagForm.get('deviceTypeModel'); }
  get serialNumber() { return this.serviceTagForm.get('serialNumber'); }
  get username() { return this.serviceTagForm.get('username'); }
  get sendingDate() { return this.serviceTagForm.get('sendingDate'); }
  get diagnosis() { return this.serviceTagForm.get('diagnosis'); }
  get accessories() { return this.serviceTagForm.get('accessories'); }
  get sentTo() { return this.serviceTagForm.get('sentTo'); }
  get itContactNumbers() { return this.serviceTagForm.get('itContactNumbers'); }
  get sentBy() { return this.serviceTagForm.get('sentBy'); }
  get remarks() { return this.serviceTagForm.get('remarks'); }

  constructor(private http: HttpClient, private route: ActivatedRoute, private fb: FormBuilder) {
    const today = new Date().toISOString().split('T')[0];
    this.serviceTagForm = this.fb.group({
      assetNumber: ['BD-'],
      deviceTypeModel: [''],
      serialNumber: [''],
      username: [''],
      sendingDate: [today],
      diagnosis: [''],
      accessories: [''],
      sentTo: [''],
      itContactNumbers: [{ value: this.itContactNumbersFixed, disabled: true }],
      sentBy: ['TH'],
      remarks: ['']
    });
  }

  formatDateDisplay(dateString: string): string {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      const day = date.toLocaleString('en-GB', { day: '2-digit' });
      const month = date.toLocaleString('en-GB', { month: 'short' });
      const year = date.getFullYear();
      return `${day} ${month}, ${year}`;
    } catch {
      return dateString;
    }
  }

  printServiceTag(): void {
    if (typeof window === 'undefined') return;

    const vals: any = {
      assetNumber: this.serviceTagForm.get('assetNumber')?.value || '',
      deviceTypeModel: this.serviceTagForm.get('deviceTypeModel')?.value || '',
      serialNumber: this.serviceTagForm.get('serialNumber')?.value || '',
      sendingDate: this.formatDateDisplay(this.serviceTagForm.get('sendingDate')?.value || ''),
      diagnosis: this.serviceTagForm.get('diagnosis')?.value || '',
      sentTo: this.serviceTagForm.get('sentTo')?.value || '',
      sentBy: this.serviceTagForm.get('sentBy')?.value || 'TH',
      remarks: this.serviceTagForm.get('remarks')?.value || '',
      itContactNumbers: this.itContactNumbersFixed
    };

    const escape = (s: string) => this.escapeHtml(String(s || '')).replace(/\r?\n/g, '<br />');

    const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Service Form</title>
          <style>
            @page { size: A4; margin: 8mm; }
            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              font-family: Inter, -apple-system, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              color: #111;
              background: #fff;
            }
            body {
              display: flex;
              align-items: flex-start;
              justify-content: center;
              -webkit-print-color-adjust: exact;
              color-adjust: exact;
            }
            .card {
              width: 100%;
              max-width: 180mm;
              border-radius: 10px;
              overflow: hidden;
              box-sizing: border-box;
              background: #ffffff;
              box-shadow: 0 10px 30px rgba(18, 38, 75, 0.08);
              border: 1px solid rgba(31, 60, 114, 0.12);
              page-break-inside: avoid;
            }
            .header {
              background: linear-gradient(90deg, #1f3c72 0%, #2b6fb3 100%);
              color: #fff;
              padding: 8px 12px;
              text-align: center;
            }
            .header h1 {
              font-size: 14pt;
              margin: 0;
              font-weight: 800;
              letter-spacing: 0.4px;
            }
            .subheader {
              font-size: 9pt;
              opacity: 0.95;
              margin-top: 4px;
            }
            .grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 8px;
              font-size: 10pt;
              padding: 10px;
            }
            .label {
              font-weight: 700;
              font-size: 8.5pt;
              color: #233a66;
              margin-bottom: 4px;
              text-transform: uppercase;
              letter-spacing: 0.6px;
            }
            .value {
              font-size: 10pt;
              color: #0b1220;
              padding: 6px 8px;
              background: linear-gradient(180deg, rgba(244,247,255,0.6), rgba(255,255,255,0.6));
              border-radius: 6px;
              white-space: pre-wrap;
            }
            .full {
              grid-column: 1 / -1;
            }
            .footer {
              margin-top: 8px;
              font-size: 8pt;
              color: #556070;
              padding: 8px 12px;
              text-align: center;
              background: linear-gradient(180deg, rgba(245,247,252,0.6), rgba(255,255,255,0.6));
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <h1>Service Tag</h1>
            </div>
            <div class="grid">
              <div>
                <div class="label">Asset Number</div>
                <div class="value">${escape(vals.assetNumber)}</div>
              </div>
              <div>
                <div class="label">Device Type / Model</div>
                <div class="value">${escape(vals.deviceTypeModel)}</div>
              </div>
              <div>
                <div class="label">Serial Number (SN)</div>
                <div class="value">${escape(vals.serialNumber)}</div>
              </div>
              <div>
                <div class="label">Sending Date</div>
                <div class="value">${escape(vals.sendingDate)}</div>
              </div>
              <div>
                <div class="label">Sent To</div>
                <div class="value">${escape(vals.sentTo)}</div>
              </div>
              <div>
                <div class="label">Diagnosis / Observation</div>
                <div class="value">${escape(vals.diagnosis)}</div>
              </div>
              <div>
                <div class="label">Sent By</div>
                <div class="value">${escape(vals.sentBy)}</div>
              </div>
              <div class="full">
                <div class="label">Remarks</div>
                <div class="value">${escape(vals.remarks)}</div>
              </div>
            </div>
            <div class="footer">
              <div class="label">IT Contact Numbers</div>
              <div class="value">${escape(vals.itContactNumbers)}</div>
              <div>Generated by <b>Shanta Denims</b> IT Department</div>
            </div>
          </div>
        </body>
      </html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.visibility = 'hidden';
    iframe.srcdoc = html;
    document.body.appendChild(iframe);

    const printFrame = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.error('Print failed:', e);
      }

      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch {}
      }, 1000);
    };

    iframe.onload = () => {
      setTimeout(printFrame, 250);
    };
  }

  ngOnInit(): void {
    this.serviceTagForm.get('assetNumber')?.valueChanges.subscribe(value => {
      this.populateServiceTagFromInventory(String(value ?? ''));
    });
    void this.loadInventory();

    this.route.queryParams.subscribe(params => {
      const tab = params['tab'] as 'label' | 'service-tag' | 'forms' | undefined;
      if (tab === 'label' || tab === 'service-tag' || tab === 'forms') {
        this.activeTab.set(tab);
      }
    });
  }

  private async loadInventory(): Promise<void> {
    this.inventoryLoading.set(true);
    this.inventoryError.set('');

    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/inventory/csv`);
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const csvText = await response.text();
      const workbook = XLSX.read(csvText, { type: 'string', raw: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      this.inventoryRows = XLSX.utils.sheet_to_json<InventoryRow>(worksheet, {
        defval: ''
      });

      this.populateServiceTagFromInventory(String(this.assetNumber?.value ?? ''));
    } catch (error) {
      console.error('Error loading inventory for service tag:', error);
      this.inventoryError.set('Inventory data is unavailable.');
    } finally {
      this.inventoryLoading.set(false);
    }
  }

  onAssetNumberInput(value: string): void {
    this.populateServiceTagFromInventory(value);
  }

  private populateServiceTagFromInventory(assetNumber: string): void {
    const normalizedAssetNumber = assetNumber.trim().toLowerCase();
    const match = normalizedAssetNumber
      ? this.inventoryRows.find(row => this.getInventoryField(row, ['Asset No', 'asset no'])
          .toLowerCase() === normalizedAssetNumber)
      : undefined;

    this.serviceTagForm.patchValue({
      deviceTypeModel: this.getInventoryField(match, ['Model', 'model']),
      serialNumber: this.getInventoryField(match, ['Serial No', 'serial no']),
      sentTo: this.getInventoryField(match, ['Pur From', 'pur from'])
    }, { emitEvent: false });
  }

  private getInventoryField(row: InventoryRow | undefined, fieldNames: string[]): string {
    if (!row) {
      return '';
    }

    const lookup = new Map<string, unknown>();
    for (const [key, value] of Object.entries(row)) {
      lookup.set(String(key).trim().toLowerCase(), value);
    }

    for (const fieldName of fieldNames) {
      const fieldKey = String(fieldName).trim().toLowerCase();
      const value = lookup.get(fieldKey);
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        return String(value).trim();
      }
    }

    return '';
  }

  private normalizeInventoryValue(value: unknown): string {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  private getApiBaseUrl(): string {
    if (typeof window !== 'undefined') {
      return `http://${window.location.hostname}:5001`;
    }
    return 'http://localhost:5001';
  }

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

  private normalizeFontFamily(fontFamily: string): string {
    const genericFonts = new Set(['serif', 'sans-serif', 'sans', 'monospace', 'cursive', 'fantasy', 'system-ui', 'arial', 'helvetica', 'times', 'times new roman', 'courier', 'courier new']);
    const candidates = (fontFamily || '')
      .split(',')
      .map(name => name.trim().replace(/['"]/g, ''))
      .filter(Boolean);

    const firstRealFont = candidates.find(name => !genericFonts.has(name.toLowerCase()));
    const selected = firstRealFont || candidates[0] || 'Arial';
    return selected.trim();
  }

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

    const fontSizePt = Math.max(6, Math.min(72, Number(this.fontSizePt()) || 24));
    const request = {
      text1: this.text1(),
      text2: this.text2(),
      fontFamily: this.normalizeFontFamily(this.fontFamily()),
      fontSize: fontSizePt,
      bold: this.bold(),
      caps: this.caps()
    };

    this.http.post(`${this.getApiBaseUrl()}/api/print/label`, request)
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

  // Service Tag Tab - methods
  clearAll(): void {
    this.serviceTagForm.reset();
  }
  // Forms Tab - Print PDF method
  openFormItem(form: { name: string; file: string }) {
    this.printPdf(form.file);
  }

  printPdf(filename: string) {
    if (typeof window === 'undefined') return;

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow?.print();
        } catch (e) {
          console.error('Print failed:', e);
        }
      }, 250);
    };

    iframe.src = `PDF/${filename}`;
  }
}

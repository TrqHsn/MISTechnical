import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api';
import { lastValueFrom } from 'rxjs';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-update-user-info',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './update-user-info.component.html',
  styleUrl: './update-user-info.component.css'
})
export class UpdateUserInfoComponent {
  fileName = signal('');
  rawContent = signal('');
  rows = signal<Array<{ upn: string; department: string; title: string; manager: string; original: string }>>([]);
  previewRows = signal<Array<{ upn: string; department: string; title: string; manager: string; original: string }>>([]);
  awaitingConfirmation = signal(false);
  isUpdating = signal(false);
  progress = signal('');
  failedRows = signal<Array<{ upn: string; department: string; title: string; manager: string; error: string; original: string }>>([]);
  showFailedModal = signal(false);
  showPreviewModal = signal(false);
  showSuccessModal = signal(false);
  headerError = signal('');
  rowLimitError = signal('');
  readonly MAX_ROWS = 1000;
  constructor(private api: ApiService) {}

  onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    this.headerError.set('');
    this.rowLimitError.set('');
    const ext = (file.name.split('.').pop() || '').toLowerCase();

    if (ext !== 'xlsx') {
      this.headerError.set('Only .xlsx files are supported. Please upload an Excel (.xlsx) file.');
      // clear input so user can re-select
      input.value = '';
      return;
    }

    this.fileName.set(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const data = new Uint8Array(reader.result as ArrayBuffer);
      this.parseXlsx(data);
      // clear input so selecting same file again will trigger change
      input.value = '';
    };
    reader.readAsArrayBuffer(file);
  }

  private parseCsv(text: string) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) {
      this.headerError.set('File is empty');
      return;
    }

    // Validate header row
    const headerCols = this.simpleCsvSplit(lines[0]).map(h => h.trim().toLowerCase());
    const expected = ['upn', 'department', 'title', 'manager'];
    if (headerCols.length < 4 || !expected.every((v, i) => headerCols[i] === v)) {
      this.headerError.set('Invalid header. Expected: UPN,Department,Title,Manager (case-insensitive, in order)');
      return;
    }

    const dataLines = lines.slice(1);
    if (dataLines.length > this.MAX_ROWS) {
      this.rowLimitError.set(`Row limit exceeded. Max ${this.MAX_ROWS} rows allowed.`);
      return;
    }

    const parsed: Array<{ upn: string; department: string; title: string; manager: string; original: string }> = [];
    for (const line of dataLines) {
      const cols = this.simpleCsvSplit(line);
      const upn = (cols[0] || '').trim();
      const department = (cols[1] || '').trim();
      const title = (cols[2] || '').trim();
      const manager = (cols[3] || '').trim();
      parsed.push({ upn, department, title, manager, original: line });
    }

    this.rows.set(parsed);
  }

  private simpleCsvSplit(line: string) {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === ',' && !inQuotes) {
        result.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    result.push(cur);
    return result;
  }

  private parseXlsx(data: ArrayBuffer | Uint8Array) {
    // Convert to workbook and read first sheet
    const wb = XLSX.read(data, { type: 'array' });
    const first = wb.SheetNames[0];
    const sheet = wb.Sheets[first];
    const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (!raw || raw.length === 0) {
      this.headerError.set('Excel sheet is empty');
      return;
    }

    // Validate header
    const headerRow = raw[0].map((h: any) => ('' + h).trim().toLowerCase());
    const expected = ['upn', 'department', 'title', 'manager'];
    if (headerRow.length < 4 || !expected.every((v, i) => headerRow[i] === v)) {
      this.headerError.set('Invalid Excel header. Expected: UPN,Department,Title,Manager (case-insensitive, in order)');
      return;
    }

    const dataRows = raw.slice(1).filter(r => r.some((c: any) => ('' + c).trim().length > 0));
    if (dataRows.length > this.MAX_ROWS) {
      this.rowLimitError.set(`Row limit exceeded. Max ${this.MAX_ROWS} rows allowed.`);
      return;
    }

    const parsed: Array<{ upn: string; department: string; title: string; manager: string; original: string }> = [];
    for (const r of dataRows) {
      const upn = (r[0] || '').toString().trim();
      const department = (r[1] || '').toString().trim();
      const title = (r[2] || '').toString().trim();
      const manager = (r[3] || '').toString().trim();
      const original = [upn, department, title, manager].map(x => x.replace(/\r?\n/g, ' ')).join(',');
      parsed.push({ upn, department, title, manager, original });
    }

    this.rows.set(parsed);
  }

  preparePreview() {
    const rows = this.rows() || [];
    const filtered = rows.filter(r => (r.department && r.department.length > 0) || (r.title && r.title.length > 0) || (r.manager && r.manager.length > 0));
    this.previewRows.set(filtered);
    this.showPreviewModal.set(true);
  }

  async startUpdates() {
    // Start actual updates for rows that have been confirmed via preview
    const rows = this.previewRows();
    if (!rows || rows.length === 0) return;
    this.isUpdating.set(true);
    this.progress.set(`0 / ${rows.length}`);
    this.failedRows.set([]);

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      this.progress.set(`${i + 1} / ${rows.length}`);
      // If no fields provided to update, skip
      if (!r.department && !r.title && !r.manager) continue;
      try {
        // Title -> Description mapping: set description equal to title if title provided
        const payload: any = {};
        if (r.department) payload.department = r.department;
        if (r.title) payload.title = r.title;
        if (r.title) payload.description = r.title; // mirror
        if (r.manager) payload.manager = r.manager;
        await lastValueFrom(this.api.updateUserAttributes(r.upn, payload));
      } catch (err: any) {
        console.error('Update failed for', r.upn, err);
        this.failedRows.set([...this.failedRows(), { ...r, error: err.error?.message || err.message || 'Unknown error' }]);
      }
    }

    this.isUpdating.set(false);
    this.showPreviewModal.set(false);
    if (this.failedRows().length > 0) {
      this.showFailedModal.set(true);
    } else {
      this.showSuccessModal.set(true);
    }
  }

  downloadFailedXlsx() {
    const failed = this.failedRows();
    if (!failed || failed.length === 0) return;
    const data = failed.map(f => ({ UPN: f.upn, Department: f.department, Title: f.title, Manager: f.manager, Error: f.error }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Failed');
    const filename = `failed-updates-${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  }

  closeFailedModal() {
    this.showFailedModal.set(false);
  }

  closeSuccessAndClear() {
    this.showSuccessModal.set(false);
    this.clearAll();
  }

  clearAll() {
    this.fileName.set('');
    this.rawContent.set('');
    this.rows.set([]);
    this.failedRows.set([]);
    this.showFailedModal.set(false);
    this.progress.set('');
  }
}

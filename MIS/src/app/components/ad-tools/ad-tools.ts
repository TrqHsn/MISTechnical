import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { debounceTime, Subject } from 'rxjs';
import { ApiService, User, Computer } from '../../services/api';
import { lastValueFrom } from 'rxjs';
import * as XLSX from 'xlsx';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-ad-tools',
  imports: [CommonModule, FormsModule],
  templateUrl: './ad-tools.html',
  styleUrl: './ad-tools.css',
})
export class AdToolsComponent {
  // Tab management
  activeTab = signal<'users' | 'computers' | 'update-description' | 'last-device' | 'update-user'>('users');

  //Copy text to clipboard
  copyText(text: string | null | undefined) {
  if (!text) {
    return;
  }

  navigator.clipboard.writeText(text).then(
    () => console.log('Copied'),
    err => console.error('Copy failed', err)
  );
}


  // Users search
  usersSearchInput = signal('');
  usersResults = signal<User[]>([]);
  selectedUser = signal<User | null>(null);
  usersLoading = signal(false);
  usersShowDropdown = signal(false);
  private usersSearchSubject = new Subject<string>();

  // Computers search
  computersSearchInput = signal('');
  computersResults = signal<Computer[]>([]);
  selectedComputer = signal<Computer | null>(null);
  computersLoading = signal(false);
  computersShowDropdown = signal(false);
  private computersSearchSubject = new Subject<string>();

  // Update Description Tab
  sourceComputerSearchInput = signal('');
  sourceComputerResults = signal<Computer[]>([]);
  selectedSourceComputer = signal<Computer | null>(null);
  sourceComputerLoading = signal(false);
  sourceComputerShowDropdown = signal(false);
  private sourceComputerSearchSubject = new Subject<string>();

  targetComputerSearchInput = signal('');
  targetComputerResults = signal<Computer[]>([]);
  selectedTargetComputer = signal<Computer | null>(null);
  targetComputerLoading = signal(false);
  targetComputerShowDropdown = signal(false);
  private targetComputerSearchSubject = new Subject<string>();

  descriptionInput = signal('');
  isUpdating = signal(false);
  updateMessage = signal('');

  // Last Device Tab
  lastDevices = signal<{ [key: string]: number }>({ SDLL: 0, SDLD: 0, DBOL: 0 });
  lastDevicesLoading = signal(false);
  lastDevicesLoaded = signal(false);

  // Update User Tab (from update-user-info)
  fileName = signal('');
  rawContent = signal('');
  rows = signal<Array<{ upn: string; department: string; title: string; manager: string; original: string }>>([]);
  previewRows = signal<Array<{ upn: string; department: string; title: string; manager: string; original: string }>>([]);
  awaitingConfirmation = signal(false);
  isBulkUpdating = signal(false);
  bulkProgress = signal('');
  failedRows = signal<Array<{ upn: string; department: string; title: string; manager: string; error: string; original: string }>>([]);
  showFailedModal = signal(false);
  showPreviewModal = signal(false);
  showSuccessModal = signal(false);
  headerError = signal('');
  rowLimitError = signal('');
  readonly MAX_ROWS = 1000;


  constructor(private apiService: ApiService, private route: ActivatedRoute) {
    // Listen for tab query parameter
    this.route.queryParams.subscribe(params => {
      if (params['tab']) {
        const tab = params['tab'] as 'users' | 'computers' | 'update-description' | 'last-device' | 'update-user';
        if (tab === 'users' || tab === 'computers' || tab === 'update-description' || tab === 'last-device' || tab === 'update-user') {
          this.activeTab.set(tab);
        }
      }
    });

    // Setup users live search
    this.usersSearchSubject.pipe(
      debounceTime(300)
    ).subscribe(searchTerm => {
      if (searchTerm.trim()) {
        this.usersLoading.set(true);
        this.usersShowDropdown.set(true);
        this.apiService.searchUsers(searchTerm).subscribe(
          (results) => {
            this.usersResults.set(results.slice(0, 5)); // Max 5 results
            this.usersLoading.set(false);
          },
          (error) => {
            console.error('Error searching users:', error);
            this.usersResults.set([]);
            this.usersLoading.set(false);
          }
        );
      } else {
        this.usersResults.set([]);
        this.usersShowDropdown.set(false);
      }
    });

    // Setup computers live search
    this.computersSearchSubject.pipe(
      debounceTime(300)
    ).subscribe(searchTerm => {
      if (searchTerm.trim()) {
        this.computersLoading.set(true);
        this.computersShowDropdown.set(true);
        
        this.apiService.searchComputers(searchTerm).subscribe(
          (results) => {
            this.computersResults.set(results.slice(0, 5)); // Max 5 results
            this.computersLoading.set(false);
          },
          (error) => {
            console.error('Error searching computers:', error);
            this.computersResults.set([]);
            this.computersLoading.set(false);
          }
        );
      } else {
        this.computersResults.set([]);
        this.computersShowDropdown.set(false);
      }
    });

    // Setup source computer search (for Update Description tab)
    this.sourceComputerSearchSubject.pipe(
      debounceTime(300)
    ).subscribe(searchTerm => {
      if (searchTerm.trim()) {
        this.sourceComputerLoading.set(true);
        this.sourceComputerShowDropdown.set(true);
        
        this.apiService.searchComputers(searchTerm).subscribe(
          (results) => {
            this.sourceComputerResults.set(results.slice(0, 5));
            this.sourceComputerLoading.set(false);
          },
          (error) => {
            console.error('Error searching computers:', error);
            this.sourceComputerResults.set([]);
            this.sourceComputerLoading.set(false);
          }
        );
      } else {
        this.sourceComputerResults.set([]);
        this.sourceComputerShowDropdown.set(false);
      }
    });

    // Setup target computer search (for Update Description tab)
    this.targetComputerSearchSubject.pipe(
      debounceTime(300)
    ).subscribe(searchTerm => {
      if (searchTerm.trim()) {
        this.targetComputerLoading.set(true);
        this.targetComputerShowDropdown.set(true);
        
        this.apiService.searchComputers(searchTerm).subscribe(
          (results) => {
            this.targetComputerResults.set(results.slice(0, 5));
            this.targetComputerLoading.set(false);
          },
          (error) => {
            console.error('Error searching computers:', error);
            this.targetComputerResults.set([]);
            this.targetComputerLoading.set(false);
          }
        );
      } else {
        this.targetComputerResults.set([]);
        this.targetComputerShowDropdown.set(false);
      }
    });
  }

  // Users handlers
  onUsersSearchInput(value: string) {
    this.usersSearchInput.set(value);
    this.usersSearchSubject.next(value);
  }

  selectUser(user: User) {
    this.selectedUser.set(user);
    this.usersShowDropdown.set(false);
    this.usersSearchInput.set('');
    this.usersResults.set([]);
  }

  clearUserSelection() {
    this.selectedUser.set(null);
  }

  // Enter handler for users search - selects first result
  onUsersSearchEnter() {
    const results = this.usersResults();
    if (results && results.length > 0) {
      this.selectUser(results[0]);
    }
  }

  // Computers handlers
  onComputersSearchInput(value: string) {
    this.computersSearchInput.set(value);
    this.computersSearchSubject.next(value);
  }

  selectComputer(computer: Computer) {
    this.selectedComputer.set(computer);
    this.computersShowDropdown.set(false);
    this.computersSearchInput.set('');
    this.computersResults.set([]);
  }

  clearComputerSelection() {
    this.selectedComputer.set(null);
  }

  // Update Description Tab handlers
  onSourceComputerSearch(value: string) {
    this.sourceComputerSearchInput.set(value);
    this.sourceComputerSearchSubject.next(value);
  }

  selectSourceComputer(computer: Computer) {
    this.selectedSourceComputer.set(computer);
    this.sourceComputerShowDropdown.set(false);
    this.sourceComputerSearchInput.set('');
    this.sourceComputerResults.set([]);
    // Auto-populate description input from source computer
    this.descriptionInput.set(computer['description'] || '');
    this.updateMessage.set('');
  }

  // Trigger search via button for source search
  triggerSourceSearch() {
    this.sourceComputerShowDropdown.set(true);
    this.sourceComputerSearchSubject.next(this.sourceComputerSearchInput());
  }

  // Trigger search via button for target search
  triggerTargetSearch() {
    this.targetComputerShowDropdown.set(true);
    this.targetComputerSearchSubject.next(this.targetComputerSearchInput());
  }

  // Select first computer in current computers results when Enter is pressed
  onComputersSearchEnter() {
    const results = this.computersResults();
    if (results && results.length > 0) {
      this.selectComputer(results[0]);
    }
  }

  onTargetComputerSearch(value: string) {
    this.targetComputerSearchInput.set(value);
    this.targetComputerSearchSubject.next(value);
  }

  selectTargetComputer(computer: Computer) {
    this.selectedTargetComputer.set(computer);
    this.targetComputerShowDropdown.set(false);
    this.targetComputerSearchInput.set('');
    this.targetComputerResults.set([]);
  }

  // Enter handler for source/target search boxes
  onSourceComputerSearchEnter() {
    const results = this.sourceComputerResults();
    if (results && results.length > 0) {
      this.selectSourceComputer(results[0]);
    }
  }

  onTargetComputerSearchEnter() {
    const results = this.targetComputerResults();
    if (results && results.length > 0) {
      this.selectTargetComputer(results[0]);
    }
  }

  clearSourceComputer() {
    this.selectedSourceComputer.set(null);
    this.descriptionInput.set('');
    this.updateMessage.set('');
  }

  clearTargetComputer() {
    this.selectedTargetComputer.set(null);
  }

  clearAll() {
    this.clearSourceComputer();
    this.clearTargetComputer();
    this.sourceComputerSearchInput.set('');
    this.targetComputerSearchInput.set('');
    this.sourceComputerResults.set([]);
    this.targetComputerResults.set([]);
    this.descriptionInput.set('');
    this.updateMessage.set('');
    this.isUpdating.set(false);
  }

  updateComputerDescription() {
    const targetComputer = this.selectedTargetComputer();
    const description = this.descriptionInput();

    if (!targetComputer) {
      this.updateMessage.set('Please select a target computer to update');
      return;
    }

    if (!targetComputer['name']) {
      this.updateMessage.set('Invalid target computer');
      return;
    }

    this.isUpdating.set(true);
    this.updateMessage.set('');

    this.apiService.updateComputerDescription(targetComputer['name'], description).subscribe(
      (response) => {
        this.updateMessage.set('Description updated successfully!');
        this.isUpdating.set(false);
        setTimeout(() => {
          this.clearTargetComputer();
          this.clearSourceComputer();
        }, 2000);
      },
      (error) => {
        console.error('Error updating description:', error);
        this.updateMessage.set('Error updating description: ' + (error.error?.message || error.message));
        this.isUpdating.set(false);
      }
    );
  }

  // Get object keys for card display
  getObjectKeys(obj: any): string[] {
    return obj ? Object.keys(obj) : [];
  }

  // Last Device Tab methods
  loadLastDevices() {
    if (this.lastDevicesLoaded()) {
      return; // Already loaded, don't fetch again
    }

    this.lastDevicesLoading.set(true);

    this.apiService.getLastDevices().subscribe(
      (data) => {
        this.lastDevices.set(data);
        this.lastDevicesLoading.set(false);
        this.lastDevicesLoaded.set(true);
      },
      (error) => {
        console.error('Error loading last devices:', error);
        this.lastDevicesLoading.set(false);
      }
    );
  }

  onTabChange(tab: string) {
    this.activeTab.set(tab as any);
    if (tab === 'last-device') {
      this.loadLastDevices();
    }
  }

  // Update User Tab methods
  onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    this.headerError.set('');
    this.rowLimitError.set('');
    const ext = (file.name.split('.').pop() || '').toLowerCase();

    if (ext !== 'xlsx') {
      this.headerError.set('Only .xlsx files are supported. Please upload an Excel (.xlsx) file.');
      input.value = '';
      return;
    }

    this.fileName.set(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const data = new Uint8Array(reader.result as ArrayBuffer);
      this.parseXlsx(data);
      input.value = '';
    };
    reader.readAsArrayBuffer(file);
  }

  private parseXlsx(data: ArrayBuffer | Uint8Array) {
    const wb = XLSX.read(data, { type: 'array' });
    const first = wb.SheetNames[0];
    const sheet = wb.Sheets[first];
    const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (!raw || raw.length === 0) {
      this.headerError.set('Excel sheet is empty');
      return;
    }

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
    const rows = this.previewRows();
    if (!rows || rows.length === 0) return;
    this.isBulkUpdating.set(true);
    this.bulkProgress.set(`0 / ${rows.length}`);
    this.failedRows.set([]);

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      this.bulkProgress.set(`${i + 1} / ${rows.length}`);
      if (!r.department && !r.title && !r.manager) continue;
      try {
        const payload: any = {};
        if (r.department) payload.department = r.department;
        if (r.title) payload.title = r.title;
        if (r.title) payload.description = r.title;
        if (r.manager) payload.manager = r.manager;
        await lastValueFrom(this.apiService.updateUserAttributes(r.upn, payload));
      } catch (err: any) {
        console.error('Update failed for', r.upn, err);
        this.failedRows.set([...this.failedRows(), { ...r, error: err.error?.message || err.message || 'Unknown error' }]);
      }
    }

    this.isBulkUpdating.set(false);
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
    this.clearBulkUpdate();
  }

  clearBulkUpdate() {
    this.fileName.set('');
    this.rawContent.set('');
    this.rows.set([]);
    this.failedRows.set([]);
    this.showFailedModal.set(false);
    this.bulkProgress.set('');
  }

  // Make JSON available in template
  JSON = JSON;
}

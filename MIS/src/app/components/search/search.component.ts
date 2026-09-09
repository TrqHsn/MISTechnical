import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime } from 'rxjs';
import { ApiService, User } from '../../services/api';
import * as XLSX from 'xlsx';
import * as QRCode from 'qrcode';

// Interface for Excel row data
interface ExcelRow {
  [key: string]: any;
}

interface ContactRow {
  'Plant Name': string;
  EmployeeName: string;
  Designation: string;
  Division: string;
  Department: string;
  'Section info': string;
  'Phone Number': string;
  Email: string;
  [key: string]: any;
}

interface DeviceRow {
  AssetName: string;
  Category: string;
  IP: string;
  Plant: string;
  Location: string;
  [key: string]: any;
}

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './search.component.html',
  styleUrl: './search.component.css'
})
export class SearchComponent {
  activeTab = signal<'inventory' | 'contacts' | 'devices'>('inventory');

  // Dynamically generate API URL based on environment
  private getApiBaseUrl(): string {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      return `http://${hostname}:5001`;
    }
    return 'http://localhost:5001';
  }

  private getApiUrl(): string {
    return `${this.getApiBaseUrl()}/api/inventory/csv`;
  }

  private apiUrl = this.getApiUrl();

  // File upload state
  fileName = signal('');
  fileUploaded = signal(false);
  fileError = signal('');
  
  // Server fetch state
  isLoadingFromServer = signal(false);
  dataSource = signal<'server' | 'upload' | null>(null);
  inventorySourceLabel = signal('Server');

  // Excel data
  private excelData = signal<ExcelRow[]>([]);
  private headers = signal<string[]>([]);
  private columnLabels = signal<Record<string, string>>({});

  // Column selection - Default columns to search
  readonly SEARCHABLE_COLUMNS = ['A', 'C', 'D', 'H', 'J', 'N', 'O', 'T'] as const;
  selectedColumn = signal('All');

  columnOptions = computed(() => {
    const labels = this.columnLabels();
    const labelFor = (col: string) => labels[col] || col;

    return [
      ...this.SEARCHABLE_COLUMNS.map(col => ({ value: col, label: labelFor(col) })),
      { value: 'All', label: `All ` } //(${this.SEARCHABLE_COLUMNS.join(', ')}) put this label: 'All(${this.SEARCHABLE_COLUMNS.join(', ')})'
    ];
  });

  // Search state
  searchTerm = signal('');
  private searchSubject = new Subject<string>();
  searchResults = signal<ExcelRow[]>([]);
  selectedRow = signal<ExcelRow | null>(null);

  // UI state
  isSearching = signal(false);
  showDropdown = signal(false);

  // Contacts tab state
  contactsLoading = signal(false);
  contactsLoaded = signal(false);
  contactsError = signal('');
  private contactsData = signal<ContactRow[]>([]);
  contactsSearchTerm = signal('');
  contactsSearchResults = signal<ContactRow[]>([]);
  contactsSearching = signal(false);
  contactsShowDropdown = signal(false);
  selectedContact = signal<ContactRow | null>(null);
  contactQrCodeUrl = signal('');
  private contactsSearchSubject = new Subject<string>();

  // Device tab state
  devicesLoading = signal(false);
  devicesLoaded = signal(false);
  devicesError = signal('');
  private devicesData = signal<DeviceRow[]>([]);
  deviceSearchTerm = signal('');
  deviceSelectedCategory = signal('All');
  deviceCategoryOptions = signal<string[]>([]);
  deviceSearchResults = signal<DeviceRow[]>([]);
  deviceSearching = signal(false);
  deviceShowDropdown = signal(false);
  selectedDevice = signal<DeviceRow | null>(null);
  private deviceSearchSubject = new Subject<string>();

  // AD edit modal state
  adEditModalOpen = signal(false);
  adUserSearch = signal('');
  adUserSearchLoading = signal(false);
  adUserSearchResults = signal<User[]>([]);
  adSelectedUser = signal<User | null>(null);
  adMobileNumberInput = signal('+88');
  adSaveLoading = signal(false);
  adSaveMessage = signal('');
  adSaveMessageType = signal<'success' | 'error' | 'info'>('info');
  private adUserSearchSubject = new Subject<string>();

  constructor(private apiService: ApiService) {
    // Setup debounced search - wait 300ms after user stops typing
    this.searchSubject.pipe(
      debounceTime(300)
    ).subscribe(term => {
      this.performSearch(term);
    });

    this.contactsSearchSubject.pipe(
      debounceTime(250)
    ).subscribe(term => {
      this.performContactsSearch(term);
    });

    this.adUserSearchSubject.pipe(
      debounceTime(300)
    ).subscribe(term => {
      this.performAdUserSearch(term);
    });

    void this.loadFromServer();
  }

  onTabChange(tab: 'inventory' | 'contacts' | 'devices'): void {
    this.activeTab.set(tab);

    if (tab === 'inventory' && !this.isLoadingFromServer()) {
      void this.loadFromServer();
    }

    if (tab === 'contacts' && !this.contactsLoaded() && !this.contactsLoading()) {
      void this.loadContactsFromPublic();
    }

    if (tab === 'devices' && !this.devicesLoaded() && !this.devicesLoading()) {
      void this.loadDevicesFromPublic();
    }
  }

  async loadContactsFromPublic(): Promise<void> {
    this.contactsLoading.set(true);
    this.contactsError.set('');

    const candidatePaths = ['ContactsList.xlsx', '/ContactsList.xlsx'];

    try {
      let fileBuffer: ArrayBuffer | null = null;

      for (const path of candidatePaths) {
        try {
          const response = await fetch(path);
          if (response.ok) {
            fileBuffer = await response.arrayBuffer();
            break;
          }
        } catch {
        }
      }

      if (!fileBuffer) {
        throw new Error('Could not load ContactsList.xlsx from public folder');
      }

      const workbook = XLSX.read(fileBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<ContactRow>(worksheet, { defval: '' });

      if (!rows.length) {
        throw new Error('Contacts file is empty');
      }

      const requiredColumns = [
        'Plant Name',
        'EmployeeName',
        'Designation',
        'Division',
        'Department',
        'Section info',
        'Phone Number',
        'Email'
      ];

      const firstRowKeys = Object.keys(rows[0] || {});
      const missingColumns = requiredColumns.filter(column => !firstRowKeys.includes(column));
      if (missingColumns.length > 0) {
        throw new Error(`Missing columns: ${missingColumns.join(', ')}`);
      }

      this.contactsData.set(rows);
      this.contactsLoaded.set(true);
      this.contactsSearchResults.set([]);
      this.selectedContact.set(null);
    } catch (error) {
      this.contactsLoaded.set(false);
      this.contactsData.set([]);
      this.contactsError.set(error instanceof Error ? error.message : 'Failed to load contacts');
    } finally {
      this.contactsLoading.set(false);
    }
  }

  onContactsSearchInput(value: string): void {
    this.contactsSearchTerm.set(value);
    this.selectedContact.set(null);
    this.contactQrCodeUrl.set('');

    if (!value.trim()) {
      this.contactsSearchResults.set([]);
      this.contactsShowDropdown.set(false);
      this.contactsSearching.set(false);
      return;
    }

    this.contactsSearching.set(true);
    this.contactsShowDropdown.set(true);
    this.contactsSearchSubject.next(value);
  }

  onContactsSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      const results = this.contactsSearchResults();
      if (results.length > 0) {
        this.selectContact(results[0]);
      }
    }
  }

  async selectContact(contact: ContactRow): Promise<void> {
    this.selectedContact.set(contact);
    this.contactsShowDropdown.set(false);

    const phone = String(contact['Phone Number'] || '').trim();
    if (!phone) {
      this.contactQrCodeUrl.set('');
      return;
    }

    try {
      const qrDataUrl = await QRCode.toDataURL(`tel:${phone}`, {
        width: 180,
        margin: 1
      });
      this.contactQrCodeUrl.set(qrDataUrl);
    } catch {
      this.contactQrCodeUrl.set('');
    }
  }

  openEditMobileModal(): void {
    this.adEditModalOpen.set(true);
    this.adUserSearch.set('');
    this.adUserSearchResults.set([]);
    this.adSelectedUser.set(null);
    this.adMobileNumberInput.set('+88');
    this.adSaveMessage.set('');
    this.adSaveMessageType.set('info');
    this.adSaveLoading.set(false);
  }

  closeEditMobileModal(): void {
    this.adEditModalOpen.set(false);
    this.adUserSearchLoading.set(false);
  }

  onAdUserSearchInput(value: string): void {
    this.adUserSearch.set(value);
    this.adSelectedUser.set(null);
    this.adSaveMessage.set('');

    if (!value.trim()) {
      this.adUserSearchResults.set([]);
      this.adUserSearchLoading.set(false);
      return;
    }

    this.adUserSearchLoading.set(true);
    this.adUserSearchSubject.next(value);
  }

  private performAdUserSearch(term: string): void {
    const searchTerm = term.trim();
    if (!searchTerm) {
      this.adUserSearchResults.set([]);
      this.adUserSearchLoading.set(false);
      return;
    }

    this.apiService.searchUsers(searchTerm).subscribe(
      (results) => {
        this.adUserSearchResults.set(results.slice(0, 5));
        this.adUserSearchLoading.set(false);
      },
      (error) => {
        console.error('Error searching AD users:', error);
        this.adUserSearchResults.set([]);
        this.adUserSearchLoading.set(false);
      }
    );
  }

  selectAdUser(user: User): void {
    this.adSelectedUser.set(user);
    this.adUserSearchResults.set([]);
    this.adMobileNumberInput.set((user.telephoneNumber || '+88').trim() || '+88');
    this.adSaveMessage.set('');
  }

  private normalizeMobileNumber(value: string): string {
    const digits = `${value}`.replace(/\D/g, '');
    if (!digits) {
      return '+88';
    }

    if (digits.startsWith('88')) {
      return `+${digits}`;
    }

    if (digits.startsWith('0')) {
      return `+88${digits.slice(1)}`;
    }

    return `+88${digits}`;
  }

  submitAdMobileUpdate(): void {
    const selected = this.adSelectedUser();
    if (!selected) {
      this.adSaveMessageType.set('error');
      this.adSaveMessage.set('Select an AD user first.');
      return;
    }

    const rawValue = this.adMobileNumberInput().trim();
    if (!rawValue) {
      this.adSaveMessageType.set('error');
      this.adSaveMessage.set('Enter a mobile number to update.');
      return;
    }

    const formattedNumber = this.normalizeMobileNumber(rawValue);
    const userPrincipalName = selected['userPrincipalName'] || selected['samAccountName'] || '';
    if (!userPrincipalName) {
      this.adSaveMessageType.set('error');
      this.adSaveMessage.set('Selected AD user does not have a valid identifier.');
      return;
    }

    this.adSaveLoading.set(true);
    this.adSaveMessage.set('');

    this.apiService.updateUserAttributes(userPrincipalName, { telephoneNumber: formattedNumber }).subscribe(
      () => {
        this.adSaveLoading.set(false);
        this.adSaveMessageType.set('success');
        this.adSaveMessage.set(`Mobile number updated to ${formattedNumber}`);
        this.adMobileNumberInput.set(formattedNumber);
        if (selected) {
          selected.telephoneNumber = formattedNumber;
          this.adSelectedUser.set(selected);
        }
      },
      (error) => {
        console.error('Error updating mobile number in AD:', error);
        this.adSaveLoading.set(false);
        this.adSaveMessageType.set('error');
        this.adSaveMessage.set(error.error?.message || error.message || 'Failed to update mobile number');
      }
    );
  }

  private performContactsSearch(term: string): void {
    const searchValue = term.trim().toLowerCase();

    if (!searchValue) {
      this.contactsSearchResults.set([]);
      this.contactsSearching.set(false);
      return;
    }

    const searchTerms = new Set<string>([searchValue]);
    const reorderedName = this.reorderCommaSeparatedName(searchValue);
    if (reorderedName) {
      searchTerms.add(reorderedName);
    }

    const results = this.contactsData().filter((row) => {
      const name = String(row.EmployeeName || '').toLowerCase();
      const email = String(row.Email || '').toLowerCase();
      return Array.from(searchTerms).some((termVariant) =>
        name.includes(termVariant) || email.includes(termVariant)
      );
    });

    this.contactsSearchResults.set(results.slice(0, 5));
    this.contactsSearching.set(false);
  }

  private reorderCommaSeparatedName(value: string): string {
    if (!value.includes(',')) {
      return '';
    }

    const parts = value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (parts.length !== 2) {
      return '';
    }

    return `${parts[1]} ${parts[0]}`.replace(/\s+/g, ' ').trim();
  }

  getContactValue(column: keyof ContactRow): string {
    const row = this.selectedContact();
    if (!row) {
      return '-';
    }

    const value = row[column];
    if (value === undefined || value === null || `${value}`.trim() === '') {
      return '-';
    }

    return `${value}`;
  }

  getContactResultDisplay(row: ContactRow): string {
    return `${row.EmployeeName || '-'} • ${row.Email || '-'}`;
  }

  async loadDevicesFromPublic(): Promise<void> {
    this.devicesLoading.set(true);
    this.devicesError.set('');

    try {
      const response = await fetch('/DeviceDetails/AssetInfo.csv');
      if (!response.ok) {
        throw new Error(`Could not load device file (${response.status})`);
      }

      const csvText = await response.text();
      const workbook = XLSX.read(csvText, { type: 'string', raw: true });
      const rows = this.parseDeviceRows(workbook);

      if (!rows.length) {
        throw new Error('Device file is empty or has no usable rows');
      }

      this.devicesData.set(rows);
      this.deviceCategoryOptions.set(this.getDeviceCategories(rows));
      this.deviceSelectedCategory.set('All');
      this.deviceSearchResults.set(rows.slice(0, 10));
      this.deviceShowDropdown.set(false);
      this.selectedDevice.set(null);
      this.devicesLoaded.set(true);
    } catch (error) {
      this.devicesLoaded.set(false);
      this.devicesData.set([]);
      this.deviceCategoryOptions.set([]);
      this.deviceSearchResults.set([]);
      this.selectedDevice.set(null);
      this.devicesError.set(error instanceof Error ? error.message : 'Failed to load device data');
    } finally {
      this.devicesLoading.set(false);
    }
  }

  onDeviceSearchInput(value: string): void {
    this.deviceSearchTerm.set(value);
    this.selectedDevice.set(null);

    if (!value.trim()) {
      this.deviceSearchResults.set(this.filterDeviceRows());
      this.deviceShowDropdown.set(false);
      this.deviceSearching.set(false);
      return;
    }

    this.performDeviceSearch(value);
    this.deviceShowDropdown.set(true);
  }

  onDeviceSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      const results = this.deviceSearchResults();
      if (results.length > 0) {
        this.selectDevice(results[0]);
      }
    }
  }

  onDeviceCategoryChange(value: string): void {
    this.deviceSelectedCategory.set(value);
    this.selectedDevice.set(null);
    this.deviceSearchResults.set(this.filterDeviceRows());
    this.deviceShowDropdown.set(false);
    this.deviceSearchTerm.set(this.deviceSearchTerm());
    if (this.deviceSearchTerm().trim()) {
      this.performDeviceSearch(this.deviceSearchTerm());
    }
  }

  private performDeviceSearch(term: string): void {
    const trimmed = term.trim();
    const results = this.filterDeviceRows(trimmed);
    this.deviceSearchResults.set(results.slice(0, 10));
    this.deviceSearching.set(false);
    this.deviceShowDropdown.set(Boolean(trimmed));
  }

  private filterDeviceRows(searchTerm?: string): DeviceRow[] {
    const rows = this.devicesData();
    const category = this.deviceSelectedCategory();
    const query = (searchTerm ?? this.deviceSearchTerm()).trim().toLowerCase();

    return rows.filter((row) => {
      const matchesCategory = category === 'All' || String(row.Category || '').trim().toLowerCase() === category.toLowerCase();
      if (!matchesCategory) {
        return false;
      }

      if (!query) {
        return true;
      }

      const asset = String(row.AssetName || '').toLowerCase();
      const ip = String(row.IP || '').toLowerCase();
      const location = String(row.Location || '').toLowerCase();
      return asset.includes(query) || ip.includes(query) || location.includes(query);
    });
  }

  selectDevice(device: DeviceRow): void {
    this.selectedDevice.set(device);
    this.deviceShowDropdown.set(false);
  }

  getDeviceResultDisplay(row: DeviceRow): string {
    const asset = row.AssetName || '-';
    const ip = row.IP || '-';
    const plant = row.Plant || '-';
    const location = row.Location || '-';
    return `${asset} • ${ip} • ${plant} • ${location}`;
  }

  getDeviceField(value: any): string {
    if (value === null || value === undefined || `${value}`.trim() === '') {
      return '-';
    }
    return `${value}`;
  }

  private parseDeviceRows(workbook: XLSX.WorkBook): DeviceRow[] {
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false,
      defval: ''
    });

    if (!rawRows.length) {
      return [];
    }

    const normalizedValues = rawRows.map((row) =>
      (Array.isArray(row) ? row.map((cell) => String(cell ?? '').trim()) : [])
    );

    const headerRow = normalizedValues.find((row) =>
      row.some((cell) => /assetname|category|ip|plant|location/i.test(cell))
    );

    if (!headerRow) {
      return [];
    }

    const rowKeys = this.getDeviceHeaderMap(headerRow);
    if (
      rowKeys['AssetName'] === undefined ||
      rowKeys['Category'] === undefined ||
      rowKeys['IP'] === undefined ||
      rowKeys['Location'] === undefined
    ) {
      return [];
    }

    return normalizedValues
      .slice(normalizedValues.indexOf(headerRow) + 1)
      .filter((row) => row.some((cell) => cell))
      .map((row) => {
        const plantIndex = rowKeys['Plant'] ?? rowKeys['Location'];
        return {
          AssetName: row[rowKeys['AssetName'] as number] || '',
          Category: row[rowKeys['Category'] as number] || '',
          IP: row[rowKeys['IP'] as number] || '',
          Plant: plantIndex !== undefined ? row[plantIndex] || '' : '',
          Location: row[rowKeys['Location'] as number] || ''
        };
      })
      .filter((row) => row.AssetName || row.Category || row.IP || row.Location);
  }

  private getDeviceHeaderMap(headerRow: string[]): Record<string, number | undefined> {
    const map: Record<string, number | undefined> = {};
    headerRow.forEach((cell, index) => {
      const normalized = cell.trim();
      if (!normalized) {
        return;
      }

      const key = normalized.toLowerCase();
      if (key === 'assetname' || key === 'asset name') {
        map['AssetName'] = index;
      } else if (key === 'category') {
        map['Category'] = index;
      } else if (key === 'ip' || key === 'ip address') {
        map['IP'] = index;
      } else if (key === 'plant') {
        map['Plant'] = index;
      } else if (key === 'location') {
        map['Location'] = index;
      }
    });

    return map;
  }

  private getDeviceCategories(rows: DeviceRow[]): string[] {
    const categories = new Set<string>();
    rows.forEach((row) => {
      const category = String(row.Category || '').trim();
      if (category) {
        categories.add(category);
      }
    });

    return Array.from(categories).sort((a, b) => a.localeCompare(b));
  }

  /**
   * Load data from server CSV
   */
  async loadFromServer(forceRefresh = false): Promise<void> {
    this.isLoadingFromServer.set(true);
    this.fileError.set('');
    this.resetFileState();

    try {
      if (forceRefresh) {
        const refreshResponse = await fetch(`${this.getApiBaseUrl()}/api/inventory/refresh`, {
          method: 'POST'
        });

        if (!refreshResponse.ok) {
          throw new Error(`Refresh returned ${refreshResponse.status}: ${refreshResponse.statusText}`);
        }
      }

      const statusResponse = await fetch(`${this.getApiBaseUrl()}/api/inventory/status`);
      const status = statusResponse.ok ? await statusResponse.json() : null;
      const sourceLabel = status?.source === 'cache' ? 'Previous Cache' : 'Server';
      this.inventorySourceLabel.set(sourceLabel);

      const response = await fetch(this.apiUrl);

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const csvText = await response.text();

      if (!csvText || csvText.trim().length === 0) {
        throw new Error('Server returned empty file');
      }

      const workbook = XLSX.read(csvText, { type: 'string', raw: true });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      const jsonData: ExcelRow[] = XLSX.utils.sheet_to_json(worksheet, {
        header: 'A',
        defval: ''
      });

      this.processData(jsonData);
      this.dataSource.set('server');
      this.fileName.set(
        status?.source === 'cache'
          ? 'Server Data (Previous Cache)'
          : 'Server Data (Latest)'
      );

    } catch (error) {
      console.error('Error loading from server:', error);
      this.fileError.set(
        error instanceof Error
          ? `Failed to load from server: ${error.message}`
          : 'Failed to load from server. Try uploading a file instead.'
      );
    } finally {
      this.isLoadingFromServer.set(false);
    }
  }

  /**
   * Handle file selection from input
   */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    
    // Validate file type - accept .xlsx and .csv files
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.csv')) {
      this.fileError.set('Only .xlsx and .csv files are supported');
      this.resetFileState();
      return;
    }

    this.fileName.set(file.name);
    this.fileError.set('');
    this.dataSource.set('upload');
    this.parseFile(file);
  }

  /**
   * Parse file (Excel or CSV) using SheetJS
   * Reads file entirely in browser without backend
   */
  private parseFile(file: File): void {
    const reader = new FileReader();
    
    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        let workbook: XLSX.WorkBook;
        const fileName = file.name.toLowerCase();
        
        if (fileName.endsWith('.csv')) {
          // Parse CSV as text
          const text = e.target?.result as string;
          workbook = XLSX.read(text, { type: 'string', raw: true });
        } else {
          // Parse Excel as binary
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          workbook = XLSX.read(data, { type: 'array' });
        }
        
        // Get first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert sheet to JSON with column letters as keys
        const jsonData: ExcelRow[] = XLSX.utils.sheet_to_json(worksheet, { 
          header: 'A', // Use column letters as keys (A, B, C, etc.)
          defval: '' // Default value for empty cells
        });

        this.processData(jsonData);
        
      } catch (error) {
        console.error('Error parsing file:', error);
        this.fileError.set('Failed to parse file');
        this.resetFileState();
      }
    };

    reader.onerror = () => {
      this.fileError.set('Failed to read file');
      this.resetFileState();
    };

    // Read file based on type
    if (file.name.toLowerCase().endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  }

  /**
   * Process parsed data (shared by both server and file upload)
   */
  private processData(jsonData: ExcelRow[]): void {
    if (jsonData.length === 0) {
      this.fileError.set('File is empty');
      this.resetFileState();
      return;
    }

    const firstRow = jsonData[0];
    const allHeaders = Object.keys(firstRow);
    this.headers.set(allHeaders);

    // Validate that required columns exist
    const missingColumns = this.SEARCHABLE_COLUMNS.filter(
      col => !allHeaders.includes(col)
    );

    if (missingColumns.length > 0) {
      this.fileError.set(
        `File is missing expected columns: ${missingColumns.join(', ')}`
      );
      this.resetFileState();
      return;
    }

    const labels: Record<string, string> = {};
    this.SEARCHABLE_COLUMNS.forEach(col => {
      const value = firstRow[col];
      labels[col] = value ? String(value) : col;
    });
    this.columnLabels.set(labels);

    // Data rows after header
    const dataRows = jsonData.slice(1);

    if (dataRows.length === 0) {
      this.fileError.set('No data rows found beneath the header row');
      this.resetFileState();
      return;
    }

    this.excelData.set(dataRows);
    this.fileUploaded.set(true);
    this.fileError.set('');
  }

  /**
   * Reset file upload state
   */
  private resetFileState(): void {
    this.fileUploaded.set(false);
    this.excelData.set([]);
    this.headers.set([]);
    this.columnLabels.set({});
    this.searchResults.set([]);
    this.selectedRow.set(null);
    this.searchTerm.set('');
    this.dataSource.set(null);
  }

  /**
   * Handle column selection change
   */
  onColumnChange(value: string): void {
    this.selectedColumn.set(value);
    this.searchResults.set([]);
    this.selectedRow.set(null);

    if (this.searchTerm().trim()) {
      this.performSearch(this.searchTerm());
    }
  }

  /**
   * Handle search input change
   */
  onSearchInput(value: string): void {
    this.searchTerm.set(value);
    this.selectedRow.set(null); // Clear selected row when searching
    
    if (!value.trim()) {
      this.searchResults.set([]);
      this.showDropdown.set(false);
      return;
    }

    this.isSearching.set(true);
    this.showDropdown.set(true);
    // Trigger debounced search
    this.searchSubject.next(value);
  }

  /**
   * Perform search on selected column(s)
   */
  private performSearch(term: string): void {
    if (!term.trim()) {
      this.searchResults.set([]);
      this.isSearching.set(false);
      return;
    }

    const searchLower = term.toLowerCase();
    const data = this.excelData();
    const column = this.selectedColumn();

    let results: ExcelRow[];

    if (column === 'All') {
      // Search across all searchable columns
      results = data.filter(row => 
        this.SEARCHABLE_COLUMNS.some(col => {
          const value = String(row[col] || '').toLowerCase();
          return value.includes(searchLower);
        })
      );
    } else {
      // Search in specific column
      results = data.filter(row => {
        const value = String(row[column] || '').toLowerCase();
        return value.includes(searchLower);
      });
    }

    // Return top 10 results
    this.searchResults.set(results.slice(0, 10));
    this.isSearching.set(false);
  }

  /**
   * Handle result selection - show full row data
   */
  onSelectResult(row: ExcelRow): void {
    this.selectedRow.set(row);
    this.showDropdown.set(false);
  }

  /**
   * Handle Enter key in search input
   */
  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      const results = this.searchResults();
      if (results.length > 0) {
        this.onSelectResult(results[0]);
      }
    }
  }

  /**
   * Get all column headers from selected row for display
   */
  getRowKeys(): string[] {
    const row = this.selectedRow();
    return row ? Object.keys(row) : [];
  }

  /**
   * Get searchable column keys only (A, C, D, H, J, N, O, T)
   */
  getSearchableRowKeys(): string[] {
    return this.SEARCHABLE_COLUMNS.filter(col => this.selectedRow()?.[col] !== undefined);
  }

  /**
   * Format cell value for display
   */
  formatValue(value: any): string {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    return String(value);
  }

  /**
   * Get display value for search result
   */
  getResultDisplay(row: ExcelRow): string {
    const column = this.selectedColumn();
    if (column === 'All') {
      // Show first non-empty value from searchable columns
      for (const col of this.SEARCHABLE_COLUMNS) {
        if (row[col]) return `${this.getColumnLabel(col)}: ${row[col]}`;
      }
      return 'No data';
    }
    const label = this.getColumnLabel(column);
    return `${label}: ${row[column] || 'No data'}`;
  }

  /**
   * Get friendly column label (uses header row values when available)
   */
  getColumnLabel(column: string): string {
    return this.columnLabels()[column] || column;
  }
}

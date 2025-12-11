import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { debounceTime, Subject } from 'rxjs';
import { ApiService, User, Computer } from '../../services/api';
import * as ExcelJS from 'exceljs';

@Component({
  selector: 'app-it-build-rebuild',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './it-build-rebuild.component.html',
  styleUrl: './it-build-rebuild.component.css',
  standalone: true,
})
export class ItBuildRebuildComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  private destroy$ = new Subject<void>();

  // Old Computer Name search
  oldComputerSearchInput = signal('');
  oldComputerResults = signal<Computer[]>([]);
  oldComputerLoading = signal(false);
  oldComputerShowDropdown = signal(false);
  private oldComputerSearchSubject = new Subject<string>();

  // New Computer Name search
  newComputerSearchInput = signal('');
  newComputerResults = signal<Computer[]>([]);
  newComputerLoading = signal(false);
  newComputerShowDropdown = signal(false);
  private newComputerSearchSubject = new Subject<string>();

  // Username search
  usernameSearchInput = signal('');
  usernameResults = signal<User[]>([]);
  usernameLoading = signal(false);
  usernameShowDropdown = signal(false);
  private usernameSearchSubject = new Subject<string>();

  // Previews
  operatingSystemPreview = signal('');
  sitePreview = signal('');
  divisionPreview = signal('');
  
  // Preview signals - updated explicitly when form values change
  deviceTypePreview = signal('Laptop');
  actionTypePreview = signal('Rebuild');
  raisedByPreview = signal('Tareque Hasan');

  // Raised by options
  raisedByOptions = [
    { value: 'Tareque Hasan', label: 'Tareque Hasan' },
    { value: 'Nurul Mustafa', label: 'Nurul Mustafa' },
    { value: 'Ridoan Zahana', label: 'Ridoan Zahana' },
    { value: 'Piyer Mollah', label: 'Piyer Mollah' },
  ];

  constructor(private fb: FormBuilder, private apiService: ApiService) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.setupSearchSubscriptions();
    this.setupFormValueChanges();
    // Initial state: RB (Rebuild) is default, so enable both
    this.form.get('oldComputerName')?.enable();
    this.form.get('newComputerName')?.enable();
  }

  private initializeForm(): void {
    this.form = this.fb.group({
      oldComputerName: [''],
      newComputerName: [''],
      description: [''],
      operatingSystem: [''],
      username: ['', Validators.required],
      adGroup: ['WEB 64 bit Client'],
      deviceType: ['Laptop', Validators.required],
      actionType: ['RB', Validators.required],
      raisedBy: ['Tareque Hasan', Validators.required],
      raisedDate: [new Date().toISOString().split('T')[0], Validators.required],
    });
  }

  private setupSearchSubscriptions(): void {
    // Old Computer search
    this.oldComputerSearchSubject.pipe(
      debounceTime(300)
    ).subscribe(searchTerm => {
      this.performOldComputerSearch(searchTerm);
    });

    // New Computer search
    this.newComputerSearchSubject.pipe(
      debounceTime(300)
    ).subscribe(searchTerm => {
      this.performNewComputerSearch(searchTerm);
    });

    // Username search
    this.usernameSearchSubject.pipe(
      debounceTime(300)
    ).subscribe(searchTerm => {
      this.performUsernameSearch(searchTerm);
    });
  }

  private setupFormValueChanges(): void {
    // When oldComputerName changes, auto-detect device type
    this.form.get('oldComputerName')?.valueChanges.subscribe(value => {
      if (!this.form.get('newComputerName')?.value) {
        this.form.patchValue({ newComputerName: value }, { emitEvent: false });
      }
    });

    // When newComputerName changes, detect device type
    this.form.get('newComputerName')?.valueChanges.subscribe(() => {
      // Device type detection happens in computed signal
    });

    // Device type changes - update preview signal
    this.form.get('deviceType')?.valueChanges.subscribe(value => {
      this.deviceTypePreview.set(value || 'Laptop');
    });

    // Action type changes - enable/disable fields based on selection
    this.form.get('actionType')?.valueChanges.subscribe(actionType => {
      // Update preview
      const actionTypeMap: { [key: string]: string } = {
        'N': 'New',
        'R': 'Removal',
        'RB': 'Rebuild',
      };
      this.actionTypePreview.set(actionTypeMap[actionType] || 'Rebuild');

      if (actionType === 'N') {
        // New - disable Old Computer Name
        this.form.get('oldComputerName')?.disable();
        this.form.get('newComputerName')?.enable();
      } else if (actionType === 'R') {
        // Removal - disable New Computer Name
        this.form.get('oldComputerName')?.enable();
        this.form.get('newComputerName')?.disable();
      } else {
        // Rebuild - enable both
        this.form.get('oldComputerName')?.enable();
        this.form.get('newComputerName')?.enable();
      }
    });

    // Raised by changes - update preview signal
    this.form.get('raisedBy')?.valueChanges.subscribe(value => {
      this.raisedByPreview.set(value || 'Tareque Hasan');
    });
  }

  private performOldComputerSearch(searchTerm: string): void {
    if (searchTerm.trim()) {
      this.oldComputerLoading.set(true);
      this.oldComputerShowDropdown.set(true);
      this.apiService.searchComputers(searchTerm).subscribe(
        (results) => {
          this.oldComputerResults.set(results.slice(0, 5));
          this.oldComputerLoading.set(false);
        },
        (error) => {
          console.error('Error searching computers:', error);
          this.oldComputerResults.set([]);
          this.oldComputerLoading.set(false);
        }
      );
    } else {
      this.oldComputerResults.set([]);
      this.oldComputerShowDropdown.set(false);
    }
  }

  private performNewComputerSearch(searchTerm: string): void {
    if (searchTerm.trim()) {
      this.newComputerLoading.set(true);
      this.newComputerShowDropdown.set(true);
      this.apiService.searchComputers(searchTerm).subscribe(
        (results) => {
          this.newComputerResults.set(results.slice(0, 5));
          this.newComputerLoading.set(false);
        },
        (error) => {
          console.error('Error searching computers:', error);
          this.newComputerResults.set([]);
          this.newComputerLoading.set(false);
        }
      );
    } else {
      this.newComputerResults.set([]);
      this.newComputerShowDropdown.set(false);
    }
  }

  private performUsernameSearch(searchTerm: string): void {
    if (searchTerm.trim()) {
      this.usernameLoading.set(true);
      this.usernameShowDropdown.set(true);
      this.apiService.searchUsers(searchTerm).subscribe(
        (results) => {
          this.usernameResults.set(results.slice(0, 5));
          this.usernameLoading.set(false);
        },
        (error) => {
          console.error('Error searching users:', error);
          this.usernameResults.set([]);
          this.usernameLoading.set(false);
        }
      );
    } else {
      this.usernameResults.set([]);
      this.usernameShowDropdown.set(false);
    }
  }

  onOldComputerSearch(value: string): void {
    this.oldComputerSearchInput.set(value);
    this.oldComputerSearchSubject.next(value);
  }

  onNewComputerSearch(value: string): void {
    this.newComputerSearchInput.set(value);
    this.newComputerSearchSubject.next(value);
  }

  onUsernameSearch(value: string): void {
    this.usernameSearchInput.set(value);
    this.usernameSearchSubject.next(value);
  }

  selectOldComputer(computer: Computer): void {
    const computerName = computer['name'] || '';
    this.form.patchValue({
      oldComputerName: computerName,
      description: computer['description'] || '',
      operatingSystem: computer['operatingSystem'] || '',
      newComputerName: computerName,
    });
    this.operatingSystemPreview.set(computer['operatingSystem'] || '');
    this.oldComputerShowDropdown.set(false);
    this.oldComputerResults.set([]);
  }

  selectNewComputer(computer: Computer): void {
    this.form.patchValue({
      newComputerName: computer['name'] || '',
    });
    this.newComputerShowDropdown.set(false);
    this.newComputerResults.set([]);
  }

  selectUsername(user: User): void {
    const samAccountName = user['sAMAccountName'] || user['samAccountName'] || '';
    this.form.patchValue({
      username: samAccountName,
    });
    this.sitePreview.set(user['site'] || '');
    this.divisionPreview.set(user['company'] || '');
    this.usernameShowDropdown.set(false);
    this.usernameResults.set([]);
  }

  clearAll(): void {
    this.form.reset({
      deviceType: 'Laptop',
      adGroup: 'WEB 64 bit Client',
      raisedBy: 'Tareque Hasan',
      raisedDate: new Date().toISOString().split('T')[0],
      actionType: 'RB',
    });
    this.oldComputerResults.set([]);
    this.newComputerResults.set([]);
    this.usernameResults.set([]);
    this.operatingSystemPreview.set('');
    this.sitePreview.set('');
    this.divisionPreview.set('');
    this.oldComputerSearchInput.set('');
    this.newComputerSearchInput.set('');
    this.usernameSearchInput.set('');
  }

  async downloadExcel(): Promise<void> {
    try {
      // Log all form values for debugging
      const formData = {
        site: this.sitePreview(),
        company: this.divisionPreview(),
        actionType: this.form.get('actionType')?.value,
        actionTypeLabel: this.getActionTypeLabel(this.form.get('actionType')?.value || ''),
        oldComputerName: this.form.get('oldComputerName')?.value,
        newComputerName: this.form.get('newComputerName')?.value,
        deviceType: this.deviceTypePreview(),
        username: this.form.get('username')?.value,
        operatingSystem: this.form.get('operatingSystem')?.value,
        description: this.form.get('description')?.value,
        adGroup: this.form.get('adGroup')?.value,
        raisedBy: this.form.get('raisedBy')?.value,
        raisedByLabel: this.raisedByPreview(),
        raisedDate: this.form.get('raisedDate')?.value,
        raisedDateFormatted: this.formatDateToMMDDYYYY(this.form.get('raisedDate')?.value || ''),
      };
      
      console.log('=== FORM VALUES BEING WRITTEN TO EXCEL ===');
      console.log('Complete Form Data:', formData);
      console.log('Form Raw Value:', this.form.getRawValue());
      console.log('=====================================');

      // Fetch the template
      let response = await fetch('templateNRBR.xlsx');
      
      if (!response.ok) {
        console.warn(`Failed with path 'templateNRBR.xlsx', trying '/templateNRBR.xlsx'...`);
        response = await fetch('/templateNRBR.xlsx');
      }
      
      if (!response.ok) {
        throw new Error(`Failed to fetch template: ${response.status} ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      
      if (!buffer || buffer.byteLength === 0) {
        throw new Error('Template file is empty');
      }

      // Load workbook with ExcelJS
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const sheet = workbook.getWorksheet(1);
      
      if (!sheet) {
        throw new Error('Invalid Excel file: no sheets found');
      }

      // Extract form values
      const actionType = this.form.get('actionType')?.value || '';
      const newComputerName = this.form.get('newComputerName')?.value || this.form.get('oldComputerName')?.value || '';
      const actionTypeLabel = this.getActionTypeLabel(actionType);

      // Fill in the required cells - using ExcelJS approach
      sheet.getCell('B5').value = this.sitePreview();
      sheet.getCell('E5').value = this.divisionPreview();
      sheet.getCell('B7').value = actionTypeLabel;
      sheet.getCell('E7').value = this.form.get('oldComputerName')?.value || '';
      sheet.getCell('B9').value = this.form.get('newComputerName')?.value || '';
      sheet.getCell('E9').value = this.deviceTypePreview();
      sheet.getCell('B11').value = this.form.get('username')?.value || '';
      sheet.getCell('E11').value = this.form.get('operatingSystem')?.value || '';
      sheet.getCell('B13').value = this.form.get('description')?.value || '';
      sheet.getCell('E13').value = this.form.get('adGroup')?.value || '';
      sheet.getCell('B15').value = this.raisedByPreview();

      // Format date for E15 (MM/DD/YYYY)
      const dateStr = this.form.get('raisedDate')?.value || '';
      const formattedDate = this.formatDateToMMDDYYYY(dateStr);
      sheet.getCell('E15').value = formattedDate;

      // Write the modified workbook to buffer
      const updatedBuffer = await workbook.xlsx.writeBuffer();

      // Generate filename
      const filename = `IT Computer Form IT003 v2.0_${actionTypeLabel}_${newComputerName}.xlsx`;

      // Create blob and download
      const blob = new Blob([updatedBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
      
      console.log('Excel file generated successfully');
    } catch (error) {
      console.error('Error generating Excel file:', error);
      alert(`Failed to generate Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private getActionTypeLabel(actionType: string): string {
    const map: { [key: string]: string } = {
      'N': 'New',
      'R': 'Removal',
      'RB': 'Rebuild',
    };
    return map[actionType] || 'Unknown';
  }

  private formatDateToMMDDYYYY(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

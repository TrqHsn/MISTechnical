import { Component, OnInit, OnDestroy, signal, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { debounceTime, Subject } from 'rxjs';
import { ApiService, User, Computer } from '../../services/api';
import * as ExcelJS from 'exceljs';

@Component({
  selector: 'app-os-installation-form',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './os-installation-form.component.html',
  styleUrl: './os-installation-form.component.css',
  standalone: true,
})
export class OsInstallationFormComponent implements OnInit, OnDestroy {
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
  
  // Track OS from old and new computers separately
  oldComputerOS = signal('');
  newComputerOS = signal('');
  
  // Store descriptions separately for old and new computer selections
  oldComputerDescription = signal('');
  newComputerDescription = signal('');
  
  // Preview signals - updated explicitly when form values change
  deviceTypePreview = signal('Laptop');
  actionTypePreview = signal('Rebuild');
  raisedByPreview = signal('Tareque Hasan');

  // Raised by options
  raisedByOptions = [
    { value: 'Tareque Hasan', label: 'Tareque' },
    { value: 'Nurul Mustafa', label: 'Mustafa' },
    { value: 'Ridoan Zahana', label: 'Ridoan' },
    { value: 'Piyer Mollah', label: 'Piyer' },
  ];

  constructor(private fb: FormBuilder, private apiService: ApiService, private cdr: ChangeDetectorRef) {
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
    // When oldComputerName changes, just uppercase it (no auto-copy)
    this.form.get('oldComputerName')?.valueChanges.subscribe(value => {
      if (value && typeof value === 'string') {
        const upperValue = value.toUpperCase();
        if (value !== upperValue) {
          this.form.patchValue({ oldComputerName: upperValue }, { emitEvent: false });
        }
      }
    });

    // When newComputerName changes, uppercase and auto-copy to old if Rebuild
    this.form.get('newComputerName')?.valueChanges.subscribe(value => {
      if (value && typeof value === 'string') {
        const upperValue = value.toUpperCase();
        if (value !== upperValue) {
          this.form.patchValue({ newComputerName: upperValue }, { emitEvent: false });
        }
      }
      // TEMPORARILY DISABLED: Auto-copy to old computer name for testing
      // const actionType = this.form.get('actionType')?.value;
      // if (actionType === 'RB' && !this.form.get('oldComputerName')?.value) {
      //   this.form.patchValue({ oldComputerName: value }, { emitEvent: false });
      // }
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
        // New - disable Old Computer Name and clear it
        this.form.get('oldComputerName')?.setValue('', { emitEvent: false });
        this.oldComputerSearchInput.set('');
        this.oldComputerResults.set([]);
        this.oldComputerDescription.set('');
        this.oldComputerOS.set('');
        this.form.get('oldComputerName')?.disable();
        this.form.get('newComputerName')?.enable();
      } else if (actionType === 'R') {
        // Removal - disable New Computer Name and clear it
        this.form.get('newComputerName')?.setValue('', { emitEvent: false });
        this.newComputerSearchInput.set('');
        this.newComputerResults.set([]);
        this.newComputerDescription.set('');
        this.newComputerOS.set('');
        this.form.get('oldComputerName')?.enable();
        this.form.get('newComputerName')?.disable();
      } else {
        // Rebuild - enable both
        this.form.get('oldComputerName')?.enable();
        this.form.get('newComputerName')?.enable();
      }
      
      // Update operating system preview based on actionType
      this.updateOperatingSystemPreview(actionType);
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
    const computerName = (computer['name'] || '').toUpperCase();
    const osValue = computer['operatingSystem'] || '';
    this.oldComputerOS.set(osValue);
    const oldDesc = computer['description'] || '';
    this.oldComputerDescription.set(oldDesc);
    
    // Auto-detect device type from 4th character
    const deviceType = this.detectDeviceType(computerName);
    
    // Get current action type
    const actionType = this.form.get('actionType')?.value;
    
    // Build patch data
    const patchData: any = {
      oldComputerName: computerName,
      operatingSystem: osValue,
      deviceType: deviceType,
    };

    if (actionType === 'R') {
      patchData.description = oldDesc;
    } else if (actionType === 'RB' && this.newComputerDescription()) {
      patchData.description = this.newComputerDescription();
    }
    
    // Only copy to new computer name if action type is Rebuild
    if (actionType === 'RB') {
      patchData.newComputerName = computerName;
    }
    
    this.form.patchValue(patchData);
    
    // Update preview based on current actionType
    this.updateOperatingSystemPreview(actionType);
    this.oldComputerShowDropdown.set(false);
    this.oldComputerResults.set([]);
  }

  onOldComputerSearchEnter(): void {
    const results = this.oldComputerResults();
    if (results && results.length > 0) {
      this.selectOldComputer(results[0]);
    }
  }

  selectNewComputer(computer: Computer): void {
    const computerName = (computer['name'] || '').toUpperCase();
    const osValue = computer['operatingSystem'] || '';
    this.newComputerOS.set(osValue);
    const desc = computer['description'] || '';
    
    // Auto-detect device type from 4th character
    const deviceType = this.detectDeviceType(computerName);
    
    // Get current action type
    const actionType = this.form.get('actionType')?.value;
    
    // If action is 'N' (New) or 'RB' (Rebuild), populate description from new computer
    const patchData: any = {
      newComputerName: computerName,
      operatingSystem: osValue,
      deviceType: deviceType,
    };
    
    if (actionType === 'N' || actionType === 'RB') {
      patchData.description = desc;
    }
    
    // Patch the form
    this.form.patchValue(patchData);
    this.newComputerDescription.set(desc);
    
    // Update preview based on current actionType
    this.updateOperatingSystemPreview(actionType);
    this.newComputerShowDropdown.set(false);
    this.newComputerResults.set([]);
  }

  onNewComputerSearchEnter(): void {
    const results = this.newComputerResults();
    if (results && results.length > 0) {
      this.selectNewComputer(results[0]);
    }
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

  onUsernameSearchEnter(): void {
    const results = this.usernameResults();
    if (results && results.length > 0) {
      this.selectUsername(results[0]);
    }
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
    this.oldComputerDescription.set('');
    this.newComputerDescription.set('');
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

  private detectDeviceType(computerName: string): string {
    // Check 4th character (index 3) of computer name
    // L = Laptop, D = Desktop
    if (computerName && computerName.length >= 4) {
      const fourthChar = computerName[3].toUpperCase();
      if (fourthChar === 'L') {
        return 'Laptop';
      } else if (fourthChar === 'D') {
        return 'Desktop';
      }
    }
    // Default to Laptop if can't detect
    return 'Laptop';
  }

  private updateOperatingSystemPreview(actionType: string): void {
    if (actionType === 'R') {
      // Removal: use old computer OS
      this.operatingSystemPreview.set(this.oldComputerOS());
    } else {
      // New and Rebuild: use new computer OS
      this.operatingSystemPreview.set(this.newComputerOS());
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, Subject } from 'rxjs';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { ApiService, User } from '../../services/api';

@Component({
  selector: 'app-jobsheet',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './jobsheet.component.html',
  styleUrl: './jobsheet.component.scss'
})
export class JobsheetComponent implements OnInit, OnDestroy {
  jobSheetForm!: FormGroup;

  userSearchInput = signal('');
  userResults = signal<User[]>([]);
  userLoading = signal(false);
  userShowDropdown = signal(false);
  exportMessage = signal('');

  private userSearchSubject = new Subject<string>();

  constructor(
    private fb: FormBuilder,
    private apiService: ApiService
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.userSearchSubject.pipe(debounceTime(300)).subscribe((searchTerm) => {
      this.performUserSearch(searchTerm);
    });
  }

  ngOnDestroy(): void {
    this.userSearchSubject.complete();
  }

  get parts(): FormArray {
    return this.jobSheetForm.get('parts') as FormArray;
  }

  onUserSearch(value: string): void {
    this.userSearchInput.set(value);
    this.userSearchSubject.next(value);
  }

  onUserSearchEnter(): void {
    const results = this.userResults();
    if (results.length > 0) {
      this.selectUser(results[0]);
    }
  }

  selectUser(user: User): void {
    const username = this.getUserValue(user, ['sAMAccountName', 'samAccountName', 'userPrincipalName', 'UserPrincipalName']);
    const name = this.getUserValue(user, ['displayName', 'DisplayName', 'name', 'Name']);
    const designation = this.getUserValue(user, ['title', 'Title']);
    const production = this.getUserValue(user, ['production', 'Production', 'company', 'Company']);
    const department = this.getUserValue(user, ['department', 'Department']);
    const site = this.getUserValue(user, ['site', 'Site']);

    this.jobSheetForm.patchValue({
      username,
      name,
      designation,
      production,
      department,
      site
    });

    this.userSearchInput.set(username || name);
    this.userShowDropdown.set(false);
    this.userResults.set([]);
  }

  setStatus(status: 'Pending' | 'Done', checked: boolean): void {
    this.jobSheetForm.patchValue({
      status: checked ? status : ''
    });
  }

  addPartRow(): void {
    this.parts.push(this.createPartRow());
  }

  removePartRow(index: number): void {
    if (this.parts.length <= 1) {
      return;
    }
    this.parts.removeAt(index);
  }

  clearForm(): void {
    this.jobSheetForm.reset({
      ticketNumber: '',
      username: '',
      name: '',
      designation: '',
      production: '',
      department: '',
      site: '',
      assetNo: '',
      status: '',
      complain: '',
      findings: '',
      solutions: '',
      raisedBy: 'Tareque Hasan',
      requestedBy: '',
      verifiedBy: ''
    });

    while (this.parts.length > 0) {
      this.parts.removeAt(0);
    }

    this.addPartRow();
    this.userSearchInput.set('');
    this.userShowDropdown.set(false);
    this.userResults.set([]);
    this.exportMessage.set('');
  }

  async generateJobSheet(): Promise<void> {
    try {
      this.exportMessage.set('Generating JobSheet...');
      const workbook = new ExcelJS.Workbook();
      const buffer = await this.loadTemplateBuffer();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.worksheets[0];
      const formValue = this.jobSheetForm.value;

      worksheet.getCell('H2').value = formValue.ticketNumber || '';
      worksheet.getCell('B4').value = formValue.username || '';
      worksheet.getCell('G4').value = formValue.name || '';
      worksheet.getCell('B6').value = formValue.designation || '';
      worksheet.getCell('G6').value = formValue.production || '';
      worksheet.getCell('B8').value = formValue.department || '';
      worksheet.getCell('G8').value = formValue.site || '';
      worksheet.getCell('B10').value = formValue.assetNo || '';
      worksheet.getCell('H10').value = formValue.status || '';

      worksheet.getCell('A15').value = formValue.complain || '';
      worksheet.getCell('D15').value = formValue.findings || '';
      worksheet.getCell('H15').value = formValue.solutions || '';

      const validParts = (formValue.parts || []).filter((part: any) =>
        !!part?.description || !!part?.quantity || !!part?.price
      );

      validParts.forEach((part: any, index: number) => {
        const row = 28 + index;
        worksheet.getCell(`A${row}`).value = part.description || '';
        worksheet.getCell(`H${row}`).value = part.quantity ?? '';
        worksheet.getCell(`I${row}`).value = part.price ?? '';
      });

      worksheet.getCell('B32').value = formValue.raisedBy || '';
      const requestedBy = (formValue.requestedBy || '').toString().trim();
      const verifiedBy = (formValue.verifiedBy || '').toString().trim();

      if (requestedBy) {
        worksheet.getCell('B35').value = requestedBy;
      }

      if (verifiedBy) {
        worksheet.getCell('B38').value = verifiedBy;
      }

      const output = await workbook.xlsx.writeBuffer();
      const selectedName = (formValue.name || '').toString().trim() || 'Unknown';
      const safeName = selectedName.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
      const today = new Date();
      const dateText = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const blob = new Blob([output], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      saveAs(blob, `JobSheet for ${safeName} ${dateText}.xlsx`);
      this.exportMessage.set('JobSheet generated successfully.');
    } catch (error) {
      console.error('JobSheet export failed', error);
      this.exportMessage.set(`Failed to generate JobSheet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  trackPartRow(index: number, _control: AbstractControl): number {
    return index;
  }

  private initializeForm(): void {
    this.jobSheetForm = this.fb.group({
      ticketNumber: [''],
      username: [''],
      name: [''],
      designation: [''],
      production: [''],
      department: [''],
      site: [''],
      assetNo: [''],
      status: [''],
      complain: [''],
      findings: [''],
      solutions: [''],
      raisedBy: ['Tareque Hasan'],
      requestedBy: [''],
      verifiedBy: [''],
      parts: this.fb.array([this.createPartRow()])
    });
  }

  private createPartRow(): FormGroup {
    return this.fb.group({
      description: [''],
      quantity: [null, [Validators.min(0)]],
      price: [null, [Validators.min(0)]]
    });
  }

  private performUserSearch(searchTerm: string): void {
    if (!searchTerm?.trim()) {
      this.userResults.set([]);
      this.userShowDropdown.set(false);
      return;
    }

    this.userLoading.set(true);
    this.userShowDropdown.set(true);

    this.apiService.searchUsers(searchTerm).subscribe({
      next: (results) => {
        this.userResults.set(results.slice(0, 8));
        this.userLoading.set(false);
      },
      error: () => {
        this.userResults.set([]);
        this.userLoading.set(false);
      }
    });
  }

  private async loadTemplateBuffer(): Promise<ArrayBuffer> {
    const candidatePaths = [
      'templateJS.xlsx',
      '/templateJS.xlsx'
    ];

    for (const path of candidatePaths) {
      try {
        const response = await fetch(path);
        if (response.ok) {
          return await response.arrayBuffer();
        }
      } catch {
      }
    }

    throw new Error('Template file not found');
  }

  private getUserValue(user: User, keys: string[]): string {
    for (const key of keys) {
      const value = user[key];
      if (value !== undefined && value !== null && `${value}`.trim() !== '') {
        return `${value}`;
      }
    }
    return '';
  }
}

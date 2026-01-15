import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { debounceTime, Subject } from 'rxjs';
import { ApiService, User } from '../../services/api';

@Component({
  selector: 'app-device-assign-form',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './device-assign-form.component.html',
  styleUrl: './device-assign-form.component.css',
  standalone: true,
})
export class DeviceAssignFormComponent {
  form: FormGroup;
  isProcessing = false;
  message = '';

  // User search
  userSearchInput = signal('');
  userResults = signal<User[]>([]);
  selectedUser = signal<User | null>(null);
  userLoading = signal(false);
  userShowDropdown = signal(false);
  private userSearchSubject = new Subject<string>();

  // Parsed user info for preview
  firstName = signal('');
  lastName = signal('');
  section = signal('');
  department = signal('');

  items = [
    { name: 'Laptop', providedKey: 'pro1', conditionKey: 'con1' },
    { name: 'Laptop Charger', providedKey: 'pro2', conditionKey: 'con2' },
    { name: 'Laptop Bag', providedKey: 'pro3', conditionKey: 'con3' },
    { name: 'Mouse', providedKey: 'pro4', conditionKey: 'con4' },
    { name: 'Headphone', providedKey: 'pro5', conditionKey: 'con5' }
  ];

  private getApiUrl(): string {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      return `http://${hostname}:5001/api/print`;
    }
    return 'http://localhost:5001/api/print';
  }

  private apiUrl = this.getApiUrl();

  constructor(private fb: FormBuilder, private http: HttpClient, private apiService: ApiService) {
    // Setup user search with debounce
    this.userSearchSubject.pipe(
      debounceTime(300)
    ).subscribe(searchTerm => {
      if (searchTerm.trim()) {
        this.userLoading.set(true);
        this.userShowDropdown.set(true);
        this.apiService.searchUsers(searchTerm).subscribe(
          (results) => {
            this.userResults.set(results.slice(0, 5));
            this.userLoading.set(false);
          },
          (error) => {
            console.error('Error searching users:', error);
            this.userResults.set([]);
            this.userLoading.set(false);
          }
        );
      } else {
        this.userResults.set([]);
        this.userShowDropdown.set(false);
      }
    });

    this.form = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      section: ['', Validators.required],
      department: ['', Validators.required],
      provided1: [false],
      provided2: [false],
      provided3: [false],
      provided4: [false],
      provided5: [false],
      condition1: [false],
      condition2: [false],
      condition3: [false],
      condition4: [false],
      condition5: [false],
      remark1: [''],
      remark2: [''],
      remark3: [''],
      remark4: [''],
      remark5: [''],
      rpro1: [false],
      rpro2: [false],
      rpro3: [false],
      rpro4: [false],
      rpro5: [false],
      rcon1: [false],
      rcon2: [false],
      rcon3: [false],
      rcon4: [false],
      rcon5: [false],
      rr1: [''],
      rr2: [''],
      rr3: [''],
      rr4: [''],
      rr5: ['']
    });

    // Disable condition toggles by default and watch provided toggles
    for (let i = 1; i <= 5; i++) {
      // Items Loaned
      this.form.get(`condition${i}`)?.disable();
      
      this.form.get(`provided${i}`)?.valueChanges.subscribe(isProvided => {
        const conditionControl = this.form.get(`condition${i}`);
        if (isProvided) {
          conditionControl?.enable();
        } else {
          conditionControl?.disable();
          conditionControl?.setValue(false);
        }
      });

      // Items Returned
      this.form.get(`rcon${i}`)?.disable();
      
      this.form.get(`rpro${i}`)?.valueChanges.subscribe(isReturned => {
        const rconControl = this.form.get(`rcon${i}`);
        if (isReturned) {
          rconControl?.enable();
        } else {
          rconControl?.disable();
          rconControl?.setValue(false);
        }
      });
    }
  }

  generateDocx() {
    if (this.form.invalid) return;

    this.isProcessing = true;
    this.message = 'Generating DOCX...';

    const formValue = this.form.getRawValue(); // Get all values including disabled controls
    const data = {
      FirstName: formValue.firstName,
      LastName: formValue.lastName,
      Section: formValue.section,
      Department: formValue.department,
      Pro1: formValue.provided1 ? 'Yes' : '',
      Pro2: formValue.provided2 ? 'Yes' : '',
      Pro3: formValue.provided3 ? 'Yes' : '',
      Pro4: formValue.provided4 ? 'Yes' : '',
      Pro5: formValue.provided5 ? 'Yes' : '',
      Con1: formValue.provided1 ? (formValue.condition1 ? 'New' : 'Used') : '',
      Con2: formValue.provided2 ? (formValue.condition2 ? 'New' : 'Used') : '',
      Con3: formValue.provided3 ? (formValue.condition3 ? 'New' : 'Used') : '',
      Con4: formValue.provided4 ? (formValue.condition4 ? 'New' : 'Used') : '',
      Con5: formValue.provided5 ? (formValue.condition5 ? 'New' : 'Used') : '',
      R1: formValue.remark1 || '',
      R2: formValue.remark2 || '',
      R3: formValue.remark3 || '',
      R4: formValue.remark4 || '',
      R5: formValue.remark5 || '',
      RPro1: formValue.rpro1 ? 'Yes' : '',
      RPro2: formValue.rpro2 ? 'Yes' : '',
      RPro3: formValue.rpro3 ? 'Yes' : '',
      RPro4: formValue.rpro4 ? 'Yes' : '',
      RPro5: formValue.rpro5 ? 'Yes' : '',
      RCon1: formValue.rpro1 ? (formValue.rcon1 ? 'New' : 'Used') : '',
      RCon2: formValue.rpro2 ? (formValue.rcon2 ? 'New' : 'Used') : '',
      RCon3: formValue.rpro3 ? (formValue.rcon3 ? 'New' : 'Used') : '',
      RCon4: formValue.rpro4 ? (formValue.rcon4 ? 'New' : 'Used') : '',
      RCon5: formValue.rpro5 ? (formValue.rcon5 ? 'New' : 'Used') : '',
      RR1: formValue.rr1 || '',
      RR2: formValue.rr2 || '',
      RR3: formValue.rr3 || '',
      RR4: formValue.rr4 || '',
      RR5: formValue.rr5 || ''
    };

    console.log('Form data being sent:', data);

    const filename = `${data.FirstName} ${data.LastName} assign form.docx`;

    this.http.post(`${this.apiUrl}/generate-docx`, data, { responseType: 'blob' })
      .subscribe({
        next: (blob) => {
          // Download the file
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
          window.URL.revokeObjectURL(url);
          
          this.message = '✅ DOCX generated successfully!';
          this.isProcessing = false;
        },
        error: (err) => {
          console.error('Error generating DOCX:', err);
          this.message = `❌ Error: ${err.error?.message || 'Failed to generate DOCX'}`;
          this.isProcessing = false;
        }
      });
  }

  silentPrint() {
    if (this.form.invalid) return;

    this.isProcessing = true;
    this.message = 'Sending to printer...';

    const formValue = this.form.getRawValue();
    const data = {
      FirstName: formValue.firstName,
      LastName: formValue.lastName,
      Section: formValue.section,
      Department: formValue.department,
      Pro1: formValue.provided1 ? 'Yes' : '',
      Pro2: formValue.provided2 ? 'Yes' : '',
      Pro3: formValue.provided3 ? 'Yes' : '',
      Pro4: formValue.provided4 ? 'Yes' : '',
      Pro5: formValue.provided5 ? 'Yes' : '',
      Con1: formValue.provided1 ? (formValue.condition1 ? 'New' : 'Used') : '',
      Con2: formValue.provided2 ? (formValue.condition2 ? 'New' : 'Used') : '',
      Con3: formValue.provided3 ? (formValue.condition3 ? 'New' : 'Used') : '',
      Con4: formValue.provided4 ? (formValue.condition4 ? 'New' : 'Used') : '',
      Con5: formValue.provided5 ? (formValue.condition5 ? 'New' : 'Used') : '',
      R1: formValue.remark1 || '',
      R2: formValue.remark2 || '',
      R3: formValue.remark3 || '',
      R4: formValue.remark4 || '',
      R5: formValue.remark5 || '',
      RPro1: formValue.rpro1 ? 'Yes' : '',
      RPro2: formValue.rpro2 ? 'Yes' : '',
      RPro3: formValue.rpro3 ? 'Yes' : '',
      RPro4: formValue.rpro4 ? 'Yes' : '',
      RPro5: formValue.rpro5 ? 'Yes' : '',
      RCon1: formValue.rpro1 ? (formValue.rcon1 ? 'New' : 'Used') : '',
      RCon2: formValue.rpro2 ? (formValue.rcon2 ? 'New' : 'Used') : '',
      RCon3: formValue.rpro3 ? (formValue.rcon3 ? 'New' : 'Used') : '',
      RCon4: formValue.rpro4 ? (formValue.rcon4 ? 'New' : 'Used') : '',
      RCon5: formValue.rpro5 ? (formValue.rcon5 ? 'New' : 'Used') : '',
      RR1: formValue.rr1 || '',
      RR2: formValue.rr2 || '',
      RR3: formValue.rr3 || '',
      RR4: formValue.rr4 || '',
      RR5: formValue.rr5 || ''
    };

    this.http.post(`${this.apiUrl}/silent-print`, data)
      .subscribe({
        next: (response: any) => {
          this.message = `✅ ${response.message || 'Printed successfully!'}`;
          this.isProcessing = false;
        },
        error: (err) => {
          console.error('Error printing:', err);
          this.message = `❌ Error: ${err.error?.message || 'Failed to print'}`;
          this.isProcessing = false;
        }
      });
  }

  clearForm() {
    this.form.reset();
    this.message = '';
    this.selectedUser.set(null);
    this.firstName.set('');
    this.lastName.set('');
    this.section.set('');
    this.department.set('');
    this.userSearchInput.set('');
    this.userResults.set([]);
  }

  onUserSearch(value: string): void {
    this.userSearchInput.set(value);
    this.userSearchSubject.next(value);
  }

  selectUser(user: User): void {
    this.selectedUser.set(user);
    
    // Parse displayName: "LastName, FirstName"
    const displayName = user['displayName'] || '';
    const parts = displayName.split(',').map((p: string) => p.trim());
    const lastNameParsed = parts[0] || '';
    const firstNameParsed = parts[1] || '';
    
    // company -> section, department as is
    const sectionValue = user['company'] || '';
    const departmentValue = user['department'] || '';
    
    // Update signals for preview
    this.firstName.set(firstNameParsed);
    this.lastName.set(lastNameParsed);
    this.section.set(sectionValue);
    this.department.set(departmentValue);
    
    // Update form values
    this.form.patchValue({
      firstName: firstNameParsed,
      lastName: lastNameParsed,
      section: sectionValue,
      department: departmentValue
    });
    
    this.userShowDropdown.set(false);
    this.userResults.set([]);
  }

  onUserSearchEnter(): void {
    const results = this.userResults();
    if (results && results.length > 0) {
      this.selectUser(results[0]);
    }
  }
}

import { Component } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-new-user-assign-form',
  imports: [ReactiveFormsModule],
  templateUrl: './new-user-assign-form.component.html',
  styleUrl: './new-user-assign-form.component.css',
  standalone: true,
})
export class NewUserAssignFormComponent {
  form: FormGroup;
  isProcessing = false;
  message = '';

  items = [
    { name: 'Laptop', providedKey: 'pro1', conditionKey: 'con1' },
    { name: 'Laptop Charger', providedKey: 'pro2', conditionKey: 'con2' },
    { name: 'Laptop Bag', providedKey: 'pro3', conditionKey: 'con3' },
    { name: 'Mouse', providedKey: 'pro4', conditionKey: 'con4' },
    { name: 'Headphone', providedKey: 'pro5', conditionKey: 'con5' }
  ];

  private apiUrl = 'http://localhost:5001/api/print';

  constructor(private fb: FormBuilder, private http: HttpClient) {
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
      condition5: [false]
    });

    // Disable condition toggles by default and watch provided toggles
    for (let i = 1; i <= 5; i++) {
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
      Con5: formValue.provided5 ? (formValue.condition5 ? 'New' : 'Used') : ''
    };

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
      Con5: formValue.provided5 ? (formValue.condition5 ? 'New' : 'Used') : ''
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
  }
}

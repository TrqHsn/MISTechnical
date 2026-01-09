import { Component, ViewChild, ElementRef } from '@angular/core';

@Component({
  selector: 'app-service-tag',
  templateUrl: './service-tag.component.html',
  styleUrls: ['./service-tag.component.css']
})
export class ServiceTag {
  
  @ViewChild('whereToClaim') whereToClaim!: ElementRef;
  @ViewChild('hostName') hostName!: ElementRef;
  @ViewChild('deviceModel') deviceModel!: ElementRef;
  @ViewChild('sendingDate') sendingDate!: ElementRef;
  @ViewChild('currentCondition') currentCondition!: ElementRef;
  @ViewChild('problemDetails') problemDetails!: ElementRef;
   @ViewChild('printSection') printSection!: ElementRef;

  clearAll(): void {
    const inputs = [
      this.whereToClaim,
      this.hostName,
      this.deviceModel,
      this.sendingDate,
      this.currentCondition,
      this.problemDetails
    ];
    
    inputs.forEach(input => {
      if (input && input.nativeElement) {
        input.nativeElement.value = '';
      }
    });
  }
  print(): void {
    // Ensure current input/textarea values are present as attributes/text
    const inputs = [
      this.whereToClaim,
      this.hostName,
      this.deviceModel,
      this.sendingDate,
      this.currentCondition,
      this.problemDetails
    ];

    inputs.forEach(ref => {
      if (!ref || !ref.nativeElement) return;
      const el = ref.nativeElement as HTMLElement & { value?: string };
      const tag = el.tagName?.toUpperCase();
      if (tag === 'INPUT') {
        // set attribute so value appears in innerHTML
        (el as HTMLInputElement).setAttribute('value', (el as HTMLInputElement).value || '');
      } else if (tag === 'TEXTAREA') {
        // set the text content for textarea
        (el as HTMLTextAreaElement).textContent = (el as HTMLTextAreaElement).value || '';
      }
    });

    const printContent = this.printSection.nativeElement.innerHTML;
    const originalContent = document.body.innerHTML;

    document.body.innerHTML = printContent;
    window.print();
    document.body.innerHTML = originalContent;

    // Reload to re-bootstrap Angular and restore component state
    window.location.reload();
  }
  
}
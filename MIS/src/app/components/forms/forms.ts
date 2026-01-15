import { Component, signal } from '@angular/core';
import { OsInstallationFormComponent } from '../os-installation-form/os-installation-form.component';
import { DeviceAssignFormComponent } from '../device-assign-form/device-assign-form.component';

@Component({
  selector: 'app-forms',
  imports: [OsInstallationFormComponent, DeviceAssignFormComponent],
  templateUrl: './forms.html',
  styleUrl: './forms.css',
  standalone: true
})
export class Forms {
  activeTab = signal<'os-form' | 'device-form'>('os-form');
}

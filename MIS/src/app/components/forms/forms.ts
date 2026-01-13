import { Component, signal } from '@angular/core';
import { OsInstallationFormComponent } from '../os-installation-form/os-installation-form.component';
import { NewUserAssignFormComponent } from '../new-user-assign-form/new-user-assign-form.component';

@Component({
  selector: 'app-forms',
  imports: [OsInstallationFormComponent, NewUserAssignFormComponent],
  templateUrl: './forms.html',
  styleUrl: './forms.css',
  standalone: true
})
export class Forms {
  activeTab = signal<'os-form' | 'device-form'>('os-form');
}

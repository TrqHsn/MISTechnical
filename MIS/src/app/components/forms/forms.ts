import { Component, signal } from '@angular/core';
import { OsInstallationFormComponent } from '../os-installation-form/os-installation-form.component';
import { DeviceAssignFormComponent } from '../device-assign-form/device-assign-form.component';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-forms',
  imports: [OsInstallationFormComponent, DeviceAssignFormComponent],
  templateUrl: './forms.html',
  styleUrl: './forms.css',
  standalone: true
})
export class Forms {
  activeTab = signal<'os-form' | 'device-form'>('os-form');

  constructor(private route: ActivatedRoute) {
    // Listen for tab query parameter
    this.route.queryParams.subscribe(params => {
      if (params['tab']) {
        const tab = params['tab'] as 'os-form' | 'device-form';
        if (tab === 'os-form' || tab === 'device-form') {
          this.activeTab.set(tab);
        }
      }
    });
  }
}

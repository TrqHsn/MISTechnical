import { Routes } from '@angular/router';

export const routes: Routes = [
  // Default redirect so root URL serves the SPA route
  { path: '', redirectTo: 'ad-tools', pathMatch: 'full' },
  {
    path: 'ad-tools',
    loadComponent: () => import('./components/ad-tools/ad-tools').then(m => m.AdToolsComponent)
  }
  ,
  {
    path: 'print',
    loadComponent: () => import('./components/print/print').then(m => m.Print)
  }
  ,
  {
    path: 'forms',
    loadComponent: () => import('./components/forms/forms').then(m => m.Forms)
  }
  ,
  {
    path: 'os-installation-form',
    loadComponent: () => import('./components/os-installation-form/os-installation-form.component').then(m => m.OsInstallationFormComponent)
  }
  ,
  {
    path: 'stress-cpu-gpu',
    loadComponent: () => import('./components/stress-cpu-gpu/stress-cpu-gpu.component').then(m => m.StressCpuGpuComponent)
  }
  ,
  {
    path: 'network',
    loadComponent: () => import('./components/network/network').then(m => m.NetworkComponent)
  }
  ,
  {
    path: 'device-tool',
    loadComponent: () => import('./components/device-tool/device-tool').then(m => m.DeviceToolComponent)
  }
  ,
  {
    path: 'device-assign',
    loadComponent: () => import('./components/device-assign-form/device-assign-form.component').then(m => m.DeviceAssignFormComponent)
  }
  ,
  {
    path: 'inventory',
    loadComponent: () => import('./components/inventory-search/inventory-search.component').then(m => m.InventorySearchComponent)
  }
  ,
  {
    path: 'kiosk-admin',
    loadComponent: () => import('./components/kiosk-admin/kiosk-admin').then(m => m.KioskAdminComponent)
  }
  ,
  {
    path: 'important-links',
    loadComponent: () => import('./components/important-links/important-links').then(m => m.ImportantLinksComponent)
  },
  {
    path: 'cam-mic-test',
    loadComponent: () => import('./components/cam-mic-audio.component').then(m => m.CamMicAudioComponent)
  }
  ,
  {
    path: 'display-test',
    loadComponent: () => import('./components/display-test/display-test.component').then(m => m.DisplayTestComponent)
  }
  ,
  // ...existing code...
  // Fallback - redirect any unknown path to ad-tools
  { path: '**', redirectTo: 'ad-tools' }
];

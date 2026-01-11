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
    path: 'label-print',
    loadComponent: () => import('./components/label-print/label-print').then(m => m.LabelPrint)
  }
  ,
  {
    path: 'os-installation-form',
    loadComponent: () => import('./components/os-installation-form/os-installation-form.component').then(m => m.OsInstallationFormComponent)
  }
  ,
  {
    path: 'service-tag',
    loadComponent: () => import('./components/service-tag/service-tag.component').then(m => m.ServiceTag)
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
    path: 'new-user-assign',
    loadComponent: () => import('./components/new-user-assign-form/new-user-assign-form.component').then(m => m.NewUserAssignFormComponent)
  }
  ,
  {
    path: 'inventory',
    loadComponent: () => import('./components/inventory-search/inventory-search.component').then(m => m.InventorySearchComponent)
  }
  ,
  // Fallback - redirect any unknown path to ad-tools
  { path: '**', redirectTo: 'ad-tools' }
];

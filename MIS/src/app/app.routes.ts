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
    path: 'update',
    loadComponent: () => import('./components/update-user-info/update-user-info.component').then(m => m.UpdateUserInfoComponent)
  }
  ,
  {
    path: 'stress-cpu-gpu',
    loadComponent: () => import('./components/stress-cpu-gpu/stress-cpu-gpu.component').then(m => m.StressCpuGpuComponent)
  }
  ,
  {
    path: 'inventory',
    loadComponent: () => import('./components/inventory-search/inventory-search.component').then(m => m.InventorySearchComponent)
  }
  ,
  {
    path: 'test1',
    loadComponent: () => import('./components/test1/test1').then(m => m.Test1Component)
  }
  ,
  // Fallback - redirect any unknown path to ad-tools
  { path: '**', redirectTo: 'ad-tools' }
];

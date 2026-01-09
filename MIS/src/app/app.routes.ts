import { Routes } from '@angular/router';

export const routes: Routes = [
  // Default redirect so root URL serves the SPA route
  { path: '', redirectTo: 'test-api', pathMatch: 'full' },
  {
    path: 'test-api',
    loadComponent: () => import('./components/test-api/test-api').then(m => m.TestApiComponent)
  }
  ,
  {
    path: 'sticker-print',
    loadComponent: () => import('./components/sticker-print/sticker-print').then(m => m.StickerPrint)
  }
  ,
  {
    path: 'build-rebuild',
    loadComponent: () => import('./components/it-build-rebuild/it-build-rebuild.component').then(m => m.ItBuildRebuildComponent)
  }
  ,
  {
    path: 'wranty',
    loadComponent: () => import('./components/warranty-claim/warranty-claim.component').then(m => m.WarrantyClaim)
  }
  ,
  {
    path: 'update',
    loadComponent: () => import('./components/update-user-info/update-user-info.component').then(m => m.UpdateUserInfoComponent)
  }
  ,
  {
    path: 'stress',
    loadComponent: () => import('./components/stress/stress.component').then(m => m.StressComponent)
  }
  ,
  {
    path: 'inventory',
    loadComponent: () => import('./components/inventory-search/inventory-search.component').then(m => m.InventorySearchComponent)
  }
  ,
  // Fallback - redirect any unknown path to test-api
  { path: '**', redirectTo: 'test-api' }
];

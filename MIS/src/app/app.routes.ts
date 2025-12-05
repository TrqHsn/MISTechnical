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
  // Fallback - redirect any unknown path to test-api
  { path: '**', redirectTo: 'test-api' }
];

import { Routes } from '@angular/router';
import { authGuard, adminGuard, homeRedirectGuard, permissionGuard } from './guards/auth.guards';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./components/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'access-denied',
    loadComponent: () => import('./components/access-denied/access-denied.component').then(m => m.AccessDeniedComponent)
  },
  {
    path: '',
    pathMatch: 'full',
    canActivate: [homeRedirectGuard],
    children: []
  },
  {
    path: '',
    canActivateChild: [authGuard],
    children: [
      {
        path: 'ad-tools',
        loadComponent: () => import('./components/ad-tools/ad-tools').then(m => m.AdToolsComponent),
        canActivate: [permissionGuard],
        data: { permission: 'ADTools' }
      },
      {
        path: 'print',
        loadComponent: () => import('./components/print/print').then(m => m.Print),
        canActivate: [permissionGuard],
        data: { permission: 'Printer' }
      },
      {
        path: 'forms',
        loadComponent: () => import('./components/forms/forms').then(m => m.Forms),
        canActivate: [permissionGuard],
        data: { permission: 'Forms' }
      },
      {
        path: 'os-installation-form',
        loadComponent: () => import('./components/os-installation-form/os-installation-form.component').then(m => m.OsInstallationFormComponent),
        canActivate: [permissionGuard],
        data: { permission: 'Forms' }
      },
      {
        path: 'mail-storage-notification',
        loadComponent: () => import('./components/mail-storage-notification/mail-storage-notification.component').then(m => m.MailStorageNotificationComponent),
        canActivate: [permissionGuard],
        data: { permission: 'MailboxQuota' }
      },
      {
        path: 'stress-cpu-gpu',
        loadComponent: () => import('./components/stress-cpu-gpu/stress-cpu-gpu.component').then(m => m.StressCpuGpuComponent),
        canActivate: [permissionGuard],
        data: { permission: 'DeviceManagement' }
      },
      {
        path: 'network',
        loadComponent: () => import('./components/network/network').then(m => m.NetworkComponent),
        canActivate: [permissionGuard],
        data: { permission: 'NetworkDashboard' }
      },
      {
        path: 'network-dashboard',
        loadComponent: () => import('./components/network-dashboard/network-dashboard').then(m => m.NetworkDashboardComponent),
        canActivate: [permissionGuard],
        data: { permission: 'NetworkDashboard' }
      },
      {
        path: 'device-tool',
        loadComponent: () => import('./components/device-tool/device-tool').then(m => m.DeviceToolComponent),
        canActivate: [permissionGuard],
        data: { permission: 'DeviceManagement' }
      },
      {
        path: 'device-assign',
        loadComponent: () => import('./components/device-assign-form/device-assign-form.component').then(m => m.LaptopAssignFormComponent),
        canActivate: [permissionGuard],
        data: { permission: 'DeviceManagement' }
      },
      {
        path: 'jobsheet',
        loadComponent: () => import('./components/jobsheet/jobsheet.component').then(m => m.JobsheetComponent),
        canActivate: [permissionGuard],
        data: { permission: 'Forms' }
      },
      {
        path: 'inventory',
        loadComponent: () => import('./components/search/search.component').then(m => m.SearchComponent),
        canActivate: [permissionGuard],
        data: { permission: 'Inventory' }
      },
      {
        path: 'sinage',
        loadComponent: () => import('./components/sinage/sinage').then(m => m.SinageComponent),
        canActivate: [permissionGuard],
        data: { permission: 'Kiosk' }
      },
      {
        path: 'important-links',
        loadComponent: () => import('./components/important-links/important-links').then(m => m.ImportantLinksComponent),
        canActivate: [permissionGuard],
        data: { permission: 'ImportantLinks' }
      },
      {
        path: 'files',
        loadComponent: () => import('./components/smb-browser/smb-browser').then(m => m.SmbBrowserComponent),
        canActivate: [permissionGuard],
        data: { permission: 'Files' }
      },
      {
        path: 'others',
        loadComponent: () => import('./components/others/others').then(m => m.OthersComponent),
        canActivate: [permissionGuard],
        data: { permission: 'OtherTools' }
      },
      {
        path: 'cam-mic-speaker',
        loadComponent: () => import('./components/cam-mic-speaker/cam-mic-speaker.component').then(m => m.CamMicSpeakerComponent),
        canActivate: [permissionGuard],
        data: { permission: 'CamMicSpeaker' }
      },
      {
        path: 'display-test',
        loadComponent: () => import('./components/display-test/display-test.component').then(m => m.DisplayTestComponent),
        canActivate: [permissionGuard],
        data: { permission: 'DisplayTest' }
      },
      {
        path: 'weekPlanner',
        loadComponent: () => import('./components/week-planner/week-planner').then(m => m.WeekPlannerComponent),
        canActivate: [permissionGuard],
        data: { permission: 'WeekPlanner' }
      },
      {
        path: 'admin',
        loadComponent: () => import('./components/admin/admin.component').then(m => m.AdminComponent),
        canActivate: [adminGuard]
      },
      { path: '**', redirectTo: 'ad-tools' }
    ]
  }
];

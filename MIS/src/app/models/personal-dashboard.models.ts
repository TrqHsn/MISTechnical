export interface DashboardChecklistItem {
  id: string;
  isCompleted: boolean;
  task: string;
  createdDate: string;
}

export interface DashboardLinkItem {
  name: string;
  link: string;
}

export interface DashboardPiDeviceStatus {
  plantName: string;
  ipAddress: string;
  isOnline: boolean;
  statusText: string;
  statusColor: string;
}

export interface DashboardDataResponse {
  checklist: DashboardChecklistItem[];
  piDevices: DashboardPiDeviceStatus[];
  portalBookmarks: DashboardLinkItem[];
  fileList: DashboardLinkItem[];
  importantLinks: DashboardLinkItem[];
  ciscoMeraki: DashboardLinkItem[];
  lastUpdatedUtc: string;
}

export interface DashboardFileActionResult {
  success: boolean;
  message: string;
  path?: string;
}

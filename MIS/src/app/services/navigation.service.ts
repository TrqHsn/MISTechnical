import { Injectable } from '@angular/core';

export interface NavButton {
  name: string;
  id: string;
  route?: string;
  icon?: string;
  description?: string;
  keywords?: string[];
  isAction?: boolean; // true for actions like "Unlock", false for navigation
}

@Injectable({
  providedIn: 'root'
})
export class NavigationService {
  // Route mapping for button IDs
  private routeMap: { [key: string]: string } = {
    'testapi': '/ad-tools',
    'print': '/print',
    'oif': '/forms',
    'inventory': '/inventory',
    'network': '/network',
    'devicetool': '/device-tool',
    'kiosk': '/kiosk-admin',
    'newuser': '/device-assign',
    'links': '/important-links',
    'files': '/files',
    'unlock': '', // Action, not a route
  };

  // Icon and metadata mapping
  private metadataMap: { [key: string]: { icon: string; description: string; keywords: string[] } } = {
    'testapi': { icon: '🔧', description: 'Active Directory management tools', keywords: ['ad', 'active directory', 'tools', 'admin', 'users', 'computers'] },
    'print': { icon: '🖨️', description: 'Print thermal labels for devices', keywords: ['print', 'label', 'thermal', 'printer'] },
    'oif': { icon: '📝', description: 'OS installation and device assignment forms', keywords: ['forms', 'os', 'installation', 'device'] },
    'inventory': { icon: '📦', description: 'Search hardware inventory database', keywords: ['inventory', 'search', 'hardware', 'stock'] },
    'network': { icon: '🌐', description: 'Ping, IP scanner, and attendance device management', keywords: ['network', 'ping', 'scan', 'attendance'] },
    'devicetool': { icon: '🔧', description: 'Device management utilities', keywords: ['device', 'tool', 'management'] },
    'kiosk': { icon: '📺', description: 'Manage kiosk media, playlists, and schedules', keywords: ['kiosk', 'display', 'signage', 'admin'] },
    'newuser': { icon: '📋', description: 'Assign devices to new users', keywords: ['assign', 'new user', 'device', 'assignment'] },
    'links': { icon: '🔗', description: 'Quick access to important resources', keywords: ['links', 'resources', 'bookmarks'] },
    'files': { icon: '📁', description: 'Browse SMB/UNC network files and folders', keywords: ['files', 'smb', 'unc', 'network share', 'browse'] },
    'unlock': { icon: '🔓', description: 'Unlock all locked Active Directory user accounts', keywords: ['unlock', 'ad', 'accounts', 'locked', 'users'] },
  };

  constructor() {}

  /**
   * Get route for a button ID
   */
  getRoute(buttonId: string): string | null {
    return this.routeMap[buttonId] || null;
  }

  /**
   * Check if button is an action (not a navigation)
   */
  isAction(buttonId: string): boolean {
    return buttonId === 'unlock';
  }

  /**
   * Enrich button data with metadata
   */
  enrichButton(button: { name: string; id: string }): NavButton {
    const metadata = this.metadataMap[button.id] || { icon: '📄', description: button.name, keywords: [] };
    return {
      ...button,
      route: this.routeMap[button.id] || undefined,
      icon: metadata.icon,
      description: metadata.description,
      keywords: metadata.keywords,
      isAction: this.isAction(button.id)
    };
  }

  /**
   * Enrich all buttons with metadata
   */
  enrichButtons(buttons: { name: string; id: string }[]): NavButton[] {
    return buttons.map(btn => this.enrichButton(btn));
  }
}

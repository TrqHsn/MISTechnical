import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NavigationService } from './navigation.service';
import { LinksService } from './links.service';
import { DeviceToolsService } from './device-tools.service';

export interface SearchItem {
  id: string;
  title: string;
  description: string;
  category: 'Pages' | 'Tabs' | 'Actions';
  route?: string;
  component?: string;
  tab?: string;
  icon?: string;
  keywords?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class UniversalSearchService {
  private navService = inject(NavigationService);
  private router = inject(Router);
  private linksService = inject(LinksService);
  private deviceToolsService = inject(DeviceToolsService);

  // Static tabs configuration (these don't come from buttons array)
  private staticTabs: SearchItem[] = [
    // AD Tools Tabs
    { id: 'find-user', title: 'Find User', description: 'Search and view user details from Active Directory', category: 'Tabs', route: '/ad-tools', component: 'ad-tools', tab: 'users', icon: '👤', keywords: ['user', 'ad', 'active directory', 'search user'] },
    { id: 'find-computer', title: 'Find Computer', description: 'Search and view computer details from Active Directory', category: 'Tabs', route: '/ad-tools', component: 'ad-tools', tab: 'computers', icon: '💻', keywords: ['computer', 'pc', 'ad', 'machine'] },
    { id: 'update-description', title: 'Update Description', description: 'Update computer description in Active Directory', category: 'Tabs', route: '/ad-tools', component: 'ad-tools', tab: 'update-description', icon: '📝', keywords: ['description', 'update', 'computer', 'modify'] },
    { id: 'update-user', title: 'Update User Info', description: 'Bulk update user information via XLSX upload', category: 'Tabs', route: '/ad-tools', component: 'ad-tools', tab: 'update-user', icon: '📊', keywords: ['bulk', 'update', 'user', 'excel', 'xlsx'] },
    { id: 'last-device', title: 'Last Device', description: 'View next available device numbers (SDLL, SDLD, DBOL)', category: 'Tabs', route: '/ad-tools', component: 'ad-tools', tab: 'last-device', icon: '🔢', keywords: ['device', 'number', 'sdll', 'sdld', 'dbol'] },
    
    // Network Tabs
    { id: 'ping', title: 'Ping', description: 'Network ping tool with continuous monitoring', category: 'Tabs', route: '/network', component: 'network', tab: 'ping', icon: '📡', keywords: ['ping', 'network', 'connectivity', 'test'] },
    { id: 'ip-scanner', title: 'ActiveIP Scanner', description: 'Scan IP range to find active devices', category: 'Tabs', route: '/network', component: 'network', tab: 'activeip', icon: '🔍', keywords: ['scan', 'ip', 'network', 'scanner', 'active'] },
    { id: 'attendance-device', title: 'Attendance Device', description: 'Manage attendance devices and check TCP ports', category: 'Tabs', route: '/network', component: 'network', tab: 'attendance', icon: '🕐', keywords: ['attendance', 'device', 'tcp', 'port', 'check'] },
    
    // Kiosk Admin Tabs
    { id: 'media-library', title: 'Media Library', description: 'Upload and manage kiosk media files', category: 'Tabs', route: '/kiosk-admin', component: 'kiosk-admin', tab: 'media', icon: '📁', keywords: ['media', 'kiosk', 'upload', 'images', 'video'] },
    { id: 'playlists', title: 'Playlists', description: 'Create and manage kiosk playlists', category: 'Tabs', route: '/kiosk-admin', component: 'kiosk-admin', tab: 'playlists', icon: '🎬', keywords: ['playlist', 'kiosk', 'schedule'] },
    { id: 'schedules', title: 'Schedules', description: 'Configure kiosk display schedules', category: 'Tabs', route: '/kiosk-admin', component: 'kiosk-admin', tab: 'schedules', icon: '📅', keywords: ['schedule', 'kiosk', 'time', 'display'] },
    { id: 'display-settings', title: 'Display Settings', description: 'Configure kiosk display mode settings', category: 'Tabs', route: '/kiosk-admin', component: 'kiosk-admin', tab: 'settings', icon: '⚙️', keywords: ['settings', 'kiosk', 'display', 'mode'] },
    
    // Forms Tabs
    { id: 'os-form', title: 'OS Installation Form', description: 'Create OS installation documentation', category: 'Tabs', route: '/forms', component: 'forms', tab: 'os-form', icon: '💿', keywords: ['os', 'installation', 'form', 'windows'] },
    { id: 'device-form', title: 'Device Form', description: 'Create device assignment documentation', category: 'Tabs', route: '/forms', component: 'forms', tab: 'device-form', icon: '📄', keywords: ['device', 'form', 'assignment'] },
    
    // Additional standalone pages not in main buttons
    { id: 'stress-test', title: 'Stress CPU/GPU', description: 'Hardware stress testing tool', category: 'Pages', route: '/stress-cpu-gpu', icon: '💪', keywords: ['stress', 'test', 'cpu', 'gpu', 'benchmark'] },
  ];

  /**
   * Build complete item list from App buttons array + static tabs + links + device tools
   */
  private buildAllItems(buttons: { name: string; id: string }[]): SearchItem[] {
    const items: SearchItem[] = [];

    // Convert app buttons to SearchItems
    const enrichedButtons = this.navService.enrichButtons(buttons);
    enrichedButtons.forEach(btn => {
      items.push({
        id: btn.id,
        title: btn.name,
        description: btn.description || btn.name,
        category: btn.isAction ? 'Actions' : 'Pages',
        route: btn.route,
        icon: btn.icon,
        keywords: btn.keywords
      });
    });

    // Add static tabs
    items.push(...this.staticTabs);

    // Add important links as searchable items
    const links = this.linksService.getLinks();
    links.forEach(link => {
      items.push({
        id: `link-${link.name.toLowerCase().replace(/\s+/g, '-')}`,
        title: link.name,
        description: link.description || link.url,
        category: 'Pages',
        route: link.url,
        icon: link.icon || '🔗',
        keywords: link.keywords || []
      });
    });

    // Add device tools as searchable items
    const deviceTools = this.deviceToolsService.getTools();
    deviceTools.forEach(tool => {
      items.push({
        id: `tool-${tool.id}`,
        title: tool.name,
        description: tool.description,
        category: 'Pages',
        route: tool.url,
        icon: tool.icon || '🔧',
        keywords: tool.keywords || []
      });
    });

    return items;
  }

  searchItems(query: string, appButtons: { name: string; id: string }[]): { categories: Map<string, SearchItem[]>, total: number } {
    const allItems = this.buildAllItems(appButtons);
    
    if (!query.trim()) {
      return this.groupByCategory(allItems);
    }

    const lowerQuery = query.toLowerCase();
    const filtered = allItems.filter(item => {
      return item.title.toLowerCase().includes(lowerQuery) ||
             item.description.toLowerCase().includes(lowerQuery) ||
             item.keywords?.some(k => k.includes(lowerQuery));
    });

    return this.groupByCategory(filtered);
  }

  private groupByCategory(items: SearchItem[]): { categories: Map<string, SearchItem[]>, total: number } {
    const categories = new Map<string, SearchItem[]>();
    
    items.forEach(item => {
      if (!categories.has(item.category)) {
        categories.set(item.category, []);
      }
      categories.get(item.category)!.push(item);
    });

    return { categories, total: items.length };
  }

  navigateTo(item: SearchItem) {
    // Check if it's an external link (http/https)
    if (item.route?.startsWith('http://') || item.route?.startsWith('https://')) {
      this.linksService.openLink(item.route);
    } else if (item.tab && item.component) {
      // Navigate with query param for tab
      this.router.navigate([item.route], { queryParams: { tab: item.tab } });
    } else {
      // Simple navigation
      this.router.navigate([item.route]);
    }
  }

  getQuickAccessItems(appButtons: { name: string; id: string }[]): SearchItem[] {
    const allItems = this.buildAllItems(appButtons);
    
    // Return the most frequently used items for quick access grid
    const quickAccessIds = [
      'find-user', 'find-computer', 'update-description', 'update-user',
      'ping', 'ip-scanner', 'attendance-device', 'print',
      'inventory', 'media-library', 'devicetool', 'links'
    ];

    return quickAccessIds
      .map(id => allItems.find(item => item.id === id))
      .filter(item => item !== undefined) as SearchItem[];
  }
}

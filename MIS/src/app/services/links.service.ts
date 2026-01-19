import { Injectable, signal } from '@angular/core';

export interface LinkItem {
  name: string;
  url: string;
  description?: string;
  icon?: string;
  keywords?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class LinksService {
  private links = signal<LinkItem[]>([
    {
      name: 'Tickets',
      url: 'https://dewhirsthelpdesk.sdpondemand.manageengine.eu/app/itdesk/ui/requests',
      description: 'IT Helpdesk Ticket System',
      icon: '🎫',
      keywords: ['ticket', 'helpdesk', 'support', 'it']
    },
    {
      name: 'Inventory',
      url: 'http://sdlportal.dewhirst.grp/inventory/',
      description: 'Asset Inventory Management',
      icon: '📦',
      keywords: ['inventory', 'asset', 'hardware', 'equipment']
    },
    {
      name: 'Dameware',
      url: 'https://admin.us0.swi-dre.com/admin_area_/devices.php',
      description: 'Remote Support Tool',
      icon: '🖥️',
      keywords: ['dameware', 'remote', 'support', 'control']
    },
    {
      name: 'Cisco',
      url: 'https://n326.meraki.com/Shanta-Denims-Lt/n/qs4q0a4d/manage/clients',
      description: 'Network Management',
      icon: '🌐',
      keywords: ['cisco', 'network', 'meraki', 'wifi', 'switch']
    },
    {
      name: 'MFA',
      url: 'https://mysignins.microsoft.com/security-info',
      description: 'Multi-Factor Authentication',
      icon: '🔐',
      keywords: ['mfa', 'authentication', 'security', '2fa', 'microsoft']
    },
    {
      name: 'Xerox',
      url: 'http://10.140.7.30/home/index.html#hashHome',
      description: 'Printer Management',
      icon: '🖨️',
      keywords: ['xerox', 'printer', 'print', 'copier']
    },
    {
      name: 'Full Instructions',
      url: 'https://docs.google.com/document/d/194O0BbduObP-ZpnrzHy1zpjm1YGKTB388_8hg5GQffs/edit?pli=1&tab=t.0',
      description: 'Complete Documentation',
      icon: '📚',
      keywords: ['documentation', 'instructions', 'manual', 'guide', 'docs']
    },
    {
      name: 'Low Storage',
      url: 'https://dewhirstgroup.sharepoint.com/:x:/r/sites/DewhirstBangladeshITServices-Technical/_layouts/15/Doc.aspx?sourcedoc=%7B40EE7159-ECB7-4657-81CD-2D96ACD72195%7D&file=Mail Storage Issues.xlsx&action=default&mobileredirect=true',
      description: 'Mail Storage Issues Tracker',
      icon: '💾',
      keywords: ['storage', 'mail', 'mailbox', 'quota', 'size']
    },
    {
      name: 'IT Forms',
      url: 'http://sdlportal.dewhirst.grp/forms/forms.php',
      description: 'IT Request Forms',
      icon: '📝',
      keywords: ['forms', 'request', 'it', 'portal']
    },
    {
      name: 'Raise PR',
      url: 'http://sdlportal.dewhirst.grp/forms/IT008/IT008.php',
      description: 'Purchase Request Form',
      icon: '🛒',
      keywords: ['purchase', 'pr', 'request', 'buy', 'order']
    },
    {
      name: 'Outlook',
      url: 'https://outlook.office.com/mail/',
      description: 'Email Client',
      icon: '📧',
      keywords: ['outlook', 'email', 'mail', 'office365', 'microsoft']
    },
  ]);

  getLinks(): LinkItem[] {
    return this.links();
  }

  getLinkSignal() {
    return this.links;
  }

  openLink(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

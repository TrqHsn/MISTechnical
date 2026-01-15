import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface LinkItem {
  name: string;
  url: string;
  description?: string;
}

@Component({
  selector: 'app-important-links',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './important-links.html',
  styleUrl: './important-links.css',
})
export class ImportantLinksComponent {
  links = signal<LinkItem[]>([
    {
      name: 'Tickets',
      url: 'https://dewhirsthelpdesk.sdpondemand.manageengine.eu/app/itdesk/ui/requests',
      description: 'IT Helpdesk Ticket System'
    },
    {
      name: 'Inventory',
      url: 'http://sdlportal.dewhirst.grp/inventory/',
      description: 'Asset Inventory Management'
    },
    {
      name: 'Dameware',
      url: 'https://admin.us0.swi-dre.com/admin_area_/devices.php',
      description: 'Remote Support Tool'
    },
    {
      name: 'Cisco',
      url: 'https://n326.meraki.com/Shanta-Denims-Lt/n/qs4q0a4d/manage/clients',
      description: 'Network Management'
    },
    {
      name: 'MFA',
      url: 'https://mysignins.microsoft.com/security-info',
      description: 'Multi-Factor Authentication'
    },
    {
      name: 'Xerox',
      url: 'http://10.140.7.30/home/index.html#hashHome',
      description: 'Printer Management'
    },
    {
      name: 'Full Instructions',
      url: 'https://docs.google.com/document/d/194O0BbduObP-ZpnrzHy1zpjm1YGKTB388_8hg5GQffs/edit?pli=1&tab=t.0',
      description: 'Complete Documentation'
    },
    {
      name: 'Low Storage',
      url: 'https://dewhirstgroup.sharepoint.com/:x:/r/sites/DewhirstBangladeshITServices-Technical/_layouts/15/Doc.aspx?sourcedoc=%7B40EE7159-ECB7-4657-81CD-2D96ACD72195%7D&file=Mail Storage Issues.xlsx&action=default&mobileredirect=true',
      description: 'Mail Storage Issues Tracker'
    },
    {
      name: 'IT Forms',
      url: 'http://sdlportal.dewhirst.grp/forms/forms.php',
      description: 'IT Request Forms'
    },
    {
      name: 'Raise PR',
      url: 'http://sdlportal.dewhirst.grp/forms/IT008/IT008.php',
      description: 'Purchase Request Form'
    },
    {
      name: 'Outlook',
      url: 'https://outlook.office.com/mail/',
      description: 'Email Client'
    },
  ]);

  openLink(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

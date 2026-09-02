import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-others',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './others.html',
  styleUrl: './others.css'
})
export class OthersComponent {
  buttons = [
    { label: 'Introduction', description: 'Overview', action: 'introduction' },
    { label: 'Network Dashboard', description: 'Nework monitor', action: 'button-2' },
    { label: 'Button 3', description: 'Coming soon', action: 'button-3' },
    { label: 'Button 4', description: 'Coming soon', action: 'button-4' },
    { label: 'Button 5', description: 'Coming soon', action: 'button-5' },
    { label: 'Button 6', description: 'Coming soon', action: 'button-6' }
  ];

  openButton(action: string) {
    if (action === 'introduction') {
      const url = '/IT Introduction.html';
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (action === 'button-2') {
      const url = '/network-dashboard';
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }
}

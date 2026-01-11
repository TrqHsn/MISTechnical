import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-device-tool',
  imports: [CommonModule],
  templateUrl: './device-tool.html',
  styleUrl: './device-tool.css',
})
export class DeviceToolComponent {
  tools = [
    {
      id: 'keyboard',
      name: '⌨️ Test Keyboard',
      description: 'Test all keyboard keys functionality',
      url: '/keyboard/index.html'
    },
    {
      id: 'stress',
      name: '🔥 Stress Test',
      description: 'CPU and GPU stress testing tool',
      url: '/stress-cpu-gpu'
    }
  ];

  openTool(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

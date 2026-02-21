import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DeviceToolsService } from '../../services/device-tools.service';
@Component({
  selector: 'app-device-tool',
  imports: [CommonModule],
  templateUrl: './device-tool.html',
  styleUrl: './device-tool.css',
})
export class DeviceToolComponent {
  tools;
  constructor(private deviceToolsService: DeviceToolsService) {
    this.tools = this.deviceToolsService.getToolsSignal();
  }

  openTool(url: string) {
    this.deviceToolsService.openTool(url);
  }
}

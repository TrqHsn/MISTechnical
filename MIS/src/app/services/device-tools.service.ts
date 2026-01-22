import { Injectable, signal } from '@angular/core';

export interface DeviceTool {
  id: string;
  name: string;
  description: string;
  url: string;
  icon?: string;
  keywords?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class DeviceToolsService {
  private tools = signal<DeviceTool[]>([
    {
      id: 'keyboard',
      name: 'Test Keyboard',
      description: 'Test all keyboard keys functionality',
      url: '/keyboard/index.html',
      icon: '⌨️',
      keywords: ['keyboard', 'test', 'keys', 'typing']
    },
    {
      id: 'mouse',
      name: 'Mouse & Touchpad Test',
      description: 'Test mouse buttons, scroll, movement, drag & drop, and touchpad gestures',
      url: '/mouse-test',
      icon: '🖱️',
      keywords: ['mouse', 'touchpad', 'test', 'click', 'scroll', 'gesture', 'drag', 'precision']
    },
    {
      id: 'stress',
      name: 'Stress Test',
      description: 'CPU and GPU stress testing tool',
      url: '/stress-cpu-gpu',
      icon: '🔥',
      keywords: ['stress', 'cpu', 'gpu', 'performance', 'benchmark']
    },
    {
      id: 'displaytest',
      name: 'Display Test',
      description: 'Test display quality and dead pixels',
      url: '/display-test',
      icon: '🖥️',
      keywords: ['display', 'screen', 'monitor', 'pixel', 'test', 'dead pixel', 'backlight']
    },
    {
      id: 'cammic',
      name: 'Camera / Mic Test',
      description: 'Test webcam video, microphone, and record audio/video',
      url: '',
      icon: '🎥',
      keywords: ['camera', 'mic', 'webcam', 'audio', 'video', 'test', 'record']
    }
  ]);

  getTools(): DeviceTool[] {
    return this.tools();
  }

  getToolsSignal() {
    return this.tools;
  }

  openTool(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

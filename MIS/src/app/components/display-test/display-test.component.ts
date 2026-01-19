import { Component, signal, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

interface ChecklistItem {
  label: string;
  value: 'yes' | 'no' | 'low' | 'medium' | 'high' | null;
  options: string[];
}

@Component({
  selector: 'app-display-test',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './display-test.component.html',
  styleUrl: './display-test.component.css'
})
export class DisplayTestComponent implements OnDestroy {
  currentStep = signal(0);
  isFullscreen = signal(false);
  showControls = signal(true);
  autoRotateEnabled = signal(false);
  currentPixelTestColor = signal(0);
  private autoRotateInterval: any = null;
  private controlsTimeout: any = null;

  // Pixel test colors
  pixelTestColors = [
    { name: 'Red', color: '#FF0000' },
    { name: 'Green', color: '#00FF00' },
    { name: 'Blue', color: '#0000FF' },
    { name: 'White', color: '#FFFFFF' },
    { name: 'Black', color: '#000000' }
  ];

  // Checklist for summary
  checklist = signal<ChecklistItem[]>([
    { label: 'Dead pixels detected', value: null, options: ['yes', 'no'] },
    { label: 'Backlight bleeding', value: null, options: ['low', 'medium', 'high'] },
    { label: 'Uniformity issues', value: null, options: ['yes', 'no'] }
  ]);

  // All test steps
  steps = [
    { id: 0, name: 'start', title: 'Display Test' },
    { id: 1, name: 'pixel-test', title: 'Dead & Stuck Pixel Test' },
    { id: 2, name: 'backlight', title: 'Backlight Bleeding Test' },
    { id: 3, name: 'ips-glow', title: 'IPS Glow Test' },
    { id: 4, name: 'brightness', title: 'Brightness Uniformity Test' },
    { id: 5, name: 'color-uniformity', title: 'Color Uniformity Test' },
    { id: 6, name: 'gradient', title: 'Gradient / Banding Test' },
    { id: 7, name: 'contrast', title: 'Contrast & Black Detail Test' },
    { id: 8, name: 'sharpness', title: 'Sharpness & Text Clarity Test' },
    { id: 9, name: 'viewing-angle', title: 'Viewing Angle Test' },
    { id: 10, name: 'summary', title: 'Test Summary' }
  ];

  ngOnDestroy() {
    this.stopAutoRotate();
    if (this.controlsTimeout) {
      clearTimeout(this.controlsTimeout);
    }
    if (this.isFullscreen()) {
      this.exitFullscreen();
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.exitFullscreen();
    } else if (event.key === 'ArrowRight' || event.key === ' ') {
      event.preventDefault();
      this.nextStep();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.previousStep();
    }
  }

  @HostListener('click')
  @HostListener('touchstart')
  onUserInteraction() {
    if (this.currentStep() > 0 && this.currentStep() < this.steps.length - 1) {
      this.showControls.set(true);
      this.resetControlsTimeout();
    }
  }

  @HostListener('document:fullscreenchange')
  @HostListener('document:webkitfullscreenchange')
  @HostListener('document:mozfullscreenchange')
  @HostListener('document:MSFullscreenChange')
  onFullscreenChange() {
    this.isFullscreen.set(!!document.fullscreenElement);
  }

  startTest() {
    this.requestFullscreen();
    this.nextStep();
  }

  requestFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen();
    } else if ((elem as any).webkitRequestFullscreen) {
      (elem as any).webkitRequestFullscreen();
    } else if ((elem as any).mozRequestFullScreen) {
      (elem as any).mozRequestFullScreen();
    } else if ((elem as any).msRequestFullscreen) {
      (elem as any).msRequestFullscreen();
    }
  }

  exitFullscreen() {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if ((document as any).webkitExitFullscreen) {
      (document as any).webkitExitFullscreen();
    } else if ((document as any).mozCancelFullScreen) {
      (document as any).mozCancelFullScreen();
    } else if ((document as any).msExitFullscreen) {
      (document as any).msExitFullscreen();
    }
    this.isFullscreen.set(false);
  }

  nextStep() {
    if (this.currentStep() < this.steps.length - 1) {
      this.currentStep.update(v => v + 1);
      this.currentPixelTestColor.set(0);
      this.stopAutoRotate();
      this.showControls.set(true);
      this.resetControlsTimeout();
    }
  }

  previousStep() {
    if (this.currentStep() > 1) {
      this.currentStep.update(v => v - 1);
      this.currentPixelTestColor.set(0);
      this.stopAutoRotate();
      this.showControls.set(true);
      this.resetControlsTimeout();
    }
  }

  nextPixelColor() {
    if (this.currentPixelTestColor() < this.pixelTestColors.length - 1) {
      this.currentPixelTestColor.update(v => v + 1);
    } else {
      this.currentPixelTestColor.set(0);
    }
  }

  previousPixelColor() {
    if (this.currentPixelTestColor() > 0) {
      this.currentPixelTestColor.update(v => v - 1);
    } else {
      this.currentPixelTestColor.set(this.pixelTestColors.length - 1);
    }
  }

  toggleAutoRotate() {
    this.autoRotateEnabled.update(v => !v);
    if (this.autoRotateEnabled()) {
      this.startAutoRotate();
    } else {
      this.stopAutoRotate();
    }
  }

  startAutoRotate() {
    this.stopAutoRotate();
    this.autoRotateInterval = setInterval(() => {
      this.nextPixelColor();
    }, 3000);
  }

  stopAutoRotate() {
    if (this.autoRotateInterval) {
      clearInterval(this.autoRotateInterval);
      this.autoRotateInterval = null;
    }
    this.autoRotateEnabled.set(false);
  }

  resetControlsTimeout() {
    if (this.controlsTimeout) {
      clearTimeout(this.controlsTimeout);
    }
    this.controlsTimeout = setTimeout(() => {
      this.showControls.set(false);
    }, 3000);
  }

  updateChecklist(index: number, value: any) {
    const items = this.checklist();
    items[index].value = value;
    this.checklist.set([...items]);
  }

  restartTest() {
    this.currentStep.set(0);
    this.currentPixelTestColor.set(0);
    this.stopAutoRotate();
    this.showControls.set(true);
    this.checklist.set([
      { label: 'Dead pixels detected', value: null, options: ['yes', 'no'] },
      { label: 'Backlight bleeding', value: null, options: ['low', 'medium', 'high'] },
      { label: 'Uniformity issues', value: null, options: ['yes', 'no'] }
    ]);
    this.exitFullscreen();
  }

  getCurrentColor() {
    return this.pixelTestColors[this.currentPixelTestColor()];
  }
}

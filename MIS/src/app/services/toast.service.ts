import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private nextId = 0;
  toasts = signal<Toast[]>([]);

  private addToast(message: string, type: 'success' | 'error' | 'info') {
    const id = this.nextId++;
    const toast: Toast = { id, message, type };
    
    this.toasts.update((current) => [...current, toast]);

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      this.dismiss(id);
    }, 3000);
  }

  success(message: string) {
    this.addToast(message, 'success');
  }

  error(message: string) {
    this.addToast(message, 'error');
  }

  info(message: string) {
    this.addToast(message, 'info');
  }

  dismiss(id: number) {
    this.toasts.update((current) => current.filter((t) => t.id !== id));
  }
}

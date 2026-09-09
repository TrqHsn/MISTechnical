import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import * as QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

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
    { label: 'Guest QR', description: 'Guest Wi-Fi access', action: 'guest-wifi' },
    { label: 'Wake on LAN', description: 'Wake network devices', action: 'wake-on-lan' },
    { label: 'Button 5', description: 'Coming soon', action: 'button-5' },
    { label: 'Button 6', description: 'Coming soon', action: 'button-6' }
  ];

  guestWifiModalOpen = signal(false);
  guestWifiEditing = signal(false);
  guestWifiLoading = signal(false);
  guestWifiError = signal('');
  guestWifiData = signal({ ssid: 'Guest@Dewhirst', password: '' });
  guestWifiPasswordInput = signal('');
  guestWifiQrCodeUrl = signal('');

  constructor(private http: HttpClient) {}

  openButton(action: string) {
    if (action === 'introduction') {
      const url = '/IT Introduction.html';
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (action === 'button-2') {
      const url = '/network-dashboard';
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (action === 'wake-on-lan') {
      const url = '/network-dashboard?tab=wol';
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (action === 'guest-wifi') {
      void this.openGuestWifiModal();
    }
  }

  async openGuestWifiModal(): Promise<void> {
    if (typeof window === 'undefined') return;

    this.guestWifiModalOpen.set(true);
    this.guestWifiEditing.set(false);
    this.guestWifiLoading.set(true);
    this.guestWifiError.set('');

    try {
      const data = await firstValueFrom(this.http.get<{ ssid: string; password: string }>(`${this.getApiBaseUrl()}/api/print/guest-wifi`));
      const ssid = data?.ssid || 'Guest@Dewhirst';
      const password = data?.password || '';
      this.guestWifiData.set({ ssid, password });
      this.guestWifiPasswordInput.set(password);
      this.guestWifiQrCodeUrl.set(await QRCode.toDataURL(this.buildGuestWifiString(ssid, password)));
    } catch (error) {
      console.error('Unable to load guest Wi-Fi settings:', error);
      this.guestWifiError.set('Unable to load guest Wi-Fi settings.');
      this.guestWifiData.set({ ssid: 'Guest@Dewhirst', password: '' });
      this.guestWifiPasswordInput.set('');
      this.guestWifiQrCodeUrl.set('');
    } finally {
      this.guestWifiLoading.set(false);
    }
  }

  closeGuestWifiModal(): void {
    this.guestWifiModalOpen.set(false);
    this.guestWifiEditing.set(false);
    this.guestWifiError.set('');
  }

  toggleGuestWifiEdit(): void {
    this.guestWifiEditing.set(!this.guestWifiEditing());
    if (!this.guestWifiEditing()) {
      this.guestWifiPasswordInput.set(this.guestWifiData().password);
    }
  }

  async saveGuestWifiPassword(): Promise<void> {
    this.guestWifiLoading.set(true);
    this.guestWifiError.set('');

    try {
      const password = this.guestWifiPasswordInput().trim();
      const data = await firstValueFrom(this.http.post<{ ssid: string; password: string }>(`${this.getApiBaseUrl()}/api/print/guest-wifi`, { password }));
      const ssid = data?.ssid || this.guestWifiData().ssid;
      const savedPassword = data?.password || password;
      this.guestWifiData.set({ ssid, password: savedPassword });
      this.guestWifiPasswordInput.set(savedPassword);
      this.guestWifiQrCodeUrl.set(await QRCode.toDataURL(this.buildGuestWifiString(ssid, savedPassword)));
      this.guestWifiEditing.set(false);
    } catch (error) {
      console.error('Unable to save guest Wi-Fi password:', error);
      this.guestWifiError.set('Unable to update guest Wi-Fi password.');
    } finally {
      this.guestWifiLoading.set(false);
    }
  }

  async printGuestWifiCards(): Promise<void> {
    if (typeof window === 'undefined') return;

    const ssid = this.guestWifiData().ssid || 'Guest@Dewhirst';
    const password = this.guestWifiPasswordInput() || this.guestWifiData().password || '';
    const qrCodeUrl = this.guestWifiQrCodeUrl() || await QRCode.toDataURL(this.buildGuestWifiString(ssid, password));
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const marginLeft = 12.7;
    const marginRight = 12.7;
    const marginTop = 12.7;
    const marginBottom = 12.7;
    const gapX = 6;
    const gapY = 6;
    const cardWidth = (pageWidth - marginLeft - marginRight - gapX) / 2;
    const cardHeight = (pageHeight - marginTop - marginBottom - gapY * 2) / 3;
    const qrSize = cardHeight * 0.62;

    const addCard = (x: number, y: number) => {
      pdf.setDrawColor(200);
      pdf.setLineWidth(0.4);
      pdf.roundedRect(x, y, cardWidth, cardHeight, 3, 3);
      pdf.addImage(qrCodeUrl, 'PNG', x + (cardWidth - qrSize) / 2, y + 6, qrSize, qrSize);
      pdf.setFontSize(9);
      pdf.setTextColor(0, 0, 0);
      const textY = y + qrSize + 14;
      const centerX = x + cardWidth / 2;
      pdf.text(`SSID: ${ssid}`, centerX, textY, { align: 'center' });
      pdf.text(`Password: ${password}`, centerX, textY + 5, { align: 'center' });
    };

    const positions = [
      { x: marginLeft, y: marginTop },
      { x: marginLeft + cardWidth + gapX, y: marginTop },
      { x: marginLeft, y: marginTop + cardHeight + gapY },
      { x: marginLeft + cardWidth + gapX, y: marginTop + cardHeight + gapY },
      { x: marginLeft, y: marginTop + (cardHeight + gapY) * 2 },
      { x: marginLeft + cardWidth + gapX, y: marginTop + (cardHeight + gapY) * 2 },
    ];
    positions.forEach(position => addCard(position.x, position.y));

    const url = window.URL.createObjectURL(pdf.output('blob'));
    const printWindow = window.open(url, '_blank', 'noopener,noreferrer');
    if (printWindow) {
      printWindow.focus();
      setTimeout(() => {
        try {
          printWindow.print();
        } catch (error) {
          console.error('Unable to open print dialog for guest Wi-Fi PDF:', error);
        }
      }, 500);
    }
    window.URL.revokeObjectURL(url);
  }

  private buildGuestWifiString(ssid: string, password: string): string {
    return `WIFI:T:WPA;S:${ssid};P:${password};;`;
  }

  private getApiBaseUrl(): string {
    if (typeof window !== 'undefined') {
      return `http://${window.location.hostname}:5001`;
    }
    return 'http://localhost:5001';
  }
}

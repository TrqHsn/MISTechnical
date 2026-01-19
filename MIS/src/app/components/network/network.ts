import { Component, signal, OnDestroy, ViewChild, ElementRef, effect, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { ToastService } from '../../services/toast.service';

interface AttendanceDevice {
  ip: string;
  location: string;
}

interface PortCheckResponse {
  results: string;
  devicesNeedReboot: string[];
  allResponding: boolean;
}

@Component({
  selector: 'app-network',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './network.html',
  styleUrl: './network.css',
})
export class NetworkComponent implements OnDestroy {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  // Tab management
  activeTab = signal<'ping' | 'activeip' | 'attendance'>('ping');

  // Ping tab
  pingAddress = signal('10.140.');
  pingResult = signal('');
  isPinging = signal(false);
  deviceStatus = signal<'unknown' | 'online' | 'offline'>('unknown');
  private eventSource: EventSource | null = null;
  private sessionId: string = '';

  // Computed signal for colorized ping result HTML
  pingResultHtml = signal('');

  // Sound toggle (true = sound on failure, false = sound on success)
  soundOnFailure = signal(true);
  private audio: HTMLAudioElement | null = null;
  private consecutiveCount = 0;
  private lastResultType: 'success' | 'failure' | null = null;

  @ViewChild('pingResultElement') pingResultElement?: ElementRef<HTMLPreElement>;

  // Attendance Device tab
  attendanceForm: FormGroup;
  attendanceDevices = signal<AttendanceDevice[]>([]);
  portCheckResults = signal('');
  isCheckingPorts = signal(false);
  lastOctet = signal('');
  location = signal('');

  constructor(
    private http: HttpClient, 
    private fb: FormBuilder, 
    private route: ActivatedRoute,
    private toastService: ToastService
  ) {
    // Initialize Audio only in browser
    if (this.isBrowser) {
      this.audio = new Audio('/ping-beep.mp3');
    }

    // Initialize attendance device form
    this.attendanceForm = this.fb.group({
      lastOctet: ['', [Validators.required, Validators.pattern(/^\d{1,3}$/), Validators.min(0), Validators.max(255)]],
      location: ['', Validators.required]
    });

    // Listen for tab query parameter
    this.route.queryParams.subscribe(params => {
      if (params['tab']) {
        const tab = params['tab'] as 'ping' | 'activeip' | 'attendance';
        if (tab === 'ping' || tab === 'activeip' || tab === 'attendance') {
          this.activeTab.set(tab);
        }
      }
    });

    // Load attendance devices only when tab becomes active
    effect(() => {
      if (this.activeTab() === 'attendance') {
        this.loadAttendanceDevices();
      }
    });

    // Auto-scroll to bottom whenever pingResult changes
    effect(() => {
      // Read the signal to trigger the effect
      this.pingResult();
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => this.scrollToBottom(), 0);
    });
  }

  ngOnDestroy() {
    this.stopPing();
  }

  executePing() {
    const address = this.pingAddress().trim();
    if (!address) {
      this.pingResult.set('❌ Please enter an IP address or hostname');
      return;
    }

    this.isPinging.set(true);
    this.pingResult.set('🔄 Starting ping...\n');
    this.pingResultHtml.set('<span>🔄 Starting ping...</span>\n');
    this.deviceStatus.set('unknown');
    this.consecutiveCount = 0;
    this.lastResultType = null;

    // Close any existing connection
    if (this.eventSource) {
      this.eventSource.close();
    }

    // Create EventSource for Server-Sent Events
    const url = `http://localhost:5001/api/network/ping/start`;
    
    // Use fetch to POST the request and get the stream
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address })
    }).then(response => {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      const readStream = () => {
        reader?.read().then(({ done, value }) => {
          if (done) {
            this.isPinging.set(false);
            return;
          }

          const text = decoder.decode(value, { stream: true });
          const lines = text.split('\n');

          lines.forEach(line => {
            if (line.startsWith('data: ')) {
              const data = line.substring(6);
              
              // Check for session ID
              if (data.startsWith('SESSION:')) {
                this.sessionId = data.substring(8).trim();
                return;
              }

              // Detect online/offline status (check errors first!)
              let isFailure = false;
              let isSuccess = false;

              if (data.includes('Request timed out') || data.includes('Destination host unreachable') || data.includes('could not find host')) {
                this.deviceStatus.set('offline');
                isFailure = true;
              } else if (data.includes('Reply from') && data.includes('bytes=') && data.includes('time=')) {
                this.deviceStatus.set('online');
                isSuccess = true;
              }

              // Handle sound logic: beep every 2 consecutive results
              if (isFailure || isSuccess) {
                const currentType: 'success' | 'failure' = isSuccess ? 'success' : 'failure';
                
                // Check if same type as last result
                if (this.lastResultType === currentType) {
                  this.consecutiveCount++;
                } else {
                  // Type changed, reset counter
                  this.consecutiveCount = 1;
                  this.lastResultType = currentType;
                }

                // Play sound every 2 consecutive results of the same type
                if (this.consecutiveCount === 2) {
                  if ((this.soundOnFailure() && isFailure) || (!this.soundOnFailure() && isSuccess)) {
                    this.playSound();
                  }
                  this.consecutiveCount = 0; // Reset for next pair
                }
              }

              // Append to result with color coding
              const newLine = this.colorizeLineHtml(data);
              this.pingResult.set(this.pingResult() + data + '\n');
              this.pingResultHtml.set(this.pingResultHtml() + newLine);
            }
          });

          readStream();
        }).catch(err => {
          console.error('Stream error:', err);
          this.pingResult.set(this.pingResult() + `\n❌ Stream error: ${err.message}`);
          this.isPinging.set(false);
        });
      };

      readStream();
    }).catch(err => {
      console.error('Ping error:', err);
      this.pingResult.set(`❌ Error: ${err.message || 'Unknown error'}`);
      this.isPinging.set(false);
    });
  }

  stopPing() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.sessionId) {
      this.http.post('http://localhost:5001/api/network/ping/stop', { sessionId: this.sessionId })
        .subscribe({
          next: () => {
            this.pingResult.set(this.pingResult() + '\n\n🛑 Ping stopped by user');
            this.pingResultHtml.set(this.pingResultHtml() + '<span>\n\n🛑 Ping stopped by user</span>');
            this.isPinging.set(false);
            this.deviceStatus.set('unknown');
            this.sessionId = '';
          },
          error: (err) => {
            console.error('Stop error:', err);
            this.isPinging.set(false);
            this.deviceStatus.set('unknown');
            this.sessionId = '';
          }
        });
    } else {
      this.isPinging.set(false);
      this.deviceStatus.set('unknown');
    }
  }

  clearPing() {
    this.stopPing();
    this.pingAddress.set('');
    this.pingResult.set('');
    this.pingResultHtml.set('');
    this.deviceStatus.set('unknown');
    this.consecutiveCount = 0;
    this.lastResultType = null;
  }

  // ActiveIP Scanner tab
  scanBaseIp = signal('10.140.');
  activeIps = signal<string[]>([]);
  isScanning = signal(false);
  scanStatus = signal('');
  private scanSessionId = '';

  executeScan() {
    const baseIp = this.scanBaseIp().trim();
    if (!baseIp) {
      this.scanStatus.set('❌ Please enter the first 3 octets of an IP address');
      return;
    }

    // Validate format (must be exactly 3 octets)
    const parts = baseIp.split('.');
    if (parts.length !== 3 || !parts.every(p => {
      const num = parseInt(p);
      return !isNaN(num) && num >= 0 && num <= 255;
    })) {
      this.scanStatus.set('❌ Invalid format. Enter exactly 3 octets (e.g., 10.140.8)');
      return;
    }

    this.isScanning.set(true);
    this.activeIps.set([]);
    this.scanStatus.set('🔄 Starting scan...');

    const url = `http://localhost:5001/api/network/scan/stream?baseIp=${encodeURIComponent(baseIp)}`;

    fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
      },
    }).then(response => {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      const readStream = () => {
        reader?.read().then(({ done, value }) => {
          if (done) {
            this.isScanning.set(false);
            if (this.activeIps().length === 0) {
              this.scanStatus.set('✅ Scan completed - No active IPs found');
            } else {
              this.scanStatus.set(`✅ Scan completed - Found ${this.activeIps().length} active IP(s)`);
            }
            return;
          }

          const text = decoder.decode(value, { stream: true });
          const lines = text.split('\n');

          lines.forEach(line => {
            if (line.startsWith('data: ')) {
              const data = line.substring(6).trim();

              if (data.startsWith('SESSION:')) {
                this.scanSessionId = data.substring(8).trim();
              } else if (data.startsWith('IP:')) {
                const ip = data.substring(3).trim();
                this.activeIps.set([...this.activeIps(), ip]);
              } else if (data.startsWith('STATUS:')) {
                this.scanStatus.set(data.substring(7).trim());
              } else if (data.startsWith('ERROR:')) {
                this.scanStatus.set('❌ ' + data.substring(6).trim());
                this.isScanning.set(false);
              }
            }
          });

          readStream();
        }).catch(err => {
          console.error('Stream error:', err);
          this.scanStatus.set(`❌ Stream error: ${err.message}`);
          this.isScanning.set(false);
        });
      };

      readStream();
    }).catch(err => {
      console.error('Scan error:', err);
      this.scanStatus.set(`❌ Error: ${err.message || 'Unknown error'}`);
      this.isScanning.set(false);
    });
  }

  stopScan() {
    if (this.scanSessionId) {
      this.http.post('http://localhost:5001/api/network/scan/stop', { sessionId: this.scanSessionId })
        .subscribe({
          next: () => {
            this.scanStatus.set('🛑 Scan stopped by user');
            this.isScanning.set(false);
            this.scanSessionId = '';
          },
          error: (err) => {
            console.error('Stop error:', err);
            this.isScanning.set(false);
            this.scanSessionId = '';
          }
        });
    } else {
      this.isScanning.set(false);
    }
  }

  clearScan() {
    this.stopScan();
    this.scanBaseIp.set('');
    this.activeIps.set([]);
    this.scanStatus.set('');
  }

  openIp(ip: string) {
    window.open(`http://${ip}`, '_blank', 'noopener,noreferrer');
  }

  private scrollToBottom() {
    if (this.pingResultElement?.nativeElement) {
      this.pingResultElement.nativeElement.scrollTop = this.pingResultElement.nativeElement.scrollHeight;
    }
  }

  private playSound() {
    if (this.audio) {
      this.audio.currentTime = 0;
      this.audio.play().catch(err => console.warn('Sound playback failed:', err));
    }
  }

  private colorizeLineHtml(line: string): string {
    // Escape HTML entities
    const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Check for successful ping (Reply from...)
    if (line.includes('Reply from') && line.includes('bytes=') && line.includes('time=')) {
      return `<span class="ping-success">${escaped}</span>\n`;
    }
    
    // Check for failed ping
    if (line.includes('Request timed out') || 
        line.includes('Destination host unreachable') || 
        line.includes('could not find host') ||
        line.includes('100% loss') ||
        line.includes('0 received')) {
      return `<span class="ping-fail">${escaped}</span>\n`;
    }
    
    // Default color (green)
    return `<span>${escaped}</span>\n`;
  }

  // ============= ATTENDANCE DEVICE METHODS =============

  async loadAttendanceDevices() {
    try {
      console.log('Loading attendance devices...');
      const response = await this.http.get<{ devices: AttendanceDevice[] }>(
        'http://localhost:5001/api/network/attendance-devices'
      ).toPromise();
      
      console.log('Received response:', response);
      if (response?.devices) {
        console.log('Setting devices:', response.devices);
        this.attendanceDevices.set(response.devices);
      } else {
        console.log('No devices in response');
        this.attendanceDevices.set([]);
      }
    } catch (error) {
      console.error('Error loading attendance devices:', error);
      this.attendanceDevices.set([]);
    }
  }

  async addAttendanceDevice() {
    if (this.attendanceForm.invalid) {
      // Mark all fields as touched to show validation errors
      Object.keys(this.attendanceForm.controls).forEach(key => {
        this.attendanceForm.get(key)?.markAsTouched();
      });
      this.toastService.error('Please fill in all required fields');
      return;
    }

    // Normalize last octet (remove leading zeros)
    const lastOctetInput = this.attendanceForm.value.lastOctet;
    const normalizedOctet = parseInt(lastOctetInput, 10).toString();
    const location = this.attendanceForm.value.location;
    const ip = `10.140.8.${normalizedOctet}`;

    // Check for duplicate IP
    const existingDevice = this.attendanceDevices().find(device => device.ip === ip);
    if (existingDevice) {
      this.toastService.error(`IP ${ip} already exists in the list`);
      this.attendanceForm.get('lastOctet')?.setErrors({ duplicate: true });
      return;
    }

    console.log('Adding device:', { ip, location });

    try {
      const response = await this.http.post<{ success: boolean; device: AttendanceDevice }>(
        'http://localhost:5001/api/network/attendance-devices',
        { ip, location }
      ).toPromise();

      console.log('Add device response:', response);

      if (response?.success) {
        console.log('Device added successfully, reloading list...');
        this.toastService.success(`Device ${ip} added successfully`);
        
        // Reload the list
        await this.loadAttendanceDevices();
        
        // Reset form
        this.attendanceForm.reset();
        this.lastOctet.set('');
        this.location.set('');

        // Refresh port check
        await this.checkPorts();
      }
    } catch (error: any) {
      console.error('Error adding device:', error);
      this.toastService.error(error?.error?.error || 'Failed to add device');
    }
  }

  async removeAttendanceDevice(ip: string) {
    // Find device to show location in confirmation
    const device = this.attendanceDevices().find(d => d.ip === ip);
    const confirmMessage = device 
      ? `Are you sure you want to remove this device?\n\nIP: ${ip}\nLocation: ${device.location}`
      : `Are you sure you want to remove device ${ip}?`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const response = await this.http.delete<{ success: boolean }>(
        `http://localhost:5001/api/network/attendance-devices/${encodeURIComponent(ip)}`
      ).toPromise();

      if (response?.success) {
        this.toastService.success(`Device ${ip} removed successfully`);
        
        // Reload the list
        await this.loadAttendanceDevices();
        
        // Refresh port check
        await this.checkPorts();
      }
    } catch (error: any) {
      console.error('Error removing device:', error);
      this.toastService.error(error?.error?.error || 'Failed to remove device');
    }
  }

  async checkPorts() {
    this.isCheckingPorts.set(true);
    this.portCheckResults.set('Checking ports...');

    try {
      const response = await this.http.get<PortCheckResponse>(
        'http://localhost:5001/api/network/attendance-devices/check-ports'
      ).toPromise();

      if (response) {
        this.portCheckResults.set(response.results || 'No results');
      }
    } catch (error) {
      console.error('Error checking ports:', error);
      this.portCheckResults.set('Error checking ports');
    } finally {
      this.isCheckingPorts.set(false);
    }
  }

  async refreshPortCheck() {
    await this.checkPorts();
  }

  // Validate IP octet input in real-time
  validateOctetInput(event: Event) {
    const input = event.target as HTMLInputElement;
    let value = input.value;

    // Remove non-numeric characters
    value = value.replace(/[^0-9]/g, '');

    // Convert to number and check range
    if (value !== '') {
      const numValue = parseInt(value, 10);
      
      // If value exceeds 255, cap it at 255
      if (numValue > 255) {
        value = '255';
        this.toastService.error('IP octet must be between 0 and 255');
      }
    }

    // Update the form control value
    this.attendanceForm.patchValue({ lastOctet: value });
    input.value = value;
  }
}

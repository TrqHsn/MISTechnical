import { Component, signal, OnDestroy, ViewChild, ElementRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-network',
  imports: [CommonModule, FormsModule],
  templateUrl: './network.html',
  styleUrl: './network.css',
})
export class NetworkComponent implements OnDestroy {
  // Tab management
  activeTab = signal<'ping' | 'activeip'>('ping');

  // Ping tab
  pingAddress = signal('10.140.');
  pingResult = signal('');
  isPinging = signal(false);
  deviceStatus = signal<'unknown' | 'online' | 'offline'>('unknown');
  private eventSource: EventSource | null = null;
  private sessionId: string = '';

  @ViewChild('pingResultElement') pingResultElement?: ElementRef<HTMLPreElement>;

  constructor(private http: HttpClient) {
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
    this.deviceStatus.set('unknown');

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
              if (data.includes('Request timed out') || data.includes('Destination host unreachable') || data.includes('could not find host')) {
                this.deviceStatus.set('offline');
              } else if (data.includes('Reply from') && data.includes('bytes=') && data.includes('time=')) {
                this.deviceStatus.set('online');
              }

              // Append to result with newline (since split removed it)
              this.pingResult.set(this.pingResult() + data + '\n');
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
    this.deviceStatus.set('unknown');
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
}

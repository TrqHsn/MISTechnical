import { Component, ElementRef, ViewChild, signal, effect, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-cam-mic-audio',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cam-mic-audio.component.html',
  styleUrls: ['./cam-mic-audio.component.css']
})
export class CamMicAudioComponent implements OnInit, OnDestroy {
  @ViewChild('video', { static: true }) videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  videoInputs = signal<MediaDeviceInfo[]>([]);
  audioInputs = signal<MediaDeviceInfo[]>([]);
  audioOutputs = signal<MediaDeviceInfo[]>([]);

  selectedVideoId = signal<string>('');
  selectedAudioId = signal<string>('');
  selectedSpeakerId = signal<string>('');

  stream: MediaStream | null = null;
  recorder: MediaRecorder | null = null;
  recordedChunks: Blob[] = [];
  recording = signal<boolean>(false);
  paused = signal<boolean>(false);
  timer = signal<number>(0);
  timerInterval: any = null;
  downloadUrl = signal<string>('');
  errorMsg = signal<string>('');

  supportsSinkId = 'setSinkId' in HTMLMediaElement.prototype;

  ngOnInit() {
    this.initDevices();
  }

  ngOnDestroy() {
    this.stopStream();
    this.clearTimer();
  }

  async initDevices() {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.videoInputs.set(devices.filter(d => d.kind === 'videoinput'));
      this.audioInputs.set(devices.filter(d => d.kind === 'audioinput'));
      this.audioOutputs.set(devices.filter(d => d.kind === 'audiooutput'));
      if (this.videoInputs().length) this.selectedVideoId.set(this.videoInputs()[0].deviceId);
      if (this.audioInputs().length) this.selectedAudioId.set(this.audioInputs()[0].deviceId);
      if (this.audioOutputs().length) this.selectedSpeakerId.set(this.audioOutputs()[0].deviceId);
      this.startStream();
    } catch (err: any) {
      this.errorMsg.set('Permission denied or no devices found.');
    }
  }

  async startStream() {
    this.stopStream();
    try {
      // If no camera is selected, show error and return
      if (!this.selectedVideoId()) {
        this.errorMsg.set('No webcam selected or available.');
        return;
      }
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: this.selectedVideoId() } },
        audio: this.selectedAudioId() ? { deviceId: { exact: this.selectedAudioId() } } : true
      });
      const videoEl = this.videoRef.nativeElement;
      videoEl.srcObject = this.stream;
      videoEl.muted = true;
      // Wait for metadata to ensure video can play
      videoEl.onloadedmetadata = () => {
        videoEl.play().catch(() => {
          this.errorMsg.set('Unable to play video preview.');
        });
      };
      // If already loaded, play immediately
      if (videoEl.readyState >= 2) {
        videoEl.play().catch(() => {
          this.errorMsg.set('Unable to play video preview.');
        });
      }
      if (this.supportsSinkId && this.selectedSpeakerId()) {
        try {
          // @ts-ignore
          await videoEl.setSinkId(this.selectedSpeakerId());
        } catch (err) {
          this.errorMsg.set('Failed to set speaker output.');
        }
      }
      this.errorMsg.set(''); // Clear error if successful
    } catch (err: any) {
      this.errorMsg.set('Failed to start video stream. Please check camera permissions and device availability.');
    }
  }

  stopStream() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    const videoEl = this.videoRef?.nativeElement;
    if (videoEl) videoEl.srcObject = null;
  }

  onSelectChange(event: Event, type: 'video' | 'audio' | 'speaker') {
    const target = event.target as HTMLSelectElement | null;
    const id = target?.value || '';
    this.onDeviceChange(type, id);
    // Always try to start stream after device change
    this.startStream();
  }

  async onDeviceChange(type: 'video' | 'audio' | 'speaker', id: string) {
    if (type === 'video') this.selectedVideoId.set(id);
    if (type === 'audio') this.selectedAudioId.set(id);
    if (type === 'speaker') this.selectedSpeakerId.set(id);
    if (type === 'speaker' && this.supportsSinkId) {
      const videoEl = this.videoRef.nativeElement;
      try {
        // @ts-ignore
        await videoEl.setSinkId(id);
      } catch (err) {
        this.errorMsg.set('Failed to set speaker output.');
      }
    }
    // Do not call startStream here, it is now always called after selection change
  }

  startRecording() {
    if (!this.stream) return;
    this.recordedChunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordedChunks.push(e.data);
    };
    this.recorder.onstop = () => {
      const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
      this.downloadUrl.set(URL.createObjectURL(blob));
    };
    this.recorder.onerror = () => {
      this.errorMsg.set('Recording error.');
    };
    this.recorder.start();
    this.recording.set(true);
    this.paused.set(false);
    this.timer.set(0);
    this.startTimer();
  }

  pauseRecording() {
    if (this.recorder && this.recorder.state === 'recording') {
      this.recorder.pause();
      this.paused.set(true);
      this.clearTimer();
    }
  }

  resumeRecording() {
    if (this.recorder && this.recorder.state === 'paused') {
      this.recorder.resume();
      this.paused.set(false);
      this.startTimer();
    }
  }

  stopRecording() {
    if (this.recorder && (this.recorder.state === 'recording' || this.recorder.state === 'paused')) {
      this.recorder.stop();
      this.recording.set(false);
      this.paused.set(false);
      this.clearTimer();
    }
  }

  cancelRecording() {
    if (this.recorder) {
      if (this.recorder.state !== 'inactive') this.recorder.stop();
      this.recorder = null;
    }
    this.recordedChunks = [];
    this.downloadUrl.set('');
    this.recording.set(false);
    this.paused.set(false);
    this.timer.set(0);
    this.clearTimer();
  }

  startTimer() {
    this.clearTimer();
    this.timerInterval = setInterval(() => {
      this.timer.set(this.timer() + 1);
    }, 1000);
  }

  clearTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  get timerDisplay(): string {
    const min = Math.floor(this.timer() / 60).toString().padStart(2, '0');
    const sec = (this.timer() % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  }

  async enterFullscreen() {
    const el = this.containerRef.nativeElement;
    if (el.requestFullscreen) {
      await el.requestFullscreen();
    }
  }
}

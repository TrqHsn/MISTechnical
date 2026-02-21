import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, signal } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

type DeviceKind = 'videoinput' | 'audioinput' | 'audiooutput';

type CamMicSpeakerForm = FormGroup<{
  cameraId: FormControl<string>;
  microphoneId: FormControl<string>;
  speakerId: FormControl<string>;
}>;

type SinkAwareAudioElement = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

@Component({
  selector: 'app-cam-mic-speaker',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './cam-mic-speaker.component.html',
  styleUrl: './cam-mic-speaker.component.css',
})
export class CamMicSpeakerComponent implements OnInit, OnDestroy {
  @ViewChild('cameraPreview', { static: true }) cameraPreviewRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('speakerTestAudio', { static: true }) speakerTestAudioRef!: ElementRef<HTMLAudioElement>;

  form: CamMicSpeakerForm;

  cameras = signal<MediaDeviceInfo[]>([]);
  microphones = signal<MediaDeviceInfo[]>([]);
  speakers = signal<MediaDeviceInfo[]>([]);

  loadingDevices = signal(false);
  isRecording = signal(false);
  isPaused = signal(false);
  hasRecordedAudio = signal(false);

  statusMessage = signal('');
  warningMessage = signal('');
  errorMessage = signal('');

  private destroy$ = new Subject<void>();
  private cameraStream: MediaStream | null = null;
  private microphoneStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordedAudioUrl: string | null = null;
  private speakerTestToneUrl: string | null = null;

  private readonly isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined';

  get supportsSetSinkId(): boolean {
    return this.isBrowser && typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  }

  constructor(private fb: FormBuilder) {
    this.form = this.fb.nonNullable.group({
      cameraId: '',
      microphoneId: '',
      speakerId: '',
    });
  }

  async ngOnInit(): Promise<void> {
    if (!this.isBrowser) {
      return;
    }

    if (!this.isSecureMediaContext()) {
      this.errorMessage.set('Media device access requires HTTPS or localhost. Open this app using https:// or http://localhost.');
      return;
    }

    if (!this.hasMediaDeviceApis()) {
      this.errorMessage.set('This browser session cannot access media device APIs.');
      return;
    }

    if (!this.supportsSetSinkId) {
      this.warningMessage.set('Speaker routing (setSinkId) is not supported in this browser. Default speaker will be used.');
    }

    this.setupFormSubscriptions();
    await this.loadDevices(true);
    this.prepareSpeakerTestTone();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    this.stopCameraStream();
    this.stopMicrophoneStream();

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    this.revokeRecordedAudioUrl();
    this.revokeSpeakerTestToneUrl();
  }

  get recordedAudioSrc(): string {
    return this.recordedAudioUrl || '';
  }

  async refreshDevices(): Promise<void> {
    await this.loadDevices(false);
  }

  async startRecording(): Promise<void> {
    if (!this.hasMediaDeviceApis()) {
      this.errorMessage.set('Media APIs are unavailable in this browser.');
      return;
    }

    this.clearMessages();
    this.revokeRecordedAudioUrl();
    this.hasRecordedAudio.set(false);
    this.audioChunks = [];

    try {
      const microphoneId = this.form.controls.microphoneId.value;
      const audioConstraints: boolean | MediaTrackConstraints = microphoneId
        ? { deviceId: { exact: microphoneId } }
        : true;

      this.microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });

      const mimeType = this.getPreferredAudioMimeType();
      this.mediaRecorder = mimeType
        ? new MediaRecorder(this.microphoneStream, { mimeType })
        : new MediaRecorder(this.microphoneStream);

      this.mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const chunkType = this.audioChunks[0]?.type || 'audio/webm';
        const audioBlob = new Blob(this.audioChunks, { type: chunkType });
        this.recordedAudioUrl = URL.createObjectURL(audioBlob);
        this.hasRecordedAudio.set(true);
        this.stopMicrophoneStream();
        this.statusMessage.set('Recording completed. You can play back the audio preview.');
      };

      this.mediaRecorder.onerror = () => {
        this.errorMessage.set('Microphone recording failed.');
      };

      this.mediaRecorder.start();
      this.isRecording.set(true);
      this.isPaused.set(false);
      this.statusMessage.set('Recording microphone input...');
    } catch {
      this.errorMessage.set('Unable to access the selected microphone. Check permissions and try again.');
      this.stopMicrophoneStream();
    }
  }

  pauseRecording(): void {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
      return;
    }

    this.mediaRecorder.pause();
    this.isPaused.set(true);
    this.statusMessage.set('Recording paused.');
  }

  resumeRecording(): void {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'paused') {
      return;
    }

    this.mediaRecorder.resume();
    this.isPaused.set(false);
    this.statusMessage.set('Recording resumed.');
  }

  stopRecording(): void {
    if (!this.mediaRecorder || (this.mediaRecorder.state !== 'recording' && this.mediaRecorder.state !== 'paused')) {
      return;
    }

    this.mediaRecorder.stop();
    this.isRecording.set(false);
    this.isPaused.set(false);
  }

  async testSpeaker(): Promise<void> {
    this.clearMessages();

    const audioEl = this.speakerTestAudioRef.nativeElement as SinkAwareAudioElement;
    if (!audioEl.src && this.speakerTestToneUrl) {
      audioEl.src = this.speakerTestToneUrl;
    }

    if (!audioEl.src) {
      this.errorMessage.set('Unable to initialize test sound.');
      return;
    }

    try {
      const selectedSpeakerId = this.form.controls.speakerId.value;

      if (this.supportsSetSinkId && selectedSpeakerId && audioEl.setSinkId) {
        await audioEl.setSinkId(selectedSpeakerId);
      } else if (!this.supportsSetSinkId) {
        this.warningMessage.set('Speaker routing is not supported in this browser. Playing on default speaker.');
      }

      audioEl.currentTime = 0;
      await audioEl.play();
      this.statusMessage.set('Playing speaker test sound.');
    } catch {
      this.errorMessage.set('Failed to play speaker test sound. Browser policy may require a direct user gesture.');
    }
  }

  trackByDeviceId(_: number, device: MediaDeviceInfo): string {
    return device.deviceId;
  }

  getDeviceLabel(device: MediaDeviceInfo, kind: DeviceKind, index: number): string {
    if (device.label) {
      return device.label;
    }

    const base = kind === 'videoinput'
      ? 'Camera'
      : kind === 'audioinput'
        ? 'Microphone'
        : 'Speaker';

    return `${base} ${index + 1}`;
  }

  private setupFormSubscriptions(): void {
    this.form.controls.cameraId.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(cameraId => {
        void this.startCameraPreview(cameraId);
      });
  }

  private async loadDevices(requestPermissions: boolean): Promise<void> {
    this.loadingDevices.set(true);
    this.clearMessages();

    try {
      if (requestPermissions) {
        await this.requestMediaPermissions();
      }

      const allDevices = await navigator.mediaDevices.enumerateDevices();

      const cameras = allDevices.filter(device => device.kind === 'videoinput');
      const microphones = allDevices.filter(device => device.kind === 'audioinput');
      const speakers = allDevices.filter(device => device.kind === 'audiooutput');

      this.cameras.set(cameras);
      this.microphones.set(microphones);
      this.speakers.set(speakers);

      if (cameras.length === 0) {
        this.warningMessage.set('No camera device detected.');
      }
      if (microphones.length === 0) {
        this.warningMessage.set(this.warningMessage() ? `${this.warningMessage()} No microphone detected.` : 'No microphone detected.');
      }
      if (speakers.length === 0) {
        this.warningMessage.set(this.warningMessage() ? `${this.warningMessage()} No speaker output detected.` : 'No speaker output detected.');
      }

      const selectedCameraId = this.pickExistingOrFirst(this.form.controls.cameraId.value, cameras);
      const selectedMicrophoneId = this.pickExistingOrFirst(this.form.controls.microphoneId.value, microphones);
      const selectedSpeakerId = this.pickExistingOrFirst(this.form.controls.speakerId.value, speakers);

      this.form.patchValue(
        {
          cameraId: selectedCameraId,
          microphoneId: selectedMicrophoneId,
          speakerId: selectedSpeakerId,
        },
        { emitEvent: false }
      );

      await this.startCameraPreview(selectedCameraId);
    } catch {
      this.errorMessage.set('Unable to detect media devices. Check browser permissions and hardware availability.');
      this.stopCameraStream();
    } finally {
      this.loadingDevices.set(false);
    }
  }

  private hasMediaDeviceApis(): boolean {
    return this.isBrowser
      && !!navigator.mediaDevices
      && typeof navigator.mediaDevices.enumerateDevices === 'function'
      && typeof navigator.mediaDevices.getUserMedia === 'function';
  }

  private isSecureMediaContext(): boolean {
    if (!this.isBrowser) {
      return false;
    }

    const host = window.location.hostname;
    const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    return window.isSecureContext || isLocalhost;
  }

  private async requestMediaPermissions(): Promise<void> {
    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      permissionStream.getTracks().forEach(track => track.stop());
    } catch {
      this.warningMessage.set('Camera/Microphone permission denied. Device labels may be hidden.');
    }
  }

  private async startCameraPreview(cameraId: string): Promise<void> {
    this.stopCameraStream();

    if (!cameraId) {
      return;
    }

    try {
      const videoConstraints: MediaTrackConstraints = { deviceId: { exact: cameraId } };
      this.cameraStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });

      const videoElement = this.cameraPreviewRef.nativeElement;
      videoElement.srcObject = this.cameraStream;
      await videoElement.play();
    } catch {
      this.errorMessage.set('Unable to start camera preview with the selected camera.');
    }
  }

  private stopCameraStream(): void {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(track => track.stop());
      this.cameraStream = null;
    }

    if (this.cameraPreviewRef?.nativeElement) {
      this.cameraPreviewRef.nativeElement.srcObject = null;
    }
  }

  private stopMicrophoneStream(): void {
    if (this.microphoneStream) {
      this.microphoneStream.getTracks().forEach(track => track.stop());
      this.microphoneStream = null;
    }
  }

  private getPreferredAudioMimeType(): string | undefined {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    return candidates.find(type => MediaRecorder.isTypeSupported(type));
  }

  private prepareSpeakerTestTone(): void {
    this.revokeSpeakerTestToneUrl();
    const blob = this.generateSineWaveWavBlob(880, 0.35, 44100);
    this.speakerTestToneUrl = URL.createObjectURL(blob);
  }

  private generateSineWaveWavBlob(frequency: number, durationSeconds: number, sampleRate: number): Blob {
    const totalSamples = Math.floor(durationSeconds * sampleRate);
    const dataSize = totalSamples * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    this.writeWavHeader(view, totalSamples, sampleRate, dataSize);

    let offset = 44;
    for (let index = 0; index < totalSamples; index++) {
      const sample = Math.sin((2 * Math.PI * frequency * index) / sampleRate);
      const amplitude = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, amplitude * 0x7fff, true);
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  private writeWavHeader(view: DataView, totalSamples: number, sampleRate: number, dataSize: number): void {
    const writeString = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index++) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    if (totalSamples <= 0) {
      view.setUint32(40, 0, true);
    }
  }

  private pickExistingOrFirst(currentId: string, devices: MediaDeviceInfo[]): string {
    if (!devices.length) {
      return '';
    }

    const exists = devices.some(device => device.deviceId === currentId);
    return exists ? currentId : devices[0].deviceId;
  }

  private clearMessages(): void {
    this.statusMessage.set('');
    this.errorMessage.set('');
  }

  private revokeRecordedAudioUrl(): void {
    if (this.recordedAudioUrl) {
      URL.revokeObjectURL(this.recordedAudioUrl);
      this.recordedAudioUrl = null;
    }
  }

  private revokeSpeakerTestToneUrl(): void {
    if (this.speakerTestToneUrl) {
      URL.revokeObjectURL(this.speakerTestToneUrl);
      this.speakerTestToneUrl = null;
    }
  }
}

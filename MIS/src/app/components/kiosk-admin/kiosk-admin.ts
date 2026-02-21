import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  KioskApiService,
  MediaItem,
  Playlist,
  Schedule,
  CreatePlaylistDto,
  CreateScheduleDto,
  ScheduleContentType,
  MediaType,
} from '../../services/kiosk-api';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-kiosk-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './kiosk-admin.html',
  styleUrl: './kiosk-admin.css',
})
export class KioskAdminComponent implements OnInit {
  private toast = inject(ToastService);
  // Tab state
  activeTab = signal<'media' | 'playlists' | 'schedules' | 'settings' | 'preview'>('media');

  // Data signals
  mediaList = signal<MediaItem[]>([]);
  playlists = signal<Playlist[]>([]);
  schedules = signal<Schedule[]>([]);

  // Display settings
  displayMode = signal<string>('cover');
  displayModes = [
    { value: 'fill', label: 'Fullscreen', description: 'Image fills entire screen (stretches)' },
    { value: 'contain', label: 'Fit to Screen', description: 'Entire image visible, may have black bars' },
    { value: 'cover', label: 'Cover', description: 'Fills screen, maintains aspect ratio (may crop)' },
    { value: 'scale-down', label: 'Scale Down', description: 'Fits inside screen, never enlarges' },
    { value: 'none', label: 'Original Size', description: 'Image at original dimensions' },
    { value: 'test-512', label: '512x512 Test', description: 'Fixed 512x512 size for testing' },
    { value: 'hd', label: 'HD', description: '1280x720 resolution' },
    { value: 'fullhd', label: 'Full HD', description: '1920x1080 resolution' },
    { value: '2k', label: '2K', description: '2048x1080 resolution' },
    { value: 'qhd', label: 'QHD', description: '2560x1440 resolution' },
    { value: '4k', label: '4K', description: '3840x2160 resolution' },
  ];

  // Upload state
  selectedFile = signal<File | null>(null);
  uploadDescription = signal('');
  uploadProgress = signal(false);

  // Playlist editing
  editingPlaylist = signal<Playlist | null>(null);
  playlistName = signal('');
  playlistDescription = signal('');
  playlistItems = signal<{ mediaId: number; durationSeconds: number; order: number }[]>([]);

  // Schedule editing
  editingSchedule = signal<Schedule | null>(null);
  scheduleName = signal('');
  scheduleContentType = signal<ScheduleContentType>(ScheduleContentType.Playlist);
  schedulePlaylistId = signal<number | null>(null);
  scheduleMediaId = signal<number | null>(null);
  scheduleStartTime = signal('09:00');
  scheduleEndTime = signal('17:00');
  scheduleDayOfWeek = signal<number | null>(null);
  schedulePriority = signal(0);

  // Enums for templates
  MediaType = MediaType;
  ScheduleContentType = ScheduleContentType;
  DaysOfWeek = [
    { value: null, label: 'Every Day' },
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
  ];

  constructor(private kioskApi: KioskApiService, private route: ActivatedRoute) {
    // Listen for tab query parameter
    this.route.queryParams.subscribe(params => {
      if (params['tab']) {
        const tab = params['tab'] as 'media' | 'playlists' | 'schedules' | 'settings' | 'preview';
        if (tab === 'media' || tab === 'playlists' || tab === 'schedules' || tab === 'settings' || tab === 'preview') {
          this.activeTab.set(tab);
        }
      }
    });
  }

  ngOnInit() {
    this.loadData();
    this.loadDisplayMode();
  }

  loadDisplayMode() {
    this.kioskApi.getDisplaySettings().subscribe({
      next: (settings) => {
        this.displayMode.set(settings.displayMode);
      },
      error: (err) => {
        console.error('Failed to load display settings:', err);
        // Fallback to 'cover' if server request fails
        this.displayMode.set('cover');
      }
    });
  }

  setDisplayMode(mode: string) {
    this.displayMode.set(mode);
    
    this.kioskApi.updateDisplaySettings({ displayMode: mode }).subscribe({
      next: () => {
        this.toast.success(`Display mode set to: ${this.displayModes.find(m => m.value === mode)?.label}`);
      },
      error: (err) => {
        console.error('Failed to update display settings:', err);
        this.toast.error('Failed to update display settings');
      }
    });
  }

  triggerReload() {
    this.kioskApi.triggerDisplayReload().subscribe({
      next: () => {
        this.toast.success('🔄 Reload command sent to all displays!');
      },
      error: (err) => {
        console.error('Failed to trigger reload:', err);
        this.toast.error('Failed to send reload command');
      }
    });
  }

  stopBroadcast() {
    this.kioskApi.stopBroadcast().subscribe({
      next: () => {
        this.toast.success('⏹️ Broadcast stopped - Displays showing 404');
      },
      error: (err) => {
        console.error('Failed to stop broadcast:', err);
        this.toast.error('Failed to stop broadcast');
      }
    });
  }

  getCurrentModeLabel(): string {
    return this.displayModes.find(m => m.value === this.displayMode())?.label || 'Cover';
  }

  loadData() {
    this.loadMedia();
    this.loadPlaylists();
    this.loadSchedules();
  }

  // Media management
  loadMedia() {
    this.kioskApi.getAllMedia().subscribe({
      next: (media) => this.mediaList.set(media),
      error: (err) => console.error('Failed to load media:', err),
    });
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile.set(input.files[0]);
    }
  }

  uploadMedia() {
    const file = this.selectedFile();
    if (!file) {
      this.toast.error('Please select a file');
      return;
    }

    this.uploadProgress.set(true);

    this.kioskApi.uploadMedia(file, this.uploadDescription()).subscribe({
      next: (response) => {
        if (response.success) {
          this.toast.success('Media uploaded successfully');
          this.selectedFile.set(null);
          this.uploadDescription.set('');
          this.loadMedia();
          // Reset file input
          const input = document.querySelector('input[type="file"]') as HTMLInputElement;
          if (input) input.value = '';
        } else {
          this.toast.error('Upload failed: ' + response.message);
        }
        this.uploadProgress.set(false);
      },
      error: (err) => {
        console.error('Upload error:', err);
        this.toast.error('Upload error: ' + (err.error?.message || 'Unknown error'));
        this.uploadProgress.set(false);
      },
    });
  }

  deleteMedia(id: number) {
    if (!confirm('Delete this media? It will be removed from all playlists.')) return;

    this.kioskApi.deleteMedia(id).subscribe({
      next: () => {
        this.toast.success('Media deleted');
        this.loadMedia();
        this.loadPlaylists(); // Refresh playlists as they may reference this media
      },
      error: (err) => {
        console.error('Delete error:', err);
        this.toast.error('Failed to delete media');
      },
    });
  }

  activateMedia(id: number) {
    this.kioskApi.activateMedia(id).subscribe({
      next: () => {
        this.toast.success('Media activated! It will now display on all screens.');
      },
      error: (err) => {
        console.error('Activation error:', err);
        this.toast.error('Failed to activate media');
      },
    });
  }

  getMediaUrl(fileName: string): string {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      return `http://${hostname}:5001/displayboard/${fileName}`;
    }
    return `http://localhost:5001/displayboard/${fileName}`;
  }

  // Playlist management
  loadPlaylists() {
    this.kioskApi.getAllPlaylists().subscribe({
      next: (playlists) => this.playlists.set(playlists),
      error: (err) => console.error('Failed to load playlists:', err),
    });
  }

  newPlaylist() {
    this.editingPlaylist.set(null);
    this.playlistName.set('');
    this.playlistDescription.set('');
    this.playlistItems.set([]);
  }

  editPlaylist(playlist: Playlist) {
    this.editingPlaylist.set(playlist);
    this.playlistName.set(playlist.name);
    this.playlistDescription.set(playlist.description || '');
    this.playlistItems.set(
      playlist.items.map((item) => ({
        mediaId: item.mediaId,
        durationSeconds: item.durationSeconds,
        order: item.order,
      }))
    );
    this.activeTab.set('playlists');
  }

  addPlaylistItem() {
    const items = this.playlistItems();
    items.push({
      mediaId: this.mediaList()[0]?.id || 0,
      durationSeconds: 10,
      order: items.length,
    });
    this.playlistItems.set([...items]);
  }

  removePlaylistItem(index: number) {
    const items = this.playlistItems();
    items.splice(index, 1);
    // Re-order
    items.forEach((item, i) => (item.order = i));
    this.playlistItems.set([...items]);
  }

  savePlaylist() {
    const dto: CreatePlaylistDto = {
      name: this.playlistName(),
      description: this.playlistDescription() || undefined,
      items: this.playlistItems(),
    };

    const editing = this.editingPlaylist();

    const request = editing
      ? this.kioskApi.updatePlaylist(editing.id, dto)
      : this.kioskApi.createPlaylist(dto);

    request.subscribe({
      next: () => {
        this.toast.success(editing ? 'Playlist updated' : 'Playlist created');
        this.loadPlaylists();
        this.newPlaylist();
      },
      error: (err) => {
        console.error('Save error:', err);
        this.toast.error('Failed to save playlist');
      },
    });
  }

  deletePlaylist(id: number) {
    if (!confirm('Delete this playlist?')) return;

    this.kioskApi.deletePlaylist(id).subscribe({
      next: () => {
        this.toast.success('Playlist deleted');
        this.loadPlaylists();
      },
      error: (err) => {
        console.error('Delete error:', err);
        this.toast.error('Failed to delete playlist');
      },
    });
  }

  // Schedule management
  loadSchedules() {
    this.kioskApi.getAllSchedules().subscribe({
      next: (schedules) => this.schedules.set(schedules),
      error: (err) => console.error('Failed to load schedules:', err),
    });
  }

  newSchedule() {
    this.editingSchedule.set(null);
    this.scheduleName.set('');
    this.scheduleContentType.set(ScheduleContentType.Playlist);
    this.schedulePlaylistId.set(this.playlists()[0]?.id || null);
    this.scheduleMediaId.set(null);
    this.scheduleStartTime.set('09:00');
    this.scheduleEndTime.set('17:00');
    this.scheduleDayOfWeek.set(null);
    this.schedulePriority.set(0);
  }

  editSchedule(schedule: Schedule) {
    this.editingSchedule.set(schedule);
    this.scheduleName.set(schedule.name);
    this.scheduleContentType.set(schedule.contentType);
    this.schedulePlaylistId.set(schedule.playlistId || null);
    this.scheduleMediaId.set(schedule.mediaId || null);
    this.scheduleStartTime.set(schedule.startTime);
    this.scheduleEndTime.set(schedule.endTime);
    this.scheduleDayOfWeek.set(schedule.dayOfWeek ?? null);
    this.schedulePriority.set(schedule.priority);
    this.activeTab.set('schedules');
  }

  saveSchedule() {
    const dto: CreateScheduleDto = {
      name: this.scheduleName(),
      contentType: this.scheduleContentType(),
      playlistId: this.scheduleContentType() === ScheduleContentType.Playlist ? (this.schedulePlaylistId() ?? undefined) : undefined,
      mediaId: this.scheduleContentType() === ScheduleContentType.SingleImage ? (this.scheduleMediaId() ?? undefined) : undefined,
      startTime: this.scheduleStartTime(),
      endTime: this.scheduleEndTime(),
      dayOfWeek: this.scheduleDayOfWeek() ?? undefined,
      priority: this.schedulePriority(),
    };

    const editing = this.editingSchedule();

    const request = editing
      ? this.kioskApi.updateSchedule(editing.id, dto)
      : this.kioskApi.createSchedule(dto);

    request.subscribe({
      next: () => {
        this.toast.success(editing ? 'Schedule updated' : 'Schedule created');
        this.loadSchedules();
        this.newSchedule();
      },
      error: (err) => {
        console.error('Save error:', err);
        this.toast.error('Failed to save schedule: ' + (err.error?.message || 'Unknown error'));
      },
    });
  }

  deleteSchedule(id: number) {
    if (!confirm('Delete this schedule?')) return;

    this.kioskApi.deleteSchedule(id).subscribe({
      next: () => {
        this.toast.success('Schedule deleted');
        this.loadSchedules();
      },
      error: (err) => {
        console.error('Delete error:', err);
        this.toast.error('Failed to delete schedule');
      },
    });
  }

  toggleSchedule(schedule: Schedule) {
    this.kioskApi.toggleSchedule(schedule.id, !schedule.isActive).subscribe({
      next: () => {
        schedule.isActive = !schedule.isActive;
        this.schedules.set([...this.schedules()]);
      },
      error: (err) => {
        console.error('Toggle error:', err);
        this.toast.error('Failed to toggle schedule');
      },
    });
  }

  // Preview
  openDisplayPreview() {
    window.open('/displayboard', '_blank');
  }
}

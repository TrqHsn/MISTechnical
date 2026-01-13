import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface MediaItem {
  id: number;
  fileName: string;
  originalFileName: string;
  type: MediaType;
  fileSizeBytes: number;
  uploadedAt: string;
  description?: string;
}

export enum MediaType {
  Image = 0,
  Video = 1
}

export interface Playlist {
  id: number;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt?: string;
  items: PlaylistItem[];
}

export interface PlaylistItem {
  id: number;
  playlistId: number;
  mediaId: number;
  durationSeconds: number;
  order: number;
  media?: MediaItem;
}

export interface Schedule {
  id: number;
  name: string;
  contentType: ScheduleContentType;
  playlistId?: number;
  mediaId?: number;
  startTime: string;
  endTime: string;
  dayOfWeek?: number;
  isActive: boolean;
  priority: number;
  playlist?: Playlist;
  media?: MediaItem;
}

export enum ScheduleContentType {
  Playlist = 0,
  SingleImage = 1
}

export interface CreatePlaylistDto {
  name: string;
  description?: string;
  items: PlaylistItemDto[];
}

export interface PlaylistItemDto {
  mediaId: number;
  durationSeconds: number;
  order: number;
}

export interface CreateScheduleDto {
  name: string;
  contentType: ScheduleContentType;
  playlistId?: number;
  mediaId?: number;
  startTime: string;
  endTime: string;
  dayOfWeek?: number;
  priority: number;
}

export interface UploadMediaResponse {
  success: boolean;
  message?: string;
  media?: MediaItem;
}

export interface ActiveContentResponse {
  contentType: string;
  playlistId?: number;
  playlistItems?: any[];
  singleMedia?: any;
  serverTime: string;
  scheduleName?: string;
}

@Injectable({
  providedIn: 'root',
})
export class KioskApiService {
  private apiUrl = 'http://localhost:5001/api/kiosk';

  constructor(private http: HttpClient) {}

  // Media endpoints
  uploadMedia(file: File, description?: string): Observable<UploadMediaResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (description) {
      formData.append('description', description);
    }
    return this.http.post<UploadMediaResponse>(`${this.apiUrl}/media/upload`, formData);
  }

  getAllMedia(): Observable<MediaItem[]> {
    return this.http.get<MediaItem[]>(`${this.apiUrl}/media`);
  }

  getMedia(id: number): Observable<MediaItem> {
    return this.http.get<MediaItem>(`${this.apiUrl}/media/${id}`);
  }

  deleteMedia(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/media/${id}`);
  }

  activateMedia(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/media/${id}/activate`, {});
  }

  deactivateMedia(): Observable<any> {
    return this.http.post(`${this.apiUrl}/media/deactivate`, {});
  }

  // Playlist endpoints
  createPlaylist(dto: CreatePlaylistDto): Observable<Playlist> {
    return this.http.post<Playlist>(`${this.apiUrl}/playlists`, dto);
  }

  updatePlaylist(id: number, dto: CreatePlaylistDto): Observable<Playlist> {
    return this.http.put<Playlist>(`${this.apiUrl}/playlists/${id}`, dto);
  }

  getAllPlaylists(): Observable<Playlist[]> {
    return this.http.get<Playlist[]>(`${this.apiUrl}/playlists`);
  }

  getPlaylist(id: number): Observable<Playlist> {
    return this.http.get<Playlist>(`${this.apiUrl}/playlists/${id}`);
  }

  deletePlaylist(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/playlists/${id}`);
  }

  // Schedule endpoints
  createSchedule(dto: CreateScheduleDto): Observable<Schedule> {
    return this.http.post<Schedule>(`${this.apiUrl}/schedules`, dto);
  }

  updateSchedule(id: number, dto: CreateScheduleDto): Observable<Schedule> {
    return this.http.put<Schedule>(`${this.apiUrl}/schedules/${id}`, dto);
  }

  getAllSchedules(): Observable<Schedule[]> {
    return this.http.get<Schedule[]>(`${this.apiUrl}/schedules`);
  }

  getSchedule(id: number): Observable<Schedule> {
    return this.http.get<Schedule>(`${this.apiUrl}/schedules/${id}`);
  }

  deleteSchedule(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/schedules/${id}`);
  }

  toggleSchedule(id: number, isActive: boolean): Observable<any> {
    return this.http.patch(`${this.apiUrl}/schedules/${id}/toggle`, isActive);
  }

  // Display content endpoint (for preview)
  getActiveContent(): Observable<ActiveContentResponse> {
    return this.http.get<ActiveContentResponse>(`${this.apiUrl}/display/content`);
  }
}

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DashboardChecklistItem, DashboardDataResponse, DashboardFileActionResult } from '../models/personal-dashboard.models';

@Injectable({ providedIn: 'root' })
export class PersonalDashboardService {
  private readonly apiBaseUrl = '/api/personal-dashboard';

  constructor(private http: HttpClient) {}

  async getDashboardData(): Promise<DashboardDataResponse> {
    return firstValueFrom(this.http.get<DashboardDataResponse>(this.apiBaseUrl));
  }

  async updateChecklist(checklist: DashboardChecklistItem[]): Promise<DashboardDataResponse> {
    return firstValueFrom(this.http.post<DashboardDataResponse>(`${this.apiBaseUrl}/checklist`, checklist));
  }

  async openFile(path: string): Promise<DashboardFileActionResult> {
    return firstValueFrom(this.http.post<DashboardFileActionResult>(`${this.apiBaseUrl}/open-file`, { path }));
  }
}

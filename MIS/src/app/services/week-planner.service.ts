import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type TaskCategory = 'Fixed' | 'NeedBased';
export type TaskStatus = 'Planned' | 'In Progress' | 'Completed' | 'Cancelled';

export interface PlannerTask {
  id: string;
  name: string;
  category: TaskCategory;
  day: number;
  start: string;
  end: string;
  notes: string;
  status: TaskStatus;
}

export interface ImportantTask {
  id: string;
  name: string;
  notes: string;
  status: TaskStatus;
}

export interface PlannerWeek {
  weekStart: string;
  tasks: PlannerTask[];
  importantTasks: ImportantTask[];
  notes: string;
}

export interface PlannerData {
  fixedTasks: PlannerTask[];
  weeks: PlannerWeek[];
}

const apiBase = () => {
  if (typeof window === 'undefined') return 'http://localhost:5001/api';
  return window.location.port === '4200'
    ? `http://${window.location.hostname}:5001/api`
    : `${window.location.protocol}//${window.location.host}/api`;
};

@Injectable({ providedIn: 'root' })
export class WeekPlannerService {
  private readonly http = inject(HttpClient);
  private readonly url = `${apiBase()}/planner`;

  load(): Observable<PlannerData> {
    return this.http.get<PlannerData>(this.url);
  }

  save(data: PlannerData): Observable<void> {
    return this.http.put<void>(this.url, data);
  }

  report(weekStart: string): Observable<Blob> {
    return this.http.post(`${this.url}/report/${weekStart}`, null, { responseType: 'blob' });
  }
}

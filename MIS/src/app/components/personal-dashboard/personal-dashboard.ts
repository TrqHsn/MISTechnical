import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PersonalDashboardService } from '../../services/personal-dashboard.service';
import { DashboardChecklistItem, DashboardDataResponse, DashboardLinkItem } from '../../models/personal-dashboard.models';
import { Inject, PLATFORM_ID } from '@angular/core';

@Component({
  selector: 'app-personal-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './personal-dashboard.html',
  styleUrls: ['./personal-dashboard.css']
})
export class PersonalDashboardComponent implements OnInit, OnDestroy {
  loading = signal(true);
  error = signal('');
  data = signal<DashboardDataResponse | null>(null);
  clock = signal(new Date());
  newTask = '';
  editingTaskId = signal<string | null>(null);
  editingTaskValue = '';
  dragIndex = signal<number | null>(null);
  private clockTimer?: number;

  constructor(
    private dashboardService: PersonalDashboardService,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      void this.loadDashboard();
      this.clockTimer = window.setInterval(() => this.clock.set(new Date()), 1000);
    }
  }

  ngOnDestroy(): void {
    if (this.clockTimer) {
      window.clearInterval(this.clockTimer);
    }
  }

  async loadDashboard(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const response = await this.dashboardService.getDashboardData();
      this.data.set(response);
    } catch (err) {
      this.error.set('Unable to load dashboard data.');
    } finally {
      this.loading.set(false);
    }
  }

  get checklist(): DashboardChecklistItem[] {
    return this.data()?.checklist ?? [];
  }

  get portalBookmarks(): DashboardLinkItem[] {
    return this.data()?.portalBookmarks ?? [];
  }

  get fileList(): DashboardLinkItem[] {
    return this.data()?.fileList ?? [];
  }

  get importantLinks(): DashboardLinkItem[] {
    return this.data()?.importantLinks ?? [];
  }

  get ciscoMeraki(): DashboardLinkItem[] {
    return this.data()?.ciscoMeraki ?? [];
  }

  get piDevices() {
    return this.data()?.piDevices ?? [];
  }

  async toggleTask(item: DashboardChecklistItem): Promise<void> {
    const updated = this.checklist.map((entry) => entry.id === item.id ? { ...entry, isCompleted: !entry.isCompleted } : entry);
    this.data.set({ ...(this.data() ?? this.emptyData()), checklist: updated } as DashboardDataResponse);
    await this.persistChecklist(updated);
  }

  async addTask(): Promise<void> {
    const task = this.newTask.trim();
    if (!task) {
      return;
    }

    const item: DashboardChecklistItem = {
      id: `temp-${Date.now()}`,
      isCompleted: false,
      task,
      createdDate: new Date().toISOString()
    };

    const updated = [item, ...this.checklist];
    this.data.set({ ...(this.data() ?? this.emptyData()), checklist: updated } as DashboardDataResponse);
    this.newTask = '';
    await this.persistChecklist(updated);
  }

  startEdit(item: DashboardChecklistItem): void {
    this.editingTaskId.set(item.id);
    this.editingTaskValue = item.task;
  }

  cancelEdit(): void {
    this.editingTaskId.set(null);
    this.editingTaskValue = '';
  }

  async saveEdit(item: DashboardChecklistItem): Promise<void> {
    const task = this.editingTaskValue.trim();
    if (!task) {
      return;
    }

    const updated = this.checklist.map((entry) => entry.id === item.id ? { ...entry, task } : entry);
    this.data.set({ ...(this.data() ?? this.emptyData()), checklist: updated } as DashboardDataResponse);
    this.editingTaskId.set(null);
    this.editingTaskValue = '';
    await this.persistChecklist(updated);
  }

  async deleteTask(item: DashboardChecklistItem): Promise<void> {
    const updated = this.checklist.filter((entry) => entry.id !== item.id);
    this.data.set({ ...(this.data() ?? this.emptyData()), checklist: updated } as DashboardDataResponse);
    await this.persistChecklist(updated);
  }

  dragStart(index: number): void {
    this.dragIndex.set(index);
  }

  dragOver(index: number): void {
    if (this.dragIndex() === null || this.dragIndex() === index) {
      return;
    }
  }

  async drop(index: number): Promise<void> {
    const source = this.dragIndex();
    if (source === null || source === index) {
      this.dragIndex.set(null);
      return;
    }

    const list = [...this.checklist];
    const [moved] = list.splice(source, 1);
    list.splice(index, 0, moved);
    this.data.set({ ...(this.data() ?? this.emptyData()), checklist: list } as DashboardDataResponse);
    this.dragIndex.set(null);
    await this.persistChecklist(list);
  }

  async persistChecklist(list: DashboardChecklistItem[]): Promise<void> {
    try {
      await this.dashboardService.updateChecklist(list);
    } catch {
      this.error.set('Changes were not saved to Excel.');
    }
  }

  openLink(link: string): void {
    if (typeof window !== 'undefined') {
      window.open(link, '_blank', 'noopener,noreferrer');
    }
  }

  async openFile(path: string): Promise<void> {
    try {
      await this.dashboardService.openFile(path);
    } catch {
      this.error.set('Unable to open file from the backend.');
    }
  }

  private emptyData(): DashboardDataResponse {
    return {
      checklist: [],
      piDevices: [],
      portalBookmarks: [],
      fileList: [],
      importantLinks: [],
      ciscoMeraki: [],
      lastUpdatedUtc: new Date().toISOString()
    };
  }

  timeLabel(): string {
    const now = this.clock();
    return now.toLocaleTimeString('en-GB', { hour12: false });
  }

  dayLabel(): string {
    return this.clock().toLocaleDateString('en-GB', { weekday: 'long' });
  }

  dateLabel(): string {
    return this.clock().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}

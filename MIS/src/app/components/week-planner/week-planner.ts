import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WeekPlannerService, PlannerData, PlannerTask, PlannerWeek, ImportantTask, TaskCategory, TaskStatus } from '../../services/week-planner.service';

const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
const STATUSES: TaskStatus[] = ['Planned', 'In Progress', 'Completed', 'Cancelled'];

@Component({
  selector: 'app-week-planner',
  imports: [FormsModule],
  templateUrl: './week-planner.html',
  styleUrl: './week-planner.css'
})
export class WeekPlannerComponent implements OnInit, OnDestroy {
  readonly days = DAYS;
  readonly statuses = STATUSES;
  readonly times = Array.from({ length: 37 }, (_, i) => this.toTime(450 + i * 15));
  readonly data = signal<PlannerData>({ fixedTasks: [], weeks: [] });
  readonly week = signal<PlannerWeek | null>(null);
  readonly selectedWeekStart = signal(this.currentWeekStart());
  readonly now = signal(new Date());
  readonly editor = signal<PlannerTask | null>(null);
  readonly importantEditor = signal<ImportantTask | null>(null);
  readonly showImportant = signal(false);
  readonly message = signal('');
  private clock?: ReturnType<typeof setInterval>;

  constructor(private readonly planner: WeekPlannerService) {}

  ngOnInit(): void {
    this.planner.load().subscribe({
      next: data => {
        const safeData = data ?? { fixedTasks: [], weeks: [] };
        safeData.fixedTasks ??= [];
        safeData.weeks ??= [];
        this.data.set(safeData);
        this.goTo(this.currentWeekStart());
      },
      error: () => this.message.set('Planner data could not be loaded.')
    });
    this.clock = setInterval(() => this.now.set(new Date()), 30_000);
  }

  ngOnDestroy(): void {
    if (this.clock) clearInterval(this.clock);
  }

  currentWeekStart(date = new Date()): string {
    const day = (date.getDay() + 1) % 7;
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    result.setDate(result.getDate() - day);
    return this.iso(result);
  }

  goTo(start: string): void {
    const existing = this.data().weeks.find(w => w.weekStart === start);
    const current = existing ?? { weekStart: start, tasks: [], importantTasks: [], notes: '' };
    const fixed = this.data().fixedTasks;
    for (const task of fixed) {
      if (!current.tasks.some(t => t.id === task.id)) current.tasks.push({ ...task, category: 'Fixed' });
    }
    if (!existing) this.data.update(d => ({ ...d, weeks: [...d.weeks, current] }));
    this.week.set(current);
    this.selectedWeekStart.set(start);
    if (!existing) this.persist();
  }

  navigate(offset: number): void {
    const date = this.fromIso(this.selectedWeekStart());
    date.setDate(date.getDate() + offset * 7);
    this.goTo(this.iso(date));
  }

  isCurrentWeek(): boolean { return this.selectedWeekStart() === this.currentWeekStart(); }

  weekLabel(): string {
    const start = this.fromIso(this.selectedWeekStart());
    return `${this.formatDate(start)} - ${this.formatDate(new Date(start.getTime() + 5 * 86400000))}`;
  }

  taskAt(day: number, time: string): PlannerTask | undefined {
    return this.week()?.tasks.find(t => t.day === day && t.start === time);
  }

  taskStyle(task: PlannerTask): Record<string, string> {
    const top = this.minutes(task.start) - 450;
    const height = this.minutes(task.end) - this.minutes(task.start);
    return { top: `${top * (34 / 15)}px`, height: `${Math.max(height * (34 / 15) - 4, 30)}px` };
  }

  addAt(day: number, start: string): void {
    if (this.week()?.tasks.some(t => t.day === day && this.minutes(t.start) <= this.minutes(start) && this.minutes(t.end) > this.minutes(start))) return;
    this.editor.set({ id: '', name: '', category: 'NeedBased', day, start, end: this.toTime(this.minutes(start) + 15), notes: '', status: 'Planned' });
  }

  edit(task: PlannerTask): void { this.editor.set({ ...task }); }
  closeEditor(): void { this.editor.set(null); }

  saveTask(): void {
    const draft = this.editor();
    const selected = this.week();
    if (!draft || !selected || !draft.name.trim() || this.minutes(draft.end) <= this.minutes(draft.start)) return;
    if (this.minutes(draft.start) < 450 || this.minutes(draft.end) > 990 || this.minutes(draft.start) % 15 || this.minutes(draft.end) % 15) {
      this.message.set('Tasks must fit within 07:30 AM - 04:30 PM on 15-minute intervals.'); return;
    }
    const conflict = selected.tasks.some(t => t.id !== draft.id && t.day === draft.day && this.minutes(t.start) < this.minutes(draft.end) && this.minutes(t.end) > this.minutes(draft.start));
    if (conflict) { this.message.set('That time overlaps another task.'); return; }
    draft.category = draft.category === 'Fixed' ? 'Fixed' : 'NeedBased';
    const id = draft.id || crypto.randomUUID();
    draft.id = id;
    const index = selected.tasks.findIndex(t => t.id === draft.id);
    if (index >= 0) selected.tasks[index] = { ...draft };
    else selected.tasks.push({ ...draft });
    if (draft.category === 'Fixed' && !this.data().fixedTasks.some(t => t.id === draft.id)) this.data().fixedTasks.push({ ...draft });
    if (draft.category !== 'Fixed') this.data.update(d => ({ ...d, fixedTasks: d.fixedTasks.filter(t => t.id !== draft.id) }));
    this.persist(); this.editor.set(null);
  }

  removeTask(): void {
    const draft = this.editor(); const selected = this.week();
    if (!draft || !selected) return;
    selected.tasks = selected.tasks.filter(t => t.id !== draft.id);
    if (draft.category === 'Fixed') this.data.update(d => ({ ...d, fixedTasks: d.fixedTasks.filter(t => t.id !== draft.id) }));
    this.persist(); this.editor.set(null);
  }

  runningTask(): PlannerTask | undefined {
    if (!this.isCurrentWeek()) return undefined;
    const current = this.now(); const day = (current.getDay() + 1) % 7;
    const minutes = current.getHours() * 60 + current.getMinutes();
    return this.week()?.tasks.find(t => t.day === day && this.minutes(t.start) <= minutes && this.minutes(t.end) > minutes);
  }

  remaining(task: PlannerTask): string {
    const end = this.minutes(task.end); const now = this.now();
    const left = Math.max(0, end - (now.getHours() * 60 + now.getMinutes()));
    return `${Math.floor(left / 60)}h ${left % 60}m remaining`;
  }

  updateNotes(notes: string): void { const week = this.week(); if (week) { week.notes = notes; this.persist(); } }
  openImportant(task?: ImportantTask): void { this.importantEditor.set(task ? { ...task } : { id: '', name: '', notes: '', status: 'Planned' }); this.showImportant.set(true); }
  saveImportant(): void {
    const item = this.importantEditor(); const week = this.week(); if (!item || !week || !item.name.trim()) return;
    const index = week.importantTasks.findIndex(t => t.id === item.id);
    if (index >= 0) week.importantTasks[index] = { ...item }; else week.importantTasks.push({ ...item, id: crypto.randomUUID() });
    this.persist(); this.showImportant.set(false);
  }
  removeImportant(): void { const item = this.importantEditor(); const week = this.week(); if (item && week) { week.importantTasks = week.importantTasks.filter(t => t.id !== item.id); this.persist(); this.showImportant.set(false); } }
  canReport(): boolean { return !this.isCurrentWeek() || this.now().getDay() === 5 || (this.now().getDay() === 4 && this.now().getHours() >= 16 && this.now().getMinutes() >= 30); }
  downloadReport(): void { this.planner.report(this.selectedWeekStart()).subscribe(blob => { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `weekly-work-planner-${this.selectedWeekStart()}.pdf`; anchor.click(); URL.revokeObjectURL(url); }); }

  private persist(): void {
    this.data.update(d => ({ ...d, weeks: d.weeks.map(w => w.weekStart === this.week()?.weekStart ? this.week()! : w) }));
    this.planner.save(this.data()).subscribe({ error: () => this.message.set('Planner changes could not be saved.') });
  }
  private minutes(value: string): number { const [h, m] = value.split(':').map(Number); return h * 60 + m; }
  private toTime(total: number): string { return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; }
  private iso(date: Date): string { return date.toISOString().slice(0, 10); }
  fromIso(value: string): Date { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d); }
  formatDate(date: Date): string { return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
}

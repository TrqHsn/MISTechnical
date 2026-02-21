import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { CommonModule, DatePipe, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService, SmbBrowseResponse, SmbItem } from '../../services/api';

interface BreadcrumbItem {
  label: string;
  path: string;
}

@Component({
  selector: 'app-smb-browser',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './smb-browser.html',
  styleUrl: './smb-browser.css'
})
export class SmbBrowserComponent implements OnInit, OnDestroy {
  private readonly storageKey = 'smbBrowserLastPath';
  private readonly viewStorageKey = 'smbBrowserViewMode';
  private readonly subscriptions = new Subscription();

  uncPathInput = signal('');
  currentPath = signal('');
  isLoading = signal(false);
  errorMessage = signal('');
  items = signal<SmbItem[]>([]);
  viewMode = signal<'list' | 'grid'>('list');

  breadcrumbs = computed<BreadcrumbItem[]>(() => this.buildBreadcrumbs(this.currentPath()));
  folderItems = computed(() => this.items().filter(i => i.isDirectory));
  fileItems = computed(() => this.items().filter(i => !i.isDirectory));

  constructor(
    private readonly api: ApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly location: Location
  ) {}

  ngOnInit(): void {
    const savedViewMode = this.tryGetStorage(this.viewStorageKey);
    if (savedViewMode === 'list' || savedViewMode === 'grid') {
      this.viewMode.set(savedViewMode);
    }

    const sub = this.route.queryParamMap.subscribe(params => {
      const pathFromQuery = params.get('path')?.trim();
      const viewFromQuery = params.get('view');

      if (viewFromQuery === 'list' || viewFromQuery === 'grid') {
        this.viewMode.set(viewFromQuery);
        this.trySetStorage(this.viewStorageKey, viewFromQuery);
      }

      if (pathFromQuery) {
        this.uncPathInput.set(pathFromQuery);
        this.browse(pathFromQuery);
        return;
      }

      const lastPath = this.tryGetStorage(this.storageKey);
      if (lastPath) {
        this.uncPathInput.set(lastPath);
        this.updateRoute(lastPath, this.viewMode());
      }
    });

    this.subscriptions.add(sub);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  onGo(): void {
    const path = this.uncPathInput().trim();
    if (!path) {
      this.errorMessage.set('Please enter a UNC path.');
      this.items.set([]);
      return;
    }

    this.updateRoute(path, this.viewMode());
  }

  onOpenFolder(item: SmbItem): void {
    if (!item.isDirectory) {
      return;
    }

    this.uncPathInput.set(item.fullPath);
    this.updateRoute(item.fullPath, this.viewMode());
  }

  onBreadcrumbClick(path: string): void {
    this.uncPathInput.set(path);
    this.updateRoute(path, this.viewMode());
  }

  onBack(): void {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      this.location.back();
      return;
    }

    const parent = this.getParentPath(this.currentPath());
    if (parent) {
      this.uncPathInput.set(parent);
      this.updateRoute(parent, this.viewMode());
    }
  }

  setViewMode(mode: 'list' | 'grid'): void {
    if (this.viewMode() === mode) {
      return;
    }

    this.viewMode.set(mode);
    this.trySetStorage(this.viewStorageKey, mode);

    const path = this.currentPath() || this.uncPathInput().trim();
    if (path) {
      this.updateRoute(path, mode);
    }
  }

  downloadFile(item: SmbItem): void {
    if (item.isDirectory || typeof window === 'undefined') {
      return;
    }

    window.open(this.api.getSmbFileDownloadUrl(item.fullPath), '_blank');
  }

  downloadFolder(item?: SmbItem): void {
    if (typeof window === 'undefined') {
      return;
    }

    const targetPath = item?.fullPath || this.currentPath();
    if (!targetPath) {
      return;
    }

    window.open(this.api.getSmbFolderDownloadUrl(targetPath), '_blank');
  }

  formatSize(size: number | null): string {
    if (size === null || size === undefined) {
      return '-';
    }

    if (size === 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = size;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  trackByPath(_index: number, item: SmbItem): string {
    return item.fullPath;
  }

  private browse(path: string): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.api.browseSmb(path).subscribe({
      next: (response: SmbBrowseResponse) => {
        this.currentPath.set(response.path);
        this.uncPathInput.set(response.path);
        this.items.set(response.items || []);
        this.trySetStorage(this.storageKey, response.path);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.items.set([]);
        this.errorMessage.set(this.mapError(err));
      }
    });
  }

  private buildBreadcrumbs(path: string): BreadcrumbItem[] {
    if (!path || !path.startsWith('\\\\')) {
      return [];
    }

    const segments = path.replace(/^\\\\/, '').split('\\').filter(Boolean);
    if (segments.length === 0) {
      return [];
    }

    const breadcrumbs: BreadcrumbItem[] = [];
    let builtPath = '\\\\';

    for (const segment of segments) {
      builtPath = builtPath.endsWith('\\') ? `${builtPath}${segment}` : `${builtPath}\\${segment}`;
      breadcrumbs.push({
        label: segment,
        path: builtPath
      });
    }

    return breadcrumbs;
  }

  private getParentPath(path: string): string | null {
    if (!path || !path.startsWith('\\\\')) {
      return null;
    }

    const segments = path.replace(/^\\\\/, '').split('\\').filter(Boolean);
    if (segments.length <= 1) {
      return null;
    }

    if (segments.length === 2) {
      return `\\\\${segments[0]}`;
    }

    return `\\\\${segments.slice(0, -1).join('\\')}`;
  }

  private updateRoute(path: string, view: 'list' | 'grid'): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { path, view },
      queryParamsHandling: 'replace'
    });
  }

  private mapError(err: any): string {
    const backendMessage = err?.error?.message as string | undefined;
    if (backendMessage) {
      return backendMessage;
    }

    switch (err?.status) {
      case 400:
        return 'Invalid path. Enter a valid UNC path like \\\\server\\share.';
      case 403:
        return 'Access denied for this path.';
      case 404:
        return 'Path not found.';
      case 503:
        return 'Network path is unavailable.';
      default:
        return 'Unable to browse this path.';
    }
  }

  private tryGetStorage(key: string): string {
    if (typeof window === 'undefined') {
      return '';
    }

    return window.localStorage.getItem(key) || '';
  }

  private trySetStorage(key: string, value: string): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(key, value);
  }
}

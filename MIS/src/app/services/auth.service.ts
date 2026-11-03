import { HttpClient, HttpHeaders } from '@angular/common/http';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, catchError, finalize, firstValueFrom, map, of, shareReplay, tap } from 'rxjs';

export interface AuthUser {
  userId: string;
  username: string;
  displayName: string;
  roles: string[];
  permissions: Record<string, string>;
}

interface AuthResponse {
  accessToken: string;
  expiresAtUtc: string;
  sessionExpiresAtUtc: string;
  user: AuthUser;
}

const apiBaseUrl = (): string => {
  if (typeof window === 'undefined') {
    return 'http://localhost:5001/api';
  }
  const { protocol, hostname, port } = window.location;
  return port === '4200'
    ? `${protocol}//${hostname}:5001/api`
    : `${protocol}//${hostname}${port ? `:${port}` : ''}/api`;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly apiUrl = apiBaseUrl();
  private readonly userState = signal<AuthUser | null>(null);
  private accessTokenValue: string | null = null;
  private accessTokenExpiresAt = 0;
  private refreshRequest?: Observable<AuthResponse>;

  readonly user = this.userState.asReadonly();
  readonly isAuthenticated = computed(() => this.userState() !== null && this.accessTokenValue !== null);

  get accessToken(): string | null {
    return this.accessTokenValue;
  }

  login(username: string, password: string): Observable<AuthUser> {
    return this.http.post<AuthResponse>(
      `${this.apiUrl}/auth/login`,
      { username, password },
      { withCredentials: true }
    ).pipe(
      tap(response => this.applyResponse(response)),
      map(response => response.user)
    );
  }

  refreshOnce(): Observable<AuthResponse> {
    if (!this.refreshRequest) {
      const headers = this.csrfHeader();
      this.refreshRequest = this.http.post<AuthResponse>(
        `${this.apiUrl}/auth/refresh`,
        {},
        { headers, withCredentials: true }
      ).pipe(
        tap(response => this.applyResponse(response)),
        finalize(() => {
          this.refreshRequest = undefined;
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }
    return this.refreshRequest;
  }

  async ensureAuthenticated(): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId)) {
      return true;
    }
    if (this.hasUsableAccessToken()) {
      return true;
    }
    return firstValueFrom(this.refreshOnce().pipe(
      map(() => true),
      catchError(() => {
        this.clearLocalSession();
        return of(false);
      })
    ));
  }

  async authorizedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    if (!await this.ensureAuthenticated()) {
      throw new Error('Authentication is required for this request.');
    }

    const request = async (): Promise<Response> => {
      const headers = new Headers(init.headers);
      if (this.accessTokenValue) {
        headers.set('Authorization', ['Bearer ', this.accessTokenValue].join(''));
      }
      return fetch(input, { ...init, headers, credentials: 'include' });
    };

    const response = await request();
    if (response.status !== 401) {
      return response;
    }

    try {
      await firstValueFrom(this.refreshOnce());
      return await request();
    } catch (error) {
      this.clearLocalSession();
      throw error;
    }
  }

  canAccess(permission: string): boolean {
    const user = this.userState();
    if (!user) {
      return false;
    }
    if (user.roles.includes('Admin')) {
      return true;
    }
    const level = user.permissions[permission];
    return level === 'View' || level === 'Full';
  }

  hasRole(role: string): boolean {
    return this.userState()?.roles.some(userRole => userRole.toLowerCase() === role.toLowerCase()) ?? false;
  }

  getDefaultHomeRoute(): string {
    return this.hasRole('RestrictedUser') ? '/sinage' : '/ad-tools';
  }

  logout(): Observable<void> {
    const request = isPlatformBrowser(this.platformId)
      ? this.http.post<void>(
        `${this.apiUrl}/auth/logout`,
        {},
        { headers: this.csrfHeader(), withCredentials: true }
      )
      : of(undefined);

    return request.pipe(finalize(() => this.clearLocalSession()));
  }

  clearLocalSession(): void {
    this.accessTokenValue = null;
    this.accessTokenExpiresAt = 0;
    this.userState.set(null);
  }

  private applyResponse(response: AuthResponse): void {
    this.accessTokenValue = response.accessToken;
    this.accessTokenExpiresAt = Date.parse(response.expiresAtUtc);
    this.userState.set(response.user);
  }

  private hasUsableAccessToken(): boolean {
    return this.accessTokenValue !== null && this.accessTokenExpiresAt > Date.now() + 30_000;
  }

  private csrfHeader(): HttpHeaders {
    if (!isPlatformBrowser(this.platformId)) {
      return new HttpHeaders();
    }
    const token = document.cookie
      .split(';')
      .map(value => value.trim())
      .find(value => value.startsWith('ADApi.Csrf='))
      ?.slice('ADApi.Csrf='.length);
    return token ? new HttpHeaders({ 'X-CSRF-Token': token }) : new HttpHeaders();
  }
}

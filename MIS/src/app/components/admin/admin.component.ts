import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';

interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  isActive: boolean;
  roles: string[];
  createdAtUtc: string;
  lastLoginAtUtc: string | null;
}

interface PermissionEntry {
  permissionId: string;
  description: string;
  effectiveLevel: string;
  userOverride: string | null;
}

interface Dashboard {
  totalUsers: number;
  activeUsers: number;
  disabledUsers: number;
  recentLogins: { id: number; username: string; succeeded: boolean; occurredAtUtc: string }[];
  recentAuditEvents: { id: number; action: string; occurredAtUtc: string; details: string | null }[];
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

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <main class="admin-page">
      <header class="admin-header">
        <div>
          <h1>Administration</h1>
          <p>Manage application accounts, roles, and component access.</p>
        </div>
        <button type="button" (click)="reload()">Refresh</button>
      </header>

      @if (error()) {
        <p class="notice error" role="alert">{{ error() }}</p>
      }
      @if (message()) {
        <p class="notice success" role="status">{{ message() }}</p>
      }

      @if (dashboard(); as summary) {
        <section class="summary-grid" aria-label="User summary">
          <article><strong>{{ summary.totalUsers }}</strong><span>Total users</span></article>
          <article><strong>{{ summary.activeUsers }}</strong><span>Active</span></article>
          <article><strong>{{ summary.disabledUsers }}</strong><span>Disabled</span></article>
        </section>
      }

      <section class="admin-card">
        <div class="section-heading">
          <div>
            <h2>Role permissions</h2>
            <p>Changes apply to requests immediately. Admin access is managed by the Admin role and cannot be edited here.</p>
          </div>
          <select aria-label="Select role" [ngModel]="selectedRole()"
            (ngModelChange)="selectRole($event)">
            @for (role of editableRoles; track role) {
              <option [value]="role">{{ role }}</option>
            }
          </select>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Component</th><th>Current role grant</th><th>Set grant</th><th>Save</th></tr></thead>
            <tbody>
              @for (permission of rolePermissions(); track permission.permissionId) {
                <tr>
                  <td>{{ permission.description }} <small>({{ permission.permissionId }})</small></td>
                  <td>{{ permission.effectiveLevel }}</td>
                  <td>
                    <select [value]="permission.effectiveLevel"
                      (change)="setPendingRoleLevel(permission.permissionId, $any($event.target).value)">
                      <option value="None">None</option>
                      <option value="View">View</option>
                      <option value="Full">Full</option>
                    </select>
                  </td>
                  <td><button type="button" (click)="saveRolePermission(permission)">Save</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="admin-card">
        <h2>Create account</h2>
        <form class="create-form" (ngSubmit)="createUser()">
          <label>Username<input name="newUsername" [(ngModel)]="newUsername" required maxlength="100"></label>
          <label>Display name<input name="newDisplayName" [(ngModel)]="newDisplayName" required maxlength="200"></label>
          <label>Temporary password<input name="newPassword" [(ngModel)]="newPassword"
            type="password" autocomplete="new-password" minlength="8" required></label>
          <label>Role
            <select name="newRole" [(ngModel)]="newRole">
              @for (role of assignableRoles; track role) {
                <option [value]="role">{{ role }}</option>
              }
            </select>
          </label>
          <button type="submit" [disabled]="saving()">Create user</button>
        </form>
      </section>

      <section class="admin-card">
        <div class="section-heading">
          <h2>Users</h2>
          <input aria-label="Search users" placeholder="Search username or display name"
            [ngModel]="search()" (ngModelChange)="search.set($event)">
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Username</th><th>Display name</th><th>Status</th><th>Assigned roles</th><th>Replace roles</th><th>Last login</th><th>Actions</th></tr></thead>
            <tbody>
              @for (user of filteredUsers(); track user.id) {
                <tr>
                  <td>{{ user.username }}</td>
                  <td>{{ user.displayName }}</td>
                  <td>{{ user.isActive ? 'Active' : 'Disabled' }}</td>
                  <td>{{ user.roles.length ? user.roles.join(', ') : 'No role assigned' }}</td>
                  <td>
                    <select [ngModel]="user.roles.length === 1 ? user.roles[0] : ''"
                      [ngModelOptions]="{ standalone: true }"
                      [disabled]="saving() || user.id === currentUserId()"
                      (ngModelChange)="changeRole(user, $event)">
                      <option value="" disabled>
                        {{ user.roles.length > 1 ? 'Multiple roles assigned' : 'Select a role' }}
                      </option>
                      @for (role of assignableRoles; track role) {
                        <option [ngValue]="role">{{ role }}</option>
                      }
                    </select>
                  </td>
                  <td>{{ user.lastLoginAtUtc ? (user.lastLoginAtUtc | date:'short') : 'Never' }}</td>
                  <td class="actions">
                    <button type="button" (click)="toggleActive(user)">
                      {{ user.isActive ? 'Deactivate' : 'Activate' }}
                    </button>
                    <button type="button" (click)="selectUser(user)">Permissions</button>
                    <button type="button" (click)="revokeSessions(user)">Revoke sessions</button>
                    <button type="button" (click)="resetPassword(user)">Reset password</button>
                    <button type="button" class="danger"
                      [disabled]="saving() || user.id === currentUserId()"
                      (click)="deleteUser(user)">Delete user</button>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="7">No users found.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      @if (selectedUser(); as selected) {
        <section class="admin-card">
          <div class="section-heading">
            <div>
              <h2>Component permissions: {{ selected.username }}</h2>
              <p>Choose None to explicitly deny, Inherit to remove the user override, or grant View/Full.</p>
            </div>
            <button type="button" (click)="selectedUser.set(null)">Close</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Component</th><th>Effective</th><th>User override</th><th>Save</th></tr></thead>
              <tbody>
                @for (permission of permissions(); track permission.permissionId) {
                  <tr>
                    <td>{{ permission.description }} <small>({{ permission.permissionId }})</small></td>
                    <td>{{ permission.effectiveLevel }}</td>
                    <td>
                      <select [value]="permission.userOverride ?? 'Inherit'"
                        (change)="setPendingLevel(permission.permissionId, $any($event.target).value)">
                        <option value="Inherit">Inherit</option>
                        <option value="None">None</option>
                        <option value="View">View</option>
                        <option value="Full">Full</option>
                      </select>
                    </td>
                    <td><button type="button" (click)="savePermission(permission)">Save</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      <section class="admin-card">
        <h2>Recent login activity</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Username</th><th>Result</th></tr></thead>
            <tbody>
              @for (entry of dashboard()?.recentLogins ?? []; track entry.id) {
                <tr><td>{{ entry.occurredAtUtc | date:'short' }}</td><td>{{ entry.username }}</td><td>{{ entry.succeeded ? 'Success' : 'Failed' }}</td></tr>
              } @empty {
                <tr><td colspan="3">No login activity yet.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="admin-card">
        <h2>Recent administrative activity</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>
              @for (entry of dashboard()?.recentAuditEvents ?? []; track entry.id) {
                <tr><td>{{ entry.occurredAtUtc | date:'short' }}</td><td>{{ entry.action }}</td><td>{{ entry.details }}</td></tr>
              } @empty {
                <tr><td colspan="3">No administrative activity yet.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    </main>
  `,
  styles: [`
    :host { display: block; }
    .admin-page { max-width: 1200px; margin: 0 auto; padding: 1.5rem; color: #202b38; }
    .admin-header, .section-heading { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
    .admin-header h1, .admin-card h2 { margin: 0 0 .4rem; }
    .admin-card { margin: 1.25rem 0; padding: 1.25rem; border-radius: 10px; background: #fff; box-shadow: 0 3px 14px #0001; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; margin-top: 1.25rem; }
    .summary-grid article { display: grid; gap: .3rem; padding: 1rem; border-radius: 8px; background: #eef4fa; }
    .summary-grid strong { font-size: 1.7rem; }
    .create-form { display: flex; flex-wrap: wrap; align-items: end; gap: .8rem; margin-top: 1rem; }
    label { display: grid; gap: .35rem; }
    input, select, button { padding: .5rem .65rem; }
    .section-heading input { min-width: min(24rem, 55vw); }
    .table-wrap { overflow-x: auto; margin-top: .8rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: .65rem; text-align: left; border-bottom: 1px solid #e4e9ef; vertical-align: middle; }
    .actions { display: flex; flex-wrap: wrap; gap: .35rem; }
    button { cursor: pointer; }
    button:disabled { cursor: not-allowed; opacity: .6; }
    .danger { color: #8d1717; }
    .notice { padding: .75rem; border-radius: 6px; }
    .error { color: #8d1717; background: #ffeded; }
    .success { color: #1d5e28; background: #eaf8ed; }
    @media (max-width: 700px) {
      .admin-page { padding: .75rem; }
      .admin-header, .section-heading { align-items: stretch; flex-direction: column; }
      .summary-grid { gap: .5rem; }
      .summary-grid article { padding: .7rem; }
    }
  `]
})
export class AdminComponent {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${apiBaseUrl()}/admin`;

  readonly assignableRoles = ['RestrictedUser', 'FullAccess', 'Manager', 'Admin'];
  readonly editableRoles = ['RestrictedUser', 'FullAccess', 'Manager'];
  readonly users = signal<AdminUser[]>([]);
  readonly dashboard = signal<Dashboard | null>(null);
  readonly selectedUser = signal<AdminUser | null>(null);
  readonly permissions = signal<PermissionEntry[]>([]);
  readonly rolePermissions = signal<PermissionEntry[]>([]);
  readonly selectedRole = signal('RestrictedUser');
  readonly search = signal('');
  readonly saving = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly currentUserId = signal('');
  readonly filteredUsers = computed(() => {
    const query = this.search().trim().toLowerCase();
    return this.users().filter(user =>
      !query || user.username.toLowerCase().includes(query) || user.displayName.toLowerCase().includes(query)
    );
  });

  newUsername = '';
  newDisplayName = '';
  newPassword = '';
  newRole = 'RestrictedUser';
  private readonly pendingLevels = new Map<string, string>();
  private readonly pendingRoleLevels = new Map<string, string>();

  constructor() {
    this.reload();
    this.selectRole(this.selectedRole());
  }

  reload(): void {
    this.error.set('');
    this.http.get<Dashboard>(`${this.apiUrl}/dashboard`).subscribe({
      next: value => {
        this.dashboard.set(value);
        this.error.set('');
      },
      error: error => this.error.set(this.loadError('the administration dashboard', error))
    });
    this.http.get<AdminUser[]>(`${this.apiUrl}/users`).subscribe({
      next: value => this.users.set(value),
      error: error => this.error.set(this.loadError('users', error))
    });
    this.http.get<{ userId: string }>(`${apiBaseUrl()}/auth/me`).subscribe({
      next: value => this.currentUserId.set(value.userId)
    });
  }

  createUser(): void {
    this.runAction(this.http.post<AdminUser>(`${this.apiUrl}/users`, {
      username: this.newUsername,
      displayName: this.newDisplayName,
      initialPassword: this.newPassword,
      role: this.newRole
    }), 'User created.', () => {
      this.newUsername = '';
      this.newDisplayName = '';
      this.newPassword = '';
      this.reload();
    });
  }

  changeRole(user: AdminUser, role: string): void {
    if (user.roles.includes('Admin') && role !== 'Admin') {
      const confirmed = typeof window !== 'undefined'
        && window.confirm(`Remove administrator access from ${user.username}?`);
      if (!confirmed) {
        this.reload();
        return;
      }
    }
    this.runAction(
      this.http.put<AdminUser>(`${this.apiUrl}/users/${encodeURIComponent(user.id)}/role`, { role }),
      `Role set to ${role}; previous roles were replaced and the user’s sessions were revoked.`,
      () => this.reload()
    );
  }

  toggleActive(user: AdminUser): void {
    this.runAction(
      this.http.put<AdminUser>(`${this.apiUrl}/users/${encodeURIComponent(user.id)}`, {
        displayName: user.displayName,
        isActive: !user.isActive
      }),
      user.isActive ? 'User deactivated.' : 'User activated.',
      () => this.reload()
    );
  }

  selectUser(user: AdminUser): void {
    this.selectedUser.set(user);
    this.pendingLevels.clear();
    this.http.get<PermissionEntry[]>(
      `${this.apiUrl}/users/${encodeURIComponent(user.id)}/permissions`
    ).subscribe({
      next: value => this.permissions.set(value),
      error: () => this.error.set('Unable to load component permissions.')
    });
  }

  setPendingLevel(permissionId: string, level: string): void {
    this.pendingLevels.set(permissionId, level);
  }

  selectRole(role: string): void {
    this.selectedRole.set(role);
    this.pendingRoleLevels.clear();
    this.http.get<PermissionEntry[]>(`${this.apiUrl}/roles/${encodeURIComponent(role)}/permissions`)
      .subscribe({
        next: value => this.rolePermissions.set(value),
        error: () => this.error.set('Unable to load role permissions.')
      });
  }

  setPendingRoleLevel(permissionId: string, level: string): void {
    this.pendingRoleLevels.set(permissionId, level);
  }

  saveRolePermission(permission: PermissionEntry): void {
    const level = this.pendingRoleLevels.get(permission.permissionId);
    if (!level) {
      return;
    }

    this.runAction(
      this.http.put<void>(
        `${this.apiUrl}/roles/${encodeURIComponent(this.selectedRole())}/permissions/${encodeURIComponent(permission.permissionId)}`,
        { level }
      ),
      'Role permission saved.',
      () => this.selectRole(this.selectedRole())
    );
  }

  savePermission(permission: PermissionEntry): void {
    const selected = this.selectedUser();
    const level = this.pendingLevels.get(permission.permissionId);
    if (!selected || !level) {
      return;
    }

    const url = `${this.apiUrl}/users/${encodeURIComponent(selected.id)}/permissions/${encodeURIComponent(permission.permissionId)}`;
    const request = level === 'Inherit'
      ? this.http.delete<void>(url)
      : this.http.put<PermissionEntry>(url, { level });
    this.runAction(request, 'Permission saved.', () => this.selectUser(selected));
  }

  revokeSessions(user: AdminUser): void {
    this.runAction(
      this.http.delete<void>(`${this.apiUrl}/users/${encodeURIComponent(user.id)}/sessions`),
      `Sessions revoked for ${user.username}.`
    );
  }

  resetPassword(user: AdminUser): void {
    const password = typeof window !== 'undefined'
      ? window.prompt(`Enter a temporary password for ${user.username} (at least 8 characters):`)
      : null;
    if (password === null) {
      return;
    }
    this.runAction(
      this.http.post<void>(
        `${this.apiUrl}/users/${encodeURIComponent(user.id)}/reset-password`,
        { newPassword: password }
      ),
      'Password reset and active sessions revoked.'
    );
  }

  deleteUser(user: AdminUser): void {
    const confirmed = typeof window !== 'undefined'
      && window.confirm(`Permanently delete "${user.username}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    this.runAction(
      this.http.delete<void>(`${this.apiUrl}/users/${encodeURIComponent(user.id)}`),
      `User "${user.username}" deleted.`,
      () => {
        if (this.selectedUser()?.id === user.id) {
          this.selectedUser.set(null);
          this.permissions.set([]);
        }
        this.reload();
      }
    );
  }

  private runAction<T>(
    request: Observable<unknown>,
    successMessage: string,
    onSuccess?: () => void
  ): void {
    this.saving.set(true);
    this.error.set('');
    this.message.set('');
    request.subscribe({
      next: () => {
        this.message.set(successMessage);
        onSuccess?.();
      },
      error: error => {
        this.error.set(error?.error?.title ?? error?.error?.detail ?? 'The requested operation failed.');
        this.saving.set(false);
      },
      complete: () => this.saving.set(false)
    });
  }

  private loadError(resource: string, error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return `Unable to load ${resource}.`;
    }

    if (error.status === 401) {
      return `Unable to load ${resource}: your session is no longer valid. Sign in again.`;
    }
    if (error.status === 403) {
      return `Unable to load ${resource}: access was denied (HTTP 403). Confirm this account has the Admin role, then sign in again.`;
    }
    if (error.status === 0) {
      return `Unable to load ${resource}: the API could not be reached.`;
    }
    return `Unable to load ${resource} (HTTP ${error.status}). Check the API logs for details.`;
  }
}

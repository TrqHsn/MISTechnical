import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-access-denied',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="access-denied">
      <h1>Access denied</h1>
      <p>Your account does not have permission to open this page.</p>
      <a routerLink="/ad-tools">Return to the application</a>
    </main>
  `,
  styles: [`
    .access-denied { max-width: 40rem; margin: 8vh auto; padding: 2rem; text-align: center; }
  `]
})
export class AccessDeniedComponent {}

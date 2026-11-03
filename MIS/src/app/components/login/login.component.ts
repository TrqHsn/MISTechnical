import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <main class="auth-page">
      <div class="auth-background" aria-hidden="true">
        <span class="shape"></span>
        <span class="shape"></span>
      </div>
      <form class="auth-card" (ngSubmit)="submit()">
        <h1>Sign in</h1>
        <label for="username">Username</label>
        <input id="username" name="username" type="text" placeholder="Username"
          [(ngModel)]="username" autocomplete="username" required>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" placeholder="Password"
          [(ngModel)]="password" autocomplete="current-password" required>
        @if (error()) {
          <p class="auth-error" role="alert">{{ error() }}</p>
        }
        <button type="submit" [disabled]="loading()">
          {{ loading() ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
    </main>
  `,
  styles: [`
    :host { font-family: Poppins, "Segoe UI", sans-serif; }
    .auth-page {
      position: fixed;
      inset: 0;
      min-height: 100vh;
      min-height: 100svh;
      display: grid;
      place-items: center;
      padding: 1.25rem;
      overflow: auto;
      box-sizing: border-box;
      isolation: isolate;
      background: #080710;
      color: #fff;
    }
    .auth-background {
      position: absolute;
      width: min(430px, calc(100vw - 3rem));
      height: min(520px, calc(100svh - 3rem));
      z-index: -1;
      pointer-events: none;
    }
    .shape {
      position: absolute;
      width: 200px;
      height: 200px;
      border-radius: 50%;
    }
    .shape:first-child {
      top: 0;
      left: -3rem;
      background: linear-gradient(#1845ad, #23a2f6);
    }
    .shape:last-child {
      right: -1rem;
      bottom: 0;
      background: linear-gradient(to right, #ff512f, #f09819);
    }
    .auth-card {
      display: grid;
      width: min(100%, 400px);
      padding: 2.5rem 2.2rem;
      box-sizing: border-box;
      border: 2px solid rgb(255 255 255 / 10%);
      border-radius: 10px;
      background: rgb(255 255 255 / 13%);
      backdrop-filter: blur(10px);
      box-shadow: 0 0 40px rgb(8 7 16 / 60%);
    }
    h1 {
      margin: 0 0 1.25rem;
      font-size: 2rem;
      font-weight: 600;
      line-height: 1.35;
      letter-spacing: .5px;
      text-align: center;
    }
    label {
      display: block;
      margin-top: 1rem;
      font-size: 1rem;
      font-weight: 500;
      letter-spacing: .5px;
    }
    input {
      width: 100%;
      height: 50px;
      margin-top: .5rem;
      padding: 0 .75rem;
      box-sizing: border-box;
      border: 1px solid rgb(255 255 255 / 15%);
      border-radius: 4px;
      background: rgb(255 255 255 / 7%);
      color: #fff;
      font: inherit;
      font-size: .9rem;
      font-weight: 300;
      letter-spacing: .3px;
    }
    input::placeholder { color: #e5e5e5; opacity: .8; }
    input:focus-visible, button:focus-visible {
      outline: 2px solid #8cc9ff;
      outline-offset: 3px;
    }
    button {
      width: 100%;
      margin-top: 2rem;
      padding: .9rem 0;
      border: 0;
      border-radius: 5px;
      background: #fff;
      color: #080710;
      font: inherit;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
    }
    button:disabled { cursor: wait; opacity: .75; }
    .auth-error {
      margin: 1rem 0 0;
      color: #ffe1e1;
      font-size: .9rem;
    }
    @media (max-width: 480px) {
      .auth-card { padding: 2rem 1.5rem; }
      .shape { width: 150px; height: 150px; }
      .shape:first-child { left: -1.5rem; }
      .shape:last-child { right: -.5rem; }
    }
  `]
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  username = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal('');

  submit(): void {
    this.loading.set(true);
    this.error.set('');
    this.auth.login(this.username, this.password).subscribe({
      next: () => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        const destination = this.auth.hasRole('RestrictedUser')
          ? this.auth.getDefaultHomeRoute()
          : returnUrl?.startsWith('/') && !returnUrl.startsWith('//')
            ? returnUrl
            : this.auth.getDefaultHomeRoute();
        void this.router.navigateByUrl(destination);
      },
      error: () => {
        this.error.set('Sign-in failed. Check your credentials or contact an administrator.');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false)
    });
  }
}

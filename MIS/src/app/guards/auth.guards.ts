import { inject } from '@angular/core';
import { CanActivateFn, CanActivateChildFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn | CanActivateChildFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (await auth.ensureAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const homeRedirectGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!await auth.ensureAuthenticated()) {
    return router.createUrlTree(['/login']);
  }
  return router.createUrlTree([auth.getDefaultHomeRoute()]);
};

export const permissionGuard: CanActivateFn = route => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const permission = route.data['permission'] as string | undefined;
  return !permission || auth.canAccess(permission)
    ? true
    : router.createUrlTree(['/access-denied']);
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.hasRole('Admin')
    ? true
    : router.createUrlTree(['/access-denied']);
};

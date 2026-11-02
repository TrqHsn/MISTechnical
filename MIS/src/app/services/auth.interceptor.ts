import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const isPublicAuthEndpoint = /\/api\/auth\/(?:login|refresh|logout)(?:[/?#]|$)/.test(request.url);
  if (!request.url.includes('/api/') || isPublicAuthEndpoint) {
    return next(request);
  }

  const authorizedRequest = request.clone({
    withCredentials: true,
    setHeaders: auth.accessToken ? { Authorization: ['Bearer ', auth.accessToken].join('') } : {}
  });

  return next(authorizedRequest).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }

      return auth.refreshOnce().pipe(
        switchMap(() => next(request.clone({
          withCredentials: true,
          setHeaders: auth.accessToken ? { Authorization: ['Bearer ', auth.accessToken].join('') } : {}
        }))),
        catchError(refreshError => {
          auth.clearLocalSession();
          return throwError(() => refreshError);
        })
      );
    })
  );
};

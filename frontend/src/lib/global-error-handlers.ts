import { toast } from 'sonner';

/**
 * Window-level safety net. Async errors that escape try/catch (a
 * fire-and-forget promise without a `.catch`, a setTimeout that throws,
 * etc.) otherwise fall straight to the browser console — invisible to the
 * user and unrecoverable for the app. We toast a generic message and log
 * the payload so at least something surfaces. When the APM hook lands
 * (Phase 2), this is where `Sentry.captureException` plugs in.
 *
 * The React error boundary handles render-phase throws; this covers the
 * async paths the boundary can't see.
 */

let installed = false;

const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
  // eslint-disable-next-line no-console
  console.error('[unhandledrejection]', event.reason);
  toast.error('Something unexpected happened. Please try again.');
};

const onError = (event: ErrorEvent): void => {
  // eslint-disable-next-line no-console
  console.error('[window.error]', event.error ?? event.message, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
  toast.error('Something unexpected happened. Please try again.');
};

export const installGlobalErrorHandlers = (): void => {
  // Idempotent — Vite HMR re-runs main.tsx in dev; doubling listeners would
  // toast every error twice.
  if (installed) return;
  installed = true;
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  window.addEventListener('error', onError);
};

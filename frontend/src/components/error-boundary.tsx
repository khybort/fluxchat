import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MaterialIcon } from '@/components/ui/material-icon';

interface Props {
  children: ReactNode;
  /** Optional override for the fallback UI — useful for nested boundaries
   *  that want a more compact card inline. */
  fallback?: (state: { error: Error; reset: () => void }) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * React error boundary. Catches render-phase + lifecycle throws so a single
 * broken component doesn't white-out the entire app.
 *
 * `componentDidCatch` logs to the console for now; when an APM lands
 * (Phase 2), this is the hook point for `Sentry.captureException(error,
 * { contexts: { componentStack } })`.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = { error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  public override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback({ error, reset: this.reset });
    }

    return <DefaultFallback error={error} onReset={this.reset} />;
  }
}

const DefaultFallback = ({
  error,
  onReset,
}: {
  error: Error;
  onReset: () => void;
}): React.JSX.Element => {
  const copyDetails = (): void => {
    const payload = `${error.name}: ${error.message}\n\n${error.stack ?? '(no stack)'}`;
    void navigator.clipboard.writeText(payload).catch(() => undefined);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-2 text-error">
            <MaterialIcon name="error" className="h-5 w-5" />
            <CardTitle>Something went wrong</CardTitle>
          </div>
          <CardDescription>
            The page hit an unexpected error. Reloading usually clears it. If it keeps happening,
            copy the details and share them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="max-h-40 overflow-auto rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            {error.message}
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => window.location.reload()}>
              <MaterialIcon name="refresh" className="h-4 w-4" />
              Reload page
            </Button>
            <Button variant="outline" onClick={onReset}>
              Try again
            </Button>
            <Button variant="ghost" onClick={copyDetails}>
              <MaterialIcon name="content_copy" className="h-4 w-4" />
              Copy details
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

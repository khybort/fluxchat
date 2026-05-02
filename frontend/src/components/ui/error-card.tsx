import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MaterialIcon } from '@/components/ui/material-icon';

interface ErrorCardProps {
  /** Headline shown to the user (e.g. "Couldn't load chat history"). */
  title?: string;
  /** Detail message — usually the API error's `.message`. */
  message: string;
  /** Optional retry callback. When provided, renders a "Retry" button. */
  onRetry?: () => void;
  /** Compact variant collapses padding; for in-page card slots. */
  variant?: 'default' | 'compact';
}

/**
 * Generic in-page error surface. Use when a hook fetch fails and you want
 * to replace the loading skeleton or empty state with something the user
 * can actually act on. Distinct from the global ErrorBoundary, which
 * catches render-phase throws — this is for caught network/API failures.
 */
export const ErrorCard = ({
  title = 'Something went wrong',
  message,
  onRetry,
  variant = 'default',
}: ErrorCardProps): React.JSX.Element => {
  const compact = variant === 'compact';
  return (
    <Card className={compact ? 'mx-auto max-w-md' : 'mx-auto max-w-lg'}>
      <CardHeader className={compact ? 'p-4' : undefined}>
        <div className="flex items-center gap-2 text-error">
          <MaterialIcon name="error" className="h-5 w-5" />
          <CardTitle className={compact ? 'text-base' : undefined}>{title}</CardTitle>
        </div>
        <CardDescription className="text-xs">{message}</CardDescription>
      </CardHeader>
      {onRetry ? (
        <CardContent className={compact ? 'p-4 pt-0' : undefined}>
          <Button size="sm" variant="outline" onClick={onRetry}>
            <MaterialIcon name="refresh" className="h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
};

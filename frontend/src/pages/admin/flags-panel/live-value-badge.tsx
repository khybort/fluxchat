import { cn } from '@/lib/utils';

interface LiveValueBadgeProps {
  value: boolean | number;
}

export const LiveValueBadge = ({ value }: LiveValueBadgeProps): React.JSX.Element => {
  if (typeof value === 'boolean') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide',
          value ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground',
        )}
      >
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            value ? 'bg-success' : 'bg-muted-foreground/60',
          )}
        />
        {value ? 'on' : 'off'}
      </span>
    );
  }
  return (
    <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums">
      {value}
    </span>
  );
};

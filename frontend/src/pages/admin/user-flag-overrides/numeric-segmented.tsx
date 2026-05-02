import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import type { OverrideRow } from '../user-flag-overrides-row';

interface NumericSegmentedProps {
  label: string;
  row: OverrideRow;
  disabled: boolean;
  onChange: (partial: { enabled?: boolean; value?: boolean | number }) => void;
}

export const NumericSegmented = ({
  label,
  row,
  disabled,
  onChange,
}: NumericSegmentedProps): React.JSX.Element => {
  const isCustom = row.enabled;
  const numericValue = typeof row.value === 'number' ? row.value : 0;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex h-8 w-full items-center rounded-md border bg-muted p-0.5 text-xs',
        disabled ? 'cursor-not-allowed' : '',
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={!isCustom}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        tabIndex={!isCustom ? 0 : -1}
        onClick={() => !disabled && onChange({ enabled: false })}
        className={cn(
          'flex-1 rounded-sm px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          !isCustom
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
          disabled ? 'cursor-not-allowed opacity-60' : '',
        )}
      >
        Inherit
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={isCustom}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        tabIndex={isCustom ? 0 : -1}
        onClick={() => !disabled && onChange({ enabled: true, value: numericValue })}
        className={cn(
          'flex-1 rounded-sm px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isCustom
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
          disabled ? 'cursor-not-allowed opacity-60' : '',
        )}
      >
        Custom
      </button>
      <Input
        type="number"
        value={numericValue}
        onChange={(e) => onChange({ enabled: true, value: Number(e.target.value) })}
        disabled={disabled || !isCustom}
        aria-label={`${label} custom value`}
        className="ml-1 h-7 w-16 text-xs"
      />
    </div>
  );
};

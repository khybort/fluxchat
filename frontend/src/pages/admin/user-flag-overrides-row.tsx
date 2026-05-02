import type { FlagDefinition, FlagName } from '@/api/types';
import { cn } from '@/lib/utils';

import { BoolSegmented } from './user-flag-overrides/bool-segmented';
import { NumericSegmented } from './user-flag-overrides/numeric-segmented';

export type RowState = 'inherit' | 'on' | 'off' | 'custom';

export interface OverrideRow {
  enabled: boolean;
  value: boolean | number;
  initial: { enabled: boolean; value: boolean | number };
}

interface FlagRowProps {
  flag: FlagName;
  row: OverrideRow;
  definition: FlagDefinition;
  isNumeric: boolean;
  disabled: boolean;
  onChange: (partial: { enabled?: boolean; value?: boolean | number }) => void;
}

export const FlagRow = ({
  flag,
  row,
  definition,
  isNumeric,
  disabled,
  onChange,
}: FlagRowProps): React.JSX.Element => (
  <li
    className={cn(
      'rounded-md border bg-card p-3 transition-colors',
      row.enabled && !disabled ? 'border-primary/40 bg-primary/[0.04]' : '',
      disabled ? 'opacity-60' : '',
    )}
  >
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <code className="text-sm font-semibold">{flag}</code>
        <p className="text-xs text-muted-foreground">
          base default: <span className="font-mono">{String(definition.default)}</span>
        </p>
      </div>
      <div className={isNumeric ? 'w-56' : 'w-44'}>
        {isNumeric ? (
          <NumericSegmented
            label={`${flag} override`}
            row={row}
            disabled={disabled}
            onChange={onChange}
          />
        ) : (
          <BoolSegmented
            label={`${flag} override`}
            row={row}
            disabled={disabled}
            onChange={onChange}
          />
        )}
      </div>
    </div>
  </li>
);

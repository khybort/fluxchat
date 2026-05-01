import { useRef } from 'react';

import type { FlagDefinition, FlagName } from '@/api/types';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

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

const BOOL_STATES: Array<{ key: RowState; label: string }> = [
  { key: 'inherit', label: 'Inherit' },
  { key: 'on', label: 'On' },
  { key: 'off', label: 'Off' },
];

const boolStateOf = (row: OverrideRow): RowState => {
  if (!row.enabled) return 'inherit';
  return row.value === true ? 'on' : 'off';
};

const BoolSegmented = ({
  label,
  row,
  disabled,
  onChange,
}: {
  label: string;
  row: OverrideRow;
  disabled: boolean;
  onChange: (partial: { enabled?: boolean; value?: boolean | number }) => void;
}): React.JSX.Element => {
  const current = boolStateOf(row);
  const groupRef = useRef<HTMLDivElement>(null);

  const select = (state: RowState): void => {
    if (disabled) return;
    if (state === 'inherit') onChange({ enabled: false });
    else onChange({ enabled: true, value: state === 'on' });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) return;
    const idx = BOOL_STATES.findIndex((s) => s.key === current);
    if (idx < 0) return;
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % BOOL_STATES.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (idx - 1 + BOOL_STATES.length) % BOOL_STATES.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = BOOL_STATES.length - 1;
    else return;
    e.preventDefault();
    const target = BOOL_STATES[next];
    if (!target) return;
    select(target.key);
    const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[next]?.focus();
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'inline-flex h-8 w-full items-center rounded-md border bg-muted p-0.5 text-xs',
        disabled ? 'cursor-not-allowed' : '',
      )}
    >
      {BOOL_STATES.map((state) => {
        const selected = state.key === current;
        return (
          <button
            key={state.key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={disabled || undefined}
            disabled={disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => select(state.key)}
            className={cn(
              'flex-1 rounded-sm px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
              disabled ? 'cursor-not-allowed opacity-60' : '',
            )}
          >
            {state.label}
          </button>
        );
      })}
    </div>
  );
};

const NumericSegmented = ({
  label,
  row,
  disabled,
  onChange,
}: {
  label: string;
  row: OverrideRow;
  disabled: boolean;
  onChange: (partial: { enabled?: boolean; value?: boolean | number }) => void;
}): React.JSX.Element => {
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

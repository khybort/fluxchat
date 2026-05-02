import { useRef } from 'react';

import { cn } from '@/lib/utils';

import type { OverrideRow, RowState } from '../user-flag-overrides-row';

const BOOL_STATES: Array<{ key: RowState; label: string }> = [
  { key: 'inherit', label: 'Inherit' },
  { key: 'on', label: 'On' },
  { key: 'off', label: 'Off' },
];

const boolStateOf = (row: OverrideRow): RowState => {
  if (!row.enabled) return 'inherit';
  return row.value === true ? 'on' : 'off';
};

interface BoolSegmentedProps {
  label: string;
  row: OverrideRow;
  disabled: boolean;
  onChange: (partial: { enabled?: boolean; value?: boolean | number }) => void;
}

export const BoolSegmented = ({
  label,
  row,
  disabled,
  onChange,
}: BoolSegmentedProps): React.JSX.Element => {
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

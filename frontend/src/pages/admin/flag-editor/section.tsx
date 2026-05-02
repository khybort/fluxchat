import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface SectionProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}

export const Section = ({ title, subtitle, right, children }: SectionProps): React.JSX.Element => (
  <section className="space-y-2">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      {right}
    </div>
    <div>{children}</div>
  </section>
);

interface ToggleSwitchProps {
  value: boolean;
  onChange: (v: boolean) => void;
}

export const ToggleSwitch = ({ value, onChange }: ToggleSwitchProps): React.JSX.Element => (
  <div className="inline-flex items-center gap-3">
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={cn(
        'relative inline-flex h-7 w-12 items-center rounded-full border transition-colors',
        value ? 'border-tertiary/50 bg-tertiary/30' : 'border-white/15 bg-white/5',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 rounded-full bg-on-surface shadow-[0_2px_8px_rgba(0,0,0,0.3)] transition-transform',
          value ? 'translate-x-6' : 'translate-x-1',
        )}
      />
      <span className="sr-only">{value ? 'true' : 'false'}</span>
    </button>
    <span
      className={cn(
        'font-mono text-xs font-semibold uppercase tracking-wide tabular-nums',
        value ? 'text-tertiary' : 'text-on-surface-variant',
      )}
    >
      {value ? 'true' : 'false'}
    </span>
  </div>
);

interface SelectFieldProps {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}

export const SelectField = ({
  label,
  value,
  options,
  onChange,
}: SelectFieldProps): React.JSX.Element => (
  <div className="space-y-1">
    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full rounded-md border bg-background px-2 text-sm"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt || '(any)'}
        </option>
      ))}
    </select>
  </div>
);

import {
  CheckCircleIcon,
  PlusIcon,
  TrashIcon,
  UserCircleIcon,
  XCircleIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { toast } from 'sonner';

import { evaluateAdminFlag } from '@/api/admin';
import { ApiError } from '@/api/client';
import type {
  ClientType,
  FlagContext,
  FlagDefinition,
  FlagName,
  FlagRule,
  UserRole,
} from '@/api/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';

interface FlagEditorProps {
  name: FlagName;
  initial: FlagDefinition;
  onClose: () => void;
  onSave: (definition: FlagDefinition) => Promise<void>;
}

const NUMERIC_FLAGS: FlagName[] = ['PAGINATION_LIMIT', 'RATE_LIMIT_PER_MINUTE'];

const CLIENT_TYPES: ClientType[] = ['web', 'mobile', 'desktop'];
const USER_ROLES: UserRole[] = ['user', 'admin'];

const PRESETS = [0, 10, 25, 50, 75, 100];

export const FlagEditor = ({
  name,
  initial,
  onClose,
  onSave,
}: FlagEditorProps): React.JSX.Element => {
  const isNumeric = NUMERIC_FLAGS.includes(name);
  const [defaultValue, setDefaultValue] = useState<boolean | number>(initial.default);
  const [rules, setRules] = useState<FlagRule[]>(initial.rules ?? []);
  const [percentage, setPercentage] = useState<number | undefined>(initial.percentage);
  const [saving, setSaving] = useState(false);

  const submit = async (): Promise<void> => {
    setSaving(true);
    try {
      const definition: FlagDefinition = { default: defaultValue };
      if (rules.length > 0) definition.rules = rules;
      if (typeof percentage === 'number' && !isNumeric) definition.percentage = percentage;
      await onSave(definition);
    } finally {
      setSaving(false);
    }
  };

  const updateRule = (idx: number, patch: Partial<FlagRule>): void => {
    setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRule = (): void => {
    setRules((prev) => [
      ...prev,
      { if: {}, value: isNumeric ? (defaultValue as number) : !defaultValue },
    ]);
  };

  const removeRule = (idx: number): void => {
    setRules((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="font-mono text-base">{name}</DialogTitle>
          <DialogDescription className="text-xs">
            Edits apply on the next request — no redeploy. Clear the override to fall back to the
            file/env default.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* Default value */}
          <Section
            title="Default value"
            subtitle="What every request returns when no rule matches."
          >
            {isNumeric ? (
              <Input
                type="number"
                value={defaultValue as number}
                onChange={(e) => setDefaultValue(Number(e.target.value))}
                className="max-w-[160px]"
              />
            ) : (
              <ToggleSwitch value={defaultValue as boolean} onChange={(v) => setDefaultValue(v)} />
            )}
          </Section>

          {/* Percentage rollout — boolean only */}
          {!isNumeric ? (
            <Section
              title="Rollout percentage"
              subtitle="Hash-based bucket on userId. Same user always lands in the same bucket; rules above always win."
              right={
                <span className="font-mono text-sm tabular-nums">
                  {typeof percentage === 'number' ? `${percentage}%` : 'off'}
                </span>
              }
            >
              <PercentageSlider value={percentage} onChange={setPercentage} />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPercentage(p)}
                    className={cn(
                      'rounded-md border px-2 py-1 font-mono text-xs transition-colors',
                      percentage === p
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'hover:bg-accent',
                    )}
                  >
                    {p}%
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPercentage(undefined)}
                  className={cn(
                    'rounded-md border px-2 py-1 text-xs transition-colors',
                    percentage === undefined
                      ? 'border-muted-foreground bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-accent',
                  )}
                >
                  disabled
                </button>
              </div>
            </Section>
          ) : null}

          {/* Rules */}
          <Section
            title="Rules"
            subtitle="Walked top-to-bottom. First match wins."
            right={
              <Button type="button" size="sm" variant="outline" onClick={addRule}>
                <PlusIcon className="h-3.5 w-3.5" weight="bold" />
                Add rule
              </Button>
            }
          >
            {rules.length === 0 ? (
              <div className="rounded-md border border-dashed bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
                No rules — every request hits the default
                {!isNumeric && typeof percentage === 'number'
                  ? ' (or the percentage bucket above).'
                  : '.'}
              </div>
            ) : (
              <ul className="space-y-2">
                {rules.map((rule, idx) => (
                  <RuleRow
                    key={idx}
                    rule={rule}
                    isNumeric={isNumeric}
                    onChange={(patch) => updateRule(idx, patch)}
                    onRemove={() => removeRule(idx)}
                  />
                ))}
              </ul>
            )}
          </Section>

          <TestAsUserPanel name={name} />
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-6 py-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// --- shared UI atoms ---------------------------------------------------

const Section = ({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element => (
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

const ToggleSwitch = ({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}): React.JSX.Element => (
  <button
    type="button"
    role="switch"
    aria-checked={value}
    onClick={() => onChange(!value)}
    className={cn(
      'relative inline-flex h-7 w-14 items-center rounded-full border transition-colors',
      value ? 'border-primary bg-primary' : 'border-input bg-muted',
    )}
  >
    <span
      className={cn(
        'inline-block h-5 w-5 rounded-full bg-background shadow-sm transition-transform',
        value ? 'translate-x-8' : 'translate-x-1',
      )}
    />
    <span className="sr-only">{value ? 'true' : 'false'}</span>
    <span
      className={cn(
        'absolute right-2 text-[10px] font-semibold uppercase tracking-wide transition-opacity',
        value ? 'text-primary-foreground opacity-100' : 'opacity-0',
      )}
    >
      ON
    </span>
    <span
      className={cn(
        'absolute left-2 text-[10px] font-semibold uppercase tracking-wide transition-opacity',
        !value ? 'text-muted-foreground opacity-100' : 'opacity-0',
      )}
    >
      OFF
    </span>
  </button>
);

/**
 * Custom-styled range slider. The native `<input type="range">` thumb visually
 * lags by half-its-width at the extremes (browser quirk), so the user reads
 * "100%" as label but sees the thumb sitting one tick short of the right edge.
 * We fix that by pinning the thumb to the track and rendering the fill via a
 * gradient — at 100 the fill covers the full track and the thumb sits flush.
 */
const PercentageSlider = ({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
}): React.JSX.Element => {
  const v = value ?? 0;
  const fillPct = `${v}%`;
  return (
    <div className="space-y-1.5">
      <div className="relative h-2 rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-150 ease-out"
          style={{ width: fillPct }}
        />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={v}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Rollout percentage"
          className={cn(
            'absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent',
            // Thumb: pin to the track so 100% sits flush right.
            '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4',
            '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
            '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary',
            '[&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:shadow-md',
            '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4',
            '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2',
            '[&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-background',
            '[&::-moz-range-track]:bg-transparent',
          )}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100</span>
      </div>
    </div>
  );
};

interface RuleRowProps {
  rule: FlagRule;
  isNumeric: boolean;
  onChange: (patch: Partial<FlagRule>) => void;
  onRemove: () => void;
}

const RuleRow = ({ rule, isNumeric, onChange, onRemove }: RuleRowProps): React.JSX.Element => (
  <li className="rounded-md border bg-muted/30 p-3">
    <div className="flex items-start gap-3 text-xs">
      <span className="mt-1.5 font-mono text-muted-foreground">if</span>
      <div className="grid flex-1 grid-cols-2 gap-2">
        <SelectField
          label="userRole"
          value={rule.if.userRole ?? ''}
          options={['', ...USER_ROLES]}
          onChange={(val) => onChange({ if: setOrUnset(rule.if, 'userRole', val as UserRole) })}
        />
        <SelectField
          label="clientType"
          value={rule.if.clientType ?? ''}
          options={['', ...CLIENT_TYPES]}
          onChange={(val) => onChange({ if: setOrUnset(rule.if, 'clientType', val as ClientType) })}
        />
      </div>
      <span className="mt-1.5 font-mono text-muted-foreground">→</span>
      <div className="w-28">
        <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
          value
        </span>
        {isNumeric ? (
          <Input
            type="number"
            value={rule.value as number}
            onChange={(e) => onChange({ value: Number(e.target.value) })}
            className="h-8 text-sm"
          />
        ) : (
          <ToggleSwitch
            value={rule.value as boolean}
            onChange={(val) => onChange({ value: val })}
          />
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove rule"
        className="mt-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <TrashIcon className="h-3.5 w-3.5" weight="bold" />
      </button>
    </div>
  </li>
);

const SelectField = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}): React.JSX.Element => (
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

const setOrUnset = <K extends keyof FlagContext>(
  ctx: FlagContext,
  key: K,
  value: FlagContext[K] | '',
): FlagContext => {
  const out: FlagContext = { ...ctx };
  if (value === '' || value === undefined) {
    delete out[key];
  } else {
    out[key] = value;
  }
  return out;
};

/**
 * Server-side preview: builds a synthetic FlagContext, calls
 * /api/admin/flags/:name/evaluate, and renders the result. Single source of
 * truth for the bucket-hash semantics — JS doesn't reimplement the math.
 */
const TestAsUserPanel = ({ name }: { name: FlagName }): React.JSX.Element => {
  const token = useAuthStore((s) => s.token) ?? '';
  const [userId, setUserId] = useState('');
  const [userRole, setUserRole] = useState<UserRole | ''>('');
  const [clientType, setClientType] = useState<ClientType | ''>('');
  const [result, setResult] = useState<{ value: boolean | number } | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (): Promise<void> => {
    setLoading(true);
    setResult(null);
    try {
      const ctx: FlagContext = {};
      if (userId) ctx.userId = userId;
      if (userRole) ctx.userRole = userRole;
      if (clientType) ctx.clientType = clientType;
      const r = await evaluateAdminFlag(token, name, ctx);
      setResult(r);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Evaluation failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const renderResult = (): React.JSX.Element | null => {
    if (!result) return null;
    if (typeof result.value === 'boolean') {
      return (
        <div
          className={cn(
            'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
            result.value
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-muted bg-muted/40 text-muted-foreground',
          )}
        >
          {result.value ? (
            <CheckCircleIcon className="h-4 w-4" weight="bold" />
          ) : (
            <XCircleIcon className="h-4 w-4" weight="bold" />
          )}
          <span className="font-mono font-semibold">{String(result.value)}</span>
          <span className="text-xs opacity-70">
            for {userId ? `userId="${userId}"` : 'no userId'}
            {userRole ? ` · role=${userRole}` : ''}
            {clientType ? ` · client=${clientType}` : ''}
          </span>
        </div>
      );
    }
    return (
      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <span className="font-mono font-semibold">{result.value}</span>
      </div>
    );
  };

  return (
    <Section
      title="Test as user"
      subtitle="Server-side evaluation against a synthetic context — preview rule + percentage outcomes before saving."
    >
      <div className="space-y-2 rounded-md border bg-muted/20 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <UserCircleIcon className="h-4 w-4" weight="bold" />
          <span>Synthetic context</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Input
            placeholder="userId"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="h-8 text-sm"
          />
          <SelectField
            label=""
            value={userRole}
            options={['', ...USER_ROLES]}
            onChange={(val) => setUserRole(val as UserRole | '')}
          />
          <SelectField
            label=""
            value={clientType}
            options={['', ...CLIENT_TYPES]}
            onChange={(val) => setClientType(val as ClientType | '')}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void run()}
            disabled={loading}
          >
            {loading ? 'Evaluating…' : 'Evaluate'}
          </Button>
        </div>
        {renderResult()}
      </div>
    </Section>
  );
};

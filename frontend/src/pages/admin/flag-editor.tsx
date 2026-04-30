import { PlusIcon, TrashIcon, XIcon } from '@phosphor-icons/react';
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono">{name}</DialogTitle>
          <DialogDescription>
            Save edits to apply on the next request — no redeploy. Clear the override on the list
            page to revert to the file/env default.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Default value */}
          <section className="space-y-2">
            <Label htmlFor="default">Default value</Label>
            {isNumeric ? (
              <Input
                id="default"
                type="number"
                value={defaultValue as number}
                onChange={(e) => setDefaultValue(Number(e.target.value))}
              />
            ) : (
              <BooleanToggle value={defaultValue as boolean} onChange={(v) => setDefaultValue(v)} />
            )}
          </section>

          {/* Percentage rollout — boolean only */}
          {!isNumeric ? (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="percentage">Rollout percentage</Label>
                <span className="font-mono text-xs text-muted-foreground">
                  {typeof percentage === 'number' ? `${percentage}%` : 'off'}
                </span>
              </div>
              <Input
                id="percentage"
                type="range"
                min={0}
                max={100}
                value={percentage ?? 0}
                onChange={(e) => setPercentage(Number(e.target.value))}
                className="cursor-pointer"
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setPercentage(undefined)}
                  className="h-7 text-xs"
                >
                  Clear
                </Button>
                <p className="text-xs text-muted-foreground">
                  Hash-based bucket on userId — same user always gets the same answer.
                </p>
              </div>
            </section>
          ) : null}

          {/* Rules */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Rules</Label>
              <Button type="button" size="sm" variant="outline" onClick={addRule}>
                <PlusIcon className="h-3.5 w-3.5" weight="bold" />
                Add rule
              </Button>
            </div>
            {rules.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No rules — every request hits the default (or the percentage bucket above).
              </p>
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
          </section>

          {/* Test-as-user */}
          <TestAsUserPanel name={name} />
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const BooleanToggle = ({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}): React.JSX.Element => (
  <div className="flex gap-2">
    <Button
      type="button"
      size="sm"
      variant={value ? 'default' : 'outline'}
      onClick={() => onChange(true)}
    >
      true
    </Button>
    <Button
      type="button"
      size="sm"
      variant={!value ? 'default' : 'outline'}
      onClick={() => onChange(false)}
    >
      false
    </Button>
  </div>
);

interface RuleRowProps {
  rule: FlagRule;
  isNumeric: boolean;
  onChange: (patch: Partial<FlagRule>) => void;
  onRemove: () => void;
}

const RuleRow = ({ rule, isNumeric, onChange, onRemove }: RuleRowProps): React.JSX.Element => (
  <li className="rounded-md border bg-secondary/50 p-3">
    <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
      <Select
        label="userRole"
        value={rule.if.userRole ?? ''}
        options={['', ...USER_ROLES]}
        onChange={(v) => onChange({ if: setOrUnset(rule.if, 'userRole', v as UserRole) })}
      />
      <Select
        label="clientType"
        value={rule.if.clientType ?? ''}
        options={['', ...CLIENT_TYPES]}
        onChange={(v) => onChange({ if: setOrUnset(rule.if, 'clientType', v as ClientType) })}
      />
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">value</Label>
        {isNumeric ? (
          <Input
            type="number"
            value={rule.value as number}
            onChange={(e) => onChange({ value: Number(e.target.value) })}
            className="h-8 text-sm"
          />
        ) : (
          <BooleanToggle value={rule.value as boolean} onChange={(v) => onChange({ value: v })} />
        )}
      </div>
      <div className="flex items-end justify-end">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onRemove}
          className="text-destructive hover:bg-destructive/10"
        >
          <TrashIcon className="h-3.5 w-3.5" weight="bold" />
        </Button>
      </div>
    </div>
  </li>
);

const Select = ({
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
 * Lets the admin preview "what would this flag return for this synthetic
 * user?" — calls the server-side evaluator so the bucket hash semantics
 * stay single-source-of-truth.
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

  return (
    <section className="rounded-md border bg-secondary/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <Label className="text-xs font-medium">Test as user</Label>
        {result ? (
          <span className="font-mono text-xs">
            =&gt; <strong>{String(result.value)}</strong>
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <Input
          placeholder="userId"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="h-8 text-sm"
        />
        <Select
          label="userRole"
          value={userRole}
          options={['', ...USER_ROLES]}
          onChange={(v) => setUserRole(v as UserRole | '')}
        />
        <Select
          label="clientType"
          value={clientType}
          options={['', ...CLIENT_TYPES]}
          onChange={(v) => setClientType(v as ClientType | '')}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void run()}
          disabled={loading}
        >
          Evaluate
        </Button>
      </div>
    </section>
  );
};

// Avoid unused warnings for the icon import — XIcon is referenced via Dialog's close button slot.
void XIcon;

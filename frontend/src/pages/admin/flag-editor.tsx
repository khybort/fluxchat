import { useState } from 'react';

import type { FlagDefinition, FlagName, FlagRule } from '@/api/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';

import { PercentageSlider } from './flag-editor/percentage-slider';
import { RuleRow } from './flag-editor/rule-row';
import { Section, ToggleSwitch } from './flag-editor/section';
import { TestAsUserPanel } from './flag-editor/test-as-user-panel';

interface FlagEditorProps {
  name: FlagName;
  initial: FlagDefinition;
  onClose: () => void;
  onSave: (definition: FlagDefinition) => Promise<void>;
}

const NUMERIC_FLAGS: FlagName[] = ['PAGINATION_LIMIT', 'RATE_LIMIT_PER_MINUTE'];
const ROLLOUT_PRESETS = [0, 10, 25, 50, 75, 100];

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
                {ROLLOUT_PRESETS.map((p) => (
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

          <Section
            title="Rules"
            subtitle="Walked top-to-bottom. First match wins."
            right={
              <Button type="button" size="sm" variant="outline" onClick={addRule}>
                <MaterialIcon name="add" className="h-3.5 w-3.5" />
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

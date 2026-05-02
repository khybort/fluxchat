import type { ClientType, FlagContext, FlagRule, UserRole } from '@/api/types';
import { Input } from '@/components/ui/input';
import { MaterialIcon } from '@/components/ui/material-icon';

import { SelectField, ToggleSwitch } from './section';

const CLIENT_TYPES: ClientType[] = ['web', 'mobile', 'desktop'];
const USER_ROLES: UserRole[] = ['user', 'admin'];

interface RuleRowProps {
  rule: FlagRule;
  isNumeric: boolean;
  onChange: (patch: Partial<FlagRule>) => void;
  onRemove: () => void;
}

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

export const RuleRow = ({
  rule,
  isNumeric,
  onChange,
  onRemove,
}: RuleRowProps): React.JSX.Element => (
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
        <MaterialIcon name="delete" className="h-3.5 w-3.5" />
      </button>
    </div>
  </li>
);

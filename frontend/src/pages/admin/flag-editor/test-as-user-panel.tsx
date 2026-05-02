import { useState } from 'react';
import { toast } from 'sonner';

import { evaluateAdminFlag } from '@/api/admin';
import { ApiError } from '@/api/client';
import type { ClientType, FlagContext, FlagName, UserRole } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';

import { Section, SelectField } from './section';

const CLIENT_TYPES: ClientType[] = ['web', 'mobile', 'desktop'];
const USER_ROLES: UserRole[] = ['user', 'admin'];

/**
 * Server-side preview: builds a synthetic FlagContext, calls
 * /api/admin/flags/:name/evaluate, and renders the result. Single source of
 * truth for the bucket-hash semantics — JS doesn't reimplement the math.
 */
export const TestAsUserPanel = ({ name }: { name: FlagName }): React.JSX.Element => {
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
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : 'Evaluation failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Section
      title="Test as user"
      subtitle="Server-side evaluation against a synthetic context — preview rule + percentage outcomes before saving."
    >
      <div className="space-y-2 rounded-md border bg-muted/20 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MaterialIcon name="account_circle" className="h-4 w-4" />
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
        <ResultDisplay
          result={result}
          userId={userId}
          userRole={userRole}
          clientType={clientType}
        />
      </div>
    </Section>
  );
};

interface ResultDisplayProps {
  result: { value: boolean | number } | null;
  userId: string;
  userRole: UserRole | '';
  clientType: ClientType | '';
}

const ResultDisplay = ({
  result,
  userId,
  userRole,
  clientType,
}: ResultDisplayProps): React.JSX.Element | null => {
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
          <MaterialIcon name="check_circle" className="h-4 w-4" />
        ) : (
          <MaterialIcon name="cancel" className="h-4 w-4" />
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

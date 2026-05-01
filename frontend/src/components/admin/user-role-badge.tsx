import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Role = 'admin' | 'user';

export const UserRoleBadge = ({
  role,
  className,
}: {
  role: Role;
  className?: string;
}): React.JSX.Element => (
  <Badge
    variant={role === 'admin' ? 'secondary' : 'outline'}
    className={cn(
      'text-[10px] uppercase tracking-wide font-normal',
      role === 'admin' ? 'border-primary/30 bg-primary/10 text-primary' : 'text-muted-foreground',
      className,
    )}
  >
    {role}
  </Badge>
);

import { Link } from 'react-router-dom';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MaterialIcon } from '@/components/ui/material-icon';
import type { AuthUser } from '@/api/types';
import { initialsOf } from '@/lib/utils';

interface UserMenuProps {
  user: AuthUser | null;
  onLogout: () => void;
}

export const UserMenu = ({ user, onLogout }: UserMenuProps): React.JSX.Element => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-2xl bg-white/5 hover:bg-white/10 px-3 py-2.5 transition-colors text-left"
      >
        <Avatar className="h-9 w-9 border border-white/15">
          <AvatarFallback>{initialsOf(user?.name ?? user?.email)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-on-surface">
            {user?.name ?? user?.email ?? 'Account'}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">
            {user?.role === 'admin' ? 'Admin' : 'Member'} · {user?.email ?? ''}
          </p>
        </div>
        <MaterialIcon name="unfold_more" className="text-base text-on-surface-variant" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent side="top" align="end" className="w-56">
      <DropdownMenuLabel className="flex flex-col gap-0.5">
        <span className="text-sm">{user?.name ?? 'Account'}</span>
        <span className="text-xs font-normal text-on-surface-variant">{user?.email}</span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link to="/chat/archived" className="cursor-pointer">
          <MaterialIcon name="inventory_2" className="text-base" />
          Archive
        </Link>
      </DropdownMenuItem>
      {user?.role === 'admin' ? (
        <DropdownMenuItem asChild>
          <Link to="/admin/flags" className="cursor-pointer">
            <MaterialIcon name="tune" className="text-base" />
            Feature Management
          </Link>
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onLogout} className="text-error">
        <MaterialIcon name="logout" className="text-base" />
        Sign out
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

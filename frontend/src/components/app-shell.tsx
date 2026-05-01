import { motion } from 'framer-motion';
import {
  CaretUpDownIcon,
  FlagIcon,
  ListIcon,
  PulseIcon,
  SignOutIcon,
  SparkleIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';

import { getHealthz } from '@/api/chat';
import type { FeatureFlagsSnapshot } from '@/api/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, initialsOf } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';

import { ChatSidebar } from './chat-sidebar';
import { FeatureFlagsPanel } from './feature-flags-panel';

export const AppShell = (): React.JSX.Element => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [flags, setFlags] = useState<FeatureFlagsSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getHealthz()
      .then((res) => {
        if (!cancelled) setFlags(res.flags);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = (): void => {
    clear();
    navigate('/login', { replace: true });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Mobile backdrop */}
        {mobileOpen ? (
          <div
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
        ) : null}

        {/* Sidebar */}
        <motion.aside
          initial={{ x: -32, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className={cn(
            'fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col border-r bg-card md:relative md:translate-x-0',
            mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
            'transition-transform duration-300',
          )}
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <SparkleIcon className="h-4 w-4" weight="bold" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">FluxChat</p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  AI Assistant
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(false)}
            >
              <XIcon className="h-4 w-4" weight="bold" />
            </Button>
          </div>

          <ChatSidebar onNavigate={() => setMobileOpen(false)} />

          <div className="border-t p-3">
            <FeatureFlagsPanel flags={flags} />
          </div>
        </motion.aside>

        {/* Main */}
        <div className="flex flex-1 flex-col">
          <header className="flex h-14 items-center justify-between gap-3 border-b bg-background px-4 md:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <ListIcon className="h-5 w-5" weight="bold" />
            </Button>

            <div className="hidden items-center gap-2 md:flex">
              <Badge variant="outline" className="gap-1.5 font-normal">
                <PulseIcon className="h-3 w-3 text-success" weight="bold" />
                Connected
              </Badge>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="ml-auto gap-2 px-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{initialsOf(user?.name ?? user?.email)}</AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm font-medium md:inline">
                    {user?.name ?? user?.email ?? 'Account'}
                  </span>
                  <CaretUpDownIcon
                    weight="bold"
                    className="hidden h-4 w-4 text-muted-foreground md:inline"
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="text-sm">{user?.name ?? 'Account'}</span>
                  <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
                </DropdownMenuLabel>
                {user?.role === 'admin' ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/admin/flags" className="cursor-pointer">
                        <FlagIcon className="h-4 w-4" weight="bold" />
                        Feature flags
                      </Link>
                    </DropdownMenuItem>
                  </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <SignOutIcon className="h-4 w-4" weight="bold" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip>
              <TooltipTrigger asChild>
                <span className="sr-only" />
              </TooltipTrigger>
              <TooltipContent>Hover items for details</TooltipContent>
            </Tooltip>
          </header>

          <main className="flex-1 overflow-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
};

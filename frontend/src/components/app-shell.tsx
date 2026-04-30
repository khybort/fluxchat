import { motion } from 'framer-motion';
import { CaretUpDown, List, Pulse, SignOut, Sparkle, X } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';

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
      <div className="relative flex h-screen overflow-hidden bg-background">
        {/* Aurora mesh backdrop — fixed, behind everything, never scrolls */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div
            className="aurora-orb h-[42rem] w-[42rem] animate-aurora bg-brand-from/20"
            style={{ top: '-12rem', left: '-10rem' }}
          />
          <div
            className="aurora-orb h-[36rem] w-[36rem] animate-aurora bg-brand-to/20"
            style={{ bottom: '-14rem', right: '-12rem', animationDelay: '-7s' }}
          />
          <div
            className="aurora-orb h-[28rem] w-[28rem] animate-aurora bg-brand-via/15"
            style={{ top: '40%', left: '50%', animationDelay: '-3s' }}
          />
        </div>

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
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className={cn(
            'fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col border-r border-border/40 bg-card/40 backdrop-blur-xl md:relative md:translate-x-0',
            mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
            'transition-transform duration-300',
          )}
        >
          <div className="relative flex items-center justify-between border-b border-border/40 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-from via-brand-via to-brand-to text-primary-foreground shadow-[0_0_24px_-4px_hsl(var(--brand-via)/0.55)]">
                <Sparkle className="h-4 w-4" weight="duotone" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">
                  <span className="text-brand-gradient">FluxChat</span>
                </p>
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
              <X className="h-4 w-4" weight="bold" />
            </Button>
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-3 -bottom-px h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent"
            />
          </div>

          <ChatSidebar onNavigate={() => setMobileOpen(false)} />

          <div className="border-t border-border/40 p-3">
            <FeatureFlagsPanel flags={flags} />
          </div>
        </motion.aside>

        {/* Main */}
        <div className="relative flex flex-1 flex-col">
          <header className="relative flex h-14 items-center justify-between gap-3 border-b border-border/40 bg-card/20 px-4 backdrop-blur-xl md:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <List className="h-5 w-5" weight="bold" />
            </Button>

            <div className="hidden items-center gap-2 md:flex">
              <Badge
                variant="outline"
                className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 font-normal text-emerald-300"
              >
                <Pulse className="h-3 w-3" weight="duotone" />
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
                  <CaretUpDown
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
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <SignOut className="h-4 w-4" weight="duotone" />
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
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-4 -bottom-px h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent"
            />
          </header>

          <main className="relative flex-1 overflow-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
};

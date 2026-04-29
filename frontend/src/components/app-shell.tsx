import { motion } from 'framer-motion';
import { Activity, ChevronsUpDown, LogOut, Menu, Sparkles, X } from 'lucide-react';
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
            'fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col border-r bg-card/50 backdrop-blur md:relative md:translate-x-0',
            mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
            'transition-transform duration-300',
          )}
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">AppNation Chat</p>
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
              <X className="h-4 w-4" />
            </Button>
          </div>

          <ChatSidebar onNavigate={() => setMobileOpen(false)} />

          <div className="border-t p-3">
            <FeatureFlagsPanel flags={flags} />
          </div>
        </motion.aside>

        {/* Main */}
        <div className="flex flex-1 flex-col">
          <header className="flex h-14 items-center justify-between gap-3 border-b bg-card/30 px-4 backdrop-blur md:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>

            <div className="hidden items-center gap-2 md:flex">
              <Badge variant="outline" className="gap-1.5 font-normal">
                <Activity className="h-3 w-3 text-emerald-500" />
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
                  <ChevronsUpDown className="hidden h-4 w-4 text-muted-foreground md:inline" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="text-sm">{user?.name ?? 'Account'}</span>
                  <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <LogOut className="h-4 w-4" />
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

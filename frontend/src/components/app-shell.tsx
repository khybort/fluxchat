import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';

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
import { MaterialIcon } from '@/components/ui/material-icon';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn, initialsOf } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';
import { useFlagsStore } from '@/store/flags-store';

import { ChatSidebar } from './chat-sidebar';
import { FeatureFlagsPanel } from './feature-flags-panel';

const MODEL_NAME = 'Claude Sonnet 4.6';

const SIDEBAR_KEY = 'appnation-sidebar-width';
const SIDEBAR_DEFAULT = 288;
const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 480;

const useResizableSidebar = (): {
  width: number;
  startDrag: (e: React.MouseEvent) => void;
  dragging: boolean;
} => {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return SIDEBAR_DEFAULT;
    const saved = window.localStorage.getItem(SIDEBAR_KEY);
    if (!saved) return SIDEBAR_DEFAULT;
    const parsed = Number.parseInt(saved, 10);
    return Number.isFinite(parsed) && parsed >= SIDEBAR_MIN && parsed <= SIDEBAR_MAX
      ? parsed
      : SIDEBAR_DEFAULT;
  });
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!draggingRef.current) return;
      // Sidebar starts at left=16 on md+ (m-4 → 1rem). Subtract that so the
      // handle tracks the cursor naturally regardless of viewport size.
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, e.clientX - 16));
      setWidth(next);
    };
    const onUp = (): void => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_KEY, String(width));
  }, [width]);

  const startDrag = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    draggingRef.current = true;
    setDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  return { width, startDrag, dragging };
};

export const AppShell = (): React.JSX.Element => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const [mobileOpen, setMobileOpen] = useState(false);
  const flags = useFlagsStore((s) => s.flags);
  const refreshFlags = useFlagsStore((s) => s.refresh);
  const sidebar = useResizableSidebar();

  useEffect(() => {
    void refreshFlags();
    const onFocus = (): void => {
      void refreshFlags();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshFlags]);

  const handleLogout = (): void => {
    clear();
    navigate('/login', { replace: true });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative flex h-screen overflow-hidden">
        {mobileOpen ? (
          <div
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
        ) : null}

        {/* Floating sidebar */}
        <motion.aside
          initial={{ x: -32, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          style={{ width: `${sidebar.width}px` }}
          className={cn(
            'fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col bg-surface-container-low/40 backdrop-blur-[40px] border-r border-white/10 shadow-[10px_0_30px_rgba(0,0,0,0.5)] md:relative md:translate-x-0 md:m-4 md:rounded-3xl md:inset-y-auto md:h-[calc(100vh-2rem)]',
            mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
            sidebar.dragging ? '' : 'transition-transform duration-300',
          )}
        >
          <div className="flex items-center justify-between border-b border-white/5 px-6 py-5">
            <Link
              to="/chat"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 rounded-lg transition-opacity hover:opacity-80"
            >
              <img src="/appnation-mark.png" alt="" className="h-9 w-9" />
              <p className="text-base font-bold tracking-tight text-on-surface">AppNation</p>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(false)}
            >
              <MaterialIcon name="close" className="text-base" />
            </Button>
          </div>

          <ChatSidebar onNavigate={() => setMobileOpen(false)} />

          <div className="border-t border-white/5 p-4 space-y-3">
            <FeatureFlagsPanel flags={flags} />
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
                <DropdownMenuItem onClick={handleLogout} className="text-error">
                  <MaterialIcon name="logout" className="text-base" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Resize handle — md+ only. Wide hit area, thin visible bar. */}
          <button
            type="button"
            aria-label="Resize sidebar"
            onMouseDown={sidebar.startDrag}
            className={cn(
              'absolute right-0 top-0 hidden h-full w-2 cursor-col-resize md:block',
              'group transition-colors',
              sidebar.dragging ? 'bg-tertiary/40' : 'hover:bg-white/5',
            )}
          >
            <span
              className={cn(
                'absolute right-0 top-1/2 h-12 w-px -translate-y-1/2 transition-colors',
                sidebar.dragging ? 'bg-tertiary' : 'bg-white/10 group-hover:bg-tertiary/60',
              )}
            />
          </button>
        </motion.aside>

        {/* Main column with floating top bar */}
        <div className="flex flex-1 flex-col min-w-0 md:p-4 md:pl-0">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-surface-container/60 backdrop-blur-[30px] shadow-[0_8px_32px_rgba(0,0,0,0.3)] px-4 py-3 md:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <MaterialIcon name="menu" className="text-xl" />
            </Button>

            <div className="hidden items-center gap-3 md:flex">
              <span className="text-base font-bold text-on-surface">AppNation Chat</span>
              <span className="h-4 w-px bg-white/10" />
              <Badge
                variant="outline"
                className="gap-1.5 border-tertiary/30 bg-tertiary/15 text-tertiary font-normal"
              >
                <MaterialIcon name="bolt" className="text-sm" />
                {MODEL_NAME}
              </Badge>
            </div>

            <div className="flex flex-1 items-center justify-end gap-3">
              <Badge
                variant="outline"
                className="hidden gap-1.5 border-tertiary/30 bg-tertiary/10 text-tertiary font-normal md:inline-flex"
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tertiary opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-tertiary" />
                </span>
                Connected
              </Badge>
            </div>
          </header>

          <main className="flex-1 overflow-hidden mt-4 min-h-0">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
};

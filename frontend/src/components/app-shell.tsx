import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { MaterialIcon } from '@/components/ui/material-icon';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';
import { useFlagsStore } from '@/store/flags-store';

import { TopBar } from './app-shell/top-bar';
import { UserMenu } from './app-shell/user-menu';
import { useResizableSidebar } from './app-shell/use-resizable-sidebar';
import { ChatSidebar } from './chat-sidebar';
import { FeatureFlagsPanel } from './feature-flags-panel';

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
            <UserMenu user={user} onLogout={handleLogout} />
          </div>

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

        <div className="flex flex-1 flex-col min-w-0 md:p-4 md:pl-0">
          <TopBar onOpenMobileMenu={() => setMobileOpen(true)} />

          <main className="flex-1 overflow-hidden mt-4 min-h-0">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
};

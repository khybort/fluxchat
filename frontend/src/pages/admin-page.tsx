import { motion } from 'framer-motion';
import { ShieldStarIcon } from '@phosphor-icons/react';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const TABS = [
  { value: 'flags', label: 'Feature flags', to: '/admin/flags' },
  { value: 'users', label: 'Users', to: '/admin/users' },
] as const;

type TabValue = (typeof TABS)[number]['value'];

const tabFromPath = (pathname: string): TabValue =>
  pathname.endsWith('/users') ? 'users' : 'flags';

export const AdminShell = (): React.JSX.Element => {
  const { pathname } = useLocation();
  const active = tabFromPath(pathname);

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldStarIcon className="h-4 w-4" weight="bold" />
            </span>
            <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Toggle runtime feature flags and manage per-user overrides. Edits persist in the
            database and apply on the next request — no redeploy.
          </p>
        </div>

        <Tabs value={active} className="mb-6">
          <TabsList>
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} asChild>
                <Link to={tab.to}>{tab.label}</Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <motion.div
          key={active}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <Outlet />
        </motion.div>
      </div>
    </ScrollArea>
  );
};

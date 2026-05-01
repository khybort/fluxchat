import { motion } from 'framer-motion';
import { type ReactNode } from 'react';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

export const AuthLayout = ({
  title,
  subtitle,
  children,
  footer,
}: AuthLayoutProps): React.JSX.Element => (
  <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="w-full max-w-md"
    >
      <div className="mb-8 flex flex-col items-center gap-4 text-center">
        <div className="flex h-12 items-center justify-center rounded-lg bg-zinc-900 px-4">
          <img src="/appnation-logo.png" alt="AppNation" className="h-6 w-auto" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">{children}</div>

      {footer ? (
        <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>
      ) : null}
    </motion.div>
  </div>
);

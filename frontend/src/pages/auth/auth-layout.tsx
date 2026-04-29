import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
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
  <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
    {/* Subtle animated gradient backdrop */}
    <div className="pointer-events-none absolute inset-0 -z-10">
      <motion.div
        className="absolute -top-1/2 left-1/2 h-[700px] w-[700px] -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-500/30 via-fuchsia-500/15 to-transparent blur-3xl"
        animate={{ opacity: [0.55, 0.85, 0.55], scale: [0.95, 1.05, 0.95] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-0 right-0 h-[500px] w-[500px] translate-x-1/3 translate-y-1/3 rounded-full bg-gradient-to-tr from-cyan-500/20 to-transparent blur-3xl"
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
      />
    </div>

    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="w-full max-w-md"
    >
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.05, type: 'spring', stiffness: 260, damping: 20 }}
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25"
        >
          <Sparkles className="h-6 w-6" />
        </motion.div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/20 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        {children}
      </div>

      {footer ? (
        <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>
      ) : null}
    </motion.div>
  </div>
);

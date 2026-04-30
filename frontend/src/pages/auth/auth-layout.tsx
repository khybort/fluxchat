import { motion } from 'framer-motion';
import { Sparkle } from '@phosphor-icons/react';
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
    {/* Aurora mesh backdrop — brand-tinted */}
    <div className="pointer-events-none absolute inset-0 -z-10">
      <motion.div
        className="absolute -top-1/2 left-1/2 h-[720px] w-[720px] -translate-x-1/2 rounded-full bg-gradient-to-br from-brand-from/40 via-brand-via/25 to-transparent blur-3xl"
        animate={{ opacity: [0.55, 0.9, 0.55], scale: [0.95, 1.08, 0.95] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/3 translate-y-1/3 rounded-full bg-gradient-to-tr from-brand-to/30 to-transparent blur-3xl"
        animate={{ opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
      />
      <motion.div
        className="absolute -left-32 top-1/3 h-[420px] w-[420px] rounded-full bg-gradient-to-br from-brand-via/25 to-transparent blur-3xl"
        animate={{ opacity: [0.35, 0.65, 0.35] }}
        transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
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
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-from via-brand-via to-brand-to text-primary-foreground shadow-[0_0_40px_-4px_hsl(var(--brand-via)/0.7)]"
        >
          <Sparkle className="h-7 w-7" weight="duotone" />
        </motion.div>
        <h1 className="text-3xl font-semibold tracking-tight">
          <span className="text-brand-gradient">{title}</span>
        </h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="rounded-2xl border border-border/40 bg-card/60 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl supports-[backdrop-filter]:bg-card/40">
        {children}
      </div>

      {footer ? (
        <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>
      ) : null}
    </motion.div>
  </div>
);

import { motion } from 'framer-motion';

import type { FeatureFlagsSnapshot } from '@/api/types';
import { Composer } from '@/components/chat/composer';
import { WelcomeBento } from '@/components/chat/welcome-bento';
import { Badge } from '@/components/ui/badge';
import { MaterialIcon } from '@/components/ui/material-icon';

interface NewChatPanelProps {
  onSubmit: (text: string) => void | Promise<void>;
  busy: boolean;
  flags: FeatureFlagsSnapshot | null;
}

export const NewChatPanel = ({ onSubmit, busy, flags }: NewChatPanelProps): React.JSX.Element => (
  <div className="relative flex h-full flex-col">
    <div className="flex flex-1 items-center overflow-y-auto pb-40">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="mx-auto w-full max-w-6xl px-6 py-12"
      >
        <div className="mb-12 flex flex-col items-center text-center">
          <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-gradient-to-tr from-primary-container to-tertiary shadow-[0_0_40px_hsl(var(--primary-container)/0.4)]">
            <MaterialIcon name="auto_awesome" filled className="text-5xl text-white" />
          </div>
          <h2 className="text-display-xl text-on-surface">What shall we build today?</h2>
          <p className="mt-4 max-w-2xl text-body-lg text-on-surface-variant">
            Your AI-powered workspace is ready. Pick a quick action below or type a message to start
            creating, analyzing, or coding.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {flags?.STREAMING_ENABLED ? (
              <Badge variant="success">
                <MaterialIcon name="bolt" className="mr-1 text-sm" />
                Streaming on
              </Badge>
            ) : (
              <Badge variant="outline">Streaming off</Badge>
            )}
            {flags?.AI_TOOLS_ENABLED ? (
              <Badge variant="warning">
                <MaterialIcon name="build" className="mr-1 text-sm" />
                Tools available
              </Badge>
            ) : null}
          </div>
        </div>
        <WelcomeBento onSelect={(p) => void onSubmit(p)} disabled={busy} />
      </motion.div>
    </div>
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30">
      <div className="pointer-events-auto">
        <Composer onSubmit={onSubmit} busy={busy} placeholder="Type your creative request…" />
      </div>
    </div>
  </div>
);

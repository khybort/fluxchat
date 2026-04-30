import { motion } from 'framer-motion';
import { Brain } from '@phosphor-icons/react';

interface StreamingStatusProps {
  label: string;
}

export const StreamingStatus = ({ label }: StreamingStatusProps): React.JSX.Element => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    className="ml-11 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs text-muted-foreground backdrop-blur"
  >
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gradient-to-r from-brand-from via-brand-via to-brand-to opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-gradient-to-br from-brand-from to-brand-via" />
    </span>
    <Brain className="h-3 w-3 text-primary" weight="duotone" />
    {label}
  </motion.div>
);

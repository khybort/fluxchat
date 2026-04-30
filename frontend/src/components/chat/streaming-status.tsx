import { motion } from 'framer-motion';
import { BrainIcon } from '@phosphor-icons/react';

interface StreamingStatusProps {
  label: string;
}

export const StreamingStatus = ({ label }: StreamingStatusProps): React.JSX.Element => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    className="ml-11 inline-flex items-center gap-2 rounded-full border bg-secondary px-3 py-1 text-xs text-muted-foreground"
  >
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
    </span>
    <BrainIcon className="h-3 w-3" weight="bold" />
    {label}
  </motion.div>
);

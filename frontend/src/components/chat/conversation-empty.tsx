import { motion } from 'framer-motion';

import { MaterialIcon } from '@/components/ui/material-icon';
import { Skeleton } from '@/components/ui/skeleton';

export const HistorySkeleton = (): React.JSX.Element => (
  <div className="space-y-3">
    {Array.from({ length: 4 }).map((_, idx) => (
      <Skeleton
        key={idx}
        className={`h-16 w-full ${idx % 2 === 0 ? 'max-w-md' : 'ml-auto max-w-sm'}`}
      />
    ))}
  </div>
);

export const ConversationEmpty = (): React.JSX.Element => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center gap-3 py-16 text-center"
  >
    <div className="flex h-12 w-12 items-center justify-center rounded-md bg-secondary text-foreground">
      <MaterialIcon name="auto_awesome" className="h-5 w-5" />
    </div>
    <div>
      <p className="text-base font-semibold">Start the conversation</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Ask anything. Try “What’s the weather in Istanbul?” when AI tools are enabled.
      </p>
    </div>
  </motion.div>
);

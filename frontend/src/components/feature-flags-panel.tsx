import { motion } from 'framer-motion';
import { Flag, Hash } from '@phosphor-icons/react';

import type { FeatureFlagsSnapshot } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface FeatureFlagsPanelProps {
  flags: FeatureFlagsSnapshot | null;
}

const BOOLEAN_FLAGS: Array<keyof FeatureFlagsSnapshot> = [
  'STREAMING_ENABLED',
  'AI_TOOLS_ENABLED',
  'CHAT_HISTORY_ENABLED',
];

const NUMERIC_FLAGS: Array<keyof FeatureFlagsSnapshot> = [
  'PAGINATION_LIMIT',
  'RATE_LIMIT_PER_MINUTE',
];

export const FeatureFlagsPanel = ({ flags }: FeatureFlagsPanelProps): React.JSX.Element => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.15 }}
    className="rounded-lg border bg-card/60 p-3"
  >
    <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <Flag className="h-3 w-3" weight="duotone" />
      Runtime feature flags
    </div>
    {!flags ? (
      <p className="text-xs text-muted-foreground">Loading…</p>
    ) : (
      <ul className="space-y-1.5 text-xs">
        {BOOLEAN_FLAGS.map((key) => {
          const value = flags[key] as boolean;
          return (
            <li key={key} className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-[11px] text-muted-foreground">{key}</span>
              <Badge
                variant={value ? 'success' : 'secondary'}
                className={cn(
                  'h-5 px-2 text-[10px] uppercase tracking-wide',
                  !value && 'opacity-70',
                )}
              >
                {value ? 'on' : 'off'}
              </Badge>
            </li>
          );
        })}
        {NUMERIC_FLAGS.map((key) => (
          <li key={key} className="flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[11px] text-muted-foreground">{key}</span>
            <Badge variant="outline" className="gap-1 px-2 font-mono text-[10px]">
              <Hash className="h-2.5 w-2.5" />
              {flags[key]}
            </Badge>
          </li>
        ))}
      </ul>
    )}
  </motion.div>
);

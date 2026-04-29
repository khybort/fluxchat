import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Wrench } from 'lucide-react';
import { useState } from 'react';

import type { ToolCall } from '@/api/types';
import { cn } from '@/lib/utils';

interface ToolExecutionCardProps {
  tool: ToolCall;
}

export const ToolExecutionCard = ({ tool }: ToolExecutionCardProps): React.JSX.Element => {
  const [open, setOpen] = useState(true);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="my-1 ml-11 max-w-[85%] overflow-hidden rounded-xl border bg-gradient-to-br from-amber-500/5 via-transparent to-transparent shadow-sm"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-amber-500/5"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10 text-amber-300">
          <Wrench className="h-3 w-3" />
        </span>
        <span className="flex-1 truncate font-medium text-amber-200">
          Tool used: <span className="font-mono">{tool.name}</span>
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-muted-foreground"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t bg-card/50 px-3 py-3">
              <DataBlock label="Arguments" value={tool.args} />
              <DataBlock label="Result" value={tool.result} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
};

const DataBlock = ({ label, value }: { label: string; value: unknown }): React.JSX.Element => (
  <div>
    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </p>
    <pre
      className={cn(
        'scrollbar-thin overflow-x-auto rounded-md bg-background/60 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground',
      )}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  </div>
);

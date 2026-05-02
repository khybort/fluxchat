import type { FeatureFlagsSnapshot } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { MaterialIcon } from '@/components/ui/material-icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ChatHeaderProps {
  chatId: string;
  messageCount: number;
  flags: FeatureFlagsSnapshot | null;
  pendingPhase: string | null;
  onArchive: () => void;
  onDelete: () => void;
}

export const ChatHeader = ({
  chatId,
  messageCount,
  flags,
  pendingPhase,
  onArchive,
  onDelete,
}: ChatHeaderProps): React.JSX.Element => (
  <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-surface-container/40 backdrop-blur-md px-4 py-3 md:px-6">
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-tertiary/20 text-tertiary">
        <MaterialIcon name="smart_toy" filled className="text-base" />
      </span>
      <div>
        <p className="text-sm font-semibold text-on-surface">Conversation</p>
        <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">
          {messageCount} message{messageCount === 1 ? '' : 's'} ·{' '}
          {flags?.STREAMING_ENABLED ? 'streaming' : 'json'}
          {flags?.AI_TOOLS_ENABLED ? ' · tools on' : ''}
        </p>
      </div>
    </div>
    <div className="flex items-center gap-2">
      {pendingPhase ? (
        <Badge variant="success" className="gap-1.5 capitalize">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tertiary opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-tertiary" />
          </span>
          {pendingPhase}
        </Badge>
      ) : null}
      <button
        type="button"
        onClick={onArchive}
        className="group inline-flex items-center gap-2 rounded-full p-2 text-on-surface-variant transition-colors hover:bg-tertiary/10 hover:text-tertiary"
      >
        <MaterialIcon name="archive" className="text-lg" />
        <span className="hidden text-xs font-bold uppercase tracking-wider md:inline">Archive</span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="group inline-flex items-center gap-2 rounded-full p-2 text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error"
      >
        <MaterialIcon name="delete" className="text-lg" />
        <span className="hidden text-xs font-bold uppercase tracking-wider md:inline">
          Delete chat
        </span>
      </button>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Chat info"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-white/10 hover:text-on-surface"
          >
            <MaterialIcon name="info" className="text-lg" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="max-w-xs">
          <div className="space-y-1 text-[11px]">
            <p>
              <span className="text-on-surface-variant">Chat ID:</span>{' '}
              <span className="font-mono">{chatId}</span>
            </p>
            <p>
              <span className="text-on-surface-variant">Messages:</span>{' '}
              <span className="font-mono">{messageCount}</span>
            </p>
            <p>
              <span className="text-on-surface-variant">Mode:</span>{' '}
              <span className="font-mono">{flags?.STREAMING_ENABLED ? 'streaming' : 'json'}</span>
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  </div>
);

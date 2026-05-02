import { useMemo } from 'react';

import type { AdminFlagsResponse } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';

import type { FlagDescriptor } from '../flag-meta';
import { TOOL_FLAGS } from '../flag-meta';
import { LiveValueBadge } from './live-value-badge';

interface FlagRowProps {
  descriptor: FlagDescriptor;
  data: AdminFlagsResponse;
  disabled?: boolean;
  onEdit: () => void;
  onClear: () => void;
}

export const FlagRow = ({
  descriptor,
  data,
  disabled = false,
  onEdit,
  onClear,
}: FlagRowProps): React.JSX.Element => {
  const definition = data.definitions[descriptor.name];
  const liveValue = data.snapshot[descriptor.name];

  const customised = useMemo(
    () =>
      Boolean(
        (definition.rules && definition.rules.length > 0) ||
        typeof definition.percentage === 'number',
      ),
    [definition],
  );

  return (
    <li
      className={cn(
        'rounded-lg border bg-card transition-colors hover:bg-accent/30',
        disabled ? 'opacity-60' : '',
      )}
    >
      <div className="flex items-start gap-4 p-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-sm font-semibold">{descriptor.name}</code>
            <LiveValueBadge value={liveValue} />
            {disabled ? (
              <Badge variant="outline" className="border-dashed font-normal text-muted-foreground">
                master OFF
              </Badge>
            ) : null}
            {definition.rules && definition.rules.length > 0 ? (
              <Badge variant="outline" className="font-normal">
                {definition.rules.length} rule{definition.rules.length === 1 ? '' : 's'}
              </Badge>
            ) : null}
            {typeof definition.percentage === 'number' ? (
              <Badge variant="outline" className="font-normal">
                {definition.percentage}% rollout
              </Badge>
            ) : null}
            {customised ? (
              <Badge
                variant="secondary"
                className="border-primary/30 bg-primary/10 font-normal text-primary"
              >
                customised
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">{descriptor.blurb}</p>
          <p className="text-xs text-muted-foreground/80">{descriptor.effect}</p>
        </div>
        <div className="flex flex-none items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={onEdit} disabled={disabled}>
            <MaterialIcon name="edit" className="h-3.5 w-3.5" />
            Edit
          </Button>
          {customised && !TOOL_FLAGS.has(descriptor.name) ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onClear}
              className="text-error hover:bg-error/10"
              aria-label="Clear override"
            >
              <MaterialIcon name="delete" className="text-base" />
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
};

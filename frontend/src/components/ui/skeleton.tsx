import * as React from 'react';

import { cn } from '@/lib/utils';

export const Skeleton = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element => (
  <div
    className={cn(
      'animate-pulse-soft rounded-md bg-gradient-to-r from-muted via-muted/60 to-muted bg-[length:200%_100%] animate-shimmer',
      className,
    )}
    {...props}
  />
);

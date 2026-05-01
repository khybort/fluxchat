import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary-container/20 text-primary border-primary-container/30',
        secondary: 'border-transparent bg-secondary/20 text-secondary border-secondary/30',
        destructive: 'border-transparent bg-error/20 text-error border-error/30',
        outline: 'text-on-surface-variant border-white/15',
        success: 'border-tertiary/30 bg-tertiary/15 text-tertiary',
        warning: 'border-secondary/30 bg-secondary/15 text-secondary',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, variant, ...props }: BadgeProps): React.JSX.Element => (
  <div className={cn(badgeVariants({ variant }), className)} {...props} />
);

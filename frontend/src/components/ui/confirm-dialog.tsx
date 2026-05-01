import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';

type ConfirmTone = 'destructive' | 'warning' | 'default';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  icon?: string;
  onConfirm: () => void | Promise<void>;
}

const TONE_STYLES: Record<ConfirmTone, { iconBox: string; cta: string }> = {
  destructive: {
    iconBox: 'bg-error/15 text-error border-error/30',
    cta: 'bg-error text-on-error hover:bg-error/90 shadow-[0_0_24px_hsl(var(--error)/0.35)]',
  },
  warning: {
    iconBox: 'bg-secondary/15 text-secondary border-secondary/30',
    cta: 'bg-secondary text-on-secondary hover:bg-secondary/90',
  },
  default: {
    iconBox: 'bg-primary-container/15 text-primary border-primary-container/30',
    cta: 'bg-primary-container text-on-primary-container hover:bg-primary-container/90',
  },
};

export const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  icon,
  onConfirm,
}: ConfirmDialogProps): React.JSX.Element => {
  const [busy, setBusy] = useState(false);
  const styles = TONE_STYLES[tone];

  // Reset busy when the dialog re-opens (e.g. user closed and re-triggered).
  useEffect(() => {
    if (open) setBusy(false);
  }, [open]);

  const handleConfirm = async (): Promise<void> => {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const fallbackIcon = tone === 'destructive' ? 'warning' : 'help';

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader className="flex-row items-start gap-4 space-y-0">
          <span
            className={cn(
              'flex h-10 w-10 flex-none items-center justify-center rounded-xl border',
              styles.iconBox,
            )}
          >
            <MaterialIcon name={icon ?? fallbackIcon} filled className="text-xl" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-base">{title}</DialogTitle>
            {description ? (
              <DialogDescription className="mt-1.5 text-sm">{description}</DialogDescription>
            ) : null}
          </div>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={busy}
            className={cn(styles.cta)}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

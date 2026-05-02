import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MaterialIcon } from '@/components/ui/material-icon';

const MODEL_NAME = 'Claude Sonnet 4.6';

interface TopBarProps {
  onOpenMobileMenu: () => void;
}

export const TopBar = ({ onOpenMobileMenu }: TopBarProps): React.JSX.Element => (
  <header className="sticky top-0 z-20 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-surface-container/60 backdrop-blur-[30px] shadow-[0_8px_32px_rgba(0,0,0,0.3)] px-4 py-3 md:px-6">
    <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenMobileMenu}>
      <MaterialIcon name="menu" className="text-xl" />
    </Button>

    <div className="hidden items-center gap-3 md:flex">
      <span className="text-base font-bold text-on-surface">AppNation Chat</span>
      <span className="h-4 w-px bg-white/10" />
      <Badge
        variant="outline"
        className="gap-1.5 border-tertiary/30 bg-tertiary/15 text-tertiary font-normal"
      >
        <MaterialIcon name="bolt" className="text-sm" />
        {MODEL_NAME}
      </Badge>
    </div>

    <div className="flex flex-1 items-center justify-end gap-3">
      <Badge
        variant="outline"
        className="hidden gap-1.5 border-tertiary/30 bg-tertiary/10 text-tertiary font-normal md:inline-flex"
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tertiary opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-tertiary" />
        </span>
        Connected
      </Badge>
    </div>
  </header>
);

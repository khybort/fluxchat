import { MaterialIcon } from '@/components/ui/material-icon';
import { Skeleton } from '@/components/ui/skeleton';

const SKELETON_ROW_COUNT = 6;

export const ArchivedListSkeleton = (): React.JSX.Element => (
  <ul className="space-y-2">
    {Array.from({ length: SKELETON_ROW_COUNT }).map((_, idx) => (
      <li
        key={idx}
        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-surface-container/40 p-4 backdrop-blur-md"
      >
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-8 w-24" />
      </li>
    ))}
  </ul>
);

export const ArchivedEmptyState = (): React.JSX.Element => (
  <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 bg-surface-container/20 px-6 py-16 text-center">
    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-on-surface-variant">
      <MaterialIcon name="inventory_2" className="text-2xl" />
    </span>
    <p className="text-sm font-medium text-on-surface">Nothing archived yet</p>
    <p className="text-xs text-on-surface-variant">
      Archive chats from the sidebar 3-dot menu or the conversation top bar.
    </p>
  </div>
);

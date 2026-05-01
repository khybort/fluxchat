import { Skeleton } from '@/components/ui/skeleton';

export const FlagListSkeleton = ({ count = 6 }: { count?: number }): React.JSX.Element => (
  <ul className="space-y-3">
    {Array.from({ length: count }).map((_, idx) => (
      <li key={idx} className="rounded-lg border bg-card p-4">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="mt-2 h-3 w-2/3" />
        <Skeleton className="mt-1 h-3 w-1/2" />
      </li>
    ))}
  </ul>
);

export interface PageResult<T> {
  data: T[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}

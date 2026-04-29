import type { PageResult } from '../../modules/chat/chat.types.js';

/**
 * Build a `PageResult<T>` from an over-fetched array (size = limit + 1) and an id extractor.
 * If `rows.length > limit`, the last id becomes the cursor and `hasMore` is true.
 */
export const buildPagedResult = <T>(
  rows: T[],
  limit: number,
  getId: (row: T) => string,
): PageResult<T> => {
  if (rows.length > limit) {
    const data = rows.slice(0, limit);
    const last = data[data.length - 1];
    return {
      data,
      pagination: {
        nextCursor: last ? getId(last) : null,
        hasMore: true,
        limit,
      },
    };
  }
  return {
    data: rows,
    pagination: { nextCursor: null, hasMore: false, limit },
  };
};

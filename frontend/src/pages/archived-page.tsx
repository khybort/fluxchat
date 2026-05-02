import { motion } from 'framer-motion';
import { useState } from 'react';

import type { Chat } from '@/api/types';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MaterialIcon } from '@/components/ui/material-icon';
import { ScrollArea } from '@/components/ui/scroll-area';

import { ArchivedRow } from './archived/archived-row';
import { ArchivedEmptyState, ArchivedListSkeleton } from './archived/empty-state';
import { useArchivedChats } from './archived/use-archived-chats';

export const ArchivedPage = (): React.JSX.Element => {
  const archive = useArchivedChats();
  const [confirmDelete, setConfirmDelete] = useState<Chat | null>(null);

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-tertiary/20 text-tertiary border border-tertiary/30">
              <MaterialIcon name="inventory_2" filled className="text-base" />
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-on-surface">Archive</h1>
              <p className="text-xs text-on-surface-variant">
                Chats you've archived. Restore to bring them back, or delete permanently.
              </p>
            </div>
          </div>

          {archive.loading ? (
            <ArchivedListSkeleton />
          ) : archive.chats.length === 0 ? (
            <ArchivedEmptyState />
          ) : (
            <>
              <ul className="space-y-2">
                {archive.chats.map((chat) => (
                  <ArchivedRow
                    key={chat.id}
                    chat={chat}
                    onRestore={(c) => void archive.restore(c)}
                    onRequestDelete={setConfirmDelete}
                  />
                ))}
              </ul>
              {archive.hasMore ? (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => void archive.loadMore()}
                    disabled={archive.loadingMore}
                  >
                    {archive.loadingMore ? 'Loading…' : 'Load more'}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </motion.div>
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title={`Delete "${confirmDelete?.title ?? ''}" permanently?`}
        description="This cannot be undone. The chat and all of its messages will be erased."
        confirmLabel="Delete permanently"
        tone="destructive"
        icon="delete_forever"
        onConfirm={async () => {
          if (confirmDelete) await archive.deletePermanently(confirmDelete);
        }}
      />
    </ScrollArea>
  );
};

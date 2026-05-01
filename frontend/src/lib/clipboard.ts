import { toast } from 'sonner';

/**
 * Write `text` to the system clipboard and surface a small toast either way.
 * Centralised so message bubbles, code blocks, and any future copy affordances
 * share the same UX (success label customisable; failure message is constant).
 */
export const copyToClipboard = async (text: string, successLabel = 'Copied'): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successLabel);
  } catch {
    toast.error('Copy failed');
  }
};

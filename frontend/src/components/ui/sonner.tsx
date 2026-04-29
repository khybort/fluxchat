import { Toaster as SonnerToaster } from 'sonner';

export const Toaster = (): React.JSX.Element => (
  <SonnerToaster
    theme="dark"
    position="top-right"
    richColors
    closeButton
    toastOptions={{
      classNames: {
        toast:
          'group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
        description: 'group-[.toast]:text-muted-foreground',
        actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
        cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
      },
    }}
  />
);

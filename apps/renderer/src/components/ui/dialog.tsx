import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
type DialogContentProps = React.ComponentProps<typeof DialogPrimitive.Content> & {
  overlayClassName?: string;
  closeClassName?: string;
  showClose?: boolean;
};

export function DialogContent({
  className,
  overlayClassName,
  closeClassName,
  showClose = true,
  children,
  ...props
}: DialogContentProps) {
  return <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className={cn('fixed inset-0 z-50 bg-zinc-950/20 backdrop-blur-[2px] data-[state=open]:animate-in dark:bg-black/55', overlayClassName)} />
    <DialogPrimitive.Content className={cn('fixed left-1/2 top-1/2 z-50 grid w-[min(92vw,620px)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-border bg-popover p-6 text-popover-foreground shadow-panel', className)} {...props}>
      {children}
      {showClose ? <DialogPrimitive.Close
        aria-label="关闭弹窗"
        className={cn('absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', closeClassName)}
      ><X className="h-4 w-4" /></DialogPrimitive.Close> : null}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>;
}
export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('flex flex-col gap-1.5', className)} {...props} />; }
export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) { return <DialogPrimitive.Title className={cn('text-lg font-semibold tracking-tight', className)} {...props} />; }
export function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) { return <DialogPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />; }

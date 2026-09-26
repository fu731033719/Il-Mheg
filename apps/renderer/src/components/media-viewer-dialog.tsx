import { Clapperboard, FileImage } from 'lucide-react';
import type { PublicAsset } from '@ilmheg/contracts';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export type MediaViewerTarget = {
  asset: PublicAsset;
  title: string;
};

export function MediaViewerDialog({ target, onOpenChange }: {
  target: MediaViewerTarget | null;
  onOpenChange(open: boolean): void;
}) {
  const asset = target?.asset;
  const isVideo = asset?.mimeType.startsWith('video/') ?? false;

  return <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
    {target && asset ? <DialogContent
      aria-describedby={undefined}
      overlayClassName="bg-zinc-950/70 backdrop-blur-xl dark:bg-black/80"
      closeClassName="right-3 top-3 z-10 rounded-full border border-white/15 bg-black/45 p-2 text-white/85 shadow-lg backdrop-blur-md hover:bg-black/65 hover:text-white focus-visible:ring-white/70"
      className="h-[min(90vh,1000px)] w-[min(94vw,1600px)] max-w-none gap-0 overflow-hidden border-0 bg-transparent p-0 text-white shadow-none"
    >
      <DialogTitle className="sr-only">查看{target.title}</DialogTitle>
      <div className="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-2xl">
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-4.5rem)] items-center gap-2 rounded-full border border-white/15 bg-black/45 px-3 py-2 text-xs text-white/90 shadow-lg backdrop-blur-md">
          {isVideo ? <Clapperboard className="h-4 w-4 shrink-0" /> : <FileImage className="h-4 w-4 shrink-0" />}
          <span className="truncate font-medium">{target.title}</span>
          <span className="hidden truncate text-white/55 sm:inline">{asset.fileName}</span>
        </div>
        {isVideo ? <video
          key={asset.id}
          src={asset.url}
          controls
          autoPlay
          playsInline
          className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
        /> : <img
          key={asset.id}
          src={asset.url}
          alt={target.title}
          className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
        />}
      </div>
    </DialogContent> : null}
  </Dialog>;
}

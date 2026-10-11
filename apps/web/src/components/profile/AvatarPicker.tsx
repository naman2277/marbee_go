import { useRef, useState } from 'react';
import { Camera, Check, ImageIcon, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button, Card } from '@/components/ui';
import { PREDEFINED_AVATARS } from '@/lib/user-avatar';
import { cn } from '@/lib/utils';

type AvatarPickerProps = {
  name?: string | null;
  email?: string | null;
  seed?: string;
  value?: string | null;
  disabled?: boolean;
  onChange: (url: string) => void | Promise<void>;
  onUpload?: (file: File) => Promise<string>;
};

export function AvatarPicker({
  name,
  email,
  seed,
  value,
  disabled,
  onChange,
  onUpload,
}: AvatarPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    if (!onUpload) {
      setError('Upload is not available');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be 2 MB or smaller');
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const url = await onUpload(file);
      await onChange(url);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const selectPredefined = async (url: string) => {
    setError(null);
    await onChange(url);
    setOpen(false);
  };

  return (
    <>
      <div className="flex items-center gap-4">
        <Avatar name={name} email={email} seed={seed} src={value} size="xl" />
        <div>
          <p className="text-sm font-medium text-slate-900">Profile photo</p>
          <p className="mt-1 text-xs text-slate-500">
            Choose a predefined avatar or upload from your device.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            disabled={disabled || uploading}
            onClick={() => {
              setError(null);
              setOpen(true);
            }}
          >
            <ImageIcon className="mr-2 h-4 w-4" />
            Select avatar
          </Button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Select avatar</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Pick a style or upload a photo from your device.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Predefined avatars
              </p>
              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                {PREDEFINED_AVATARS.map((item) => {
                  const selected = value === item.url;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={item.label}
                      disabled={disabled || uploading}
                      onClick={() => void selectPredefined(item.url)}
                      className={cn(
                        'relative rounded-full p-0.5 transition ring-2',
                        selected ? 'ring-brand-500' : 'ring-transparent hover:ring-slate-200',
                      )}
                    >
                      <img src={item.url} alt={item.label} className="h-12 w-12 rounded-full" />
                      {selected && (
                        <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {onUpload && (
              <div className="mt-6 border-t border-slate-100 pt-6">
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  disabled={disabled || uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFile(file);
                    e.target.value = '';
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={disabled || uploading}
                  onClick={() => inputRef.current?.click()}
                >
                  <Camera className="mr-2 h-4 w-4" />
                  {uploading ? 'Uploading…' : 'Upload from device'}
                </Button>
                <p className="mt-2 text-xs text-slate-500">PNG, JPG, WEBP or GIF · max 2 MB</p>
              </div>
            )}

            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

            <div className="mt-6 flex justify-end">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

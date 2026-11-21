import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Check,
  FolderOpen,
  Loader2,
  Lock,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui';
import {
  fetchAssets,
  formatAssetSize,
  getPublicCopyUrl,
  uploadPublishedSystemAsset,
  type SystemAssetTarget,
} from '@/lib/assets';
import { useTenantScope } from '@/contexts/AuthContext';

type Props = {
  target: SystemAssetTarget;
  value: string;
  onChange: (url: string) => void;
  label?: string;
  placeholder?: string;
};

export function SystemImageUploader({
  target,
  value,
  onChange,
  label = 'Image Source',
  placeholder = 'https://… or upload file',
}: Props) {
  const { tenantId, environment } = useTenantScope();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const folderName =
    target === 'templates'
      ? 'Templates'
      : target === 'forms'
      ? 'Forms'
      : target === 'social'
      ? 'Social'
      : 'Landing Pages';

  const folderPath =
    target === 'templates'
      ? '/Templates'
      : target === 'forms'
      ? '/Forms'
      : target === 'social'
      ? '/Social'
      : '/Landing Pages';

  const { data: assets = [] } = useQuery({
    queryKey: ['assets', tenantId, environment],
    queryFn: () => fetchAssets(tenantId, environment),
    enabled: showPicker,
  });

  const folderAssets = assets.filter(
    (a) => a.folder === folderPath && a.public_url && a.mime_type?.startsWith('image/'),
  );

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setUploadError(null);
      const res = await uploadPublishedSystemAsset(tenantId, environment, file, target);
      if (res.error || !res.publicUrl) {
        setUploadError(res.error || 'Upload failed');
        return;
      }
      onChange(res.publicUrl);
    } catch (err: any) {
      setUploadError(err.message || 'Upload error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-center justify-between">
        <label className="font-bold text-slate-700">{label}</label>
        <span className="text-[10px] font-bold text-indigo-600 flex items-center gap-1">
          <Lock className="h-2.5 w-2.5" /> Saves to /{folderName}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono focus:border-brand-500 focus:outline-none"
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelected}
        />

        <Button
          size="sm"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="rounded-xl px-2.5 py-1.5 font-bold shadow-xs bg-brand-600 hover:bg-brand-700 text-white shrink-0"
          title={`Upload directly to /${folderName} and publish`}
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <Upload className="mr-1 h-3.5 w-3.5" />
              Upload
            </>
          )}
        </Button>

        <Button
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => setShowPicker((v) => !v)}
          className="rounded-xl px-2 py-1.5 text-slate-600 shrink-0"
          title={`Choose existing image from /${folderName}`}
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </Button>
      </div>

      {uploadError && (
        <p className="text-[11px] font-bold text-rose-600">{uploadError}</p>
      )}

      {/* Media Picker Dropdown from System Folder */}
      {showPicker && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-3 space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800 text-[11px]">
              Select from /{folderName} ({folderAssets.length})
            </span>
            <button
              type="button"
              onClick={() => setShowPicker(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {folderAssets.length > 0 ? (
            <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto p-1">
              {folderAssets.map((asset) => {
                const cdn = getPublicCopyUrl(asset);
                if (!cdn) return null;
                const isSelected = value === cdn;

                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => {
                      onChange(cdn);
                      setShowPicker(false);
                    }}
                    className={`group relative aspect-video overflow-hidden rounded-xl border transition-all ${
                      isSelected
                        ? 'border-brand-500 ring-2 ring-brand-300'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                    title={`${asset.name} (${formatAssetSize(asset.file_size)})`}
                  >
                    <img
                      src={cdn}
                      alt={asset.name}
                      className="h-full w-full object-cover"
                    />
                    {isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-brand-600/30">
                        <Check className="h-4 w-4 text-white font-bold" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 italic py-1">
              No images published in /{folderName} yet. Upload one using the button above.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

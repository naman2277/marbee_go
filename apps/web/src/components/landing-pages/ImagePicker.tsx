import { useState, useRef } from 'react';
import { UploadCloud, Link as LinkIcon, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { uploadLandingPageAsset } from '@/lib/assets';
import { useTenantScope } from '@/contexts/AuthContext';

type Props = {
  label: string;
  value: string;
  onChange: (url: string) => void;
};

export function ImagePicker({ label, value, onChange }: Props) {
  const { tenantId, environment } = useTenantScope();
  const [tab, setTab] = useState<'url' | 'upload'>('url');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate image
    if (!file.type.startsWith('image/')) {
      setError('Only image files are allowed.');
      return;
    }
    
    // Max 5MB
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB.');
      return;
    }

    setUploading(true);
    setError('');

    try {
      // 1. Upload to Asset Library under '/Landing Pages' and publish to public CDN
      const { publicUrl, error: upError } = await uploadLandingPageAsset(tenantId, environment, file);
      
      if (upError || !publicUrl) {
        throw new Error(upError || 'Failed to upload and publish image');
      }

      // 2. Set the public URL
      onChange(publicUrl);
      setTab('url'); // Switch back to URL tab to show the result
    } catch (err: any) {
      setError(err.message || 'An error occurred during upload.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = ''; // reset
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-slate-600">{label}</label>
      </div>
      
      <div className="flex rounded-md bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setTab('url')}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded py-1.5 text-xs font-medium transition-colors ${tab === 'url' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <LinkIcon className="h-3 w-3" /> URL
        </button>
        <button
          type="button"
          onClick={() => setTab('upload')}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded py-1.5 text-xs font-medium transition-colors ${tab === 'upload' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <UploadCloud className="h-3 w-3" /> Upload
        </button>
      </div>

      {tab === 'url' ? (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://example.com/image.png"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center hover:bg-slate-50 transition-colors cursor-pointer relative" onClick={() => fileInputRef.current?.click()}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
          {uploading ? (
            <div className="flex flex-col items-center justify-center text-brand-600">
              <Loader2 className="h-5 w-5 animate-spin mb-2" />
              <p className="text-xs font-medium">Uploading & Publishing...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-500">
              <UploadCloud className="h-6 w-6 mb-2 opacity-50" />
              <p className="text-xs font-medium text-slate-700">Click to browse</p>
              <p className="text-[10px] mt-1 text-slate-400">JPG, PNG, GIF up to 5MB</p>
            </div>
          )}
        </div>
      )}
      
      {error && <p className="text-xs text-red-600 font-medium mt-1">{error}</p>}
      
      {value && tab === 'upload' && !uploading && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium mt-2">
          <CheckCircle2 className="h-3.5 w-3.5" /> Upload successful
        </div>
      )}
    </div>
  );
}

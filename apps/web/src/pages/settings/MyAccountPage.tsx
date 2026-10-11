import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { AvatarPicker } from '@/components/profile/AvatarPicker';
import { LastLoginCard } from '@/components/profile/LastLoginCard';
import { Button, Card, PageHeader } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { uploadAvatarImage, updateMyProfile } from '@/lib/profile';
import { getDisplayName } from '@/lib/user-avatar';

export function MyAccountPage() {
  const { user, profile, displayName, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(profile?.name ?? displayName);
    setAvatarUrl(profile?.avatarUrl ?? null);
  }, [profile, displayName]);

  const email = profile?.email ?? user?.email ?? '';

  const saveMutation = useMutation({
    mutationFn: () =>
      updateMyProfile({
        name,
        avatarUrl,
      }),
    onSuccess: async () => {
      await refreshProfile();
      setMessage('Account updated.');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['access-members'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const greetingName = useMemo(
    () => getDisplayName(name, email),
    [name, email],
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="My account"
        description="Manage your profile photo and display name across Marbee."
      />

      <Card className="space-y-6 p-6">
        <AvatarPicker
          name={name}
          email={email}
          seed={user?.id}
          value={avatarUrl}
          onChange={async (url) => {
            setAvatarUrl(url);
            setMessage(null);
          }}
          onUpload={user?.id ? (file) => uploadAvatarImage(user.id, file) : undefined}
        />

        <LastLoginCard lastLoginAt={profile?.lastLoginAt ?? null} />

        <div>
          <label className="text-xs font-medium text-slate-600">Display name</label>
          <input
            type="text"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={greetingName}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Login email</label>
          <input
            type="email"
            readOnly
            className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
            value={email}
          />
        </div>

        {message && <p className="text-sm text-emerald-700">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end">
          <Button
            disabled={saveMutation.isPending || !name.trim()}
            onClick={() => saveMutation.mutate()}
          >
            <Save className="mr-2 h-4 w-4" />
            Save account
          </Button>
        </div>
      </Card>
    </div>
  );
}

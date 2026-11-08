// Supabase Storage uploads. RLS restricts writes to the signed-in user's own
// <auth.uid>/ folder; the bucket is public so avatars/badges can be displayed.
import { supabase } from '@/lib/supabase';

export type MediaKind = 'avatar' | 'badge';
const MAX_BYTES = 5 * 1024 * 1024;

export async function uploadMediaFromUri(userId: string, kind: MediaKind, uri: string) {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Could not read the selected image.');
  const blob = await response.blob();
  return uploadMediaBlob(userId, kind, blob);
}

export async function uploadMediaBlob(userId: string, kind: MediaKind, blob: Blob) {
  if (blob.size > MAX_BYTES) throw new Error('Please choose an image smaller than 5 MB.');
  const path = `${userId}/${kind}`;
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function removeMedia(userId: string, kind: MediaKind) {
  const { error } = await supabase.storage.from('avatars').remove([`${userId}/${kind}`]);
  if (error) throw error;
}

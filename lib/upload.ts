import { readAsStringAsync, EncodingType } from 'expo-file-system';
import { Buffer } from 'buffer';
import { supabase } from './supabase';

export async function uploadImage(
  bucket: string,
  path: string,
  uri: string,
  mime?: string
): Promise<string> {
  let bytes: Uint8Array | Buffer;
  try {
    const r = await fetch(uri);
    const b: any = await r.blob();
    if (typeof b.arrayBuffer === 'function') {
      const ab = await b.arrayBuffer();
      bytes = new Uint8Array(ab);
    } else {
      const b64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
      bytes = Buffer.from(b64, 'base64');
    }
  } catch {
    const b64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
    bytes = Buffer.from(b64, 'base64');
  }

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, { contentType: mime || 'image/jpeg', upsert: true });
  if (error) throw error;

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
  return `${pub.publicUrl}?v=${Date.now()}`;
}
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import type { PickedFile } from './attachments';

/**
 * Native side of the picker seam (web sibling: filePicker.web.ts).
 *
 * The two platforms genuinely cannot share this. A browser's file input hands
 * back a `File`, which already IS a Blob; a native picker hands back a
 * `file://` (or `content://`) URI and nothing else. The Storage SDK wants a
 * Blob either way.
 *
 * Autolinked with no config plugin, so it needs a native rebuild but no
 * prebuild — which matters here, because `android/` is committed rather than
 * regenerated.
 */
export type PickSource = 'files' | 'photos' | 'camera';

/**
 * All three on a phone. The document picker alone would technically reach
 * photos through the storage-access UI, but "attach the photo I just took" is
 * the commonest thing anyone wants to do from a phone and it should not cost
 * four taps through a file browser.
 */
export const PICK_SOURCES: readonly PickSource[] = ['files', 'photos', 'camera'];

/**
 * URI to Blob, plus the type the picker declared.
 *
 * React Native's Blob layer resolves a local URI through fetch — the bridge the
 * web side does not need. A picker can also hand back a TYPELESS blob, and
 * carrying its declared mime matters: without it the upload records
 * application/octet-stream, and every file then downloads instead of opening
 * in a viewer.
 */
async function toPickedFile(
  uri: string,
  name: string,
  mimeType: string | undefined,
): Promise<PickedFile> {
  const blob = await (await fetch(uri)).blob();
  const typed =
    mimeType && (!blob.type || blob.type === 'application/octet-stream')
      ? blob.slice(0, blob.size, mimeType)
      : blob;
  return {
    blob: typed,
    name: name || 'file',
    contentType: mimeType || typed.type || 'application/octet-stream',
  };
}

/**
 * Names that carry no meaning to a person.
 *
 * The gallery reports a MediaStore id (`1000000089.png`) and the camera a raw
 * UUID (`2ebca2da-f044-...jpg`), so `fileName` is present but useless — a card
 * with three photos would list three identifiers nobody can tell apart. Both
 * are treated as absent so a readable name is generated instead.
 */
function isOpaqueName(base: string): boolean {
  return /^\d+$/.test(base) || /^[0-9a-f]{8}-[0-9a-f-]{8,}$/i.test(base);
}

/** `photo-2026-07-27-1432.jpg` — the timestamp is what makes one recognisable. */
function nameFor(asset: ImagePicker.ImagePickerAsset, kind: 'photo' | 'image'): string {
  const ext = (asset.mimeType?.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
  const reported = asset.fileName ?? '';
  const base = reported.replace(/\.[^.]+$/, '');
  if (reported && base && !isOpaqueName(base)) return reported;

  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  return `${kind}-${stamp}.${ext}`;
}

async function pickImage(source: 'photos' | 'camera'): Promise<PickedFile | null> {
  if (source === 'camera') {
    // Asking is not optional and the refusal is quiet: without the grant,
    // launchCameraAsync returns as if the person cancelled, so a missing
    // permission looks exactly like backing out.
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      throw new Error('Allow camera access to attach a photo.');
    }
  }

  const res =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
        });

  const asset = res.canceled ? null : res.assets?.[0];
  if (!asset) return null;
  return toPickedFile(
    asset.uri,
    nameFor(asset, source === 'camera' ? 'photo' : 'image'),
    asset.mimeType,
  );
}

export async function pickAttachment(source: PickSource): Promise<PickedFile | null> {
  if (source !== 'files') return pickImage(source);

  const res = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    // Copy into the app's cache, or the URI can be revoked the moment the
    // picker closes and the upload reads from nothing.
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = res.canceled ? null : res.assets?.[0];
  if (!asset) return null; // backed out

  return toPickedFile(asset.uri, asset.name, asset.mimeType);
}

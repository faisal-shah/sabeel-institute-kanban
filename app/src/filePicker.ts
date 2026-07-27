import * as DocumentPicker from 'expo-document-picker';
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
 * Files only for now. Android's document picker already reaches Photos,
 * Downloads and Drive through the storage-access UI, so this is not a dead end
 * while the camera path lands separately.
 */
export const PICK_SOURCES: readonly PickSource[] = ['files'];

export async function pickAttachment(_source: PickSource): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    // Copy into the app's cache, or the URI can be revoked the moment the
    // picker closes and the upload reads from nothing.
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = res.canceled ? null : res.assets?.[0];
  if (!asset) return null; // backed out

  // React Native's Blob layer resolves a local URI through fetch. This is the
  // bridge the web side does not need.
  const blob = await (await fetch(asset.uri)).blob();

  // Some pickers hand back a typeless blob. Carry the picker's declared type or
  // the upload records application/octet-stream, and the file then downloads
  // instead of opening in a viewer.
  const typed =
    asset.mimeType && (!blob.type || blob.type === 'application/octet-stream')
      ? blob.slice(0, blob.size, asset.mimeType)
      : blob;

  return {
    blob: typed,
    name: asset.name || 'file',
    contentType: asset.mimeType || typed.type || 'application/octet-stream',
  };
}

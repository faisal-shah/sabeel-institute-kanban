import type { PickedFile } from './attachments';

/**
 * Web side of the picker seam (native sibling: filePicker.ts).
 *
 * A plain file input gives the OS picker for free, and the `File` it hands back
 * already IS a Blob — which is the whole reason the two platforms cannot share
 * this code. A native picker returns a `file://` URI and has to be read into
 * bytes first.
 */
export type PickSource = 'files' | 'photos' | 'camera';

/**
 * What this platform can offer. The browser has one picker and it already
 * reaches photos, so a "where from?" sheet would be a menu with one item.
 */
export const PICK_SOURCES: readonly PickSource[] = ['files'];

export function pickAttachment(_source: PickSource): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    // Resolving null on cancel rather than never settling: a promise left
    // hanging would leave the attach button spinning with no way back.
    input.addEventListener('cancel', () => resolve(null));
    input.addEventListener('change', () => {
      const file = input.files?.[0] ?? null;
      if (!file) return resolve(null);
      resolve({
        blob: file,
        name: file.name,
        // A browser can hand back an empty type for an unrecognised extension.
        contentType: file.type || 'application/octet-stream',
      });
    });
    input.click();
  });
}

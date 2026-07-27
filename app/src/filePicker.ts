import type { PickedFile } from './attachments';

/**
 * Native side of the picker seam (web sibling: filePicker.web.ts).
 *
 * NOT IMPLEMENTED YET — the native modules land with the Android phase. Web
 * ships first because it needs no new dependencies, while native needs a
 * document picker, the file system and a share/intent path, all of which force
 * a new APK rather than a JS-only update.
 *
 * `PICK_SOURCES` is empty until then, and the UI hides the attach control
 * rather than offering something that cannot work.
 */
export type PickSource = 'files' | 'photos' | 'camera';

export const PICK_SOURCES: readonly PickSource[] = [];

export async function pickAttachment(_source: PickSource): Promise<PickedFile | null> {
  return null;
}

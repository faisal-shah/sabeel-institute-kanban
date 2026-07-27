import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { attachmentCacheName } from '@sabeel/shared';

/**
 * Native side of the open seam (web sibling: openAttachment.web.ts).
 *
 * A browser can be handed a URL and left to it. Android cannot: a viewer will
 * not take a remote https URL, and it will not read a raw `file://` path out of
 * another app's sandbox either. So the file is downloaded into this app's own
 * cache, exposed through the FileProvider as a `content://` URI, and handed to
 * whichever app claims its type.
 *
 * The legacy FileSystem surface is deliberate: `getContentUriAsync` is
 * Android-only and exists nowhere else, and the sibling recording app imports
 * the same path for its CSV export.
 */

/**
 * expo-sharing holds exactly ONE pending promise, set before the chooser starts
 * and cleared only when the activity result comes back (SharingModule.kt). A
 * share that arrives while another is outstanding is rejected, and the rejection
 * reads "Call to function 'ExpoSharing.shareAsync' has been rejected. → Caused
 * by: Another share request is being processed now." — a sentence about function
 * calls, shown verbatim to someone who just wanted to read a PDF.
 *
 * The caller stops the ordinary cause (a double tap) synchronously, so reaching
 * this means the native slot is genuinely occupied: a chooser still on screen,
 * or one that went away without delivering a result and left the slot stuck.
 * Matched on the CODE, not the message — expo derives `ERR_SHARING_IN_PROGRESS`
 * from the exception class name, so it survives a rewording upstream.
 */
const SHARING_BUSY = 'ERR_SHARING_IN_PROGRESS';

function isSharingBusy(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === SHARING_BUSY;
}

async function shareInstead(uri: string, mimeType: string): Promise<void> {
  if (!(await isAvailableAsync())) {
    throw new Error('No app on this device can open that file.');
  }
  try {
    // The share sheet lists everything that can take the file — save it to
    // Drive, send it on — which beats "nothing happened" when no viewer claims
    // the type.
    await shareAsync(uri, { mimeType, dialogTitle: 'Open with' });
  } catch (e) {
    if (isSharingBusy(e)) {
      throw new Error('Another file is still opening. Finish with it, then try this one again.');
    }
    throw e;
  }
}

export async function openAttachment(
  file: { id: string; name: string; contentType: string },
  getUrl: () => Promise<string>,
): Promise<void> {
  const url = await getUrl();
  const target = `${FileSystem.cacheDirectory ?? ''}${attachmentCacheName(file.id, file.name)}`;
  await FileSystem.downloadAsync(url, target);

  if (Platform.OS !== 'android') {
    await shareInstead(target, file.contentType);
    return;
  }

  const contentUri = await FileSystem.getContentUriAsync(target);
  try {
    // ACTION_VIEW is what "open in whatever the system reader is" means here.
    //
    // `flags: 1` is FLAG_GRANT_READ_URI_PERMISSION and is not optional: the URI
    // belongs to this app's FileProvider, so without the grant the viewer is
    // handed a path it is not allowed to read.
    //
    // The app manifest also needs a <queries> entry for VIEW with mimeType
    // */*. On API 30+ package visibility hides every handler from us, and the
    // symptom is an open that silently resolves to nothing at all.
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: 1,
      type: file.contentType,
    });
  } catch {
    // ActivityNotFoundException: nothing installed claims this type.
    await shareInstead(target, file.contentType);
  }
}

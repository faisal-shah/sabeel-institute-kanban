/**
 * Native side of the open seam (web sibling: openAttachment.web.ts).
 *
 * NOT IMPLEMENTED YET — see filePicker.ts. Opening a file in the system viewer
 * on Android means downloading it to the cache, converting the path to a
 * `content://` URI and firing an ACTION_VIEW intent, which needs native modules
 * and therefore a new APK.
 *
 * It throws rather than doing nothing: a control that silently no-ops is worse
 * than one that says it cannot help, and the attach control is hidden on native
 * until then anyway, so nothing should reach this.
 */
export async function openAttachment(_getUrl: () => Promise<string>): Promise<void> {
  throw new Error('Opening attachments needs a newer version of the app.');
}

/**
 * Web side of the open seam (native sibling: openAttachment.ts).
 *
 * How the file presents — rendered in place or downloaded — is decided by the
 * `Content-Disposition` stored on the object at finalize, not here. This only
 * has to get the tab open.
 */
export async function openAttachment(
  // The name and type only matter on native, which has to write the file to
  // disk and tell an intent what it is. Here the stored Content-Disposition
  // already carries both.
  _file: { id: string; name: string; contentType: string },
  getUrl: () => Promise<string>,
): Promise<void> {
  // Open the tab SYNCHRONOUSLY, while the tap is still the reason anything is
  // happening. Awaiting the URL first and calling window.open after is the
  // classic popup-blocker false negative: the browser sees a programmatic open
  // with no user gesture behind it, silently blocks it, and nothing happens and
  // nothing throws.
  //
  // Deliberately no 'noopener' feature string: it makes window.open return null
  // in most browsers, which is precisely the handle needed to navigate the tab
  // once the URL arrives. The opener is severed below instead.
  const tab = window.open('', '_blank');

  try {
    const url = await getUrl();
    if (!tab || tab.closed) {
      // Popups blocked. Navigating this tab still opens the file, and the
      // stored disposition means an inline type renders rather than replacing
      // the app with a download.
      window.location.assign(url);
      return;
    }
    // An attachment may be served inline from a googleapis.com origin, so the
    // opened document must not keep a handle back to the app. Its own try:
    // assigning `opener` throws in some browsers, and severing the reference
    // failing must not stop the file opening — the tab is about to navigate
    // cross-origin anyway.
    try {
      tab.opener = null;
    } catch {
      /* browser refused the assignment; the navigation below still matters */
    }
    tab.location.replace(url);
  } catch (e) {
    // Never leave a blank tab sitting there after a failure.
    tab?.close();
    throw e;
  }
}

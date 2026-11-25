// Copy text to the clipboard, including on http:// pages opened over the local network.

/**
 * Returns true if the text was copied.
 *
 * Browsers only provide navigator.clipboard on secure pages (https:// or localhost). On
 * http://192.168.x.x (testing from other devices on the network) it is undefined, so we
 * fall back to the older execCommand('copy') on a hidden text box, which still works there.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Blocked (e.g. no permission): try the fallback below.
    }
  }
  return copyWithTextArea(text)
}

function copyWithTextArea(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '') // no on-screen keyboard on phones
  area.style.position = 'fixed' // don't scroll the page
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  try {
    // Deprecated, but the only way to copy on non-secure pages.
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}

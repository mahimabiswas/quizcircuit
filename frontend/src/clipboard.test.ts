import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard'

/** Pretend the browser does (or doesn't) give us navigator.clipboard. */
function setClipboard(value: { writeText: (text: string) => Promise<void> } | undefined) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
}

/** Pretend document.execCommand('copy') returns `result` (or throws). */
function setExecCommand(result: boolean | Error) {
  const execCommand = vi.fn(() => {
    if (result instanceof Error) throw result
    return result
  })
  Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })
  return execCommand
}

afterEach(() => {
  setClipboard(undefined)
  Reflect.deleteProperty(document, 'execCommand')
})

describe('copyText', () => {
  it('uses the Clipboard API on secure pages', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    const execCommand = setExecCommand(true)
    expect(await copyText('http://localhost:5173/join/QC-1')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('http://localhost:5173/join/QC-1')
    expect(execCommand).not.toHaveBeenCalled()
  })

  it('falls back to execCommand on http:// network pages, where the API is missing', async () => {
    setClipboard(undefined)
    const execCommand = setExecCommand(true)
    expect(await copyText('http://192.168.1.20:5173/join/QC-1')).toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull() // the hidden text box is removed
  })

  it('falls back when the Clipboard API refuses', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) })
    setExecCommand(true)
    expect(await copyText('link')).toBe(true)
  })

  it('reports failure when nothing works', async () => {
    setClipboard(undefined)
    setExecCommand(false)
    expect(await copyText('link')).toBe(false)
    setExecCommand(new Error('not supported'))
    expect(await copyText('link')).toBe(false)
  })
})

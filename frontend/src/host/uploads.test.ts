import { describe, expect, it } from 'vitest'
import { MAX_FILE_BYTES, addFiles, fileKind, fileProblem, formatSize } from './uploads'

function file(name: string, size = 1000): File {
  // A File whose reported size we control, without allocating the bytes.
  const f = new File(['x'], name)
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('fileProblem', () => {
  it('accepts PDF, TXT and MD files, whatever the case of the extension', () => {
    for (const name of ['notes.pdf', 'NOTES.PDF', 'a.txt', 'readme.md']) {
      expect(fileProblem(file(name))).toBeNull()
    }
  })

  it('rejects other types and suggests exporting slides as PDF', () => {
    expect(fileProblem(file('slides.pptx'))).toBe(
      '"slides.pptx" isn\'t a PDF, TXT or MD file. Export slides as PDF first.',
    )
    expect(fileProblem(file('no-extension'))).not.toBeNull()
  })

  it('rejects files over 10 MB, and empty files', () => {
    expect(fileProblem(file('big.pdf', MAX_FILE_BYTES + 1))).toBe('"big.pdf" is larger than 10 MB.')
    expect(fileProblem(file('ok.pdf', MAX_FILE_BYTES))).toBeNull()
    expect(fileProblem(file('empty.txt', 0))).toBe('"empty.txt" is empty.')
  })
})

describe('addFiles', () => {
  it('adds usable files and reports the rest', () => {
    const { files, problems } = addFiles([], [file('a.pdf'), file('b.pptx'), file('c.md')])
    expect(files.map((f) => f.name)).toEqual(['a.pdf', 'c.md'])
    expect(problems).toHaveLength(1)
  })

  it('skips a file that was already added', () => {
    const a = file('a.pdf', 500)
    const { files, problems } = addFiles([a], [file('a.pdf', 500)])
    expect(files).toHaveLength(1)
    expect(problems).toEqual([])
  })

  it('stops at three files', () => {
    const { files, problems } = addFiles(
      [file('1.pdf')],
      [file('2.pdf'), file('3.pdf'), file('4.pdf')],
    )
    expect(files.map((f) => f.name)).toEqual(['1.pdf', '2.pdf', '3.pdf'])
    expect(problems).toEqual(['You can upload at most 3 files. "4.pdf" wasn\'t added.'])
  })
})

describe('labels', () => {
  it('shows the file kind and a readable size', () => {
    expect(fileKind('notes.pdf')).toBe('PDF')
    expect(fileKind('readme.md')).toBe('MD')
    expect(formatSize(2_400_000)).toBe('2.3 MB')
    expect(formatSize(48_000)).toBe('47 KB')
    expect(formatSize(10)).toBe('1 KB')
  })
})

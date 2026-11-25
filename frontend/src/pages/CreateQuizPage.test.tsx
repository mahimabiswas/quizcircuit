import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CreateQuizPage } from './CreateQuizPage'

function file(name: string, size = 2000): File {
  const f = new File(['x'], name)
  Object.defineProperty(f, 'size', { value: size })
  return f
}

function renderPage(props: { busy?: boolean; error?: string | null } = {}) {
  const onGenerate = vi.fn()
  render(<CreateQuizPage onGenerate={onGenerate} {...props} />)
  const user = userEvent.setup({ applyAccept: false }) // let tests pick "wrong" files too
  return {
    onGenerate,
    user,
    upload: (...files: File[]) => user.upload(screen.getByLabelText('Upload files'), files),
    generateButton: () => screen.getByRole('button', { name: 'Generate quiz' }),
    fileList: () => screen.queryByRole('list', { name: 'Files to use' }),
  }
}

describe('CreateQuizPage', () => {
  it('starts with no files, 10 questions, an automatic mix, and Generate disabled', () => {
    const { generateButton } = renderPage()
    expect(screen.getByRole('heading', { name: 'Create a quiz' })).toBeInTheDocument()
    expect(screen.getByLabelText('questions')).toHaveTextContent('10')
    expect(screen.getByRole('radio', { name: 'auto' })).toHaveAttribute('aria-checked', 'true')
    expect(generateButton()).toBeDisabled()
  })


  it('lists uploaded files with their type and size', async () => {
    const { upload, fileList, generateButton } = renderPage()
    await upload(file('lecture.pdf', 2_400_000), file('notes.md', 48_000))
    const rows = within(fileList()!).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('PDFlecture.pdf2.3 MB')
    expect(rows[1]).toHaveTextContent('MDnotes.md47 KB')
    expect(generateButton()).toBeEnabled()
  })

  it('removes a file', async () => {
    const { upload, user, fileList } = renderPage()
    await upload(file('a.pdf'), file('b.pdf'))
    await user.click(screen.getByRole('button', { name: 'Remove a.pdf' }))
    expect(within(fileList()!).getAllByRole('listitem')).toHaveLength(1)
  })

  it('explains files it cannot use', async () => {
    const { upload, fileList } = renderPage()
    await upload(file('slides.pptx'), file('ok.pdf'))
    expect(screen.getByRole('alert')).toHaveTextContent('Export slides as PDF first')
    expect(within(fileList()!).getAllByRole('listitem')).toHaveLength(1)
  })

  it('accepts files dropped onto the drop zone', () => {
    const { fileList } = renderPage()
    const zone = screen.getByText('Drop your notes or slides here').parentElement!
    fireEvent.drop(zone, { dataTransfer: { files: [file('dropped.txt')] } })
    expect(within(fileList()!).getByText('dropped.txt')).toBeInTheDocument()
  })

  it('changes the number of questions within 5 to 20', async () => {
    const { user } = renderPage()
    const fewer = screen.getByRole('button', { name: 'Fewer questions' })
    for (let i = 0; i < 10; i++) await user.click(fewer)
    expect(screen.getByLabelText('questions')).toHaveTextContent('5')
    expect(fewer).toBeDisabled()
  })

  it('keeps a custom mix adding up to the total', async () => {
    const { user } = renderPage()
    await user.click(screen.getByRole('radio', { name: 'custom' }))
    expect(screen.getByLabelText('multiple choice questions')).toHaveTextContent('7')
    expect(screen.getByLabelText('true/false questions')).toHaveTextContent('3')
    await user.click(screen.getByRole('button', { name: 'More true/false questions' }))
    expect(screen.getByLabelText('multiple choice questions')).toHaveTextContent('6')
    expect(screen.getByLabelText('true/false questions')).toHaveTextContent('4')
    expect(screen.getByText('Total: 10 questions')).toBeInTheDocument()
  })

  it('sends the files, the count and an automatic mix', async () => {
    const { upload, user, generateButton, onGenerate } = renderPage()
    const pdf = file('lecture.pdf')
    await upload(pdf)
    await user.click(screen.getByRole('button', { name: 'More questions' }))
    await user.click(generateButton())
    expect(onGenerate).toHaveBeenCalledWith({ files: [pdf], count: 11, trueFalse: null })
  })

  it('sends a custom mix', async () => {
    const { upload, user, generateButton, onGenerate } = renderPage()
    await upload(file('lecture.pdf'))
    await user.click(screen.getByRole('radio', { name: 'custom' }))
    await user.click(screen.getByRole('button', { name: 'Fewer true/false questions' }))
    await user.click(generateButton())
    expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({ count: 10, trueFalse: 2 }))
  })

  it('shows progress and errors from generating', () => {
    renderPage({ busy: true, error: 'The AI service is busy right now.' })
    expect(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('busy right now')
  })
})

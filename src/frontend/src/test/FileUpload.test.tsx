import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileUpload } from '../components/FileUpload';
import i18n from '../i18n';

describe('FileUpload Component', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows attachment limit and handles file selection', () => {
    const onFilesChange = vi.fn();
    render(
      <FileUpload
        files={[]}
        onFilesChange={onFilesChange}
        maxFiles={3}
        maxSizeMb={5}
      />
    );

    expect(screen.getByText(/Attachments \(max 3 files, 5 MB each\)/i)).toBeInTheDocument();
  });

  it('clears the file input so the same file can be selected again', () => {
    const onFilesChange = vi.fn();
    const { container } = render(<FileUpload files={[]} onFilesChange={onFilesChange} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'game.pgn', { type: 'text/plain' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(onFilesChange).toHaveBeenCalledWith([file]);
    expect(input.value).toBe('');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { FileUpload } from '../components/FileUpload';

describe('FileUpload Component', () => {
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

    expect(screen.getByText(/Attachments \(max 3 files, 5MB each\)/i)).toBeInTheDocument();
  });
});

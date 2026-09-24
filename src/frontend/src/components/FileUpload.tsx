import React, { useState } from 'react';
import { Upload, X, AlertCircle } from 'lucide-react';

interface FileUploadProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  maxFiles?: number;
  maxSizeMb?: number;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  files,
  onFilesChange,
  maxFiles = 3,
  maxSizeMb = 5,
}) => {
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    if (!e.target.files) return;

    const selectedFiles = Array.from(e.target.files);
    if (files.length + selectedFiles.length > maxFiles) {
      setError(`You can only attach up to ${maxFiles} files.`);
      return;
    }

    const maxSizeBytes = maxSizeMb * 1024 * 1024;
    const validFiles: File[] = [];

    for (const f of selectedFiles) {
      if (f.size > maxSizeBytes) {
        setError(`File "${f.name}" exceeds the ${maxSizeMb} MB limit.`);
        return;
      }
      validFiles.push(f);
    }

    onFilesChange([...files, ...validFiles]);
  };

  const removeFile = (index: number) => {
    const updated = files.filter((_, i) => i !== index);
    onFilesChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>Attachments (max {maxFiles} files, {maxSizeMb}MB each)</span>
        <span>{files.length}/{maxFiles}</span>
      </div>

      {files.length < maxFiles && (
        <label className="border-2 border-dashed border-slate-700 hover:border-amber-500 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer bg-slate-900/50 hover:bg-slate-900 transition">
          <Upload className="w-5 h-5 text-slate-400 mb-1" />
          <span className="text-xs text-slate-300 font-medium">Click or drag files here (PNG, JPG, PDF, PGN)</span>
          <input
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.pgn,.txt"
            className="hidden"
            onChange={handleFileSelect}
          />
        </label>
      )}

      {error && (
        <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-950/40 p-2 rounded border border-rose-900">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700 text-xs"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="text-slate-200 font-mono truncate">{file.name}</span>
                <span className="text-slate-500 shrink-0">
                  ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeFile(idx)}
                className="text-slate-400 hover:text-rose-400 transition ml-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

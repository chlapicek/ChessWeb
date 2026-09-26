import React, { useState } from 'react';
import { Upload, X, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    if (!e.target.files) return;

    const selectedFiles = Array.from(e.target.files);
    e.currentTarget.value = '';
    if (files.length + selectedFiles.length > maxFiles) {
      setError(t('fileUpload.tooManyFiles', { count: maxFiles }));
      return;
    }

    const maxSizeBytes = maxSizeMb * 1024 * 1024;
    const validFiles: File[] = [];

    for (const f of selectedFiles) {
      if (f.size > maxSizeBytes) {
        setError(t('fileUpload.fileTooLarge', { name: f.name, size: maxSizeMb }));
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
      <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
        <span>{t('fileUpload.limits', { count: maxFiles, size: maxSizeMb })}</span>
        <span>{files.length}/{maxFiles}</span>
      </div>

      {files.length < maxFiles && (
        <label className="border-2 border-dashed border-slate-300 hover:border-emerald-500 dark:border-slate-700 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer bg-white/70 hover:bg-emerald-50 dark:bg-slate-900/50 dark:hover:bg-slate-900 transition focus-within:ring-2 focus-within:ring-emerald-500">
          <Upload className="w-5 h-5 text-slate-400 mb-1" />
          <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">{t('fileUpload.selectPrompt')}</span>
          <input
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.pgn,.txt"
            className="sr-only"
            onChange={handleFileSelect}
          />
        </label>
      )}

      {error && (
        <div role="alert" className="flex items-center gap-2 text-rose-700 dark:text-rose-300 text-xs bg-rose-50 dark:bg-rose-950/40 p-2 rounded border border-rose-300 dark:border-rose-900">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between bg-white/80 dark:bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="text-slate-800 dark:text-slate-200 font-mono truncate">{file.name}</span>
                <span className="text-slate-600 dark:text-slate-400 shrink-0">
                  ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeFile(idx)}
                aria-label={t('fileUpload.removeFile', { name: file.name })}
                className="ml-2 rounded text-slate-700 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 dark:text-slate-300 dark:hover:text-rose-300 dark:focus-visible:ring-rose-400"
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

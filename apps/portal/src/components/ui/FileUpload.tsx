'use client';
import { useDropzone } from 'react-dropzone';
import { Icon } from '@/components/ui/Icon';

interface FileUploadProps {
  accept?: Record<string, string[]>;
  maxSize?: number;
  label?: string;
  hint?: string;
  onFile: (file: File) => void;
  preview?: string | null;
  uploading?: boolean;
}

export function FileUpload({
  accept = { 'video/*': ['.mp4', '.webm', '.mov'], 'application/pdf': ['.pdf'] },
  maxSize = 500 * 1024 * 1024, // 500 MB
  label = 'Upload file',
  hint = 'MP4, WebM, MOV or PDF up to 500 MB',
  onFile,
  preview,
  uploading = false,
}: FileUploadProps) {
  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    accept,
    maxSize,
    multiple: false,
    onDropAccepted: ([file]) => onFile(file),
  });

  const rejection = fileRejections[0]?.errors[0];

  return (
    <div>
      <div
        {...(getRootProps() as React.HTMLAttributes<HTMLDivElement>)}
        className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition cursor-pointer ${
          isDragActive
            ? 'border-azure bg-azure/5 scale-[1.01]'
            : 'border-cloud bg-surface hover:border-azure/50 hover:bg-azure/[0.02]'
        } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input {...getInputProps()} />

        {uploading ? (
          <>
            <div className="h-10 w-10 rounded-2xl bg-azure/10 flex items-center justify-center animate-pulse">
              <Icon name="upload" size={20} className="text-azure" />
            </div>
            <p className="text-sm font-semibold text-navy">Uploading…</p>
          </>
        ) : isDragActive ? (
          <>
            <div className="h-10 w-10 rounded-2xl bg-azure/20 flex items-center justify-center">
              <Icon name="upload" size={20} className="text-azure" />
            </div>
            <p className="text-sm font-semibold text-azure">Drop it here</p>
          </>
        ) : (
          <>
            <div className="h-10 w-10 rounded-2xl bg-cloud flex items-center justify-center">
              <Icon name="upload" size={20} className="text-royal/50" />
            </div>
            <div>
              <p className="text-sm font-semibold text-navy">{label}</p>
              <p className="text-xs text-royal/40 mt-0.5">{hint}</p>
              <p className="text-xs font-semibold text-azure mt-2">Browse or drag & drop</p>
            </div>
          </>
        )}
      </div>

      {rejection && (
        <p className="mt-2 text-xs text-red-500 font-medium">
          {rejection.code === 'file-too-large'
            ? `File is too large (max ${Math.round(maxSize / 1024 / 1024)} MB)`
            : rejection.message}
        </p>
      )}

      {preview && !uploading && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-cloud bg-white px-3 py-2">
          <Icon name="file" size={14} className="text-azure flex-shrink-0" />
          <a href={preview} target="_blank" rel="noreferrer"
            className="flex-1 text-xs font-semibold text-navy truncate hover:text-azure transition">
            {preview.split('/').pop() ?? 'Uploaded file'}
          </a>
          <Icon name="externalLink" size={12} className="text-royal/40 flex-shrink-0" />
        </div>
      )}
    </div>
  );
}

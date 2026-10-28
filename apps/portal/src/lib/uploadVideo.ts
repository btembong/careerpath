import api from '@/lib/api';

/**
 * Uploads a video straight from the browser to R2 using a pre-signed URL from the API.
 * Large files never pass through the API server.
 */
export async function uploadVideo(
  file: File, onProgress?: (pct: number) => void, purpose?: 'lesson',
): Promise<string> {
  // Browsers often report .vtt files with an empty type
  const contentType = file.type || (file.name.toLowerCase().endsWith('.vtt') ? 'text/vtt' : '');
  const { data } = await api.post('/files/video-upload-url', { contentType, size: file.size, purpose });

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', data.uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Storage upload failed — check your connection and try again.'));
    xhr.send(file);
  });

  return data.url as string;
}

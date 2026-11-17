import api from '@/lib/api';

/** Download a file the API sends (needs the sign-in token, so not a plain link) */
export async function downloadFromApi(path: string, fallbackName: string) {
  const r = await api.get(path, { responseType: 'blob' });
  const name = /filename="([^"]+)"/.exec(String(r.headers['content-disposition'] ?? ''))?.[1] ?? fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(r.data as Blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

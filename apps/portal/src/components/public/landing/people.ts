import fs from 'fs';
import path from 'path';

/**
 * A photo for a slot, if one has been added to /public/landing/people (student-1.jpg, tutor-1.jpg, school-1.jpg …);
 * otherwise undefined, and the slot shows an illustrated face.
 */
export function peoplePhoto(name: string): string | undefined {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    try { if (fs.existsSync(path.join(process.cwd(), 'public', 'landing', 'people', `${name}.${ext}`))) return `/landing/people/${name}.${ext}`; } catch { /* not there */ }
  }
  return undefined;
}

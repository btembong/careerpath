import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as fontkitModule from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont } from 'pdf-lib';

/**
 * Bricolage Grotesque (SIL Open Font License, see assets/fonts/OFL.txt) for PDFs, so names and course
 * titles in any Latin-based language print as typed. The files are read once and cached.
 */
const FILES = { regular: 'BricolageGrotesque-Regular.ttf', bold: 'BricolageGrotesque-Bold.ttf' };
let cache: { regular: Buffer; bold: Buffer } | null = null;
// The package is a UMD bundle: without esModuleInterop the module itself is the fontkit object
const fontkit = (fontkitModule as any).default ?? fontkitModule;

function fontsDir() {
  // Built API (nest copies assets next to the compiled code), the source tree, or the working directory
  const candidates = [
    join(__dirname, '..', 'assets', 'fonts'),
    join(__dirname, '..', '..', '..', '..', 'assets', 'fonts'),
    join(process.cwd(), 'dist', 'apps', 'api', 'src', 'assets', 'fonts'),
    join(process.cwd(), 'src', 'assets', 'fonts'),
    join(process.cwd(), 'apps', 'api', 'src', 'assets', 'fonts'),
  ];
  const dir = candidates.find(d => existsSync(join(d, FILES.regular)));
  if (!dir) throw new Error('PDF fonts not found (expected assets/fonts/BricolageGrotesque-*.ttf)');
  return dir;
}

export async function embedBrandFonts(doc: PDFDocument): Promise<{ regular: PDFFont; bold: PDFFont }> {
  if (!cache) {
    const dir = fontsDir();
    cache = { regular: readFileSync(join(dir, FILES.regular)), bold: readFileSync(join(dir, FILES.bold)) };
  }
  doc.registerFontkit(fontkit);
  // Subset: only the characters actually used go into the PDF, keeping receipts small
  const [regular, bold] = await Promise.all([
    doc.embedFont(cache.regular, { subset: true }),
    doc.embedFont(cache.bold, { subset: true }),
  ]);
  return { regular, bold };
}

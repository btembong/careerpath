import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import { agreementRuns, type AgreementBlock, type TutorAgreementText } from '@cpa/shared';
import { embedBrandFonts } from '../payments/pdf-fonts';

export interface AcceptanceRecord {
  name: string;
  email: string;
  reference: string;
  acceptedAt: Date;
  ip: string | null;
  issuedAt: Date;
}

type Word = { w: string; f: PDFFont; glue?: boolean };
const W = 595.28, H = 841.89, M = 56, BODY = W - M * 2;
const NAVY = rgb(7 / 255, 32 / 255, 97 / 255), BLUE = rgb(63 / 255, 111 / 255, 232 / 255), INK = rgb(0.2, 0.25, 0.36);
const MUTED = rgb(0.39, 0.44, 0.56), LINE = rgb(0.86, 0.89, 0.94), SOFT = rgb(0.96, 0.97, 1), SOFT2 = rgb(0.93, 0.95, 1), WHITE = rgb(1, 1, 1);

const when = (d: Date) => `${d.toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Douala' })} (West Africa Time)`;

/**
 * The tutor's copy of the agreement they accepted: the full text of that version, then a record of the
 * acceptance (who, when, from where). Bricolage Grotesque, A4, a footer with page numbers on every page.
 */
export async function tutorAgreementPdf(text: TutorAgreementText, rec: AcceptanceRecord): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${text.title} – ${rec.name}`);
  doc.setAuthor('CareerPath Africa');
  doc.setSubject(`Accepted ${rec.acceptedAt.toISOString()} · ${text.version}`);
  doc.setCreationDate(rec.issuedAt);
  const { regular, bold } = await embedBrandFonts(doc);

  let page!: PDFPage;
  let y = 0;
  const newPage = () => { page = doc.addPage([W, H]); y = H - M; };
  const need = (h: number) => { if (y - h < M + 28) newPage(); };

  /** Words with their font, wrapped to the width; returns the lines */
  const wrap = (txt: string, size: number, width: number, baseBold = false) => {
    // glue: no space before it (punctuation right after a bold run, as in "Africa**, permitted")
    const words: Word[] = [];
    let prevEndsSpace = true;
    for (const r of agreementRuns(txt)) {
      const touching = !prevEndsSpace && !/^\s/.test(r.text);
      r.text.split(/\s+/).forEach((w, i) => { if (w) words.push({ w, f: r.bold || baseBold ? bold : regular, glue: i === 0 && touching && words.length > 0 }); });
      prevEndsSpace = /\s$/.test(r.text);
    }
    const lines: Word[][] = [];
    let cur: Word[] = [], curW = 0;
    for (const word of words) {
      const ww = word.f.widthOfTextAtSize(word.w, size), sp = cur.length && !word.glue ? regular.widthOfTextAtSize(' ', size) : 0;
      if (cur.length && curW + sp + ww > width) { lines.push(cur); cur = [word]; curW = ww; }
      else { cur.push(word); curW += sp + ww; }
    }
    if (cur.length) lines.push(cur);
    return lines;
  };
  const drawLines = (lines: Word[][], x: number, size: number, lead: number, color = INK) => {
    for (const line of lines) {
      need(lead);
      let cx = x;
      for (const [i, word] of line.entries()) {
        if (i && !word.glue) cx += regular.widthOfTextAtSize(' ', size);
        page.drawText(word.w, { x: cx, y: y - size, size, font: word.f, color });
        cx += word.f.widthOfTextAtSize(word.w, size);
      }
      y -= lead;
    }
  };
  const para = (txt: string, opts: { size?: number; x?: number; width?: number; color?: typeof INK; bold?: boolean } = {}) => {
    const size = opts.size ?? 10;
    drawLines(wrap(txt, size, opts.width ?? BODY, opts.bold), opts.x ?? M, size, size * 1.5, opts.color);
  };

  const block = (b: AgreementBlock) => {
    if (b.kind === 'p') { para(b.text, { color: b.muted ? MUTED : INK }); y -= 6; return; }
    if (b.kind === 'list') {
      for (const item of b.items) {
        const lines = wrap(item, 10, BODY - 16);
        need(15);
        page.drawCircle({ x: M + 4, y: y - 6.5, size: 1.8, color: BLUE });
        drawLines(lines, M + 16, 10, 15);
        y -= 4;
      }
      y -= 4;
      return;
    }
    // A shaded box: label, text, small print
    const inner = BODY - 24;
    const label = b.label ? 16 : 0;
    const tLines = wrap(b.text, 10, inner), nLines = b.note ? wrap(b.note, 8.5, inner) : [];
    const h = 12 + label + tLines.length * 15 + (nLines.length ? 6 + nLines.length * 12.5 : 0) + 8;
    need(Math.min(h, H - M * 2 - 40));
    page.drawRectangle({ x: M, y: y - h, width: BODY, height: h, color: b.strong ? SOFT2 : SOFT, borderColor: b.strong ? rgb(0.75, 0.82, 0.98) : LINE, borderWidth: 0.8 });
    y -= 12;
    if (b.label) { page.drawText(b.label.toUpperCase(), { x: M + 12, y: y - 8, size: 8, font: bold, color: b.strong ? BLUE : MUTED }); y -= label; }
    drawLines(tLines, M + 12, 10, 15, NAVY);
    if (nLines.length) { y -= 6; drawLines(nLines, M + 12, 8.5, 12.5, MUTED); }
    y -= 18;
  };

  // ── First page: the header band ──
  newPage();
  page.drawRectangle({ x: 0, y: H - 168, width: W, height: 168, color: NAVY });
  page.drawRectangle({ x: M, y: H - 70, width: 22, height: 22, color: WHITE });
  page.drawText('c', { x: M + 6.5, y: H - 64, size: 15, font: bold, color: BLUE });
  page.drawText('careerpath', { x: M + 30, y: H - 64, size: 15, font: bold, color: WHITE });
  page.drawText('.', { x: M + 30 + bold.widthOfTextAtSize('careerpath', 15), y: H - 64, size: 15, font: bold, color: BLUE });
  page.drawText('LEGAL DOCUMENT · TUTOR’S COPY', { x: M, y: H - 98, size: 8, font: bold, color: rgb(0.56, 0.69, 1) });
  page.drawText('Tutor Offer Letter &', { x: M, y: H - 122, size: 20, font: bold, color: WHITE });
  page.drawText('Content Ownership Agreement', { x: M, y: H - 146, size: 20, font: bold, color: WHITE });
  const tag = `${text.label}  ·  Accepted by ${rec.name}`;
  page.drawText(tag, { x: W - M - regular.widthOfTextAtSize(tag, 8.5), y: H - 98, size: 8.5, font: regular, color: rgb(0.8, 0.85, 0.95) });
  y = H - 168 - 28;

  for (const b of text.preamble) block(b);
  y -= 4;

  for (const s of text.sections) {
    need(60);
    y -= 6;
    page.drawRectangle({ x: M, y: y - 20, width: 20, height: 20, color: BLUE });
    const nw = bold.widthOfTextAtSize(s.num, 9);
    page.drawText(s.num, { x: M + 10 - nw / 2, y: y - 13.5, size: 9, font: bold, color: WHITE });
    const tl = wrap(s.title, 12.5, BODY - 32, true);
    const top = y;
    drawLines(tl.map(l => l), M + 30, 12.5, 17, NAVY);
    y = Math.min(y, top - 22) - 8;
    for (const b of s.blocks) block(b);
  }

  // ── The acceptance record ──
  need(250);
  y -= 8;
  const boxTop = y;
  const rows: [string, string][] = [
    ['Tutor', rec.name],
    ['Email', rec.email],
    ['Tutor reference', rec.reference],
    ['Agreement version', text.label],
    ['Accepted on', when(rec.acceptedAt)],
    ['How', 'Electronically, by ticking the acceptance box on the CareerPath Africa platform'],
    ['From IP address', rec.ip ?? 'Not recorded'],
  ];
  const rowH = rows.map(([, v]) => wrap(v, 10, BODY - 150).length * 14 + 8);
  const boxH = 44 + rowH.reduce((a, b) => a + b, 0) + 52;
  page.drawRectangle({ x: M, y: boxTop - boxH, width: BODY, height: boxH, color: SOFT, borderColor: rgb(0.75, 0.82, 0.98), borderWidth: 1 });
  page.drawText('RECORD OF ACCEPTANCE', { x: M + 16, y: boxTop - 24, size: 8.5, font: bold, color: BLUE });
  y = boxTop - 44;
  rows.forEach(([k, v], i) => {
    page.drawText(k, { x: M + 16, y: y - 10, size: 9, font: regular, color: MUTED });
    const lines = wrap(v, 10, BODY - 150, k === 'Tutor');
    drawLines(lines, M + 140, 10, 14, NAVY);
    y -= rowH[i] - lines.length * 14;
    if (i < rows.length - 1) page.drawLine({ start: { x: M + 16, y: y + 3 }, end: { x: W - M - 16, y: y + 3 }, thickness: 0.5, color: LINE });
  });
  y -= 6;
  para(`This copy was issued by CareerPath Africa on ${when(rec.issuedAt)} from the record kept on the platform. Keep it for your files. Questions about this agreement: ${text.contact.email}.`, { size: 8.5, x: M + 16, width: BODY - 32, color: MUTED });
  y = boxTop - boxH - 18;
  para(`CareerPath Africa · ${text.contact.address} · ${text.contact.phone}`, { size: 8, color: MUTED });

  // ── Footer on every page ──
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const left = `${text.title} · ${rec.name}`;
    const right = `Page ${i + 1} of ${pages.length}`;
    p.drawLine({ start: { x: M, y: 40 }, end: { x: W - M, y: 40 }, thickness: 0.5, color: LINE });
    p.drawText(left.length > 90 ? left.slice(0, 89) + '…' : left, { x: M, y: 28, size: 7.5, font: regular, color: MUTED });
    p.drawText(right, { x: W - M - regular.widthOfTextAtSize(right, 7.5), y: 28, size: 7.5, font: regular, color: MUTED });
  });

  return doc.save();
}

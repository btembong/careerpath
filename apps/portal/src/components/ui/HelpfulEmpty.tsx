import Link from 'next/link';

/** An empty page that helps: what will show here, a small tilted preview card, one button to get there. */
export function HelpfulEmpty({ title, body, cta, preview }: {
  title: string;
  body: string;
  cta?: { label: string; href?: string; onClick?: () => void };
  preview: { icon: string; title: string; line: string };
}) {
  const btn = 'mt-1 inline-flex h-[38px] self-start items-center rounded-md bg-[#3F6FE8] px-3.5 text-[13.5px] font-semibold text-white hover:bg-[#2F57C9]';
  return (
    <div className="grid items-center gap-4 rounded-[10px] border border-line bg-white p-6 sm:grid-cols-[1fr_200px]">
      <div className="flex flex-col gap-2">
        <p className="text-[21px] font-extrabold tracking-[-0.02em] text-navy">{title}</p>
        <p className="text-sm leading-[1.45] text-ink2">{body}</p>
        {cta && (cta.href ? <Link href={cta.href} className={btn}>{cta.label}</Link> : <button type="button" onClick={cta.onClick} className={btn}>{cta.label}</button>)}
      </div>
      <div aria-hidden className="hidden h-[140px] items-center justify-center rounded-[10px] bg-[#EAF0FF] sm:flex">
        <div className="flex w-[170px] -rotate-3 gap-2 rounded-lg bg-[#FFFDF8] p-2.5 shadow-[0_8px_18px_rgba(7,32,97,0.15)]">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-[#3F6FE8] text-xs font-extrabold text-white">{preview.icon}</span>
          <span className="min-w-0 text-[11.5px] leading-snug text-[#3A4A70]"><strong className="block truncate text-[#072061]">{preview.title}</strong>{preview.line}</span>
        </div>
      </div>
    </div>
  );
}

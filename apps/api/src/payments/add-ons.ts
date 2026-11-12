import { BadRequestException } from '@nestjs/common';

/**
 * Extras a student can add at checkout to a course or package: live classes (a place in a cohort) and
 * mentorship (sessions a month for the access period). Prices are in minor units, in the item's currency.
 */
export type AddOnConfig = { live?: { cohortId: string; price: number } | null; mentorship?: { perMonth: number; price: number } | null };
export type AddOnLine = { kind: 'live' | 'mentorship'; price: number; cohortId?: string; perMonth?: number };

export const ADD_ON_NAMES: Record<AddOnLine['kind'], string> = { live: 'Live classes', mentorship: 'Mentorship' };

/** The add-ons a student asked for, checked against what the item offers (the server sets every price) */
export function pickAddOns(config: unknown, requested?: string[] | null): AddOnLine[] {
  if (!requested?.length) return [];
  const c = (config ?? {}) as AddOnConfig;
  const lines: AddOnLine[] = [];
  for (const kind of [...new Set(requested)]) {
    if (kind === 'live' && c.live) lines.push({ kind: 'live', price: c.live.price, cohortId: c.live.cohortId });
    else if (kind === 'mentorship' && c.mentorship) lines.push({ kind: 'mentorship', price: c.mentorship.price, perMonth: c.mentorship.perMonth });
    else throw new BadRequestException(`This isn’t offered with this item: ${kind}`);
  }
  return lines;
}

export const addOnTotal = (lines: AddOnLine[] | null | undefined) => (lines ?? []).reduce((n, l) => n + l.price, 0);
export const addOnLabel = (lines: AddOnLine[] | null | undefined) => (lines ?? []).map(l => ADD_ON_NAMES[l.kind].toLowerCase()).join(' and ');
export const asLines = (v: unknown): AddOnLine[] => (Array.isArray(v) ? (v as AddOnLine[]) : []);

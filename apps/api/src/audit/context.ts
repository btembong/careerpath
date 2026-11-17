import { AsyncLocalStorage } from 'async_hooks';
import type { NextFunction, Request, Response } from 'express';

/** Who is making this request and from where, so every audit entry can say so without being passed it */
export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
  user?: { id: string; role: string };
  /** An entry was written for this request, so the automatic one isn't needed */
  audited?: boolean;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();
export const currentRequest = () => requestContext.getStore();

/** Express middleware: starts the context for each request (main.ts) */
export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  const ua = req.headers['user-agent'];
  requestContext.run({ ip: req.ip ?? null, userAgent: typeof ua === 'string' ? ua.slice(0, 300) : null }, next);
}

/** "Chrome on Windows", from a user agent */
export function browserOn(ua: string | null | undefined): string | null {
  const s = ua ?? '';
  if (!s) return null;
  const b = /Edg\//.test(s) ? 'Edge' : /OPR\/|Opera/.test(s) ? 'Opera' : /SamsungBrowser/.test(s) ? 'Samsung Internet' : /Firefox\//.test(s) ? 'Firefox' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : /curl|node|axios|python/i.test(s) ? 'A script' : null;
  const os = /Windows/.test(s) ? 'Windows' : /Android/.test(s) ? 'Android' : /iPhone|iPad|iPod/.test(s) ? 'iPhone' : /Mac OS X/.test(s) ? 'Mac' : /Linux/.test(s) ? 'Linux' : null;
  return b && os ? `${b} on ${os}` : b ?? os;
}

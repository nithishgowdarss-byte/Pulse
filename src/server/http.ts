import type { Request, Response, NextFunction, RequestHandler } from 'express';

export const isProduction = () => process.env.NODE_ENV === 'production';

export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (isProduction()) {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        "connect-src 'self'",
        "worker-src 'self'",
        "manifest-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
    );
    if (process.env.ENABLE_HSTS === '1') res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
};

/** Fixed-window in-memory rate limiter keyed by client IP. */
export function createRateLimiter(opts: { windowMs: number; max: number }): RequestHandler & { reset: () => void } {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const handler = ((req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + opts.windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    res.setHeader('RateLimit-Limit', String(opts.max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, opts.max - entry.count)));
    if (entry.count > opts.max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Too many requests, slow down', code: 'RATE_LIMITED' });
    }
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    next();
  }) as unknown as RequestHandler & { reset: () => void };
  handler.reset = () => hits.clear();
  return handler;
}

export const requestLogger: RequestHandler = (req, res, next) => {
  const urlPath = req.originalUrl.split('?')[0];
  if (process.env.VITEST || !urlPath.startsWith('/api') || urlPath === '/api/health') return next();
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (res.statusCode >= 400 || ms > 1000 || req.method !== 'GET' || process.env.LOG_LEVEL === 'debug') {
      console.log(JSON.stringify({ t: new Date().toISOString(), level: res.statusCode >= 500 ? 'error' : 'info', method: req.method, path: urlPath, status: res.statusCode, ms }));
    }
  });
  next();
};

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const status = err?.type === 'entity.too.large' ? 413 : err?.type === 'entity.parse.failed' ? 400 : Number(err?.status) || 500;
  if (!process.env.VITEST || status >= 500) console.error(JSON.stringify({ t: new Date().toISOString(), level: 'error', path: req.originalUrl.split('?')[0], status, msg: String(err?.message || err).slice(0, 300) }));
  if (res.headersSent) return;
  res.status(status).json({ error: status >= 500 && isProduction() ? 'Internal server error' : String(err?.message || 'Error') });
}

import { timingSafeEqual } from 'crypto';

/**
 * Optional perimeter gate: when PULSE_BASIC_AUTH="user:password" is set, every request
 * (UI + API, except health checks) requires HTTP Basic credentials. This is NOT per-role auth.
 */
export function createBasicAuthGate(credentials: string | undefined): RequestHandler {
  if (!credentials) return (_req, _res, next) => next();
  const expected = Buffer.from(credentials);
  return (req, res, next) => {
    if (req.path === '/healthz' || req.path === '/api/health') return next();
    const header = req.headers.authorization || '';
    const supplied = header.startsWith('Basic ') ? Buffer.from(Buffer.from(header.slice(6), 'base64').toString('utf8')) : Buffer.alloc(0);
    if (supplied.length === expected.length && timingSafeEqual(supplied, expected)) return next();
    res.setHeader('WWW-Authenticate', 'Basic realm="Pulse Fitness", charset="UTF-8"');
    res.status(401).json({ error: 'Authentication required' });
  };
}

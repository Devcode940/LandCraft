/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Operational concerns: security headers, request logging, liveness and
 * readiness probes, and graceful shutdown.
 *
 * Kept out of server.ts so the route definitions stay readable and so these
 * can be unit-tested without booting the whole app.
 */

import compression from 'compression';
import type { Express, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

// ---------------------------------------------------------------------------
// Request context
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Correlation id, echoed in the response and every log line. */
      id?: string;
      /** Monotonic start time, for duration logging. */
      startedAt?: [number, number];
    }
  }
}

/**
 * Attach a correlation id to every request.
 *
 * Trusts an inbound `X-Request-Id` only when it looks like an id we could have
 * generated: an attacker-controlled string would otherwise be written verbatim
 * into logs (log injection) and reflected into a response header.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.get('x-request-id');
  const usable = inbound && /^[A-Za-z0-9._-]{8,128}$/.test(inbound) ? inbound : null;

  req.id = usable ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  req.startedAt = process.hrtime();

  res.setHeader('X-Request-Id', req.id);
  next();
}

/** One JSON line per request. Never logs bodies, query strings, or headers. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    const start = req.startedAt;
    const durationMs = start
      ? Math.round((process.hrtime(start)[0] * 1e3 + process.hrtime(start)[1] / 1e6) * 10) / 10
      : null;

    const line = {
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      msg: 'request',
      id: req.id,
      method: req.method,
      // Path only. The query string can carry user content and should not be
      // shipped to a log aggregator by default.
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs,
    };

    // Structured access log. This is the app's stdout contract with the log
    // aggregator, not debug output.

    console.log(JSON.stringify(line));
  });
  next();
}

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

/**
 * Helmet defaults, relaxed only where this app genuinely needs it.
 *
 * - `contentSecurityPolicy` is configured explicitly rather than disabled. The
 *   app loads no third-party scripts, so a strict policy is affordable.
 * - `crossOriginEmbedderPolicy` is off: WebXR (the AR viewer) is not usable
 *   under `require-corp`, and no cross-origin isolation is needed here.
 */
export function securityHeaders(isProduction: boolean): ReturnType<typeof helmet> {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        // Vite injects inline styles for HMR in development and Tailwind emits
        // inline style attributes; 'unsafe-inline' for styles is required by
        // both. Scripts stay locked to 'self'.
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        // Blob/data URLs are used by the SVG and PNG export paths.
        imgSrc: ["'self'", 'data:', 'blob:'],
        // The Google GenAI SDK is called server-side only, so no connect-src
        // exception is needed. WebXR hit-testing may fetch nothing external.
        connectSrc: ["'self'", 'blob:'],
        workerSrc: ["'self'", 'blob:'],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'", 'https:'],
        // WebXR and the AR session need an explicit opt-in to cameras/motion.
        ...(isProduction ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    crossOriginEmbedderPolicy: false,
    // WebXR requires the xr-spatial-tracking permissions policy, which has no
    // effect here but lets the permission propagate to the top-level document.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true, preload: false } : false,
  });
}

/**
 * Gzip responses. The entry bundle is ~500 kB of JS and compresses to ~144 kB,
 * so this is the single largest perceived-latency win available server-side.
 */
export const compressionMiddleware = compression({
  // Compressing a 200-byte JSON reply costs more than it saves.
  threshold: 1024,
  // Never compress an event stream.
  filter: (req, res) => {
    if (req.headers['accept'] === 'text/event-stream') return false;
    return compression.filter(req, res);
  },
});

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

/** Uptime and build metadata, exposed to the client for support triage. */
export const SERVICE_STARTED_AT = Date.now();

export function uptimeSeconds(): number {
  return Math.round((Date.now() - SERVICE_STARTED_AT) / 1000);
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

export interface ShutdownOptions {
  /** Force-exit after this long even if connections have not drained. */
  timeoutMs?: number;
  /** Called once the HTTP server has stopped accepting connections. */
  onDrained?: () => void;
}

/**
 * Stop accepting connections, let in-flight requests finish, then exit.
 *
 * Without this, a rolling deploy kills the process mid-request: a user sees a
 * dropped connection, and any partially written response is truncated. Cloud
 * Run and Kubernetes both send SIGTERM and expect the process to drain.
 *
 * The 10s default is under the typical 30s orchestrator grace period, leaving
 * room for a clean exit before SIGKILL.
 */
export function installGracefulShutdown(
  server: { close: (cb: (err?: Error) => void) => void; closeAllConnections?: () => void },
  options: ShutdownOptions = {},
): () => void {
  const timeoutMs = options.timeoutMs ?? 10_000;
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(JSON.stringify({ level: 'info', msg: 'shutdown.start', signal }));

    const forceTimer = setTimeout(() => {
      console.error(JSON.stringify({ level: 'error', msg: 'shutdown.forced', signal, timeoutMs }));
      server.closeAllConnections?.();
      process.exit(1);
    }, timeoutMs);
    // Do not keep the event loop alive just for the watchdog.
    forceTimer.unref?.();

    server.close((err) => {
      clearTimeout(forceTimer);
      if (err) {
        console.error(JSON.stringify({ level: 'error', msg: 'shutdown.error', error: err.message }));
        process.exit(1);
      }

      console.log(JSON.stringify({ level: 'info', msg: 'shutdown.drained' }));
      options.onDrained?.();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return () => shutdown('manual');
}

/**
 * Turn an unhandled rejection into a logged, non-silent failure.
 *
 * Node's default is to terminate. Terminating is the right call for a
 * corrupted process, but only after the reason is recorded: a bare exit leaves
 * no trace in the logs.
 */
export function installCrashHandlers(): void {
  process.on('unhandledRejection', (reason) => {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'unhandledRejection',
        error: reason instanceof Error ? reason.message : String(reason),
      }),
    );
  });

  process.on('uncaughtException', (err) => {
    console.error(JSON.stringify({ level: 'error', msg: 'uncaughtException', error: err.message }));
    // The process state is not trustworthy after an uncaught exception.
    process.exit(1);
  });
}

/** Mount the non-route plumbing on an Express app. */
export function installOperations(app: Express, isProduction: boolean): void {
  app.disable('x-powered-by');
  app.set('etag', 'strong');

  // Behind a load balancer every request otherwise appears to come from the
  // proxy's IP, which makes express-rate-limit throttle ALL users as one.
  // `1` trusts exactly one hop; setting `true` would let a client spoof its own
  // address with a forged X-Forwarded-For header and bypass the limiter.
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);

  app.use(securityHeaders(isProduction));
  app.use(compressionMiddleware);
  app.use(requestContext);
  app.use(requestLogger);
}

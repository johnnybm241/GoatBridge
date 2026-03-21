/**
 * Lightweight structured logger.
 * In production logs JSON; in development logs human-readable coloured output.
 */

const IS_TEST = !!process.env.VITEST;
const IS_PROD = process.env.NODE_ENV === 'production';

type Level = 'debug' | 'info' | 'warn' | 'error';
type Context = Record<string, unknown>;

const COLOURS: Record<Level, string> = {
  debug: '\x1b[90m',  // grey
  info:  '\x1b[36m',  // cyan
  warn:  '\x1b[33m',  // yellow
  error: '\x1b[31m',  // red
};
const RESET = '\x1b[0m';

function log(level: Level, msg: string, ctx?: Context): void {
  if (IS_TEST) return; // silence during tests

  const ts = new Date().toISOString();

  if (IS_PROD) {
    process.stdout.write(JSON.stringify({ ts, level, msg, ...ctx }) + '\n');
    return;
  }

  const colour = COLOURS[level];
  const ctxStr = ctx ? ' ' + JSON.stringify(ctx) : '';
  const prefix = `${colour}[${level.toUpperCase()}]${RESET}`;
  // eslint-disable-next-line no-console
  console.log(`${ts} ${prefix} ${msg}${ctxStr}`);
}

export const logger = {
  debug: (msg: string, ctx?: Context) => log('debug', msg, ctx),
  info:  (msg: string, ctx?: Context) => log('info',  msg, ctx),
  warn:  (msg: string, ctx?: Context) => log('warn',  msg, ctx),
  error: (msg: string, ctx?: Context) => log('error', msg, ctx),
};

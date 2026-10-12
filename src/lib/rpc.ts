// src/lib/rpc.ts
import { toAppError, type AppErrorShape } from './errors';
import { parseResponseJson } from './apiUtils';

export class RpcError extends Error {
  shape: AppErrorShape;
  constructor(shape: AppErrorShape) {
    super(shape.message);
    this.name = 'RpcError';
    this.shape = shape;
  }
}

function sanitizeArgs(args?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!args) return args;
  const clone = { ...args };
  for (const k of Object.keys(clone)) {
    if (/key|secret|password|token|auth/i.test(k)) {
      clone[k] = '[redacted]';
    }
  }
  return clone;
}

export async function callRpc<T>(
  fn: string,
  args?: Record<string, unknown>,
  opts?: { context?: string }
): Promise<T> {
  try {
    const res = await fetch(`/api/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {}),
    });

    const body = await parseResponseJson<any>(res, {});

    if (!res.ok) {
      const shape = toAppError({
        message: body.error || body.message || `RPC ${fn} failed (${res.status})`,
        status: res.status,
        code: body.code,
        details: body.details,
      });
      console.warn(`[RPC Error: ${opts?.context || fn}]`, {
        args: sanitizeArgs(args),
        shape,
      });
      throw new RpcError(shape);
    }

    return (body.data !== undefined ? body.data : body) as T;
  } catch (err) {
    if (err instanceof RpcError) throw err;
    const shape = toAppError(err);
    console.warn(`[RPC Failure: ${opts?.context || fn}]`, {
      args: sanitizeArgs(args),
      shape,
    });
    throw new RpcError(shape);
  }
}

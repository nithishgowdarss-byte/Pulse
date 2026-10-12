// src/lib/handleMutationError.ts
import { toast } from './toast';
import { RpcError } from './rpc';
import { toAppError, type AppErrorShape } from './errors';

export function handleMutationError(
  err: unknown,
  opts?: { onReauth?: () => void; fallbackTitle?: string }
): AppErrorShape {
  const shape = err instanceof RpcError ? err.shape : toAppError(err);

  if (shape.reauth) {
    toast.error(shape.message, {
      description: 'Your authentication token has expired. Please re-authenticate.',
    });
    opts?.onReauth?.();
    return shape;
  }

  toast.error(shape.message, {
    description: shape.retryable ? 'Temporary glitch — please try again.' : undefined,
  });

  return shape;
}

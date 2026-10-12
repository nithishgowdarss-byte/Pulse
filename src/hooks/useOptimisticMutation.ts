import { useState, useCallback } from 'react';
import { enqueueMutation } from '../lib/offline-queue';

export interface OptimisticMutationOptions<TVariables = any, TData = any> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  queryKeys?: any[][];
  updateCache?: (variables: TVariables, oldState: any) => any;
  rollbackCache?: (variables: TVariables, oldState: any) => any;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables, rollbackContext?: any) => void;
  successMessage?: string;
  errorMessage?: string;
  mutationType?: string;
}

export function useOptimisticMutation<TVariables = any, TData = any>(
  options: OptimisticMutationOptions<TVariables, TData>
) {
  const [isPending, setIsPending] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (variables: TVariables, currentCacheState?: any, setCacheState?: (updater: any) => void) => {
      setIsPending(true);
      setError(null);

      // 1. Snapshot previous state for rollback
      const snapshot = currentCacheState;

      // 2. Perform optimistic update immediately
      if (setCacheState && options.updateCache) {
        setCacheState((old: any) => options.updateCache!(variables, old));
      }

      try {
        // 3. Execute remote mutation
        const result = await options.mutationFn(variables);
        setIsPending(false);
        if (options.onSuccess) {
          options.onSuccess(result, variables);
        }
        return result;
      } catch (err: any) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        setIsPending(false);

        // 4. Automatic Rollback on failure!
        if (setCacheState) {
          if (options.rollbackCache) {
            setCacheState((current: any) => options.rollbackCache!(variables, current));
          } else if (snapshot !== undefined) {
            setCacheState(snapshot);
          }
        }

        // 5. Enqueue offline mutation if network failed
        if (!navigator.onLine || errorObj.message.toLowerCase().includes('network') || errorObj.message.toLowerCase().includes('fetch')) {
          await enqueueMutation({
            type: options.mutationType || 'generic_mutation',
            variables,
          });
        }

        if (options.onError) {
          options.onError(errorObj, variables, snapshot);
        }

        throw errorObj;
      }
    },
    [options]
  );

  return {
    mutate,
    mutateAsync: mutate,
    isPending,
    isLoading: isPending,
    error,
  };
}

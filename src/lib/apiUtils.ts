import { get, set } from 'idb-keyval';

/**
 * Safely parse JSON from a Response object, guarding against HTML fallbacks or non-JSON content
 */
export async function parseResponseJson<T = any>(res: Response, fallback: T = {} as T): Promise<T> {
  try {
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return fallback;
    }
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

/**
 * Safe API fetch utility that guarantees graceful handling of HTML fallbacks,
 * non-200 responses, network disconnects, and malformed JSON.
 * It also caches GET requests in IndexedDB for offline access.
 */
export async function safeFetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallbackValue: T | null = null
): Promise<T | null> {
  const method = init?.method?.toUpperCase() || 'GET';
  const isGet = method === 'GET';
  let cacheKey = '';

  if (isGet) {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    cacheKey = `api_cache_${urlStr}`;
  }

  try {
    const res = await fetch(input, init);
    
    // Fallback to cache if response is not ok
    if (!res.ok) {
      // Never serve cached data for auth failures (could belong to another user)
      if (isGet && res.status !== 401 && res.status !== 403) {
        const cached = await get<T>(cacheKey);
        if (cached !== undefined) return cached;
      }
      return fallbackValue;
    }

    const contentType = res.headers.get('content-type');
    
    // Fallback to cache if response is not JSON
    if (!contentType || !contentType.includes('application/json')) {
      if (isGet) {
        const cached = await get<T>(cacheKey);
        if (cached !== undefined) return cached;
      }
      return fallbackValue;
    }

    const data = await res.json() as T;

    // Persist successful GET responses to IndexedDB
    if (isGet) {
      try {
        await set(cacheKey, data);
      } catch (e) {
        console.warn('Failed to cache API response', e);
      }
    }

    return data;
  } catch (error) {
    // Network error or offline: fallback to cache
    if (isGet) {
      try {
        const cached = await get<T>(cacheKey);
        if (cached !== undefined) return cached;
      } catch (e) {
        console.warn('Failed to read API cache', e);
      }
    }
    return fallbackValue;
  }
}

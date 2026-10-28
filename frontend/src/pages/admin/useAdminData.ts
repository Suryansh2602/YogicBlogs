import { useEffect, useState } from 'react';
import { errorMessage } from '../../features/auth/errors';

type State<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; message: string };

/**
 * Load admin data for the given inputs. Results are stored with the inputs they belong to, so a new
 * input shows "loading" immediately and a slow, stale response can never overwrite a newer one.
 */
export function useAdminData<T>(load: () => Promise<T>, inputs: readonly (string | number)[]): State<T> {
  const key = JSON.stringify(inputs);
  const [result, setResult] = useState<{ key: string; state: State<T> } | null>(null);

  useEffect(() => {
    let current = true;
    load().then(
      (data) => {
        if (current) setResult({ key, state: { status: 'ready', data } });
      },
      (err: unknown) => {
        if (current) setResult({ key, state: { status: 'error', message: errorMessage(err) } });
      },
    );
    return () => {
      current = false;
    };
    // `key` encodes every input `load` depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return result?.key === key ? result.state : { status: 'loading' };
}

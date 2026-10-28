import { useState } from 'react';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { adminApi } from '../../features/auth/api';
import { useAdminData } from './useAdminData';

const FILTERS = [
  { value: '', label: 'Everything' },
  { value: 'auth.login', label: 'Sign-ins' },
  { value: 'auth.register', label: 'Sign-ups' },
  { value: 'auth.password', label: 'Password resets' },
  { value: 'auth.2fa', label: 'Two-step sign-in' },
  { value: 'auth.refresh', label: 'Session alerts' },
  { value: 'admin.', label: 'Admin actions' },
];

// Failures and alerts stand out in the list.
const tone = (action: string) =>
  /failure|reuse|duplicate/.test(action) ? 'badge--danger' : /success|verified|enabled|created/.test(action) ? 'badge--ok' : '';

export default function AdminAudit() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const result = useAdminData(() => adminApi.auditLogs({ page, action }), [page, action]);
  const pages = result.status === 'ready' ? Math.max(1, Math.ceil(result.data.total / result.data.pageSize)) : 1;

  return (
    <>
      <header className="admin__header">
        <h1>Audit log</h1>
        <p className="muted">Security events, newest first. Entries can’t be edited or deleted, even by admins.</p>
      </header>
      <div className="chips" role="group" aria-label="Filter events">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className="chip"
            aria-pressed={action === f.value}
            onClick={() => {
              setAction(f.value);
              setPage(1);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      {result.status === 'error' && <Alert tone="danger">{result.message}</Alert>}
      <div className="table-wrap" aria-busy={result.status === 'loading'}>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Event</th>
              <th scope="col">Account</th>
              <th scope="col">IP address</th>
            </tr>
          </thead>
          <tbody>
            {result.status === 'loading' && (
              <tr>
                <td colSpan={4} className="table__empty">
                  <Spinner size={22} label="Loading events" />
                </td>
              </tr>
            )}
            {result.status === 'ready' && result.data.items.length === 0 && (
              <tr>
                <td colSpan={4} className="table__empty muted">
                  No events yet.
                </td>
              </tr>
            )}
            {result.status === 'ready' &&
              result.data.items.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })}</td>
                  <td>
                    <span className={`badge ${tone(row.action)}`}>{row.action}</span>
                  </td>
                  <td>{row.actorEmail ?? <span className="muted">{row.actorId ? 'Deleted account' : 'Not signed in'}</span>}</td>
                  <td className="table__mono">{row.ip ?? '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => {
            setPage((p) => p - 1);
          }}
        >
          Newer
        </Button>
        <span className="muted">
          Page {page} of {pages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= pages}
          onClick={() => {
            setPage((p) => p + 1);
          }}
        >
          Older
        </Button>
      </div>
    </>
  );
}

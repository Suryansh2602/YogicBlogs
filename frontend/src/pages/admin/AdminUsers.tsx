import { useEffect, useState } from 'react';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { adminApi } from '../../features/auth/api';
import { useAdminData } from './useAdminData';

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export default function AdminUsers() {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Search as you type, but only after a short pause.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(input.trim());
      setPage(1);
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [input]);

  const result = useAdminData(() => adminApi.users({ page, search }), [page, search]);
  const pages = result.status === 'ready' ? Math.max(1, Math.ceil(result.data.total / result.data.pageSize)) : 1;

  return (
    <>
      <header className="admin__header">
        <h1>Members</h1>
        <p className="muted">Everyone with a Healthmarg account.</p>
      </header>
      <TextField
        label="Search by name or email"
        type="search"
        value={input}
        className="admin__search"
        onChange={(e) => {
          setInput(e.target.value);
        }}
      />
      {result.status === 'error' && <Alert tone="danger">{result.message}</Alert>}
      <div className="table-wrap" aria-busy={result.status === 'loading'}>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Member</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">Last sign-in</th>
              <th scope="col">Joined</th>
            </tr>
          </thead>
          <tbody>
            {result.status === 'loading' && (
              <tr>
                <td colSpan={5} className="table__empty">
                  <Spinner size={22} label="Loading members" />
                </td>
              </tr>
            )}
            {result.status === 'ready' && result.data.items.length === 0 && (
              <tr>
                <td colSpan={5} className="table__empty muted">
                  No members match “{search}”.
                </td>
              </tr>
            )}
            {result.status === 'ready' &&
              result.data.items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.displayName}</strong>
                    <div className="muted table__sub">{u.email}</div>
                  </td>
                  <td>{u.role === 'admin' ? <span className="badge badge--accent">Admin</span> : 'Member'}</td>
                  <td>
                    {u.status === 'suspended' ? (
                      <span className="badge badge--danger">Suspended</span>
                    ) : u.emailVerified ? (
                      <span className="badge badge--ok">Active</span>
                    ) : (
                      <span className="badge">Unverified</span>
                    )}
                  </td>
                  <td>{formatDate(u.lastLoginAt)}</td>
                  <td>{formatDate(u.createdAt)}</td>
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
          Previous
        </Button>
        <span className="muted">
          Page {page} of {pages}
          {result.status === 'ready' && ` · ${result.data.total.toLocaleString()} members`}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= pages}
          onClick={() => {
            setPage((p) => p + 1);
          }}
        >
          Next
        </Button>
      </div>
    </>
  );
}

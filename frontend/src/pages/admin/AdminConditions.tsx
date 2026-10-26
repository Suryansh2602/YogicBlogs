import { useState, type SubmitEvent } from 'react';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Spinner } from '../../components/ui/Spinner';
import { TextArea } from '../../components/ui/TextArea';
import { TextField } from '../../components/ui/TextField';
import { conditionsApi, slugify, SLUG_RE, type Condition } from '../../features/content/api';
import { errorMessage, fieldErrors } from '../../features/auth/errors';
import { useFormErrors } from '../../hooks/useFormErrors';
import { useAdminData } from './useAdminData';

type Field = 'name' | 'slug' | 'summary';

interface FormState {
  name: string;
  slug: string;
  /** Once the admin edits the web address by hand, it stops following the name. */
  slugTouched: boolean;
  summary: string;
  isPublished: boolean;
}

const EMPTY: FormState = { name: '', slug: '', slugTouched: false, summary: '', isPublished: false };

function ConditionForm({ initial, onSaved, onCancel }: { initial: Condition | null; onSaved: (c: Condition) => void; onCancel: () => void }) {
  const [form, setForm] = useState<FormState>(
    initial
      ? { name: initial.name, slug: initial.slug, slugTouched: true, summary: initial.summary ?? '', isPublished: initial.isPublished }
      : EMPTY,
  );
  const { fieldErrors: errors, setFieldErrors, formError, setFormError, edited } = useFormErrors<Field>();
  const [busy, setBusy] = useState(false);

  const validate = () => {
    const next = {
      name: form.name.trim() ? undefined : 'Enter a name, like "Migraine".',
      slug:
        form.slug && !SLUG_RE.test(form.slug)
          ? 'Use only lowercase letters, numbers and single hyphens, like "lower-back-pain".'
          : !form.slug && form.name.trim() && !slugify(form.name)
            ? 'This name has no English letters to build a web address from. Type one, like "migraine".'
            : undefined,
      summary: form.summary.length > 500 ? `The summary has ${form.summary.length} characters. Keep it to 500.` : undefined,
    };
    setFieldErrors(next);
    return !Object.values(next).some(Boolean);
  };

  const onSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validate()) return;
    setBusy(true);
    setFormError(null);
    const input = {
      name: form.name.trim(),
      ...(form.slug && { slug: form.slug }),
      summary: form.summary.trim(),
      isPublished: form.isPublished,
    };
    try {
      const { condition } = initial ? await conditionsApi.update(initial.id, input) : await conditionsApi.create(input);
      onSaved(condition);
    } catch (err) {
      const fields = fieldErrors(err);
      if (Object.keys(fields).length) setFieldErrors(fields);
      else setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="admin-form" onSubmit={(e) => void onSubmit(e)} noValidate>
      <h2 className="admin-form__title">{initial ? `Edit “${initial.name}”` : 'New condition'}</h2>
      {formError && <Alert tone="danger">{formError}</Alert>}
      <div className="admin-form__grid">
        <TextField
          label="Name"
          value={form.name}
          maxLength={120}
          error={errors.name}
          autoFocus
          onChange={(e) => {
            const name = e.target.value;
            setForm((f) => ({ ...f, name, slug: f.slugTouched ? f.slug : slugify(name) }));
            edited('name');
            if (!form.slugTouched) edited('slug');
          }}
        />
        <TextField
          label="Web address"
          value={form.slug}
          maxLength={140}
          error={errors.slug}
          spellCheck={false}
          autoCapitalize="none"
          hint={form.slug ? `Shown as …/conditions/${form.slug}` : 'Made from the name. Edit it if you like.'}
          onChange={(e) => {
            setForm((f) => ({ ...f, slug: e.target.value.toLowerCase(), slugTouched: true }));
            edited('slug');
          }}
        />
      </div>
      <TextArea
        label="Summary"
        value={form.summary}
        maxLength={500}
        error={errors.summary}
        hint="One or two sentences shown to members on the conditions list."
        onChange={(e) => {
          setForm((f) => ({ ...f, summary: e.target.value }));
          edited('summary');
        }}
      />
      <Checkbox
        checked={form.isPublished}
        onChange={(e) => {
          setForm((f) => ({ ...f, isPublished: e.target.checked }));
          edited();
        }}
      >
        Published (visible to members)
      </Checkbox>
      <div className="admin-form__actions">
        <Button type="submit" loading={busy}>
          {initial ? 'Save changes' : 'Create condition'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function AdminConditions() {
  const [reloadKey, setReloadKey] = useState(0);
  const result = useAdminData(() => conditionsApi.list(), [reloadKey]);
  const [editing, setEditing] = useState<Condition | 'new' | null>(null);
  const [confirming, setConfirming] = useState<Condition | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = () => {
    setReloadKey((k) => k + 1);
  };

  const remove = async (condition: Condition) => {
    setDeleting(true);
    try {
      await conditionsApi.remove(condition.id);
      setNotice({ tone: 'success', text: `“${condition.name}” was deleted.` });
      reload();
    } catch (err) {
      setNotice({ tone: 'danger', text: errorMessage(err) });
    } finally {
      setDeleting(false);
      setConfirming(null);
    }
  };

  return (
    <>
      <header className="admin__header admin__header--row">
        <div>
          <h1>Conditions</h1>
          <p className="muted">What each article is about. Members see the published ones.</p>
        </div>
        {!editing && (
          <Button
            onClick={() => {
              setEditing('new');
              setNotice(null);
            }}
          >
            New condition
          </Button>
        )}
      </header>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      {editing && (
        <ConditionForm
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          onCancel={() => {
            setEditing(null);
          }}
          onSaved={(condition) => {
            setNotice({ tone: 'success', text: `“${condition.name}” was saved.` });
            setEditing(null);
            reload();
          }}
        />
      )}

      {result.status === 'error' && <Alert tone="danger">{result.message}</Alert>}
      <div className="table-wrap" aria-busy={result.status === 'loading'}>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Condition</th>
              <th scope="col">Articles</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {result.status === 'loading' && (
              <tr>
                <td colSpan={4} className="table__empty">
                  <Spinner size={22} label="Loading conditions" />
                </td>
              </tr>
            )}
            {result.status === 'ready' && result.data.items.length === 0 && (
              <tr>
                <td colSpan={4} className="table__empty muted">
                  No conditions yet. Create the first one.
                </td>
              </tr>
            )}
            {result.status === 'ready' &&
              result.data.items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    <div className="muted table__sub">/{c.slug}</div>
                  </td>
                  <td>{c.articleCount}</td>
                  <td>{c.isPublished ? <span className="badge badge--ok">Published</span> : <span className="badge">Hidden</span>}</td>
                  <td className="table__actions">
                    {confirming?.id === c.id ? (
                      <span className="confirm">
                        <span>Delete “{c.name}”?</span>
                        <Button size="sm" variant="danger" loading={deleting} onClick={() => void remove(c)}>
                          Yes, delete
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          // Focus lands on the safe choice, so a reflexive Enter never deletes.
                          autoFocus
                          onClick={() => {
                            setConfirming(null);
                          }}
                        >
                          Keep
                        </Button>
                      </span>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditing(c);
                            setNotice(null);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Delete ${c.name}`}
                          onClick={() => {
                            setConfirming(c);
                            setNotice(null);
                          }}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

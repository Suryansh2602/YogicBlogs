import { useCallback, useState } from 'react';

type FieldErrors<F extends string> = Partial<Record<F, string | undefined>>;

/**
 * Error state for a form: one message per field plus a form-level banner.
 * `edited(field)` is called from a field's onChange. It clears that field's message and the banner,
 * because once the person starts correcting their input, the old complaint no longer applies.
 */
export function useFormErrors<F extends string>() {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<F>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const edited = useCallback((field?: F) => {
    setFormError(null);
    if (field) setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }, []);

  const clearAll = useCallback(() => {
    setFieldErrors({});
    setFormError(null);
  }, []);

  return { fieldErrors, setFieldErrors, formError, setFormError, edited, clearAll };
}

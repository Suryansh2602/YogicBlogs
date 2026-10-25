import { useState, type SubmitEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { PasswordField } from '../../components/ui/PasswordField';
import { Checkbox } from '../../components/ui/Checkbox';
import { Alert } from '../../components/ui/Alert';
import { authApi } from '../../features/auth/api';
import { errorMessage, fieldErrors } from '../../features/auth/errors';
import { passwordProblems } from '../../features/auth/passwordPolicy';
import { emailProblem, nameProblem } from '../../features/auth/validation';
import { useRecaptcha } from '../../features/auth/useRecaptcha';
import { useFormErrors } from '../../hooks/useFormErrors';

type Field = 'displayName' | 'email' | 'password' | 'acceptTerms';

export default function SignUpPage() {
  const navigate = useNavigate();
  const getCaptcha = useRecaptcha();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const { fieldErrors: errors, setFieldErrors: setErrors, formError, setFormError, edited } = useFormErrors<Field>();
  const [busy, setBusy] = useState(false);

  const validate = () => {
    const next: Partial<Record<Field, string | undefined>> = {
      displayName: nameProblem(displayName),
      email: emailProblem(email),
      password: passwordProblems(password, { email, displayName })[0],
      acceptTerms: accepted ? undefined : 'Tick the box to accept the Terms of Use and Privacy Policy.',
    };
    setErrors(next);
    return Object.values(next).every((message) => !message);
  };

  const onSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const captchaToken = await getCaptcha('register');
      await authApi.register({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        acceptTerms: true,
        acceptPrivacy: true,
        ...(captchaToken && { captchaToken }),
      });
      void navigate('/check-email', { state: { email: email.trim() } });
    } catch (err) {
      // A problem with one field is shown under that field only; anything else goes in the banner.
      const fields = fieldErrors(err);
      if (Object.keys(fields).length) {
        setErrors({ displayName: fields['displayName'], email: fields['email'], password: fields['password'] });
      } else {
        setFormError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Begin your path"
      subtitle="Learn the roots of common conditions and gentle Ayurvedic ways to heal, from yoga practitioners."
      verse={{
        sanskrit: 'शरीरमाद्यं खलु धर्मसाधनम्',
        transliteration: 'śarīram ādyaṃ khalu dharma-sādhanam',
        meaning: 'The body is the first instrument of a good life. (Kumārasambhava 5.33)',
      }}
    >
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <TextField
          label="Your name"
          autoComplete="name"
          required
          maxLength={80}
          value={displayName}
          error={errors.displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
            edited('displayName');
          }}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          error={errors.email}
          onChange={(e) => {
            setEmail(e.target.value);
            edited('email');
          }}
        />
        <PasswordField
          label="Password"
          autoComplete="new-password"
          required
          showStrength
          maxLength={128}
          value={password}
          error={errors.password}
          hint="At least 12 characters. A short phrase is easy to remember and hard to guess."
          onChange={(e) => {
            setPassword(e.target.value);
            edited('password');
          }}
        />
        <Checkbox
          checked={accepted}
          error={errors.acceptTerms}
          onChange={(e) => {
            setAccepted(e.target.checked);
            edited('acceptTerms');
          }}
        >
          I agree to the{' '}
          <Link to="/terms" target="_blank" rel="noopener">
            Terms of Use
          </Link>{' '}
          and{' '}
          <Link to="/privacy" target="_blank" rel="noopener">
            Privacy Policy
          </Link>
          , and understand Healthmarg offers guidance, not medical treatment.
        </Checkbox>
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          Create my account
        </Button>
      </form>
      <p className="auth__footer">
        Already have an account?{' '}
        <Link to="/signin">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}

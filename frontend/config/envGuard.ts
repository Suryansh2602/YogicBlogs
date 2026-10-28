// Every VITE_* variable is baked into the public JS bundle that anyone can download.
// Fail the build if one of them looks like a credential, so a secret can never ship to browsers.
const SECRET_PATTERN = /SECRET|PASSWORD|PASSWD|PRIVATE|TOKEN|CREDENTIAL|API_KEY|DB_/i;

export function findSecretLikeKeys(env: Record<string, string | undefined>): string[] {
  return Object.keys(env).filter((key) => key.startsWith('VITE_') && SECRET_PATTERN.test(key));
}

export function assertNoSecretsInClientEnv(env: Record<string, string | undefined>): void {
  const offending = findSecretLikeKeys(env);
  if (offending.length > 0) {
    throw new Error(
      `Refusing to build: ${offending.join(', ')} would be exposed to every visitor. ` +
        'Secrets belong in backend/.env only.',
    );
  }
}

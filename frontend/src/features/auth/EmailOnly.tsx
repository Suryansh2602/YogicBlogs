import type { ReactNode } from 'react';
import { emailEnabled } from '../../config/features';
import NotFoundPage from '../../pages/NotFoundPage';

/** Renders its page only while email features are on; otherwise the page doesn't exist (404). */
export function EmailOnly({ children }: { children: ReactNode }) {
  return emailEnabled() ? children : <NotFoundPage />;
}

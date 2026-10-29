import { useEffect } from 'react';
import { Link } from 'react-router';
import { ErrorView } from '../components/ErrorView';

/** An address that doesn't exist: say so plainly, then help the reader find what they wanted. */
export default function NotFoundPage() {
  useEffect(() => {
    document.title = 'Page not found · Healthmarg';
  }, []);
  return (
    <ErrorView
      code="404"
      title="Page not found"
      search="articles"
      links
      actions={
        <Link to="/" className="btn btn--primary btn--md">
          <span className="btn__label">Go back home</span>
        </Link>
      }
    >
      <p>This address doesn’t lead anywhere. It may have a typo, or the page may have moved.</p>
    </ErrorView>
  );
}

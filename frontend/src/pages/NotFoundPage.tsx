import { Link } from 'react-router';

export default function NotFoundPage() {
  return (
    <section>
      <h1>Page not found</h1>
      <p>
        The page you are looking for does not exist. <Link to="/">Go back home</Link>.
      </p>
    </section>
  );
}

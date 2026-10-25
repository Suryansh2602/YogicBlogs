import { Link } from 'react-router';
import { Mandala } from '../components/brand/Mandala';
import './pages.css';

export default function NotFoundPage() {
  return (
    <section className="simple-page">
      <Mandala size={140} />
      <h1>Page not found</h1>
      <p className="muted">
        This path doesn’t lead anywhere yet. <Link to="/">Go back home</Link>.
      </p>
    </section>
  );
}

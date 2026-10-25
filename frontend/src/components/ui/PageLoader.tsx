import { LogoMark } from '../brand/Logo';
import './ui.css';

/** Full-area loader while a page or the session loads: the lotus breathes gently. */
export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="page-loader" role="status">
      <LogoMark size={56} className="page-loader__mark" />
      <span className="visually-hidden">{label}</span>
    </div>
  );
}

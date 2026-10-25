import { useEffect, useRef, useState } from 'react';

/**
 * True once the element has scrolled into view (then stays true). One shared-cost IntersectionObserver
 * per element; nothing runs on scroll. Falls back to "visible" where IntersectionObserver is missing.
 */
export function useInView<T extends Element>({ rootMargin = '0px 0px -10% 0px' } = {}) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const node = ref.current;
    if (!node || inView) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [inView, rootMargin]);

  return { ref, inView };
}

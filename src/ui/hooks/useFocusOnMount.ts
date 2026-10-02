import { useEffect, useRef } from 'react';

/** Moves focus to the referenced element when a screen mounts, so keyboard users land on it. */
export function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
}

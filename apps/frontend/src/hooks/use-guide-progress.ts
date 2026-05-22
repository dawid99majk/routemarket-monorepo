import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'guide-hub-read';

function getReadSlugs(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function persistReadSlugs(slugs: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...slugs]));
}

export function useGuideProgress() {
  const [readSlugs, setReadSlugs] = useState<Set<string>>(getReadSlugs);

  const isRead = useCallback((slug: string) => readSlugs.has(slug), [readSlugs]);

  const markAsRead = useCallback((slug: string) => {
    setReadSlugs((prev) => {
      const next = new Set(prev);
      next.add(slug);
      persistReadSlugs(next);
      return next;
    });
  }, []);

  return { isRead, markAsRead, readCount: readSlugs.size };
}

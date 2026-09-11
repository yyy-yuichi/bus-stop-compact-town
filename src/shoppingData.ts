import { useEffect, useState } from 'react';
import type { ShoppingCollection, ShoppingFeature, ShoppingProperties } from './types';

export type ShoppingCategory = NonNullable<ShoppingProperties['category']>;
export const SHOPPING_CATEGORIES: { id: ShoppingCategory; name: string; short: string; color: string }[] = [
  { id: 'supermarket', name: 'スーパー', short: '食', color: '#ae5419' },
  { id: 'drugstore', name: 'ドラッグストア', short: '薬', color: '#7959a3' },
  { id: 'mall', name: '商業施設', short: '買', color: '#276b73' },
];
export const categoryOf = (feature: ShoppingFeature) => SHOPPING_CATEGORIES.find(c => c.id === (feature.properties.category || 'mall'))!;

export function useShoppingData() {
  const [features, setFeatures] = useState<ShoppingFeature[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError(false);
    fetch(`${import.meta.env.BASE_URL}data/shopping.geojson`, { signal: abort.signal })
      .then(r => { if (!r.ok) throw Error('Shopping data unavailable'); return r.json() as Promise<ShoppingCollection>; })
      .then(data => {
        if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length) throw Error('Invalid shopping data');
        if (!abort.signal.aborted) { setFeatures(data.features); setLoading(false); }
      }).catch(() => { if (!abort.signal.aborted) { setError(true); setLoading(false); } });
    return () => abort.abort();
  }, [attempt]);
  return { features, error, loading, retry: () => setAttempt(n => n + 1) };
}

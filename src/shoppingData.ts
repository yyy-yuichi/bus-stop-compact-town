import { useEffect, useState } from 'react';
import type { ShoppingCollection, ShoppingFeature } from './types';
import { applyFacilityCurrent } from './facilityFreshness';
import { applyFacilityAudit } from './facilityAudit';

export { SHOPPING_CATEGORIES, categoryOf } from './facilityCatalog';
export type { ShoppingCategory } from './facilityCatalog';

export function useShoppingData() {
  const [features, setFeatures] = useState<ShoppingFeature[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError(false);
    const originals = Promise.all(['shopping', 'civic-facilities'].map(name =>
      fetch(`${import.meta.env.BASE_URL}data/${name}.geojson`, { signal: abort.signal })
        .then(r => { if (!r.ok) throw Error('Facility data unavailable'); return r.json() as Promise<ShoppingCollection>; })
        .then(data => {
          if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length) throw Error('Invalid facility data');
          return data.features;
        })
    ));
    const current = fetch(`${import.meta.env.BASE_URL}data/facility-current.json`, { signal: abort.signal })
      .then(r => { if (!r.ok) throw Error('Current facility reviews unavailable'); return r.json() as Promise<unknown>; });
    const audit = fetch(`${import.meta.env.BASE_URL}data/facility-audit.json`, { signal: abort.signal })
      .then(r => { if (!r.ok) throw Error('Facility audit unavailable'); return r.json() as Promise<unknown>; });
    Promise.all([originals, current, audit]).then(([collections, reviews, auditData]) => {
        if (!abort.signal.aborted) { setFeatures(applyFacilityAudit(applyFacilityCurrent(collections.flat(), reviews), auditData)); setLoading(false); }
      }).catch(() => { if (!abort.signal.aborted) { setError(true); setLoading(false); } });
    return () => abort.abort();
  }, [attempt]);
  return { features, error, loading, retry: () => setAttempt(n => n + 1) };
}

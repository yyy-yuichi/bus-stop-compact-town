export type WalkingConditions = { minutes: 5 | 10; speed: 3 | 4 };
export const DEFAULT_WALKING_CONDITIONS: WalkingConditions = { minutes: 10, speed: 4 };
export type SharedPlace =
  | { kind: 'facility' | 'national'; id: string }
  | { kind: 'pilot'; id: string; walking?: WalkingConditions };

export function readPlaceLink(hash: string): SharedPlace | null {
  if (hash.length > 512) return null;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.getAll('kind').length !== 1 || params.getAll('id').length !== 1) return null;
  const kind = params.get('kind');
  const id = params.get('id') || '';
  if (kind === 'national' && /^mlit-p11-22-35:\d+$/.test(id)) return { kind, id };
  if (kind === 'pilot' && /^(node|way|relation)\/\d+$/.test(id)) {
    if (!params.has('minutes') && !params.has('speed')) return { kind, id };
    if (params.getAll('minutes').length !== 1 || params.getAll('speed').length !== 1) return null;
    const minutes = params.get('minutes');
    const speed = params.get('speed');
    if ((minutes !== '5' && minutes !== '10') || (speed !== '3' && speed !== '4')) return null;
    return { kind, id, walking: { minutes: minutes === '5' ? 5 : 10, speed: speed === '3' ? 3 : 4 } };
  }
  if (kind === 'facility' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(id)) return { kind, id };
  return null;
}

export function placeLink(pageUrl: string, place: SharedPlace): string {
  const url = new URL(pageUrl);
  url.search = '';
  const params = new URLSearchParams({ kind: place.kind, id: place.id });
  if (place.kind === 'pilot' && place.walking) {
    params.set('minutes', String(place.walking.minutes));
    params.set('speed', String(place.walking.speed));
  }
  url.hash = params.toString();
  return url.href;
}

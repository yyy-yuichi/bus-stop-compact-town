export type SharedPlace = { kind: 'facility' | 'national' | 'pilot'; id: string };

export function readPlaceLink(hash: string): SharedPlace | null {
  if (hash.length > 512) return null;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.getAll('kind').length !== 1 || params.getAll('id').length !== 1) return null;
  const kind = params.get('kind');
  const id = params.get('id') || '';
  if (kind === 'national' && /^mlit-p11-22-35:\d+$/.test(id)) return { kind, id };
  if (kind === 'pilot' && /^(node|way|relation)\/\d+$/.test(id)) return { kind, id };
  if (kind === 'facility' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(id)) return { kind, id };
  return null;
}

export function placeLink(pageUrl: string, place: SharedPlace): string {
  const url = new URL(pageUrl);
  url.search = '';
  url.hash = new URLSearchParams({ kind: place.kind, id: place.id }).toString();
  return url.href;
}

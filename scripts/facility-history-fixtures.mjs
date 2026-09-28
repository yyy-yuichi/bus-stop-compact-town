export function throughRegistryBatch(live, holds) {
 const later = new Set(holds.map(r => r.id));
 return {...live, updates:live.updates.filter(r=>!later.has(r.id)), verifications:(live.verifications??[]).filter(r=>!later.has(r.id))};
}

export interface RegistryReview {
  scope: 'care_service_registry' | 'school_register' | 'childcare_register' | 'medical_register' | 'pharmacy_register' | 'welfare_register' | 'food_business_register' | 'post_office_directory' | 'public_facility_directory' | 'operator_directory';
  checked_at: string;
  source_as_of: string;
  source_date_kind?: 'as_of' | 'retrieved';
  registry_id: string;
  official_name: string;
  official_address: string;
  services: string[];
  summary: string;
  sources: { title: string; url: string; sha256: string }[];
  limits: string[];
}

const validDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const httpsUrl = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
};

export function validateRegistryReview(value: RegistryReview, overlayCheckedAt: string): void {
  const review = value as RegistryReview | undefined;
  if (!review || !['care_service_registry', 'school_register', 'childcare_register', 'medical_register', 'pharmacy_register', 'welfare_register', 'food_business_register', 'post_office_directory', 'public_facility_directory', 'operator_directory'].includes(review.scope) ||
      !validDate(review.source_as_of) || !validDate(review.checked_at) || !validDate(overlayCheckedAt) ||
      (review.source_date_kind !== undefined && !['as_of', 'retrieved'].includes(review.source_date_kind)) ||
      review.source_as_of > review.checked_at || review.checked_at > overlayCheckedAt ||
      !nonempty(review.registry_id) || !nonempty(review.official_name) ||
      !nonempty(review.official_address) || !nonempty(review.summary)) {
    throw Error('Invalid registry review');
  }
  if (!Array.isArray(review.services) || review.services.some(s => !nonempty(s)) ||
      (review.scope !== 'school_register' && review.services.length === 0) ||
      !Array.isArray(review.sources) || review.sources.length === 0 ||
      review.sources.some(s => !s || !nonempty(s.title) || !httpsUrl(s.url) || !/^[0-9a-fA-F]{64}$/.test(s.sha256)) ||
      !Array.isArray(review.limits) || review.limits.length === 0 || review.limits.some(s => !nonempty(s))) {
    throw Error('Invalid registry evidence or scope limits');
  }
}

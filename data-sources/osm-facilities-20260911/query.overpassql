[out:json][timeout:90];
area["ISO3166-2"="JP-35"]["boundary"="administrative"]->.pref;
(
  nwr(area.pref)["shop"~"^(supermarket|chemist|convenience|mall|department_store)$"];
  nwr(area.pref)["amenity"~"^(hospital|clinic|doctors|pharmacy)$"];
  nwr(area.pref)["healthcare"~"^(hospital|clinic|doctor|pharmacy)$"];
);
out body center;
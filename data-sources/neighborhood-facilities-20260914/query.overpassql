[out:json][timeout:90];
area["ISO3166-2"="JP-35"]["boundary"="administrative"]->.pref;
(
  nwr(area.pref)["amenity"~"^(restaurant|cafe|fast_food|food_court|bar|pub|dentist|kindergarten|childcare|school|college|university|social_facility)$"];
  nwr(area.pref)["healthcare"="dentist"];
  nwr(area.pref)["leisure"~"^(park|playground|sports_centre|fitness_centre)$"];
  nwr(area.pref)["shop"~"^(bakery|laundry|dry_cleaning|hairdresser|beauty)$"];
);
out body center geom;
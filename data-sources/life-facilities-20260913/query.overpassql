[out:json][timeout:90];
area["ISO3166-2"="JP-35"]["boundary"="administrative"]->.pref;
nwr(area.pref)["amenity"~"^(post_office|bank|library|townhall|community_centre)$"];
out body center;
/* Hong Kong Island + Kowloon + Victoria Harbour. south,west,north,east. Pier and ferry-terminal fill. */
[out:json][timeout:120];
(
  way["man_made"="pier"](22.185,114.100,22.360,114.260);
  relation["man_made"="pier"](22.185,114.100,22.360,114.260);
  way["amenity"="ferry_terminal"](22.185,114.100,22.360,114.260);
);
out geom;

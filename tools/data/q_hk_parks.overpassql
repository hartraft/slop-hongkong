/* Hong Kong Island + Kowloon + Victoria Harbour. south,west,north,east. Park and reserve fill. */
[out:json][timeout:180];
(
  way["leisure"="park"](22.185,114.100,22.360,114.260);
  relation["leisure"="park"](22.185,114.100,22.360,114.260);
  way["leisure"="garden"](22.185,114.100,22.360,114.260);
  relation["leisure"="garden"](22.185,114.100,22.360,114.260);
  way["leisure"="nature_reserve"](22.185,114.100,22.360,114.260);
  way["boundary"="protected_area"](22.185,114.100,22.360,114.260);
);
out geom;

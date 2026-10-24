/* Hong Kong Island + Kowloon + Victoria Harbour. south,west,north,east. OSM fill; LandsD is the building and road source. */
[out:json][timeout:180];
(
  way["natural"="coastline"](22.185,114.100,22.360,114.260);
  way["natural"="water"](22.185,114.100,22.360,114.260);
  way["waterway"="riverbank"](22.185,114.100,22.360,114.260);
  way["harbour"="yes"](22.185,114.100,22.360,114.260);
);
out geom;

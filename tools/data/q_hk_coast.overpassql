/* Hong Kong Island + Kowloon + Victoria Harbour. south,west,north,east.
   OSM water and coast for harbour v1. LandsD stays the building and road source.
   Relations carry Victoria Harbour and other multipolygon water; ways carry the coastline. */
[out:json][timeout:180];
(
  way["natural"="coastline"](22.185,114.100,22.360,114.260);
  way["natural"="water"](22.185,114.100,22.360,114.260);
  way["waterway"="riverbank"](22.185,114.100,22.360,114.260);
  way["harbour"="yes"](22.185,114.100,22.360,114.260);
  relation["natural"="water"](22.185,114.100,22.360,114.260);
  relation["natural"="coastline"](22.185,114.100,22.360,114.260);
  relation["harbour"="yes"](22.185,114.100,22.360,114.260);
  relation["waterway"="riverbank"](22.185,114.100,22.360,114.260);
);
out geom;

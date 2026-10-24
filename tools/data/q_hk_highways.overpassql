/* Hong Kong Island + Kowloon + Victoria Harbour. south,west,north,east.
   Drivable highways for the street graph. LandsD Road Centreline supplies geometry and names;
   these ways supply class, lanes, width, oneway, and gap fill. Coast, parks, landmarks, and piers stay in their own queries. */
[out:json][timeout:180];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"](22.185,114.100,22.360,114.260);
);
out geom;

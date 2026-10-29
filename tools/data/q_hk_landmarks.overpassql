/* Hong Kong Island + Kowloon + Victoria Harbour. south,west,north,east. Named landmark fill. */
[out:json][timeout:120];
(
  way["building"]["name"~"^(Bank of China Tower|Bank of China Building|HSBC Main Building|HSBC Building|International Finance Centre|International Commerce Centre|Two International Finance Centre|The Center|Central Plaza|Hopewell Centre|Lippo Centre|Jardine House|Cheung Kong Center|The Henderson|Exchange Square|Prince's Building|The Peninsula|Peninsula Hotel|Clock Tower|Hong Kong Cultural Centre|Hong Kong Convention and Exhibition Centre|Hong Kong City Hall|Legislative Council Complex|Court of Final Appeal|Tai Kwun|PMQ|Peak Tower|The Peak Tower|Ocean Park|Times Square|Pacific Place|Langham Place|Hong Kong Palace Museum|M\+|Victoria Dockside|K11 Musea|Harbour City|The Murray|Government House|St\. John's Cathedral|Man Mo Temple|Chi Lin Nunnery|Wong Tai Sin Temple|Happy Valley Racecourse|Hong Kong Stadium|Hong Kong Coliseum|University of Hong Kong|The Repulse Bay|Murray House|Statue Square|Cenotaph)$"](22.185,114.100,22.360,114.260);
  relation["building"]["name"~"^(International Finance Centre|International Commerce Centre|Hong Kong Convention and Exhibition Centre|Pacific Place|Harbour City|Exchange Square|Tai Kwun|Ocean Park|University of Hong Kong|Hong Kong Palace Museum)$"](22.185,114.100,22.360,114.260);
);
out geom tags;

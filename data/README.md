# Reference data

| File | What it is | How it is made |
|---|---|---|
| `ports.csv` | About 11,800 ports (UN/LOCODE code, name, country, lat, lon, rank) | **Generated**: `node scripts/build-ports.mjs` downloads the open UN/LOCODE dataset and merges `ports-curated.csv` over it |
| `ports-curated.csv` | 73 hand-checked major ports | Edit by hand. These win over the dataset and cover big ports UN/LOCODE lists without coordinates (for example Jebel Ali, Southampton, Kaohsiung) |
| `port-aliases.json` | English names that differ from the UN/LOCODE spelling (ANTWERP -> BEANR) | Edit by hand. A test checks every target exists |
| `airports.csv` | 15 major airports | Starter sample. Replace with OurAirports for full coverage |
| `freight-callsigns.json` | Freight airline callsign prefixes | Grow as you spot more |

## How ship destinations are matched

AIS destinations are free text typed by crews ("NL RTM", "ROTTERDAM@@@", "SINGAPORE > ROTTERDAM", "FOR ORDERS").
The matcher tries, in order: a port code, an alias, then a port name. If a name belongs to several ports it
picks one only when it is clearly the biggest hub; otherwise the destination stays **unknown** rather than guessed.
Airport codes are never used for ships.

## Known gaps

- About 5,800 ports in UN/LOCODE have no coordinates, so they cannot be placed on the map. The larger ones I was
  confident about are in `ports-curated.csv`; many small ones are missing. The NGA World Port Index would fill
  most of that gap (it needs a manual download from the NGA site).
- Plenty of real AIS destinations are junk or generic, so some ships will always show "destination unknown".
- Port coordinates are approximate port-area centres.
- Source: UN/LOCODE via github.com/datasets/un-locode (check its license terms before redistributing).

/** [lat, lon] corner pairs, the order AISStream expects. */
export type Box = [[number, number], [number, number]];

/** Busy shipping areas. `world` streams everything; the map thins what it draws, but start with a few areas. */
export const REGION_PRESETS: Record<string, Box> = {
  'english-channel': [[48.5, -6.0], [52.0, 3.5]],
  'north-sea': [[51.0, -4.0], [61.0, 9.0]],
  gibraltar: [[35.0, -7.0], [37.0, -4.0]],
  suez: [[27.0, 31.5], [32.0, 34.5]],
  hormuz: [[23.0, 54.0], [28.0, 60.0]],
  malacca: [[-1.0, 95.0], [8.0, 106.0]],
  'east-china-sea': [[22.0, 117.0], [35.0, 130.0]],
  'us-west-coast': [[32.0, -123.0], [38.0, -117.0]],
  'us-east-coast': [[24.0, -82.0], [42.0, -69.0]],
  panama: [[7.0, -81.0], [10.0, -78.0]],
  mediterranean: [[30.0, -6.0], [46.0, 37.0]],
  baltic: [[53.0, 9.0], [66.0, 30.0]],
  'red-sea': [[12.0, 32.0], [28.0, 44.0]],
  'india-west': [[8.0, 66.0], [24.0, 76.0]],
  japan: [[30.0, 128.0], [45.0, 146.0]],
  'gulf-of-mexico': [[18.0, -98.0], [30.0, -80.0]],
  brazil: [[-30.0, -52.0], [-20.0, -38.0]],
  'australia-east': [[-38.0, 148.0], [-25.0, 155.0]],
  'west-africa': [[-5.0, -20.0], [15.0, 10.0]],
  world: [[-90, -180], [90, 180]],
};

export const DEFAULT_REGIONS = 'english-channel,malacca,suez';

export function parseRegions(value: string | undefined): { boxes: Box[]; names: string[]; unknown: string[] } {
  const requested = (value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const names: string[] = [];
  const unknown: string[] = [];
  for (const r of requested) (r in REGION_PRESETS ? names : unknown).push(r);
  if (names.length === 0) {
    // nothing valid requested: fall back to the default regions
    return { boxes: DEFAULT_REGIONS.split(',').map((n) => REGION_PRESETS[n]!), names: DEFAULT_REGIONS.split(','), unknown };
  }
  return { boxes: names.map((n) => REGION_PRESETS[n]!), names, unknown };
}

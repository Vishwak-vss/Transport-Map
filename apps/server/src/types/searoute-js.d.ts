declare module 'searoute-js' {
  type PointFeature = { type: 'Feature'; properties: Record<string, unknown>; geometry: { type: 'Point'; coordinates: number[] } };
  type RouteFeature = { geometry: { coordinates: number[][] }; properties: { length: number; units?: string } };
  export default function searoute(origin: PointFeature, destination: PointFeature, units?: string): RouteFeature;
}

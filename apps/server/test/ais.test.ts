import { describe, it, expect } from 'vitest';
import { parseAisEta, parseAisMessage, cleanAisText } from '../src/ingest/aisstream';
import { shipTypeInfo } from '../src/enrich/freight';
import { loadPlaces } from '../src/enrich/places';

const places = loadPlaces();

describe('AIS parsing', () => {
  it('converts a position report (knots -> m/s)', () => {
    const u = parseAisMessage(
      { MessageType: 'PositionReport', MetaData: { MMSI: 1 }, Message: { PositionReport: { Latitude: 5, Longitude: 98, Sog: 10, TrueHeading: 511, Cog: 290 } } },
      places,
      0,
    );
    expect(u?.patch.speed).toBeCloseTo(5.14444, 3);
    expect(u?.patch.heading).toBe(290); // 511 = "not available", falls back to COG
  });
  it('reads static data: type, freight flag, destination', () => {
    const u = parseAisMessage(
      { MessageType: 'ShipStaticData', MetaData: { MMSI: 2 }, Message: { ShipStaticData: { Name: 'X', Type: 72, Destination: 'SINGAPORE > ROTTERDAM' } } },
      places,
    );
    expect(u?.patch).toMatchObject({ model: 'Cargo ship', isFreight: true });
    expect(u?.patch.destination?.code).toBe('NLRTM');
  });
  it('treats unavailable ETA values as undefined', () => {
    expect(parseAisEta({ Month: 0, Day: 0, Hour: 24, Minute: 60 })).toBeUndefined();
  });
  it('rolls an ETA that already passed into next year', () => {
    const eta = parseAisEta({ Month: 1, Day: 5, Hour: 0, Minute: 0 }, new Date('2026-10-13T00:00:00Z'));
    expect(new Date(eta!).getUTCFullYear()).toBe(2027);
  });
  it('classifies ship types', () => {
    expect(shipTypeInfo(80).isFreight).toBe(true);
    expect(shipTypeInfo(60).isFreight).toBe(false);
  });
  it('treats AIS "not available" values as unknown', () => {
    const base = { MessageType: 'PositionReport', MetaData: { MMSI: 3 } };
    const bad = parseAisMessage({ ...base, Message: { PositionReport: { Latitude: 91, Longitude: 181, Sog: 5 } } }, places);
    expect(bad).toBeNull(); // position not available: skip
    const noSpeed = parseAisMessage({ ...base, Message: { PositionReport: { Latitude: 1, Longitude: 2, Sog: 102.3, Cog: 360, TrueHeading: 511 } } }, places);
    expect(noSpeed?.patch).toMatchObject({ speed: 0, heading: 0 });
  });
  it('cleans @ padding from names and destinations', () => {
    expect(cleanAisText('EVER GIVEN@@@@@@')).toBe('EVER GIVEN');
    expect(cleanAisText('@@@@')).toBeUndefined();
    const u = parseAisMessage(
      { MessageType: 'ShipStaticData', MetaData: { MMSI: 4 }, Message: { ShipStaticData: { Name: 'X@@@', Type: 70, Destination: 'ROTTERDAM@@@@@@' } } },
      places,
    );
    expect(u?.patch.destination?.code).toBe('NLRTM');
  });

  it('reads Class B (small vessel) positions', () => {
    const u = parseAisMessage(
      { MessageType: 'StandardClassBPositionReport', MetaData: { MMSI: 5, ShipName: 'SMALL BOAT@@' }, Message: { StandardClassBPositionReport: { Latitude: 50.7, Longitude: -1.3, Sog: 6, Cog: 45, TrueHeading: 511 } } },
      places,
    );
    expect(u?.patch).toMatchObject({ lat: 50.7, lon: -1.3, heading: 45, name: 'SMALL BOAT' });
  });
  it('reads extended Class B positions with name and type', () => {
    const u = parseAisMessage(
      { MessageType: 'ExtendedClassBPositionReport', MetaData: { MMSI: 6 }, Message: { ExtendedClassBPositionReport: { Latitude: 1, Longitude: 2, Sog: 3, Cog: 10, TrueHeading: 10, Name: 'FISHER@@@', Type: 30 } } },
      places,
    );
    expect(u?.patch).toMatchObject({ name: 'FISHER', model: 'Fishing vessel', isFreight: false });
  });
  it('reads Class B static data (name from part A, type from part B)', () => {
    const u = parseAisMessage(
      { MessageType: 'StaticDataReport', MetaData: { MMSI: 7 }, Message: { StaticDataReport: { ReportA: { Valid: true, Name: 'COASTER ONE@@' }, ReportB: { Valid: true, ShipType: 70 } } } },
      places,
    );
    expect(u?.patch).toMatchObject({ name: 'COASTER ONE', model: 'Cargo ship', isFreight: true });
  });
  it('ignores empty or invalid static reports', () => {
    expect(parseAisMessage({ MessageType: 'StaticDataReport', MetaData: { MMSI: 8 }, Message: { StaticDataReport: { ReportA: { Valid: false, Name: 'X' }, ReportB: { Valid: false, ShipType: 70 } } } }, places)).toBeNull();
  });
  it('treats ship type 0 as unknown instead of inventing a label', () => {
    const u = parseAisMessage({ MessageType: 'ShipStaticData', MetaData: { MMSI: 9 }, Message: { ShipStaticData: { Name: 'N', Type: 0 } } }, places);
    expect(u?.patch.model).toBeUndefined();
  });
});

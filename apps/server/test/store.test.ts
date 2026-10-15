import { describe, it, expect } from 'vitest';
import { VehicleStore } from '../src/store/vehicleStore';

const ttl = { air: 1000, sea: 5000 };

describe('VehicleStore', () => {
  it('holds static info until the first position arrives', () => {
    const s = new VehicleStore(ttl);
    s.upsert('1', 'sea', { name: 'SHIP' });
    expect(s.size).toBe(0);
    s.upsert('1', 'sea', { lat: 1, lon: 2, updatedAt: 0 });
    expect(s.get('1')).toMatchObject({ name: 'SHIP', lat: 1, lon: 2 });
  });
  it('expires stale vehicles per mode and reports removals', () => {
    const s = new VehicleStore(ttl);
    s.upsert('a', 'air', { lat: 0, lon: 0, updatedAt: 0 });
    s.upsert('b', 'sea', { lat: 0, lon: 0, updatedAt: 0 });
    expect(s.expire(2000)).toBe(1);
    expect(s.get('b')).toBeDefined();
    expect(s.drain().removed).toEqual(['a']);
  });
  it('drain returns only changed vehicles once', () => {
    const s = new VehicleStore(ttl);
    s.upsert('a', 'air', { lat: 0, lon: 0 });
    expect(s.drain().changed).toHaveLength(1);
    expect(s.drain().changed).toHaveLength(0);
  });
  it('does not erase known fields when a later message lacks them', () => {
    const s = new VehicleStore(ttl);
    s.upsert('a', 'sea', { lat: 1, lon: 2, name: 'KNOWN', model: 'Cargo ship' });
    s.upsert('a', 'sea', { lat: 1.1, lon: 2.1, name: undefined });
    expect(s.get('a')).toMatchObject({ name: 'KNOWN', model: 'Cargo ship', lat: 1.1 });
  });
  it('flags a vehicle as changed when it turns out to be freight', () => {
    const s = new VehicleStore(ttl);
    s.upsert('a', 'sea', { lat: 1, lon: 2 });
    s.drain();
    s.upsert('a', 'sea', { isFreight: true });
    expect(s.drain().changed.map((v) => v.id)).toEqual(['a']);
  });
});

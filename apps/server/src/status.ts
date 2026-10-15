export type SourceState = 'off' | 'connecting' | 'live' | 'error';

export type SourceInfo = { state: SourceState; detail: string };

/** Shown in the UI so it is clear why, for example, there are no planes. */
export const sources: { ships: SourceInfo; planes: SourceInfo } = {
  ships: { state: 'off', detail: '' },
  planes: { state: 'off', detail: '' },
};

export function setSource(kind: 'ships' | 'planes', state: SourceState, detail = '') {
  sources[kind] = { state, detail };
}

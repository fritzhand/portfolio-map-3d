// @ts-nocheck
// The walk world has its own live explorers (src/live), so this P2P hook is a quiet stand-in.
export interface P2PClientData { p: number[]; r: number[]; a: number; seed?: number }
export class P2PConnection {
  _clients = new Map<string, any>();
  _data: any = null;
  constructor(o: any) { setTimeout(() => o?.onConnect?.(), 0); }
  _dispose() {}
}

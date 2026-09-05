import { EventEmitter } from 'events';

class RealtimeEvents extends EventEmitter {}

export const realtimeEvents: RealtimeEvents = (global as any)._realtimeEvents || new RealtimeEvents();
if (process.env.NODE_ENV !== 'production') {
  (global as any)._realtimeEvents = realtimeEvents;
}

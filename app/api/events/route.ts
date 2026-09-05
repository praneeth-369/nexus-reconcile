import { realtimeEvents } from '@/lib/realtimeStore';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (data: any) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch (err) {
          // Client disconnected
        }
      };

      const onRunUpdated = (payload: any) => {
        sendEvent({ type: 'RUN_UPDATED', payload });
      };

      realtimeEvents.on('RUN_UPDATED', onRunUpdated);

      // Send initial connection event
      sendEvent({ type: 'CONNECTED', timestamp: new Date().toISOString() });

      req.signal.addEventListener('abort', () => {
        realtimeEvents.off('RUN_UPDATED', onRunUpdated);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}

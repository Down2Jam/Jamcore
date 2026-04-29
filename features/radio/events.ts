import type { Response } from "express";

type RadioEvent = {
  type: string;
  payload: unknown;
};

const clientsByTenant = new Map<string, Set<Response>>();

function writeEvent(client: Response, event: RadioEvent) {
  client.write(`event: ${event.type}\n`);
  client.write(`data: ${JSON.stringify(event.payload)}\n\n`);
}

export function addRadioClient(tenantId: string, client: Response) {
  const clients = clientsByTenant.get(tenantId) ?? new Set<Response>();
  clients.add(client);
  clientsByTenant.set(tenantId, clients);
  writeEvent(client, {
    type: "listener.count",
    payload: { listenerCount: clients.size },
  });

  client.on("close", () => {
    clients.delete(client);
    broadcastRadioEvent(tenantId, {
      type: "listener.count",
      payload: { listenerCount: clients.size },
    });
  });
}

export function broadcastRadioEvent(tenantId: string, event: RadioEvent) {
  const clients = clientsByTenant.get(tenantId);
  if (!clients) {
    return;
  }

  for (const client of clients) {
    writeEvent(client, event);
  }
}

export function getRadioListenerCount(tenantId: string) {
  return clientsByTenant.get(tenantId)?.size ?? 0;
}

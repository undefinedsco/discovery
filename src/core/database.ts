import net from 'node:net';
import { Pool } from 'pg';

export function createIpv4PreferredStream(): net.Socket {
  const socket = new net.Socket();
  const originalConnect = socket.connect.bind(socket);

  socket.connect = ((...args: unknown[]) => {
    if (typeof args[0] === 'number' && typeof args[1] === 'string') {
      return originalConnect({
        family: 4,
        host: args[1],
        port: args[0]
      });
    }

    if (typeof args[0] === 'object' && args[0] !== null) {
      return originalConnect({
        ...(args[0] as net.NetConnectOpts),
        family: 4
      });
    }

    return originalConnect(...(args as Parameters<typeof originalConnect>));
  }) as typeof socket.connect;

  return socket;
}

export function createPgPoolFromEnv(): Pool {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const config = {
    connectionString,
    max: Number.parseInt(process.env.PGPOOL_MAX ?? '10', 10),
    stream: createIpv4PreferredStream
  } as ConstructorParameters<typeof Pool>[0] & {
    stream: typeof createIpv4PreferredStream
  };

  return new Pool(config);
}

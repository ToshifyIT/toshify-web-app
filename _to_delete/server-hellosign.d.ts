// server-hellosign.d.ts
// Tipos mínimos para poder importar el router desde vite.config.ts (TS estricto).
// El módulo real es server-hellosign.js.

import type { IncomingMessage, ServerResponse } from 'node:http';

type HelloSignHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: any) => void,
) => void;

export declare const hellosignRouter: HelloSignHandler;

declare const _default: HelloSignHandler;
export default _default;

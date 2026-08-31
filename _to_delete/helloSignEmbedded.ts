// src/modules/hellosign/helloSignEmbedded.ts
/**
 * Carga perezosa del SDK `hellosign-embedded` (v2) desde CDN.
 *
 * Se carga por CDN en vez de como dependencia npm para no obligar a un
 * `npm install` ni engordar el bundle: solo se descarga cuando el usuario
 * abre el editor de plantillas. Si preferís tenerlo versionado, alcanza con
 * `npm i hellosign-embedded` y cambiar esta función por un import dinámico.
 *
 * Requiere en la CSP de index.html:
 *   script-src ... https://cdn.jsdelivr.net
 *   frame-src  ... https://app.hellosign.com
 */

const CDN_URL =
  'https://cdn.jsdelivr.net/npm/hellosign-embedded@2.12.3/umd/embedded.production.min.js';

export interface HelloSignOpenOptions {
  /** Elemento donde se inyecta el iframe. Sin esto se abre como modal propio del SDK. */
  container?: HTMLElement;
  /** Permite saltear la verificación de dominio. Solo funciona junto con test mode. */
  skipDomainVerification?: boolean;
  testMode?: boolean;
  allowCancel?: boolean;
  debug?: boolean;
}

export interface HelloSignClient {
  open(url: string, options?: HelloSignOpenOptions): void;
  close(): void;
  on(evento: string, handler: (payload?: unknown) => void): void;
  off(evento: string, handler?: (payload?: unknown) => void): void;
}

export type HelloSignConstructor = new (config: { clientId: string }) => HelloSignClient;

/** Eventos del SDK v2 que nos interesan. */
export const HELLOSIGN_EVENTS = {
  createTemplate: 'createTemplate',
  close: 'close',
  error: 'error',
  ready: 'ready',
} as const;

let cargaEnCurso: Promise<HelloSignConstructor> | null = null;

function getGlobal(): HelloSignConstructor | null {
  const global = window as unknown as { HelloSign?: HelloSignConstructor };
  return global.HelloSign ?? null;
}

export function cargarHelloSignEmbedded(): Promise<HelloSignConstructor> {
  const yaCargado = getGlobal();
  if (yaCargado) return Promise.resolve(yaCargado);
  if (cargaEnCurso) return cargaEnCurso;

  cargaEnCurso = new Promise<HelloSignConstructor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CDN_URL;
    script.async = true;

    script.onload = () => {
      const HelloSign = getGlobal();
      if (HelloSign) {
        resolve(HelloSign);
      } else {
        cargaEnCurso = null;
        reject(new Error('El SDK de Dropbox Sign cargó pero no expuso window.HelloSign.'));
      }
    };

    script.onerror = () => {
      cargaEnCurso = null;
      script.remove();
      reject(
        new Error(
          'No se pudo cargar el SDK de Dropbox Sign. Revisá la conexión o que la CSP ' +
            'permita https://cdn.jsdelivr.net en script-src.',
        ),
      );
    };

    document.head.appendChild(script);
  });

  return cargaEnCurso;
}

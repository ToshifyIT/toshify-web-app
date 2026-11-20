// Prueba carga: módulo de prueba para subir una foto a una carpeta de Google Drive.
// En el celular se saca con la cámara o se elige de la galería; en la laptop se adjunta un archivo.
// La subida pasa por el servidor (/api/prueba-carga/subir-foto): la credencial de Google
// nunca llega al frontend.
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useDeviceType } from '../../hooks/useDeviceType';
import { showError, showSuccess } from '../../utils/toast';
import '../../styles/modules.css';
import './PruebaCargaModule.css';

const MAX_BYTES = 25 * 1024 * 1024;

interface FotoSubida {
  nombre: string;
  url: string;
}

export function PruebaCargaModule() {
  const { isMobile } = useDeviceType();
  const camaraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const [isSubiendo, setIsSubiendo] = useState(false);
  const [subidas, setSubidas] = useState<FotoSubida[]>([]);

  useEffect(() => {
    if (!foto) {
      setVistaPrevia(null);
      return;
    }
    const url = URL.createObjectURL(foto);
    setVistaPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);

  const elegirFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!archivo) return;
    if (!archivo.type.startsWith('image/')) {
      showError('Archivo no válido', 'Elegí una foto (imagen).');
      return;
    }
    if (archivo.size > MAX_BYTES) {
      showError('Foto muy pesada', 'La foto pesa más de 25 MB.');
      return;
    }
    setFoto(archivo);
  };

  const subir = async () => {
    if (!foto) return;
    setIsSubiendo(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesión vencida, volvé a iniciar sesión');
      const respuesta = await fetch('/api/prueba-carga/subir-foto', {
        method: 'POST',
        headers: {
          'Content-Type': foto.type,
          'X-Nombre-Archivo': encodeURIComponent(foto.name || 'foto.jpg'),
          Authorization: `Bearer ${session.access_token}`,
        },
        body: foto,
      });
      const datos = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) throw new Error(datos.error || 'No se pudo subir la foto');
      setSubidas(prev => [{ nombre: datos.nombre, url: datos.url }, ...prev]);
      setFoto(null);
      showSuccess('Foto subida', 'Quedó guardada en la carpeta de Drive.');
    } catch (error) {
      console.error('Error subiendo foto a Drive:', error);
      showError('Error', error instanceof Error ? error.message : 'No se pudo subir la foto');
    } finally {
      setIsSubiendo(false);
    }
  };

  return (
    <div className="module-container prueba-carga">
      <div className="prueba-carga-card">
        <h3>Subir una foto a Drive</h3>
        <p className="prueba-carga-ayuda">
          {isMobile
            ? 'Sacá una foto con la cámara o elegí una de la galería.'
            : 'Adjuntá una foto desde la computadora.'}
        </p>

        <input
          ref={camaraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={elegirFoto}
        />
        <input ref={galeriaRef} type="file" accept="image/*" hidden onChange={elegirFoto} />
        <input ref={archivoRef} type="file" accept="image/*" hidden onChange={elegirFoto} />

        <div className="prueba-carga-botones">
          {isMobile ? (
            <>
              <button
                type="button"
                className="btn-secondary"
                disabled={isSubiendo}
                onClick={() => camaraRef.current?.click()}
              >
                Sacar foto
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={isSubiendo}
                onClick={() => galeriaRef.current?.click()}
              >
                Elegir de la galería
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-secondary"
              disabled={isSubiendo}
              onClick={() => archivoRef.current?.click()}
            >
              Adjuntar archivo
            </button>
          )}
        </div>

        {foto && vistaPrevia && (
          <div className="prueba-carga-vista">
            <img src={vistaPrevia} alt="Foto elegida" />
            <div className="prueba-carga-vista-pie">
              <span className="prueba-carga-ayuda">
                {foto.name} ({foto.size < 1024 * 1024
                  ? `${Math.max(1, Math.round(foto.size / 1024))} KB`
                  : `${(foto.size / 1024 / 1024).toFixed(1)} MB`})
              </span>
              <div className="prueba-carga-botones">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={isSubiendo}
                  onClick={() => setFoto(null)}
                >
                  Quitar
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={isSubiendo}
                  onClick={() => void subir()}
                >
                  {isSubiendo ? 'Subiendo...' : 'Subir a Drive'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {subidas.length > 0 && (
        <div className="prueba-carga-card">
          <h3>Subidas en esta sesión</h3>
          <ul className="prueba-carga-lista">
            {subidas.map(s => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer">{s.nombre}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

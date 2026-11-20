// Prueba carga: módulo de prueba para subir fotos a una carpeta de Google Drive.
// En el celular se sacan con la cámara o se eligen de la galería (varias a la vez); en la
// laptop se adjuntan archivos. La subida pasa por el servidor (/api/prueba-carga/subir-foto),
// una foto por pedido: la credencial de Google nunca llega al frontend.
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useDeviceType } from '../../hooks/useDeviceType';
import { showError, showSuccess, showWarning } from '../../utils/toast';
import '../../styles/modules.css';
import './PruebaCargaModule.css';

const MAX_BYTES = 25 * 1024 * 1024;

interface FotoElegida {
  id: string;
  archivo: File;
  vistaPrevia: string;
}

interface FotoSubida {
  nombre: string;
  url: string;
}

function formatoPeso(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function PruebaCargaModule() {
  const { isMobile } = useDeviceType();
  const camaraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const [fotos, setFotos] = useState<FotoElegida[]>([]);
  const [progreso, setProgreso] = useState<{ actual: number; total: number } | null>(null);
  const [subidas, setSubidas] = useState<FotoSubida[]>([]);
  const fotosRef = useRef<FotoElegida[]>([]);
  fotosRef.current = fotos;
  const isSubiendo = progreso !== null;

  // Al salir de la pantalla se liberan las vistas previas
  useEffect(() => () => fotosRef.current.forEach(f => URL.revokeObjectURL(f.vistaPrevia)), []);

  const agregarFotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivos = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (archivos.length === 0) return;
    const validas = archivos.filter(a => a.type.startsWith('image/') && a.size <= MAX_BYTES);
    const descartadas = archivos.length - validas.length;
    if (descartadas > 0) {
      showWarning(
        descartadas === 1 ? '1 archivo no se agregó' : `${descartadas} archivos no se agregaron`,
        'Solo se aceptan fotos de hasta 25 MB.',
      );
    }
    const nuevas = validas.map((archivo, i) => ({
      id: `${Date.now()}-${i}-${archivo.name}`,
      archivo,
      vistaPrevia: URL.createObjectURL(archivo),
    }));
    setFotos(prev => [...prev, ...nuevas]);
  };

  const quitarFoto = (id: string) => {
    setFotos(prev => {
      const foto = prev.find(f => f.id === id);
      if (foto) URL.revokeObjectURL(foto.vistaPrevia);
      return prev.filter(f => f.id !== id);
    });
  };

  const subirUna = async (archivo: File, token: string): Promise<FotoSubida> => {
    const respuesta = await fetch('/api/prueba-carga/subir-foto', {
      method: 'POST',
      headers: {
        'Content-Type': archivo.type,
        'X-Nombre-Archivo': encodeURIComponent(archivo.name || 'foto.jpg'),
        Authorization: `Bearer ${token}`,
      },
      body: archivo,
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      const detalle = datos.detalle ? ` (Google: ${datos.detalle})` : '';
      throw new Error(`${datos.error || 'No se pudo subir la foto'}${detalle}`);
    }
    return { nombre: datos.nombre, url: datos.url };
  };

  const subirTodas = async () => {
    if (fotos.length === 0) return;
    const pendientes = [...fotos];
    let fallidas = 0;
    let ultimoError = '';
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showError('Error', 'Sesión vencida, volvé a iniciar sesión');
        return;
      }
      for (let i = 0; i < pendientes.length; i++) {
        const foto = pendientes[i];
        setProgreso({ actual: i + 1, total: pendientes.length });
        try {
          const subida = await subirUna(foto.archivo, session.access_token);
          setSubidas(prev => [subida, ...prev]);
          quitarFoto(foto.id);
        } catch (error) {
          console.error('Error subiendo foto a Drive:', error);
          fallidas++;
          ultimoError = error instanceof Error ? error.message : 'No se pudo subir la foto';
        }
      }
    } finally {
      setProgreso(null);
    }
    const subidasOk = pendientes.length - fallidas;
    if (fallidas === 0) {
      showSuccess(
        subidasOk === 1 ? 'Foto subida' : `${subidasOk} fotos subidas`,
        'Quedaron guardadas en la carpeta de Drive.',
      );
    } else {
      // Las que fallaron quedan en la lista para reintentar
      showError(
        subidasOk === 0 ? 'No se subió ninguna foto' : `Se subieron ${subidasOk} de ${pendientes.length}`,
        ultimoError,
      );
    }
  };

  const textoBoton = progreso
    ? `Subiendo ${progreso.actual} de ${progreso.total}...`
    : fotos.length === 1 ? 'Subir a Drive' : `Subir ${fotos.length} fotos a Drive`;

  return (
    <div className="module-container prueba-carga">
      <div className="prueba-carga-card">
        <h3>Subir fotos a Drive</h3>
        <p className="prueba-carga-ayuda">
          {isMobile
            ? 'Sacá una foto con la cámara o elegí una o varias de la galería.'
            : 'Adjuntá una o varias fotos desde la computadora.'}
        </p>

        <input
          ref={camaraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={agregarFotos}
        />
        <input ref={galeriaRef} type="file" accept="image/*" multiple hidden onChange={agregarFotos} />
        <input ref={archivoRef} type="file" accept="image/*" multiple hidden onChange={agregarFotos} />

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
              Adjuntar archivos
            </button>
          )}
        </div>

        {fotos.length > 0 && (
          <>
            <div className="prueba-carga-grilla">
              {fotos.map(f => (
                <div key={f.id} className="prueba-carga-miniatura">
                  <img src={f.vistaPrevia} alt={f.archivo.name} />
                  <span className="prueba-carga-ayuda">{formatoPeso(f.archivo.size)}</span>
                  <button
                    type="button"
                    className="prueba-carga-quitar"
                    disabled={isSubiendo}
                    onClick={() => quitarFoto(f.id)}
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
            <div className="prueba-carga-vista-pie">
              <span className="prueba-carga-ayuda">
                {fotos.length === 1 ? '1 foto elegida' : `${fotos.length} fotos elegidas`}
              </span>
              <button
                type="button"
                className="btn-primary"
                disabled={isSubiendo}
                onClick={() => void subirTodas()}
              >
                {textoBoton}
              </button>
            </div>
          </>
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

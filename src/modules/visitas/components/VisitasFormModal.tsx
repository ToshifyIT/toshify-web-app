// ============================================================
// Modal de formulario para crear/editar visitas
// Responsabilidad: UI del formulario + validación local
// Soporta múltiples visitantes para categoría Inducción + motivo Inducción
// Auto-asigna anfitrión según categoría+motivo (excepto Directivo)
// ============================================================

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, User } from 'lucide-react';
import Swal from 'sweetalert2';
import { supabase } from '../../../lib/supabase';
import { useSede } from '../../../contexts/SedeContext';
import type {
  VisitaCategoria,
  VisitaMotivo,
  VisitaFormData,
  VisitaCompleta,
  VisitaAtendedor,
} from '../../../types/visitas.types';
import { VISITA_FORM_INITIAL } from '../../../types/visitas.types';
import { TIPO_ASIGNACION_LABELS } from '../../../types/onboarding.types';
import { getMotivosByCategoria, checkConflict, buildLocalTimestamp } from '../../../services/visitasService';
import { format } from 'date-fns';

// Formatear fecha/hora en zona Argentina (independiente del navegador)
const ARG_TZ = 'America/Argentina/Buenos_Aires';
function formatInArgentina(date: Date, fmt: string): string {
  if (fmt === 'yyyy-MM-dd') {
    return new Intl.DateTimeFormat('en-CA', { timeZone: ARG_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }
  if (fmt === 'HH:mm') {
    return new Intl.DateTimeFormat('en-GB', { timeZone: ARG_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }
  return format(date, fmt);
}

// Motivos derivados de asignaciones, formateados como opciones de select
const MOTIVOS_ASIGNACIONES = Object.entries(TIPO_ASIGNACION_LABELS).map(
  ([key, label]) => ({ key, label })
);

/**
 * Mapeo categoría+motivo → anfitrión por defecto.
 * Clave: "categoria::motivo" (lowercase, trimmed). Valor: nombre del anfitrión.
 * Para categorías con un único anfitrión sin importar el motivo: "categoria::*".
 */
const ANFITRION_DEFAULT_MAP: Record<string, string> = {
  'inducción::inducción': 'Manuel/Marina',
  'asignaciones::*': 'Iván',
  'siniestros::declaración de siniestro': 'Eugenia',
  'logística::checklist': 'Emiliano',
  'logística::gps': 'Emiliano',
  'logística::incidencia': 'Emiliano',
  'logística::service': 'Emiliano',
  'autos del pueblo::inducción': 'Manuel/Marina',
  'autos del pueblo::check vehicular': 'Emiliano',
  'autos del pueblo::check vehícular': 'Emiliano',
  'autos del pueblo::firma de contrato de alquiler': 'Karen',
  'externo::proveedor': 'Eugenia',
  'externo::taller kalzalo': 'Kalzalo',
};

/** Categorías donde el anfitrión se elige manualmente (no auto-asignar) */
const CATEGORIAS_ANFITRION_MANUAL = ['directivo'];

/** Para "Directivo", solo mostrar estos anfitriones */
const ANFITRIONES_DIRECTIVO = ['josué', 'sara'];

// Separador para concatenar múltiples visitantes en un solo campo
const VISITANTES_SEPARATOR = '; ';

interface VisitanteEntry {
  nombre: string;
  dni: string;
}

interface SugerenciaPersona {
  tipo: 'lead' | 'conductor';
  nombre: string;
  dni: string;
  conductorId?: string;
  patenteAsignada?: string;
}

interface VisitasFormModalProps {
  mode: 'create' | 'edit';
  visita: VisitaCompleta | null;
  categorias: VisitaCategoria[];
  motivos: VisitaMotivo[];
  atendedores: VisitaAtendedor[];
  /** Mapa motivo_id → atendedor_id cargado desde BD (tiene prioridad sobre el hardcode) */
  motivoAtendedorMap?: Map<string, string>;
  prefillDate?: Date;
  prefillResourceId?: string;
  onSave: (data: VisitaFormData) => Promise<void>;
  onClose: () => void;
}

function parseVisitantes(nombres: string, dnis: string): VisitanteEntry[] {
  const nombresArr = nombres.split(VISITANTES_SEPARATOR).map((s) => s.trim()).filter(Boolean);
  const dnisArr = dnis.split(VISITANTES_SEPARATOR).map((s) => s.trim());

  if (nombresArr.length <= 1) {
    return [{ nombre: nombres, dni: dnis }];
  }

  return nombresArr.map((nombre, i) => ({
    nombre,
    dni: dnisArr[i] ?? '',
  }));
}

function serializeVisitantes(visitantes: VisitanteEntry[]): { nombre: string; dni: string } {
  const filtered = visitantes.filter((v) => v.nombre.trim());
  return {
    nombre: filtered.map((v) => v.nombre.trim()).join(VISITANTES_SEPARATOR),
    dni: filtered.map((v) => v.dni.trim()).join(VISITANTES_SEPARATOR),
  };
}

/**
 * Busca el anfitrión por defecto para una categoría+motivo.
 * Retorna el id del anfitrión si se encuentra match, o '' si no.
 */
function resolveDefaultAnfitrion(
  catNombre: string | undefined,
  motNombre: string | undefined,
  atendedores: VisitaAtendedor[]
): string {
  if (!catNombre) return '';
  const catKey = catNombre.trim().toLowerCase();

  // No auto-asignar para categorías manuales
  if (CATEGORIAS_ANFITRION_MANUAL.includes(catKey)) return '';

  // Buscar por categoría+motivo específico
  if (motNombre) {
    const motKey = motNombre.trim().toLowerCase();
    const specificKey = `${catKey}::${motKey}`;
    const anfitrionNombre = ANFITRION_DEFAULT_MAP[specificKey];
    if (anfitrionNombre) {
      const match = atendedores.find(
        (a) => a.nombre.toLowerCase() === anfitrionNombre.toLowerCase()
      );
      if (match) return match.id;
    }
  }

  // Buscar por categoría wildcard
  const wildcardKey = `${catKey}::*`;
  const anfitrionNombre = ANFITRION_DEFAULT_MAP[wildcardKey];
  if (anfitrionNombre) {
    const match = atendedores.find(
      (a) => a.nombre.toLowerCase() === anfitrionNombre.toLowerCase()
    );
    if (match) return match.id;
  }

  return '';
}

export function VisitasFormModal({
  mode,
  visita,
  categorias,
  motivos,
  atendedores,
  motivoAtendedorMap,
  prefillDate,
  prefillResourceId,
  onSave,
  onClose,
}: VisitasFormModalProps) {
  const [formData, setFormData] = useState<VisitaFormData>(VISITA_FORM_INITIAL);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof VisitaFormData, string>>>({});
  const [visitantes, setVisitantes] = useState<VisitanteEntry[]>([{ nombre: '', dni: '' }]);

  // Autocomplete para visitantes (Inducción)
  const { aplicarFiltroSede } = useSede();
  const [sugerencias, setSugerencias] = useState<SugerenciaPersona[]>([]);
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
  const inputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const singleInputRef = useRef<HTMLInputElement | null>(null);
  const [singleDropdownOpen, setSingleDropdownOpen] = useState(false);
  const [singleDropdownPos, setSingleDropdownPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
  const [patenteConductoresMap, setPatenteConductoresMap] = useState<Map<string, { nombre: string; dni: string }[]>>(new Map());

  // Cargar leads + conductores para autocomplete cuando es Inducción
  useEffect(() => {
    async function loadSugerencias() {
      const personas: SugerenciaPersona[] = [];

      // Leads
      let queryLeads = supabase
        .from('leads')
        .select('nombre_completo, dni')
        .order('nombre_completo');
      queryLeads = aplicarFiltroSede(queryLeads, 'sede_id');
      const { data: leads } = await queryLeads;
      if (leads) {
        for (const l of leads) {
          if (l.nombre_completo) {
            personas.push({ tipo: 'lead', nombre: l.nombre_completo, dni: l.dni || '' });
          }
        }
      }

      // Conductores
      let queryCond = supabase
        .from('conductores')
        .select('id, nombres, apellidos, numero_dni')
        .order('apellidos');
      queryCond = aplicarFiltroSede(queryCond, 'sede_id');
      const { data: conductores } = await queryCond;

      // Mapear conductor -> patente de asignación activa
      const conductorPatenteMap = new Map<string, string>();
      if (conductores && conductores.length > 0) {
        // 1. Obtener asignaciones activas con sus conductores
        const { data: asigActivas } = await supabase
          .from('asignaciones')
          .select('vehiculo_id, asignaciones_conductores(conductor_id)')
          .eq('estado', 'activa');

        if (asigActivas && asigActivas.length > 0) {
          // 2. Obtener patentes de los vehiculos en esas asignaciones
          const vehiculoIds = [...new Set(asigActivas.map((a: any) => a.vehiculo_id).filter(Boolean))];
          const { data: vehiculos } = await supabase
            .from('vehiculos')
            .select('id, patente')
            .in('id', vehiculoIds);

          const vehiculoPatenteMap = new Map<string, string>();
          if (vehiculos) {
            for (const v of vehiculos) {
              vehiculoPatenteMap.set(v.id, v.patente);
            }
          }

          // 3. Mapear conductor_id -> patente
          for (const asig of asigActivas as any[]) {
            const patente = vehiculoPatenteMap.get(asig.vehiculo_id);
            if (patente && asig.asignaciones_conductores) {
              for (const ac of asig.asignaciones_conductores) {
                conductorPatenteMap.set(ac.conductor_id, patente);
              }
            }
          }
        }
      }

      // Construir mapa conductor_id -> { nombre, dni }
      const conductorInfoMap = new Map<string, { nombre: string; dni: string }>();
      if (conductores) {
        for (const c of conductores as any[]) {
          const nombre = `${c.apellidos || ''} ${c.nombres || ''}`.trim();
          if (nombre) {
            conductorInfoMap.set(c.id, { nombre, dni: c.numero_dni || '' });
            personas.push({
              tipo: 'conductor',
              nombre,
              dni: c.numero_dni || '',
              conductorId: c.id,
              patenteAsignada: conductorPatenteMap.get(c.id) || '',
            });
          }
        }
      }

      // Mapa inverso: patente -> conductores asignados (para búsqueda instantánea)
      const patenteMap = new Map<string, { nombre: string; dni: string }[]>();
      for (const [conductorId, patente] of conductorPatenteMap.entries()) {
        const info = conductorInfoMap.get(conductorId);
        if (info) {
          const arr = patenteMap.get(patente) || [];
          arr.push(info);
          patenteMap.set(patente, arr);
        }
      }
      setPatenteConductoresMap(patenteMap);

      setSugerencias(personas);
    }
    loadSugerencias();
  }, [aplicarFiltroSede]);

  // Cerrar dropdown al hacer click afuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
        setSingleDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Posicionar dropdown debajo del input activo
  const updateDropdownPos = useCallback((index: number) => {
    const input = inputRefs.current.get(index);
    if (input) {
      const rect = input.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, []);

  // Filtrar sugerencias según lo que el usuario escribió
  const getSugerenciasFiltradas = useCallback((query: string, soloConductores = false) => {
    if (!query || query.length < 1) return [];
    const q = query.toLowerCase();
    const base = soloConductores ? sugerencias.filter(s => s.tipo === 'conductor') : sugerencias;
    return base.filter(s => s.nombre.toLowerCase().includes(q) || s.dni.includes(q));
  }, [sugerencias]);

  // Búsqueda inversa: patente -> conductor(es) asignado(s) (instantánea desde mapa local)
  const buscarConductorPorPatente = useCallback(async (patente: string) => {
    if (!patente || patente.length < 6) return;
    // No sobreescribir si ya hay un visitante ingresado
    if (formData.nombre_visitante.trim()) return;

    const conductoresInfo = patenteConductoresMap.get(patente.toUpperCase());
    if (!conductoresInfo || conductoresInfo.length === 0) return;

    if (conductoresInfo.length === 1) {
      setFormData((prev) => ({
        ...prev,
        nombre_visitante: conductoresInfo[0].nombre,
        dni_visitante: conductoresInfo[0].dni,
      }));
    } else {
      const htmlList = conductoresInfo
        .map((c, i) =>
          `<div style="padding:10px 14px;border:1px solid #E5E7EB;border-radius:8px;margin-bottom:8px;cursor:pointer;transition:background 0.15s;"
                onmouseover="this.style.background='#F3F4F6'" onmouseout="this.style.background='#fff'"
                onclick="document.querySelector('#swal-conductor-selected').value='${i}';document.querySelector('.swal2-confirm').click()">
            <div style="font-weight:600;font-size:14px;">${c.nombre}</div>
            <div style="font-size:12px;color:#6B7280;">DNI: ${c.dni || 'Sin DNI'}</div>
          </div>`
        )
        .join('');

      const { isConfirmed, value } = await Swal.fire({
        title: 'Seleccionar conductor',
        html: `
          <p style="font-size:13px;color:#6B7280;margin-bottom:12px;">La patente <strong>${patente}</strong> tiene ${conductoresInfo.length} conductores asignados:</p>
          ${htmlList}
          <input type="hidden" id="swal-conductor-selected" value="0" />
        `,
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        confirmButtonText: 'Seleccionar',
        confirmButtonColor: '#ff0033',
        preConfirm: () => {
          const el = document.querySelector('#swal-conductor-selected') as HTMLInputElement;
          return parseInt(el?.value || '0', 10);
        },
      });

      if (isConfirmed && value !== undefined) {
        const selected = conductoresInfo[value];
        setFormData((prev) => ({
          ...prev,
          nombre_visitante: selected.nombre,
          dni_visitante: selected.dni,
        }));
      }
    }
  }, [formData.nombre_visitante, patenteConductoresMap]);

  // Prefill on open
  useEffect(() => {
    if (mode === 'edit' && visita) {
      const dt = new Date(visita.fecha_hora);
      setFormData({
        categoria_id: visita.categoria_id,
        motivo_id: visita.motivo_id ?? '',
        atendedor_id: visita.atendedor_id,
        nombre_visitante: visita.nombre_visitante,
        dni_visitante: visita.dni_visitante ?? '',
        patente: visita.patente ?? '',
        fecha: formatInArgentina(dt, 'yyyy-MM-dd'),
        hora: formatInArgentina(dt, 'HH:mm'),
        duracion_minutos: visita.duracion_minutos,
        nota: visita.nota ?? '',
      });
      setVisitantes(
        parseVisitantes(visita.nombre_visitante, visita.dni_visitante ?? '')
      );
    } else if (prefillDate) {
      setFormData((prev) => ({
        ...prev,
        fecha: formatInArgentina(prefillDate, 'yyyy-MM-dd'),
        hora: formatInArgentina(prefillDate, 'HH:mm'),
        atendedor_id: prefillResourceId ?? '',
      }));
      setVisitantes([{ nombre: '', dni: '' }]);
    }
  }, [mode, visita, prefillDate, prefillResourceId]);

  // Motivos filtrados por categoría seleccionada
  const motivosFiltrados = useMemo(
    () => getMotivosByCategoria(motivos, formData.categoria_id),
    [motivos, formData.categoria_id]
  );

  // Categoría seleccionada
  const categoriaSeleccionada = useMemo(
    () => categorias.find((c) => c.id === formData.categoria_id),
    [categorias, formData.categoria_id]
  );

  // Motivo seleccionado (para motivos normales o nombre desde asignaciones)
  const motivoSeleccionado = useMemo(
    () => motivos.find((m) => m.id === formData.motivo_id),
    [motivos, formData.motivo_id]
  );

  const esAsignaciones = useMemo(() => {
    return categoriaSeleccionada?.nombre?.trim().toLowerCase() === 'asignaciones';
  }, [categoriaSeleccionada]);

  const esDirectivo = useMemo(() => {
    return categoriaSeleccionada?.nombre?.trim().toLowerCase() === 'directivo';
  }, [categoriaSeleccionada]);

  const esInduccion = useMemo(() => {
    const catNombre = categoriaSeleccionada?.nombre?.trim().toLowerCase();
    const motNombre = motivoSeleccionado?.nombre?.trim().toLowerCase();
    return catNombre === 'inducción' && motNombre === 'inducción';
  }, [categoriaSeleccionada, motivoSeleccionado]);

  const esSiniestrosOLogistica = useMemo(() => {
    const catNombre = categoriaSeleccionada?.nombre?.trim().toLowerCase();
    return catNombre === 'siniestros' || catNombre === 'logística' || catNombre === 'logistica';
  }, [categoriaSeleccionada]);

  // Anfitriones filtrados: para Directivo solo Josué/Sara, para el resto todos
  const anfitrionesDisponibles = useMemo(() => {
    if (esDirectivo) {
      return atendedores.filter((a) =>
        ANFITRIONES_DIRECTIVO.includes(a.nombre.toLowerCase())
      );
    }
    return atendedores;
  }, [atendedores, esDirectivo]);

  // Determinar si el anfitrión fue auto-asignado (para mostrarlo como readonly)
  const anfitrionAutoAsignado = useMemo(() => {
    if (!categoriaSeleccionada) return false;
    const catKey = categoriaSeleccionada.nombre.trim().toLowerCase();
    return !CATEGORIAS_ANFITRION_MANUAL.includes(catKey);
  }, [categoriaSeleccionada]);

  // Nombre del anfitrión seleccionado
  const anfitrionNombre = useMemo(() => {
    return atendedores.find((a) => a.id === formData.atendedor_id)?.nombre ?? '';
  }, [atendedores, formData.atendedor_id]);

  // Auto-asignar anfitrión cuando cambia categoría o motivo
  useEffect(() => {
    // Solo auto-asignar en modo create
    if (mode === 'edit') return;
    if (!categoriaSeleccionada) return;

    const catKey = categoriaSeleccionada.nombre.trim().toLowerCase();
    if (CATEGORIAS_ANFITRION_MANUAL.includes(catKey)) return;

    // Helper: el id resuelto debe pertenecer a un anfitrion ACTIVO
    // (atendedores ya viene filtrado por activo=true desde fetchAtendedores)
    const isActivo = (id: string | null | undefined): boolean =>
      !!id && atendedores.some((a) => a.id === id);

    // 1. Prioridad: mapa desde BD (motivo_id → atendedor_id)
    if (motivoSeleccionado && motivoAtendedorMap && motivoAtendedorMap.has(motivoSeleccionado.id)) {
      const atendedorId = motivoAtendedorMap.get(motivoSeleccionado.id)!;
      if (isActivo(atendedorId)) {
        setFormData((prev) => ({ ...prev, atendedor_id: atendedorId }));
        return;
      }
      // Si el mapeo BD apunta a un anfitrion inactivo, caemos al fallback hardcodeado
    }

    // 2. Fallback: mapa hardcodeado por nombre
    const motNombre = motivoSeleccionado?.nombre;
    const resolved = resolveDefaultAnfitrion(
      categoriaSeleccionada.nombre,
      motNombre,
      atendedores
    );
    if (resolved && isActivo(resolved)) {
      setFormData((prev) => ({ ...prev, atendedor_id: resolved }));
    } else {
      // Ningun mapeo dio un anfitrion activo: dejar vacio para que el usuario elija
      setFormData((prev) => ({ ...prev, atendedor_id: '' }));
    }
  }, [categoriaSeleccionada, motivoSeleccionado, atendedores, motivoAtendedorMap, mode]);

  // Al cambiar categoría: duración default, limpiar motivo, auto-asignar anfitrión
  function handleCategoriaChange(categoriaId: string) {
    const cat = categorias.find((c) => c.id === categoriaId);
    setFormData((prev) => ({
      ...prev,
      categoria_id: categoriaId,
      motivo_id: '',
      atendedor_id: '', // Se re-asigna via useEffect
      nombre_visitante: '',
      dni_visitante: '',
      patente: '',
      duracion_minutos: cat?.duracion_default ?? 30,
    }));
    setVisitantes([{ nombre: '', dni: '' }]);
  }

  function handleMotivoChange(motivoId: string) {
    setFormData((prev) => ({
      ...prev,
      motivo_id: motivoId,
      // anfitrión se re-asigna via useEffect cuando cambia motivoSeleccionado
    }));
  }

  function handleChange(field: keyof VisitaFormData, value: string | number) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  // --- Handlers de visitantes múltiples ---
  const handleVisitanteChange = useCallback(
    (index: number, field: 'nombre' | 'dni', value: string) => {
      setVisitantes((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: value };
        return updated;
      });
      if (field === 'nombre' && errors.nombre_visitante) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next.nombre_visitante;
          return next;
        });
      }
    },
    [errors.nombre_visitante]
  );

  const handleAddVisitante = useCallback(() => {
    setVisitantes((prev) => [...prev, { nombre: '', dni: '' }]);
  }, []);

  const handleRemoveVisitante = useCallback((index: number) => {
    setVisitantes((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  function validate(): boolean {
    const e: Partial<Record<keyof VisitaFormData, string>> = {};
    if (!formData.categoria_id) e.categoria_id = 'Seleccione una categoría';
    if (!formData.atendedor_id) e.atendedor_id = 'Seleccione un anfitrión';

    if (esInduccion) {
      const tieneAlMenosUno = visitantes.some((v) => v.nombre.trim());
      if (!tieneAlMenosUno) {
        e.nombre_visitante = 'Ingrese al menos un visitante';
      }
      const algunoSinDni = visitantes.some((v) => v.nombre.trim() && !/^\d{6,}$/.test((v.dni || '').trim()));
      if (algunoSinDni) {
        e.dni_visitante = 'DNI obligatorio (solo numeros, min 6 digitos) en cada visitante';
      }
    } else {
      if (!formData.nombre_visitante.trim()) {
        e.nombre_visitante = 'Ingrese el nombre del visitante';
      }
      const dni = (formData.dni_visitante || '').trim();
      if (!dni) {
        e.dni_visitante = 'DNI obligatorio';
      } else if (!/^\d{6,}$/.test(dni)) {
        e.dni_visitante = 'DNI debe tener solo numeros (minimo 6 digitos)';
      }
    }

    if (!formData.fecha) e.fecha = 'Seleccione la fecha';
    if (!formData.hora) e.hora = 'Seleccione la hora';
    if (formData.duracion_minutos < 15) e.duracion_minutos = 'Mínimo 15 minutos';
    if (categoriaSeleccionada?.requiere_patente && !formData.patente.trim()) {
      e.patente = 'Esta categoría requiere patente';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;

    let dataToSave = { ...formData };
    if (esInduccion) {
      const { nombre, dni } = serializeVisitantes(visitantes);
      dataToSave = {
        ...dataToSave,
        nombre_visitante: nombre,
        dni_visitante: dni,
      };
    }

    setSaving(true);
    try {
      const fechaHora = buildLocalTimestamp(dataToSave.fecha, dataToSave.hora);

      if (categoriaSeleccionada?.tipo_visita !== 'grupal') {
        const hasConflict = await checkConflict(
          dataToSave.atendedor_id,
          fechaHora,
          dataToSave.duracion_minutos,
          mode === 'edit' ? visita?.id : undefined
        );

        if (hasConflict) {
          const atendedor = atendedores.find((a) => a.id === dataToSave.atendedor_id);
          await Swal.fire(
            'Conflicto de agenda',
            `${atendedor?.nombre ?? 'El anfitrión'} ya tiene una cita en ese horario.`,
            'warning'
          );
          return;
        }
      }

      // Verificar si ya existe una cita con el mismo visitante en la misma fecha/hora
      if (mode === 'create') {
        const { supabase } = await import('../../../lib/supabase');
        const nombreVisitante = dataToSave.nombre_visitante.split(';')[0].trim();
        const { data: existentes } = await supabase
          .from('visitas')
          .select('id, nombre_visitante, fecha_hora')
          .eq('fecha_hora', fechaHora)
          .neq('estado', 'cancelada');

        const duplicada = (existentes || []).find((v: { nombre_visitante: string }) =>
          v.nombre_visitante.toUpperCase().includes(nombreVisitante.toUpperCase())
        );

        if (duplicada) {
          const result = await Swal.fire({
            icon: 'warning',
            title: 'Posible cita duplicada',
            html: `<div style="text-align:left;font-size:14px;">
              <p><strong>Ya existe una cita a las ${dataToSave.hora} del ${dataToSave.fecha} para:</strong></p>
              <p style="color:#ff0033;font-weight:600;font-size:16px;margin:12px 0;">${nombreVisitante}</p>
              <p>Si continúas se creará una cita duplicada.</p>
              <p style="margin-top:12px;color:#666;">¿Estás seguro de que querés crear otra cita?</p>
            </div>`,
            showCancelButton: true,
            confirmButtonText: 'Crear de todas formas',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#ff0033',
          });
          if (!result.isConfirmed) return;
        }
      }

      await onSave(dataToSave);
    } catch {
      Swal.fire('Error', 'No se pudo guardar la cita', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content visitas-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{mode === 'create' ? 'Nueva Cita' : 'Editar Cita'}</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body vf-compact">
          {/* ── Categoría (chips) ── */}
          <div className="form-group">
            <label className="vf-label-sm">Categoría <span className="required">*</span></label>
            <div className="vf-category-grid">
              {categorias.filter((c) => c.nombre.toLowerCase() !== 'asignaciones').map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`vf-category-chip ${formData.categoria_id === c.id ? 'active' : ''}`}
                  style={{
                    '--chip-color': c.color,
                    borderColor: formData.categoria_id === c.id ? c.color : undefined,
                  } as React.CSSProperties}
                  onClick={() => handleCategoriaChange(c.id)}
                >
                  <span className="vf-chip-dot" style={{ background: c.color }} />
                  {c.nombre}
                </button>
              ))}
            </div>
            {errors.categoria_id && <span className="error-message">{errors.categoria_id}</span>}
          </div>

          {/* ── Motivo + Anfitrión (fila compacta, solo si hay categoría) ── */}
          {categoriaSeleccionada && (
            <div className="vf-motivo-anfitrion-row">
              {/* Motivo dropdown */}
              {esAsignaciones ? (
                <div className="form-group vf-motivo-field">
                  <label className="vf-label-sm">Motivo</label>
                  <select
                    value={formData.motivo_id}
                    onChange={(e) => handleMotivoChange(e.target.value)}
                  >
                    <option value="">Seleccionar motivo...</option>
                    {MOTIVOS_ASIGNACIONES.map((m) => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                  </select>
                </div>
              ) : motivosFiltrados.length > 0 ? (
                <div className="form-group vf-motivo-field">
                  <label className="vf-label-sm">Motivo</label>
                  <select
                    value={formData.motivo_id}
                    onChange={(e) => handleMotivoChange(e.target.value)}
                  >
                    <option value="">Seleccionar motivo...</option>
                    {motivosFiltrados.map((m) => (
                      <option key={m.id} value={m.id}>{m.nombre}</option>
                    ))}
                  </select>
                </div>
              ) : null}

              {/* Anfitrión: dropdown solo para Directivo, inline text para auto, warning si falta */}
              {!anfitrionAutoAsignado ? (
                <div className="form-group vf-anfitrion-field">
                  <label className="vf-label-sm">Anfitrión <span className="required">*</span></label>
                  <select
                    value={formData.atendedor_id}
                    onChange={(e) => handleChange('atendedor_id', e.target.value)}
                    className={errors.atendedor_id ? 'input-error' : ''}
                  >
                    <option value="">Seleccionar...</option>
                    {anfitrionesDisponibles.map((a) => (
                      <option key={a.id} value={a.id}>{a.nombre}</option>
                    ))}
                  </select>
                  {errors.atendedor_id && <span className="error-message">{errors.atendedor_id}</span>}
                </div>
              ) : formData.atendedor_id ? (
                <div className="vf-anfitrion-inline">
                  <User size={13} />
                  <span>Atiende: <strong>{anfitrionNombre}</strong></span>
                </div>
              ) : (
                <div className="vf-anfitrion-warning">
                  <span>Sin anfitrión para esta categoría</span>
                </div>
              )}
            </div>
          )}

          {/* ── Separador ── */}
          <div className="vf-divider" />

          {/* ── Visitante ── */}
          {esInduccion ? (
            <div className="form-group">
              <div className="visitantes-header">
                <label className="vf-label-sm">Visitantes <span className="required">*</span></label>
                <button
                  type="button"
                  className="btn-add-visitante"
                  onClick={handleAddVisitante}
                  title="Agregar visitante"
                >
                  <Plus size={14} /> Agregar
                </button>
              </div>
              {errors.nombre_visitante && (
                <span className="error-message">{errors.nombre_visitante}</span>
              )}
              <div className="visitantes-list">
                {visitantes.map((v, index) => (
                  <div key={index} className="visitante-row">
                    <div className="visitante-fields">
                      <input
                        type="text"
                        ref={(el) => { if (el) inputRefs.current.set(index, el); }}
                        value={v.nombre}
                        onChange={(e) => {
                          handleVisitanteChange(index, 'nombre', e.target.value);
                          setActiveDropdown(index);
                          updateDropdownPos(index);
                        }}
                        onFocus={() => {
                          setActiveDropdown(index);
                          updateDropdownPos(index);
                        }}
                        placeholder={`Nombre completo ${index + 1}`}
                        className="visitante-nombre"
                        autoComplete="off"
                      />
                      <input
                        type="text"
                        value={v.dni}
                        onChange={(e) => handleVisitanteChange(index, 'dni', e.target.value)}
                        placeholder="DNI"
                        className="visitante-dni"
                      />
                    </div>
                    {visitantes.length > 1 && (
                      <button
                        type="button"
                        className="btn-remove-visitante"
                        onClick={() => handleRemoveVisitante(index)}
                        title="Eliminar visitante"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {activeDropdown !== null && (() => {
                const filtradas = getSugerenciasFiltradas(visitantes[activeDropdown]?.nombre || '');
                const leadsF = filtradas.filter(s => s.tipo === 'lead');
                const conductoresF = filtradas.filter(s => s.tipo === 'conductor');
                if (filtradas.length === 0) return null;
                return createPortal(
                  <div
                    ref={dropdownRef}
                    className="visitante-sugerencias-dropdown"
                    style={{
                      position: 'fixed',
                      top: dropdownPos.top,
                      left: dropdownPos.left,
                      width: dropdownPos.width,
                    }}
                  >
                    {leadsF.length > 0 && (
                      <>
                        <div className="sugerencia-grupo-header">Leads</div>
                        {leadsF.map((s, i) => (
                          <div
                            key={`lead-${i}`}
                            className="sugerencia-item"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleVisitanteChange(activeDropdown, 'nombre', s.nombre);
                              handleVisitanteChange(activeDropdown, 'dni', s.dni);
                              setActiveDropdown(null);
                            }}
                          >
                            <span className="sugerencia-nombre">{s.nombre}</span>
                            {s.dni && <span className="sugerencia-dni">DNI: {s.dni}</span>}
                          </div>
                        ))}
                      </>
                    )}
                    {conductoresF.length > 0 && (
                      <>
                        <div className="sugerencia-grupo-header">Conductores</div>
                        {conductoresF.map((s, i) => (
                          <div
                            key={`cond-${i}`}
                            className="sugerencia-item"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleVisitanteChange(activeDropdown, 'nombre', s.nombre);
                              handleVisitanteChange(activeDropdown, 'dni', s.dni);
                              setActiveDropdown(null);
                            }}
                          >
                            <span className="sugerencia-nombre">{s.nombre}</span>
                            {s.dni && <span className="sugerencia-dni">DNI: {s.dni}</span>}
                          </div>
                        ))}
                      </>
                    )}
                  </div>,
                  document.body
                );
              })()}
              <span className="visitantes-count">
                {visitantes.filter((v) => v.nombre.trim()).length} visitante(s)
              </span>
            </div>
          ) : (
            <div className="vf-visitante-row">
              <div className="form-group vf-visitante-nombre" style={{ position: 'relative' }}>
                <label className="vf-label-sm">Visitante <span className="required">*</span></label>
                <input
                  type="text"
                  ref={esSiniestrosOLogistica ? singleInputRef : undefined}
                  value={formData.nombre_visitante}
                  onChange={(e) => {
                    handleChange('nombre_visitante', e.target.value);
                    if (esSiniestrosOLogistica) {
                      setSingleDropdownOpen(true);
                      if (singleInputRef.current) {
                        const rect = singleInputRef.current.getBoundingClientRect();
                        setSingleDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
                      }
                    }
                  }}
                  onFocus={() => {
                    if (esSiniestrosOLogistica && formData.nombre_visitante.length >= 1) {
                      setSingleDropdownOpen(true);
                      if (singleInputRef.current) {
                        const rect = singleInputRef.current.getBoundingClientRect();
                        setSingleDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
                      }
                    }
                  }}
                  className={errors.nombre_visitante ? 'input-error' : ''}
                  placeholder="Nombre completo"
                  autoComplete="off"
                />
                {errors.nombre_visitante && <span className="error-message">{errors.nombre_visitante}</span>}
              </div>
              <div className="form-group vf-visitante-dni">
                <label className="vf-label-sm">DNI <span className="required">*</span></label>
                <input
                  type="text"
                  value={formData.dni_visitante}
                  onChange={(e) => handleChange('dni_visitante', e.target.value.replace(/\D/g, ''))}
                  placeholder="Documento"
                  inputMode="numeric"
                  className={errors.dni_visitante ? 'input-error' : ''}
                />
                {errors.dni_visitante && <span className="error-message">{errors.dni_visitante}</span>}
              </div>
              {categoriaSeleccionada?.requiere_patente && (
                <div className="form-group vf-visitante-patente">
                  <label className="vf-label-sm">Patente <span className="required">*</span></label>
                  <input
                    type="text"
                    value={formData.patente}
                    onChange={(e) => handleChange('patente', e.target.value.toUpperCase())}
                    onBlur={(e) => {
                      if (esSiniestrosOLogistica) {
                        buscarConductorPorPatente(e.target.value);
                      }
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const pasted = e.clipboardData.getData('text').trim().toUpperCase();
                      handleChange('patente', pasted);
                      if (esSiniestrosOLogistica && pasted.length >= 6) {
                        setTimeout(() => buscarConductorPorPatente(pasted), 0);
                      }
                    }}
                    className={errors.patente ? 'input-error' : ''}
                    placeholder="AB123CD"
                    style={{ textTransform: 'uppercase', letterSpacing: '1px' }}
                  />
                  {errors.patente && <span className="error-message">{errors.patente}</span>}
                </div>
              )}
              {/* Dropdown autocomplete conductores para Siniestros/Logística */}
              {esSiniestrosOLogistica && singleDropdownOpen && (() => {
                const filtradas = getSugerenciasFiltradas(formData.nombre_visitante, true);
                if (filtradas.length === 0) return null;
                return createPortal(
                  <div
                    ref={dropdownRef}
                    className="visitante-sugerencias-dropdown"
                    style={{
                      position: 'fixed',
                      top: singleDropdownPos.top,
                      left: singleDropdownPos.left,
                      width: singleDropdownPos.width,
                    }}
                  >
                    <div className="sugerencia-grupo-header">Conductores</div>
                    {filtradas.map((s, i) => (
                      <div
                        key={`cond-${i}`}
                        className="sugerencia-item"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleChange('nombre_visitante', s.nombre);
                          handleChange('dni_visitante', s.dni);
                          handleChange('patente', s.patenteAsignada || '');
                          setSingleDropdownOpen(false);
                        }}
                      >
                        <span className="sugerencia-nombre">{s.nombre}</span>
                        {s.dni && <span className="sugerencia-dni">DNI: {s.dni}</span>}
                        {s.patenteAsignada && <span className="sugerencia-dni" style={{ color: '#059669', fontWeight: 600 }}>{s.patenteAsignada}</span>}
                      </div>
                    ))}
                  </div>,
                  document.body
                );
              })()}
            </div>
          )}

          {/* ── Fecha / Hora / Duración ── */}
          <div className="vf-datetime-row">
            <div className="form-group">
              <label className="vf-label-sm">Fecha <span className="required">*</span></label>
              <input
                type="date"
                value={formData.fecha}
                onChange={(e) => handleChange('fecha', e.target.value)}
                className={errors.fecha ? 'input-error' : ''}
              />
              {errors.fecha && <span className="error-message">{errors.fecha}</span>}
            </div>
            <div className="form-group">
              <label className="vf-label-sm">Hora <span className="required">*</span></label>
              <input
                type="time"
                value={formData.hora}
                onChange={(e) => handleChange('hora', e.target.value)}
                className={errors.hora ? 'input-error' : ''}
              />
              {errors.hora && <span className="error-message">{errors.hora}</span>}
            </div>
            <div className="form-group">
              <label className="vf-label-sm">Duración</label>
              {categoriaSeleccionada?.duracion_modificable ? (
                <select
                  value={formData.duracion_minutos}
                  onChange={(e) => handleChange('duracion_minutos', Number(e.target.value))}
                >
                  <option value={30}>30 min</option>
                  <option value={60}>60 min</option>
                  <option value={90}>90 min</option>
                  <option value={120}>2 horas</option>
                  <option value={180}>3 horas</option>
                  <option value={240}>4 horas</option>
                  <option value={300}>5 horas</option>
                  <option value={360}>6 horas</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={`${formData.duracion_minutos} min`}
                  disabled
                />
              )}
            </div>
          </div>

          {/* ── Nota ── */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="vf-label-sm">
              Nota
              <span className="vf-optional-tag">opcional</span>
            </label>
            <textarea
              value={formData.nota}
              onChange={(e) => handleChange('nota', e.target.value)}
              rows={2}
              placeholder="Observaciones adicionales..."
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Guardando...' : mode === 'create' ? 'Agendar' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

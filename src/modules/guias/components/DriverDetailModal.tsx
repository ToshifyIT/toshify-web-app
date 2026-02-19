import { useState } from 'react';
import { X, User, Sun, Moon, Briefcase, Calendar, CheckCircle2, AlertTriangle, ShieldAlert, Save } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import type { ConductorWithRelations } from '../../../types/database.types';
import './DriverDetailModal.css';
import Swal from 'sweetalert2';
import { IncidentsHistory } from './IncidentsHistory';
import { AnotacionesEditorModal, type Nota } from './AnotacionesEditorModal';

interface DriverDetailModalProps {
  driver: ConductorWithRelations & {
    id_guia?: string;
    semana?: string;
    licencias_categorias?: string[];
    vehiculo_asignado?: {
      patente: string;
      marca: string;
      modelo: string;
    };
    // Campos de historial semanal
    historial_id?: string;
    meta_sem_cumplida?: boolean | string | null;
    fecha_llamada?: string | null;
    accion_implementaria?: string | null;
    id_accion_imp?: number | null;
    anotaciones_extra?: Nota[] | null;
    escuela_conductores?: string | null;
    fecha_inicio_escuela?: string | null;
    facturacion_app?: number;
    facturacion_efectivo?: number;
    facturacion_total?: number;
    cabifyData?: any; // Datos completos de Cabify
    asignacion_info?: {
      modalidad?: string;
      turno_conductor?: string;
    };
    seguimiento?: string | null;
  };
  onClose: () => void;
  onDriverUpdate?: () => void;
  accionesImplementadas: any[];
  currentProfile?: any;
  readOnly?: boolean;
}

export function DriverDetailModal({ driver, onClose, onDriverUpdate, accionesImplementadas, currentProfile, readOnly = false }: DriverDetailModalProps) {
  if (!driver) return null;

  const [showAnotaciones, setShowAnotaciones] = useState(false);
  const [anotaciones, setAnotaciones] = useState<Nota[]>(driver.anotaciones_extra || []);
  const [editingNoteIndex, setEditingNoteIndex] = useState<number | null>(null);

  // Estado para los campos editables
  // Normalizamos meta_sem_cumplida para que coincida con las opciones del select
  const getInitialMeta = (val: boolean | string | null | undefined) => {
    if (val === true) return "SI";
    if (val === false) return "NO";
    if (val === "INTERMEDIO") return "INTERMEDIO";
    return ""; // Valor por defecto vacío
  };

  const formatDateForInput = (dateString: string | null | undefined) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    
    // Ajustar a zona horaria local para input datetime-local
    const offset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - offset);
    return localDate.toISOString().slice(0, 16);
  };

  const formatDateForDateInput = (dateString: string | null | undefined) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    return date.toISOString().split('T')[0];
  };

  const getInitialSeguimiento = () => {
    const raw = (driver.seguimiento || '').toString().trim();
    if (raw) {
      return raw.toUpperCase();
    }
    const prev = ((driver as any).prev_week_seguimiento || '').toString().toLowerCase();
    if (!prev) return '';
    if (prev.includes('diario')) return 'DIARIO';
    if (prev.includes('cercano')) return 'CERCANO';
    if (prev.includes('semanal')) return 'SEMANAL';
    return '';
  };

  const [formData, setFormData] = useState({
    meta_sem_cumplida: getInitialMeta(driver.meta_sem_cumplida),
    accion_implementaria: driver.accion_implementaria || "",
    id_accion_imp: driver.id_accion_imp || 1,
    escuela_conductores: driver.escuela_conductores || "",
    fecha_escuela: formatDateForDateInput(driver.fecha_escuela),
    fecha_llamada: formatDateForInput(driver.fecha_llamada),
    facturacion_app: driver.facturacion_app || 0,
    facturacion_efectivo: driver.facturacion_efectivo || 0,
    seguimiento: getInitialSeguimiento()
  });

  // Si tiene datos de cabify (relacion cabify = SI), no es editable
  const isCabifyConnected = !!driver.cabifyData;

  const [isSaving, setIsSaving] = useState(false);

  const formatFecha = (fecha: string | null | undefined) => {
    if (!fecha) return "-";
    return new Date(fecha).toLocaleDateString("es-AR");
  };

  const getLlamadaStatus = (fecha: string | null | undefined) => {
    if (!fecha) return "Pendientes";
    return "Realizada";
  };

  const getTurnoInfo = () => {
    // 1. Priorizar turno real de la asignación actual (lógica de GuiasModule)
    if (driver.asignacion_info) {
      const { modalidad, turno_conductor } = driver.asignacion_info;
      
      if (modalidad === 'CARGO') {
        return { icon: <Briefcase size={14} className="text-purple-500" />, label: 'A Cargo' };
      }
      
      const t = turno_conductor?.toUpperCase();
      if (t === 'DIURNO') return { icon: <Sun size={14} className="text-yellow-500" />, label: 'Diurno' };
      if (t === 'NOCTURNO') return { icon: <Moon size={14} className="text-blue-500" />, label: 'Nocturno' };
      if (t) return { icon: null, label: t };
    }

    // 2. Fallback a preferencia de turno
    const turno = driver.preferencia_turno;
    if (turno === 'DIURNO') return { icon: <Sun size={14} className="text-yellow-500" />, label: 'Diurno' };
    if (turno === 'NOCTURNO') return { icon: <Moon size={14} className="text-blue-500" />, label: 'Nocturno' };
    if (turno === 'A_CARGO') return { icon: <Briefcase size={14} className="text-purple-500" />, label: 'A Cargo' };
    return { icon: null, label: 'Sin Preferencia' };
  };

  const turnoInfo = getTurnoInfo();

  const getEstadoInfo = () => {
    const codigo = driver.conductores_estados?.codigo?.toLowerCase();
    if (codigo === 'activo') return { icon: <CheckCircle2 size={20} />, label: 'Conductor Activo', className: 'success' };
    if (codigo === 'baja') return { icon: <ShieldAlert size={20} />, label: 'Baja', className: 'info' };
    return { icon: <AlertTriangle size={20} />, label: driver.conductores_estados?.descripcion || 'Inactivo', className: 'warning' };
  };

  const estadoInfo = getEstadoInfo();

  // Función helper para formato de moneda (local para asegurar consistencia)
  const formatCurrency = (amount: number | undefined | null) => {
    if (amount === undefined || amount === null) return '$ 0,00';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (!driver.semana) throw new Error("No hay semana seleccionada");

      // Convertir meta_sem_cumplida a booleano o null
      let metaVal: boolean | string | null = null;
      if (formData.meta_sem_cumplida === "SI") metaVal = true;
      else if (formData.meta_sem_cumplida === "NO") metaVal = false;
      else if (formData.meta_sem_cumplida === "INTERMEDIO") metaVal = "INTERMEDIO";

      const updates: any = {
        id_conductor: driver.id,
        id_guia: driver.id_guia, 
        semana: driver.semana,
        meta_sem_cumplida: metaVal,
        accion_implementaria: formData.accion_implementaria || null,
        id_accion_imp: formData.id_accion_imp,
        escuela_conductores: formData.escuela_conductores || null,
        fecha_llamada: formData.fecha_llamada ? new Date(formData.fecha_llamada).toISOString() : null,
        seguimiento: (formData as any).seguimiento ? (formData as any).seguimiento.toString().toUpperCase() : null
      };

      // Si NO está conectado a Cabify, permitimos guardar los montos editados
      if (!isCabifyConnected) {
        updates.app = formData.facturacion_app;
        updates.efectivo = formData.facturacion_efectivo;
        updates.total = Number(formData.facturacion_app) + Number(formData.facturacion_efectivo);
      }

      // Si no tenemos id_guia en el driver (puede pasar si viene de un left join vacío), intentamos buscarlo
      if (!updates.id_guia) {
        const { data: condData } = await supabase.from('conductores').select('id_guia').eq('id', driver.id).single();
        if (condData) updates.id_guia = condData.id_guia;
      }

      if (!updates.id_guia) throw new Error("No se pudo identificar el guía del conductor");

      // GUARDAR FECHA ESCUELA EN TABLA CONDUCTORES
      const { error: conductorError } = await supabase
        .from('conductores')
        .update({ 
          fecha_escuela: formData.fecha_escuela ? new Date(formData.fecha_escuela).toISOString() : null 
        })
        .eq('id', driver.id);

      if (conductorError) throw conductorError;

      let error;

      // Intentamos usar el ID de historial si existe, o buscamos por conductor+semana
      if (driver.historial_id) {
        const { error: updateError } = await supabase
          .from('guias_historial_semanal')
          .update(updates)
          .eq('id', driver.historial_id);
        error = updateError;
      } else {
        // Verificar si ya existe registro para esta semana
        const { data: existing } = await supabase
          .from('guias_historial_semanal')
          .select('id')
          .eq('id_conductor', driver.id)
          .eq('semana', driver.semana)
          .maybeSingle();

        if (existing) {
          const { error: updateError } = await supabase
            .from('guias_historial_semanal')
            .update(updates)
            .eq('id', existing.id);
          error = updateError;
        } else {
          const { error: insertError } = await supabase
            .from('guias_historial_semanal')
            .insert(updates);
          error = insertError;
        }
      }

      if (error) throw error;

      await Swal.fire({
        title: '¡Guardado con éxito!',
        text: 'Los cambios han sido aplicados correctamente en el sistema de gestión de flota.',
        icon: 'success',
        timer: 1500,
        showConfirmButton: true,
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#1d4ed8',
        buttonsStyling: true,
        customClass: {
          popup: 'rounded-2xl shadow-xl',
          confirmButton: 'px-6 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-transform active:scale-95',
          title: 'text-xl font-bold text-gray-800',
          htmlContainer: 'text-sm text-gray-500'
        },
        timerProgressBar: true,
        didClose: () => {
          if (onDriverUpdate) onDriverUpdate();
          onClose();
        }
      });

    } catch (error: any) {
      console.error("Error guardando:", error);
      Swal.fire('Error', error.message || 'No se pudo guardar', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAnotaciones = async (nuevasAnotaciones: Nota[]) => {
    if (!driver.historial_id) {
      Swal.fire('Error', 'Este registro no tiene historial asociado.', 'error');
      return;
    }

    try {
      const { error } = await supabase
        .from('guias_historial_semanal')
        .update({ anotaciones_extra: nuevasAnotaciones } as any)
        .eq('id', driver.historial_id);

      if (error) throw error;

      setAnotaciones(nuevasAnotaciones);
      onDriverUpdate?.();
      setEditingNoteIndex(null); // Reset editing index
      
    } catch (error) {
      console.error('Error saving annotations:', error);
      Swal.fire('Error', 'No se pudieron guardar las anotaciones', 'error');
      throw error;
    }
  };

  const handleEditNote = (_nota: Nota, index: number) => {
    setEditingNoteIndex(index);
    setShowAnotaciones(true);
  };

  const handleDeleteNote = async (index: number) => {
    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: "No podrás revertir esta acción",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      didOpen: () => {
        const container = Swal.getContainer();
        if (container) {
          container.style.zIndex = '99999';
        }
      }
    });

    if (result.isConfirmed) {
      const nuevasAnotaciones = [...anotaciones];
      nuevasAnotaciones.splice(index, 1);
      
      // Reutilizamos la lógica de guardado
      await handleSaveAnotaciones(nuevasAnotaciones);
      
      Swal.fire({
        title: 'Eliminado',
        text: 'La nota ha sido eliminada.',
        icon: 'success',
        didOpen: () => {
          const container = Swal.getContainer();
          if (container) {
            container.style.zIndex = '99999';
          }
        }
      });
    }
  };

  const conductor = {
    nombreCompleto: `${(driver as any).nombres || (driver as any).nombre || ''} ${(driver as any).apellidos || (driver as any).apellido || ''}`.trim() || "Conductor",
    dniCuil: driver.numero_dni || (driver as any).dni || (driver as any).cuit || "-",
    telefono: driver.telefono_contacto || (driver as any).telefono || "-",
  };

  return (
    <div className="driver-modal-overlay">
      <div className="driver-modal-content animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="driver-modal-header">
          <div className="driver-modal-title-group">
            <h2 className="driver-modal-title">
              <User style={{ color: 'var(--color-primary)' }} size={20} />
              {conductor.nombreCompleto}
            </h2>
            {driver.semana && (
              <p className="driver-modal-subtitle">
                Semana de Historial: <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>{driver.semana}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="driver-modal-close">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="driver-modal-body grid grid-cols-1 lg:grid-cols-2 gap-8 p-8">
          
          {/* Columna Izquierda: GUIAS + Historial */}
          <div className="flex flex-col h-full">
            <div className="section-header">
              <span className="section-title">Nuestros Programas Educativos</span>
            </div>

            <div className="rounded-2xl border flex-1" style={{ padding: '20px', background: 'var(--bg-secondary)', borderColor: 'var(--border-secondary)' }}>
              
              {/* Sección Financiera */}
              <div 
                className="grid grid-cols-3 gap-4 rounded-xl border mb-6 shadow-sm"
                style={{
                  paddingTop: '5px',
                  paddingBottom: '5px',
                  paddingLeft: '10px',
                  paddingRight: '10px',
                  background: 'var(--card-bg)',
                  borderColor: 'var(--border-secondary)',
                }}
              >
                <div className="info-field">
                  <span className="info-label">Efectivo</span>
                  {isCabifyConnected || readOnly ? (
                    <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                      {formatCurrency(driver.facturacion_efectivo)}
                    </span>
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      className="w-full p-1 border rounded text-sm font-bold outline-none"
                      style={{ borderColor: 'var(--input-border)', color: 'var(--text-primary)', background: 'var(--input-bg)' }}
                      value={formData.facturacion_efectivo}
                      onChange={(e) => handleInputChange('facturacion_efectivo', e.target.value)}
                    />
                  )}
                </div>
                <div className="info-field">
                  <span className="info-label">App</span>
                  {isCabifyConnected || readOnly ? (
                    <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                      {formatCurrency(driver.facturacion_app)}
                    </span>
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      className="w-full p-1 border rounded text-sm font-bold outline-none"
                      style={{ borderColor: 'var(--input-border)', color: 'var(--text-primary)', background: 'var(--input-bg)' }}
                      value={formData.facturacion_app}
                      onChange={(e) => handleInputChange('facturacion_app', e.target.value)}
                    />
                  )}
                </div>
                <div className="info-field">
                  <span className="info-label">Total</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                    {isCabifyConnected 
                      ? formatCurrency(driver.facturacion_total)
                      : formatCurrency(Number(formData.facturacion_app) + Number(formData.facturacion_efectivo))
                    }
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5 mb-2" style={{ marginTop: '10px' }}>
                {/* Llamada */}
                <div className="form-group">
                  <label className="info-label block mb-2">LLAMADA</label>
                  <input 
                    type="text"
                    className="w-full p-2.5 border rounded-lg text-sm font-bold outline-none"
                    style={{
                      borderColor: 'var(--input-border)',
                      background: getLlamadaStatus(formData.fecha_llamada) === 'Realizada' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                      color: getLlamadaStatus(formData.fecha_llamada) === 'Realizada' ? '#10b981' : '#f59e0b',
                    }}
                    value={getLlamadaStatus(formData.fecha_llamada)}
                    disabled={true}
                  />
                </div>

                {/* Fecha Llamada */}
                <div className="form-group">
                  <label className="info-label block mb-2">Fecha Llamada</label>
                  <div className="relative">
                    <input 
                      type="datetime-local"
                      className="w-full p-2.5 border rounded-lg text-sm transition-all outline-none disabled:opacity-60"
                      style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                      value={formData.fecha_llamada}
                      onChange={(e) => handleInputChange('fecha_llamada', e.target.value)}
                      disabled={readOnly}
                    />
                  </div>
                </div>

                {/* Escuela Conductores */}
                <div className="form-group">
                  <label className="info-label block mb-2">Escuela de Conductores</label>
                  <input 
                    type="text"
                    className="w-full p-2.5 border rounded-lg text-sm font-bold outline-none"
                    style={{ borderColor: 'var(--input-border)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                    value={formData.fecha_escuela ? "SI" : "NO"}
                    disabled={true}
                  />
                </div>

                {/* Fecha Inicio Escuela */}
                <div className="form-group">
                  <label className="info-label block mb-2">Fecha Inicio Escuela</label>
                  <input 
                    type="date"
                    className="w-full p-2.5 border rounded-lg text-sm transition-all outline-none disabled:opacity-60"
                    style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                    value={formData.fecha_escuela}
                    onChange={(e) => handleInputChange('fecha_escuela', e.target.value)}
                    disabled={readOnly}
                  />
                </div>

                {/* Acción Implementada - Span 2 columns */}
                <div className="form-group col-span-2 mt-1">
                  <label className="info-label block mb-2">Acción Implementada</label>
                  <select 
                    className="w-full p-2.5 border rounded-lg text-sm transition-all outline-none disabled:opacity-60"
                    style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                    value={formData.id_accion_imp}
                    onChange={(e) => handleInputChange('id_accion_imp', Number(e.target.value))}
                    disabled={readOnly}
                  >
                    {accionesImplementadas.map((accion) => (
                      <option key={accion.id} value={accion.id}>{accion.nombre}</option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group col-span-2">
                  <label className="info-label block mb-2">Seguimiento</label>
                  <select
                    className="w-full p-2.5 border rounded-lg text-sm transition-all outline-none disabled:opacity-60"
                    style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                    value={(formData as any).seguimiento || ""}
                    onChange={(e) => handleInputChange('seguimiento', e.target.value.toUpperCase())}
                    disabled={readOnly}
                  >
                    <option value="">Sin definir</option>
                    <option value="SEMANAL">SEMANAL</option>
                    <option value="CERCANO">CERCANO</option>
                    <option value="DIARIO">DIARIO</option>
                  </select>
                </div>
              </div>
              
              <IncidentsHistory 
                notas={anotaciones} 
                onAddNote={() => {
                  setEditingNoteIndex(null);
                  setShowAnotaciones(true);
                }}
                onEditNote={handleEditNote}
                onDeleteNote={handleDeleteNote}
                readOnly={readOnly}
              />
            </div>
          </div>

          {/* Columna Derecha: Info + Docs + Vehículo */}
          <div className="flex flex-col gap-8">
            
            {/* Sección: Información Personal */}
            <div>
              <div className="section-header">
                <span className="section-title">Información Personal</span>
              </div>
              
              <div className="rounded-2xl border grid grid-cols-2 gap-y-6 gap-x-4" style={{ padding: '10px', background: 'var(--bg-secondary)', borderColor: 'var(--border-secondary)' }}>
                <div className="info-field">
                  <span className="info-label">Nombre Completo</span>
                  <span className="text-sm font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{conductor.nombreCompleto.toUpperCase()}</span>
                </div>
                <div className="info-field">
                  <span className="info-label">DNI / CUIL</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{conductor.dniCuil}</span>
                </div>
                <div className="info-field">
                  <span className="info-label">Teléfono</span>
                  <span className="text-sm font-bold" style={{ color: conductor.telefono === '-' ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
                    {conductor.telefono}
                  </span>
                </div>
                <div className="info-field">
                  <span className="info-label">Turno</span>
                  <div className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                    {turnoInfo.icon}
                    <span>{turnoInfo.label}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sección: Documentación y Estado */}
            <div>
              <div className="section-header">
                <span className="section-title">Documentación y Estado</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Tarjeta Estado */}
                <div className="border rounded-xl flex items-center gap-4 shadow-sm" style={{ padding: '10px', borderColor: 'var(--border-primary)', background: 'var(--card-bg)' }}>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${estadoInfo.className === 'success' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}`}>
                    {estadoInfo.icon}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Estado Actual</span>
                    <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                      {estadoInfo.label}
                    </span>
                  </div>
                </div>

                {/* Tarjeta Vencimiento */}
                <div className="border rounded-xl flex items-center gap-4 shadow-sm" style={{ padding: '10px', borderColor: 'var(--border-primary)', background: 'var(--card-bg)' }}>
                  <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center flex-shrink-0">
                    <Calendar size={20} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Vencimiento Licencia</span>
                    <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                      {formatFecha(driver.licencia_vencimiento)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sección: Asignación Vehicular */}
            <div>
              <div className="section-header">
                <span className="section-title">Asignación Vehicular</span>
              </div>
                
              {driver.vehiculo_asignado ? (
                <div className="rounded-xl relative overflow-hidden flex justify-between items-start shadow-sm border" style={{ padding: '20px', background: 'var(--bg-secondary)', borderColor: 'var(--border-secondary)' }}>
                  <div className="relative z-10">
                    <span className="text-white text-[10px] font-bold rounded mb-3 inline-block uppercase tracking-wider" style={{ padding: '3px', background: 'var(--color-primary)' }}>Vehículo Actual</span>
                    <h4 className="text-lg font-bold mb-1 tracking-tight" style={{ color: 'var(--text-primary)' }}>
                      {driver.vehiculo_asignado.marca.toUpperCase()} {driver.vehiculo_asignado.modelo.toUpperCase()}
                    </h4>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      Sedan - Transmisión Manual
                    </p>
                  </div>
                  
                  <div className="font-mono font-bold text-lg rounded-md shadow-sm border relative z-10" style={{ padding: '3px', background: 'var(--card-bg)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
                    <span className="absolute -top-3 right-0 text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>Patente</span>
                    {driver.vehiculo_asignado.patente}
                  </div>
                </div>
              ) : (
                 <div className="rounded-xl p-8 flex justify-center items-center border border-dashed" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
                    <span className="italic text-sm" style={{ color: 'var(--text-tertiary)' }}>Sin vehículo asignado actualmente</span>
                 </div>
              )}
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="driver-modal-footer">
          {!readOnly && (
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="save-button"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Guardar Cambios
                </>
              )}
            </button>
          )}
          <button onClick={onClose} className="close-button">
            Cerrar
          </button>
        </div>
      </div>
      
      {showAnotaciones && (
        <AnotacionesEditorModal
          isOpen={showAnotaciones}
          onClose={() => {
            setShowAnotaciones(false);
            setEditingNoteIndex(null);
          }}
          initialAnotaciones={anotaciones}
          onSave={handleSaveAnotaciones}
          currentUser={currentProfile?.full_name || currentProfile?.email || 'Usuario'}
          title={`${driver.nombres} ${driver.apellidos}`}
          editingNoteIndex={editingNoteIndex}
        />
      )}
    </div>
  );
}

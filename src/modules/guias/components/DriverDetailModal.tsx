import React, { useState, useEffect } from 'react';
import { X, User, Sun, Moon, Briefcase, Calendar, CheckCircle2, AlertTriangle, ShieldAlert, Save, MessageSquarePlus } from 'lucide-react';
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

  const formatCurrency = (amount: number | string | undefined) => {
    if (amount === undefined || amount === null) return "-";
    return new Intl.NumberFormat("es-AR", { 
      style: "currency", 
      currency: "ARS",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    }).format(Number(amount));
  };

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

  const [formData, setFormData] = useState({
    meta_sem_cumplida: getInitialMeta(driver.meta_sem_cumplida),
    accion_implementaria: driver.accion_implementaria || "",
    id_accion_imp: driver.id_accion_imp || 1,
    escuela_conductores: driver.escuela_conductores || "",
    fecha_escuela: formatDateForDateInput(driver.fecha_escuela),
    fecha_llamada: formatDateForInput(driver.fecha_llamada),
    facturacion_app: driver.facturacion_app || 0,
    facturacion_efectivo: driver.facturacion_efectivo || 0
  });

  // Si tiene datos de cabify (relacion cabify = SI), no es editable
  const isCabifyConnected = !!driver.cabifyData;

  const [isSaving, setIsSaving] = useState(false);

  // Eliminar carga de incidencias antiguas
  // const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  // const [loadingIncidencias, setLoadingIncidencias] = useState(false);
  
  // useEffect(() => {
  //   if (driver.id) {
  //     loadIncidencias();
  //   }
  // }, [driver.id]);

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
        fecha_llamada: formData.fecha_llamada ? new Date(formData.fecha_llamada).toISOString() : null
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
      // Esto evita el error de ON CONFLICT si falta la constraint en la BD
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

  const handleEditNote = (nota: Nota, index: number) => {
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
        // Fix z-index issue: DriverDetailModal has z-50, so we need SweetAlert to be higher
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
              <User className="text-red-500" size={20} />
              {conductor.nombreCompleto}
            </h2>
            {driver.semana && (
              <p className="driver-modal-subtitle">
                Semana de Historial: <span className="text-red-500 font-bold">{driver.semana}</span>
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
              <div className="section-indicator"></div>
              <span className="section-title">GUIAS</span>
            </div>

            <div className="bg-gray-50/80 rounded-2xl border border-gray-100 flex-1" style={{ padding: '20px' }}>
              
              {/* Sección Financiera */}
              <div 
                className="grid grid-cols-3 gap-4 p-4 bg-white rounded-xl border border-gray-100 mb-6 shadow-sm"
                style={{
                  paddingTop: '5px',
                  paddingBottom: '5px',
                  paddingLeft: '10px',
                  paddingRight: '10px'
                }}
              >
                <div className="info-field">
                  <span className="info-label">Efectivo</span>
                  {isCabifyConnected || readOnly ? (
                    <span className="text-sm font-bold text-gray-900">
                      {formatCurrency(driver.facturacion_efectivo)}
                    </span>
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      className="w-full p-1 border border-gray-200 rounded text-sm font-bold text-gray-900 outline-none focus:border-blue-400"
                      value={formData.facturacion_efectivo}
                      onChange={(e) => handleInputChange('facturacion_efectivo', e.target.value)}
                    />
                  )}
                </div>
                <div className="info-field">
                  <span className="info-label">App</span>
                  {isCabifyConnected || readOnly ? (
                    <span className="text-sm font-bold text-gray-900">
                      {formatCurrency(driver.facturacion_app)}
                    </span>
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      className="w-full p-1 border border-gray-200 rounded text-sm font-bold text-gray-900 outline-none focus:border-blue-400"
                      value={formData.facturacion_app}
                      onChange={(e) => handleInputChange('facturacion_app', e.target.value)}
                    />
                  )}
                </div>
                <div className="info-field">
                  <span className="info-label">Total</span>
                  <span className="text-sm font-bold text-gray-900">
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
                    className={`w-full p-2.5 border border-gray-200 rounded-lg text-sm font-bold outline-none ${
                      getLlamadaStatus(formData.fecha_llamada) === 'Realizada' 
                        ? 'bg-green-50 text-green-600' 
                        : 'bg-yellow-50 text-yellow-600'
                    }`}
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
                      className="w-full p-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all outline-none text-gray-700 disabled:bg-gray-100 disabled:text-gray-500"
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
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm bg-gray-100 font-bold text-gray-700 outline-none"
                    value={formData.fecha_escuela ? "SI" : "NO"}
                    disabled={true}
                  />
                </div>

                {/* Fecha Inicio Escuela */}
                <div className="form-group">
                  <label className="info-label block mb-2">Fecha Inicio Escuela</label>
                  <input 
                    type="date"
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all outline-none text-gray-700 disabled:bg-gray-100 disabled:text-gray-500"
                    value={formData.fecha_escuela}
                    onChange={(e) => handleInputChange('fecha_escuela', e.target.value)}
                    disabled={readOnly}
                  />
                </div>

                {/* Acción Implementada - Span 2 columns */}
                <div className="form-group col-span-2 mt-1">
                  <label className="info-label block mb-2">Acción Implementada</label>
                  <select 
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all outline-none text-gray-700 disabled:bg-gray-100 disabled:text-gray-500"
                    value={formData.id_accion_imp}
                    onChange={(e) => handleInputChange('id_accion_imp', Number(e.target.value))}
                    disabled={readOnly}
                  >
                    {accionesImplementadas.map((accion) => (
                      <option key={accion.id} value={accion.id}>{accion.nombre}</option>
                    ))}
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
                <div className="section-indicator"></div>
                <span className="section-title">Información Personal</span>
              </div>
              
              <div className="bg-gray-50/80 rounded-2xl border border-gray-100 grid grid-cols-2 gap-y-6 gap-x-4" style={{ padding: '10px' }}>
                <div className="info-field">
                  <span className="info-label">Nombre Completo</span>
                  <span className="text-sm font-bold text-gray-900 leading-tight">{conductor.nombreCompleto.toUpperCase()}</span>
                </div>
                <div className="info-field">
                  <span className="info-label">DNI / CUIL</span>
                  <span className="text-sm font-bold text-gray-900">{conductor.dniCuil}</span>
                </div>
                <div className="info-field">
                  <span className="info-label">Teléfono</span>
                  <span className={`text-sm font-bold ${conductor.telefono === '-' ? 'text-gray-400 italic font-normal' : 'text-gray-900'}`}>
                    {conductor.telefono}
                  </span>
                </div>
                <div className="info-field">
                  <span className="info-label">Turno</span>
                  <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    {turnoInfo.icon}
                    <span>{turnoInfo.label}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sección: Documentación y Estado */}
            <div>
              <div className="section-header">
                <div className="section-indicator"></div>
                <span className="section-title">Documentación y Estado</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Tarjeta Estado */}
                <div className="border border-gray-200 rounded-xl flex items-center gap-4 bg-white shadow-sm" style={{ padding: '10px' }}>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${estadoInfo.className === 'success' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}`}>
                    {estadoInfo.icon}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Estado Actual</span>
                    <span className={`text-sm font-bold ${estadoInfo.className === 'success' ? 'text-gray-900' : 'text-gray-900'}`}>
                      {estadoInfo.label}
                    </span>
                  </div>
                </div>

                {/* Tarjeta Vencimiento */}
                <div className="border border-gray-200 rounded-xl flex items-center gap-4 bg-white shadow-sm" style={{ padding: '10px' }}>
                  <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center flex-shrink-0">
                    <Calendar size={20} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Vencimiento Licencia</span>
                    <span className="text-sm font-bold text-gray-900">
                      {formatFecha(driver.licencia_vencimiento)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sección: Asignación Vehicular */}
            <div>
              <div className="section-header">
                <div className="section-indicator"></div>
                <span className="section-title">Asignación Vehicular</span>
              </div>
                
              {driver.vehiculo_asignado ? (
                <div className="bg-[#0f172a] rounded-xl text-white relative overflow-hidden flex justify-between items-start shadow-md" style={{ padding: '20px' }}>
                  {/* Background decoration if needed, or keeping it clean as per CSS */}
                  <div className="relative z-10">
                    <span className="bg-red-500 text-white text-[10px] font-bold rounded mb-3 inline-block uppercase tracking-wider" style={{ padding: '3px' }}>Vehículo Actual</span>
                    <h4 className="text-lg font-bold mb-1 tracking-tight">
                      {driver.vehiculo_asignado.marca.toUpperCase()} {driver.vehiculo_asignado.modelo.toUpperCase()}
                    </h4>
                    <p className="text-slate-400 text-xs">
                      Sedan - Transmisión Manual
                    </p>
                  </div>
                  
                  <div className="bg-white text-gray-900 font-mono font-bold text-lg rounded-md shadow-lg relative z-10" style={{ padding: '3px' }}>
                    <span className="absolute -top-3 right-0 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Patente</span>
                    {driver.vehiculo_asignado.patente}
                  </div>
                </div>
              ) : (
                 <div className="bg-gray-50 rounded-xl p-8 flex justify-center items-center border border-gray-100 border-dashed">
                    <span className="text-gray-400 italic text-sm">Sin vehículo asignado actualmente</span>
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

import React, { useState, useEffect, useRef } from 'react';
import { X, Send, User, Calendar, MessageSquare } from 'lucide-react';

export interface Nota {
  texto: string;
  fecha: string;
  usuario?: string;
}

interface AnotacionesEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialAnotaciones: Nota[] | null;
  onSave: (nuevasAnotaciones: Nota[]) => Promise<void>;
  currentUser: string;
  title?: string;
  editingNoteIndex?: number | null;
}

export function AnotacionesEditorModal({ 
  isOpen, 
  onClose, 
  initialAnotaciones, 
  onSave, 
  currentUser, 
  title = "Anotaciones Extra",
  editingNoteIndex
}: AnotacionesEditorModalProps) {
  const [anotaciones, setAnotaciones] = useState<Nota[]>([]);
  const [nuevoTexto, setNuevoTexto] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (editingNoteIndex !== undefined && editingNoteIndex !== null && initialAnotaciones && initialAnotaciones[editingNoteIndex]) {
        setNuevoTexto(initialAnotaciones[editingNoteIndex].texto);
      } else {
        setNuevoTexto('');
      }
    }
  }, [isOpen, editingNoteIndex, initialAnotaciones]);

  if (!isOpen) return null;

  const handleGuardar = async () => {
    if (!nuevoTexto.trim()) return;

    const fechaExacta = new Date().toLocaleString('es-AR');
    
    // Si estamos editando, mantenemos la nota original pero actualizamos texto y quizás fecha de modificación
    // Opcional: actualizar fecha/usuario al editar. Por ahora actualizaremos fecha y usuario para reflejar la edición.
    const nuevaNota: Nota = {
      texto: nuevoTexto.trim(),
      fecha: fechaExacta,
      usuario: currentUser
    };

    let nuevasAnotaciones: Nota[];

    if (editingNoteIndex !== undefined && editingNoteIndex !== null && initialAnotaciones) {
      nuevasAnotaciones = [...initialAnotaciones];
      nuevasAnotaciones[editingNoteIndex] = nuevaNota;
    } else {
      nuevasAnotaciones = [...(initialAnotaciones || []), nuevaNota];
    }

    try {
      setIsSaving(true);
      await onSave(nuevasAnotaciones);
      onClose();
    } catch (error) {
      console.error("Error al guardar nota:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div 
          className="flex items-start gap-4 p-8 pb-4"
          style={{ 
            paddingTop: '20px', 
            paddingLeft: '20px', 
            paddingBottom: '20px', 
            paddingRight: '20px' 
          }}
        >
          <div className="flex-shrink-0 p-3 bg-blue-50 text-blue-600 rounded-xl">
            <MessageSquare size={24} strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">
              NOTAS DEL CONDUCTOR
            </div>
            <h3 className="text-xl font-bold text-gray-900 leading-tight truncate mb-1">
              {title}
            </h3>
            <p className="text-sm text-gray-500 font-medium">
              {editingNoteIndex !== undefined && editingNoteIndex !== null ? 'Editar nota existente' : 'Agregar nueva nota'}
            </p>
          </div>
        </div>

        {/* Input Area */}
        <div 
          className="px-8 py-2"
          style={{ 
            paddingTop: 'unset', 
            paddingLeft: '20px', 
            borderRightWidth: '0px', 
            paddingRight: '20px', 
            paddingBottom: '20px' 
          }}
        >
          <textarea
            value={nuevoTexto}
            onChange={(e) => setNuevoTexto(e.target.value)}
            placeholder="Escribe una nota..."
            className="w-full p-4 bg-slate-50 border border-gray-200 rounded-xl text-gray-700 placeholder-gray-400 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all resize-none outline-none min-h-[160px] text-base leading-relaxed"
            autoFocus
            style={{ 
              paddingTop: '10px', 
              paddingLeft: '10px', 
              paddingRight: '10px', 
              paddingBottom: '10px' 
            }}
          />
        </div>

        {/* Footer Buttons */}
        <div 
          className="flex items-center justify-end gap-4 p-8 pt-6"
          style={{ 
            paddingRight: '20px', 
            paddingBottom: '20px', 
            paddingLeft: '20px' 
          }}
        >
          <button
            onClick={onClose}
            className="text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors px-2"
            disabled={isSaving}
          >
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={!nuevoTexto.trim() || isSaving}
            className={`
              flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg active:scale-95
              ${!nuevoTexto.trim() || isSaving 
                ? 'bg-blue-400 cursor-not-allowed shadow-none' 
                : 'bg-blue-600 hover:bg-blue-700'
              }
            `}
            style={{ 
              paddingTop: '5px', 
              paddingRight: '5px', 
              paddingLeft: '5px', 
              paddingBottom: '5px' 
            }}
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Send size={16} strokeWidth={2.5} />
                Guardar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

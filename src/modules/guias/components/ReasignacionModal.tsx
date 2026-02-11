import { useState, useEffect } from 'react';
import { X, Car, Search, Check } from 'lucide-react';
import Swal from 'sweetalert2';
import './ReasignacionModal.css';

interface Guide {
  id: string;
  full_name: string;
}

interface Vehicle {
  patente: string;
  marca: string;
  modelo: string;
}

interface ConductorData {
  id: string;
  nombres: string;
  apellidos: string;
  numero_dni: string;
  vehiculo_asignado?: Vehicle;
  id_guia: string;
  historial_id?: string;
}

interface ReasignacionModalProps {
  isOpen: boolean;
  onClose: () => void;
  conductor: ConductorData | null;
  guides: Guide[];
  onConfirm: (newGuideId: string) => Promise<void>;
}

export function ReasignacionModal({ 
  isOpen, 
  onClose, 
  conductor, 
  guides, 
  onConfirm 
}: ReasignacionModalProps) {
  const [selectedGuideId, setSelectedGuideId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    if (conductor) {
      setSelectedGuideId(conductor.id_guia || '');
      setSearchTerm('');
    }
  }, [conductor]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.select-container')) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isOpen || !conductor) return null;

  const handleConfirm = async () => {
    if (!selectedGuideId) {
      Swal.fire('Error', 'Debes seleccionar un guía', 'warning');
      return;
    }

    if (selectedGuideId === conductor.id_guia) {
      Swal.fire('Info', 'El guía seleccionado es el mismo que el actual', 'info');
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm(selectedGuideId);
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredGuides = guides.filter(g => 
    g.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedGuideName = guides.find(g => g.id === selectedGuideId)?.full_name || '';

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">Reasignación de Conductor</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Sección Datos del Conductor */}
        <div className="section">
          <div className="section-label">
            <span className="section-indicator"></span>
            <span className="section-title">DATOS DEL CONDUCTOR</span>
          </div>
          
          <div className="conductor-info">
            <div className="info-column">
              <span className="info-label">Nombre</span>
              <span className="info-value" title={`${conductor.nombres} ${conductor.apellidos}`}>
                {conductor.nombres} {conductor.apellidos}
              </span>
            </div>
            <div className="info-column">
              <span className="info-label">DNI</span>
              <span className="info-value">{conductor.numero_dni || '-'}</span>
            </div>
          </div>

          <div className="vehiculo-card">
            <span className="vehiculo-label">Vehículo Actual</span>
            <div className="vehiculo-content">
              <div className="vehiculo-icon">
                <Car size={24} />
              </div>
              <div className="vehiculo-info">
                {conductor.vehiculo_asignado ? (
                  <>
                    <span className="vehiculo-modelo">
                      {conductor.vehiculo_asignado.marca} {conductor.vehiculo_asignado.modelo}
                    </span>
                    <span className="vehiculo-placa">Placa: {conductor.vehiculo_asignado.patente}</span>
                  </>
                ) : (
                  <span className="vehiculo-modelo" style={{ fontStyle: 'italic', color: '#9ca3af' }}>
                    Sin vehículo asignado
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sección Nueva Asignación */}
        <div className="section">
          <div className="section-label">
            <span className="section-indicator"></span>
            <span className="section-title">NUEVA ASIGNACIÓN</span>
          </div>
          
          <div className="form-group">
            <label className="form-label">Guía Asignado</label>
            <div className="select-container" onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
              <Search size={18} className="select-icon" />
              <input 
                type="text" 
                className="select-input" 
                style={{ paddingLeft: '35px' }}
                placeholder="Buscar o seleccionar guía..."
                value={isDropdownOpen ? searchTerm : selectedGuideName}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setIsDropdownOpen(true);
                  if (!isDropdownOpen) setSelectedGuideId('');
                }}
                onFocus={() => {
                  setIsDropdownOpen(true);
                  setSearchTerm('');
                }}
                readOnly={!isDropdownOpen}
              />
              <span 
                className="guia-indicator" 
                style={{ backgroundColor: selectedGuideId ? '#22c55e' : '#e5e7eb' }}
              ></span>

              {/* Dropdown List - Hidden unless open */}
              {isDropdownOpen && (
                <div className="dropdown-list">
                  {filteredGuides.length > 0 ? (
                    filteredGuides.map(guide => (
                      <div
                        key={guide.id}
                        className={`dropdown-item ${guide.id === selectedGuideId ? 'selected' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent closing when clicking item
                          setSelectedGuideId(guide.id);
                          setSearchTerm('');
                          setIsDropdownOpen(false);
                        }}
                      >
                        <div className="dropdown-item-content">
                           <div className={`dropdown-item-avatar ${guide.id === selectedGuideId ? 'active' : ''}`}>
                                {guide.full_name.charAt(0).toUpperCase()}
                            </div>
                          <span>{guide.full_name}</span>
                        </div>
                        {guide.id === selectedGuideId && <Check size={16} className="dropdown-check" />}
                      </div>
                    ))
                  ) : (
                    <div className="dropdown-empty">
                      No se encontraron guías
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <p className="nota">* La reasignación tomará efecto inmediato en el sistema de despacho.</p>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn btn-cancel" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </button>
          <button 
            className="btn btn-confirm" 
            onClick={handleConfirm}
            disabled={isSubmitting || !selectedGuideId}
          >
            {isSubmitting ? (
               <div className="spinner"></div>
            ) : (
               <Check size={18} />
            )}
            Confirmar Reasignación
          </button>
        </div>

      </div>
    </div>
  );
}

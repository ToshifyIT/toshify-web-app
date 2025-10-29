// src/modules/asignaciones/ProgramacionModule.tsx
import { useState, useMemo, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Check, X, Calendar, User } from 'lucide-react'

interface Driver {
  id: string
  name: string
}

interface Vehicle {
  plate: string
  brand: string
  model: string
  year: number
  km: number
  status: 'available' | 'in_use' | 'maintenance'
}

const DRIVERS: Driver[] = [
  { id: 'DRV-001', name: 'Juan López' },
  { id: 'DRV-002', name: 'Aníbal Morales' },
  { id: 'DRV-003', name: 'Carlos Díaz' },
  { id: 'DRV-004', name: 'Laura Vega' },
  { id: 'DRV-005', name: 'Roberto Moreno' }
]

const VEHICLES: Vehicle[] = [
  { plate: 'ABC-123', brand: 'Toyota', model: 'Yaris', year: 2022, km: 45230, status: 'available' },
  { plate: 'DEF-456', brand: 'Ford', model: 'Transit', year: 2021, km: 52100, status: 'available' },
  { plate: 'GHI-789', brand: 'Chevrolet', model: 'Cruze', year: 2020, km: 68950, status: 'available' },
  { plate: 'JKL-012', brand: 'Renault', model: 'Kwid', year: 2023, km: 12340, status: 'available' }
]

const MODALITY_OPTIONS = [
  {
    id: 'turno',
    label: 'Turno',
    description: 'Asignación por jornada',
    icon: Calendar
  },
  {
    id: 'cargo',
    label: 'A Cargo',
    description: 'Asignación a conductor',
    icon: User
  }
]

const VEHICLE_STATUS_CONFIG = {
  available: { label: 'Disponible', color: '#D1FAE5', textColor: '#065F46' },
  in_use: { label: 'En Uso', color: '#FEF3C7', textColor: '#92400E' },
  maintenance: { label: 'Mantenimiento', color: '#FEE2E2', textColor: '#DC2626' }
}

const StepIndicator: React.FC<{ currentStep: number; totalSteps: number; onStepClick: (step: number) => void }> = ({ currentStep, totalSteps, onStepClick }) => {
  const steps = ['Modalidad', 'Vehículo', 'Conductores']

  const getStepStatus = (step: number) => {
    if (step < currentStep) return 'completed'
    if (step === currentStep) return 'active'
    return 'pending'
  }

  return (
    <div style={{ marginBottom: '48px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {steps.map((step, index) => {
          const stepNum = index + 1
          const status = getStepStatus(stepNum)

          return (
            <div key={step} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                <button
                  onClick={() => stepNum < currentStep && onStepClick(stepNum)}
                  disabled={stepNum >= currentStep}
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '18px',
                    transition: 'all 0.2s',
                    background: status === 'completed' || status === 'active' ? '#E63946' : '#E5E7EB',
                    color: status === 'completed' || status === 'active' ? 'white' : '#9CA3AF',
                    border: status === 'active' ? '4px solid #FEE2E2' : 'none',
                    cursor: stepNum < currentStep ? 'pointer' : 'not-allowed'
                  }}
                >
                  {status === 'completed' ? <Check size={20} /> : stepNum}
                </button>
                <span style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  marginTop: '8px',
                  color: status === 'active' ? '#E63946' : '#6B7280'
                }}>
                  {step}
                </span>
              </div>

              {stepNum < steps.length && (
                <div style={{
                  flex: 1,
                  height: '2px',
                  margin: '0 16px',
                  background: stepNum < currentStep ? '#E63946' : '#E5E7EB'
                }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const ErrorMessage: React.FC<{ message: string }> = ({ message }) => (
  <div style={{
    background: '#FEE2E2',
    border: '1px solid #FCA5A5',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  }} role="alert">
    <X size={20} style={{ color: '#DC2626', flexShrink: 0 }} />
    <p style={{ color: '#991B1B', fontSize: '14px', margin: 0 }}>{message}</p>
  </div>
)

export function ProgramacionModule() {
  const [currentStep, setCurrentStep] = useState(1)
  const [modality, setModality] = useState<'turno' | 'cargo' | null>(null)
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null)
  const [dayDrivers, setDayDrivers] = useState<string[]>([])
  const [nightDrivers, setNightDrivers] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [draggedDriver, setDraggedDriver] = useState<string | null>(null)

  const driverNameMap = useMemo(() => {
    return Object.fromEntries(DRIVERS.map(d => [d.id, d.name]))
  }, [])

  const handleSelectModality = useCallback((type: 'turno' | 'cargo') => {
    setModality(type)
    setErrors(prev => ({ ...prev, 1: '' }))
  }, [])

  const handleSelectVehicle = useCallback((plate: string) => {
    setSelectedVehicle(plate)
    setErrors(prev => ({ ...prev, 2: '' }))
  }, [])

  const handleDragStart = (e: React.DragEvent, driverId: string) => {
    setDraggedDriver(driverId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, shift: 'day' | 'night') => {
    e.preventDefault()
    if (draggedDriver) {
      if (shift === 'day' && dayDrivers.length === 0) {
        setDayDrivers([draggedDriver])
      } else if (shift === 'night' && nightDrivers.length === 0) {
        setNightDrivers([draggedDriver])
      }
      setDraggedDriver(null)
      setErrors(prev => ({ ...prev, 3: '' }))
    }
  }

  const handleRemoveDriver = (driverId: string, shift: 'day' | 'night') => {
    if (shift === 'day') {
      setDayDrivers(prev => prev.filter(id => id !== driverId))
    } else {
      setNightDrivers(prev => prev.filter(id => id !== driverId))
    }
  }

  const handleNextStep = useCallback(() => {
    if (currentStep === 1 && !modality) {
      setErrors(prev => ({ ...prev, 1: 'Por favor selecciona una modalidad' }))
      return
    }
    if (currentStep === 2 && !selectedVehicle) {
      setErrors(prev => ({ ...prev, 2: 'Por favor selecciona un vehículo' }))
      return
    }
    setCurrentStep(prev => prev + 1)
  }, [currentStep, modality, selectedVehicle])

  const handlePreviousStep = useCallback(() => {
    setCurrentStep(prev => Math.max(1, prev - 1))
    setErrors({})
  }, [])

  const handleStepClick = useCallback((step: number) => {
    setCurrentStep(step)
    setErrors({})
  }, [])

  const handleFinalizeAssignment = useCallback(() => {
    if (dayDrivers.length !== 1 || nightDrivers.length !== 1) {
      setErrors(prev => ({
        ...prev,
        3: 'Debe asignar exactamente 1 conductor para turno diurno y 1 para turno nocturno'
      }))
      return
    }

    alert('¡Asignación creada exitosamente!')
    resetForm()
  }, [dayDrivers, nightDrivers])

  const resetForm = useCallback(() => {
    setCurrentStep(1)
    setModality(null)
    setSelectedVehicle(null)
    setDayDrivers([])
    setNightDrivers([])
    setErrors({})
  }, [])

  const isComplete = dayDrivers.length === 1 && nightDrivers.length === 1

  return (
    <div>
      <style>{`
        .wizard-card {
          background: white;
          border-radius: 8px;
          border: 1px solid #E5E7EB;
          padding: 32px;
        }

        .modality-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-bottom: 32px;
          max-width: 800px;
          margin-left: auto;
          margin-right: auto;
        }

        .modality-option {
          padding: 32px;
          border-radius: 8px;
          border: 2px solid #E5E7EB;
          transition: all 0.2s;
          text-align: center;
          cursor: pointer;
          background: white;
        }

        .modality-option:hover {
          border-color: #FCA5A5;
        }

        .modality-option.selected {
          border-color: #E63946;
          background: #FEF2F2;
          box-shadow: 0 0 0 3px #FEE2E2;
        }

        .table-wrapper {
          overflow-x: auto;
          border-radius: 8px;
          border: 1px solid #E5E7EB;
          margin-bottom: 32px;
        }

        .vehicle-table {
          width: 100%;
          border-collapse: collapse;
          background: white;
          min-width: 900px;
        }

        .vehicle-table th {
          text-align: left;
          padding: 12px;
          background: #F9FAFB;
          font-size: 12px;
          font-weight: 600;
          color: #6B7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #E5E7EB;
          white-space: nowrap;
        }

        .vehicle-table th:last-child {
          text-align: center;
        }

        .vehicle-table td {
          padding: 16px 12px;
          border-bottom: 1px solid #E5E7EB;
          color: #1F2937;
          font-size: 14px;
        }

        .vehicle-table td:last-child {
          text-align: center;
        }

        .vehicle-table tr:hover {
          background: #F9FAFB;
        }

        .vehicle-table tr.selected {
          background: #FEF2F2;
        }

        .btn-primary {
          padding: 10px 20px;
          background: #E63946;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .btn-primary:hover {
          background: #D62828;
        }

        .btn-primary:disabled {
          background: #D1D5DB;
          cursor: not-allowed;
        }

        .btn-secondary {
          padding: 10px 20px;
          background: white;
          color: #6B7280;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .btn-secondary:hover {
          background: #F9FAFB;
        }

        .driver-card {
          padding: 14px;
          border-radius: 8px;
          border: 1px solid #E5E7EB;
          background: white;
          cursor: move;
          transition: all 0.2s;
        }

        .driver-card:hover {
          border-color: #D1D5DB;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .drop-zone {
          border: 2px solid #FCA5A5;
          border-radius: 8px;
          padding: 20px;
          min-height: 140px;
          background: white;
          transition: all 0.2s;
        }

        .drop-zone:hover {
          border-color: #F87171;
        }

        .assigned-driver {
          padding: 14px;
          background: #FEF2F2;
          border: 1px solid #FCA5A5;
          border-radius: 8px;
        }

        .badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }

        @media (max-width: 768px) {
          .modality-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>
          Asistente de Asignación
        </h3>
        <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#6B7280' }}>
          Guíate paso a paso en la asignación de vehículos
        </p>
      </div>

      <div className="wizard-card">
        <StepIndicator
          currentStep={currentStep}
          totalSteps={3}
          onStepClick={handleStepClick}
        />

        {/* Step 1: Modality */}
        {currentStep === 1 && (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1F2937', marginBottom: '8px' }}>
              Paso 1: Selecciona la Modalidad
            </h2>
            <p style={{ color: '#6B7280', marginBottom: '32px' }}>
              ¿Deseas asignar un vehículo por turno o a cargo?
            </p>

            {errors[1] && <ErrorMessage message={errors[1]} />}

            <div className="modality-grid">
              {MODALITY_OPTIONS.map(option => {
                const IconComponent = option.icon
                return (
                  <button
                    key={option.id}
                    onClick={() => handleSelectModality(option.id as 'turno' | 'cargo')}
                    className={`modality-option ${modality === option.id ? 'selected' : ''}`}
                  >
                    <IconComponent
                      size={48}
                      style={{ color: modality === option.id ? '#E63946' : '#6B7280', marginBottom: '16px' }}
                    />
                    <div style={{ fontWeight: 'bold', fontSize: '18px', color: '#1F2937', marginBottom: '4px' }}>
                      {option.label}
                    </div>
                    <div style={{ fontSize: '14px', color: '#6B7280' }}>
                      {option.description}
                    </div>
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={resetForm} className="btn-secondary">
                Cancelar
              </button>
              <button onClick={handleNextStep} disabled={!modality} className="btn-primary">
                Siguiente <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Vehicle */}
        {currentStep === 2 && (
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1F2937', marginBottom: '8px' }}>
              Paso 2: Selecciona Vehículo
            </h2>
            <p style={{ color: '#6B7280', marginBottom: '24px' }}>
              Selecciona el vehículo que deseas asignar.
            </p>

            {errors[2] && <ErrorMessage message={errors[2]} />}

            <div className="table-wrapper">
              <table className="vehicle-table">
                <thead>
                  <tr>
                    <th>Patente</th>
                    <th>Marca</th>
                    <th>Modelo</th>
                    <th>Año</th>
                    <th>KM Totales</th>
                    <th>Estado</th>
                    <th>Seleccionar</th>
                  </tr>
                </thead>
                <tbody>
                  {VEHICLES.map(vehicle => {
                    const statusConfig = VEHICLE_STATUS_CONFIG[vehicle.status]
                    return (
                      <tr key={vehicle.plate} className={selectedVehicle === vehicle.plate ? 'selected' : ''}>
                        <td><strong>{vehicle.plate}</strong></td>
                        <td>{vehicle.brand}</td>
                        <td>{vehicle.model}</td>
                        <td>{vehicle.year}</td>
                        <td>{vehicle.km.toLocaleString()}</td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              background: statusConfig.color,
                              color: statusConfig.textColor
                            }}
                          >
                            {statusConfig.label}
                          </span>
                        </td>
                        <td>
                          <input
                            type="radio"
                            name="vehicle"
                            value={vehicle.plate}
                            checked={selectedVehicle === vehicle.plate}
                            onChange={(e) => handleSelectVehicle(e.target.value)}
                            style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#E63946' }}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
              <button onClick={handlePreviousStep} className="btn-secondary">
                <ChevronLeft size={16} /> Atrás
              </button>
              <button onClick={handleNextStep} disabled={!selectedVehicle} className="btn-primary">
                Siguiente <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Drivers */}
        {currentStep === 3 && (
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1F2937', marginBottom: '8px' }}>
              Paso 3: Asigna los Conductores
            </h2>
            <p style={{ color: '#6B7280', marginBottom: '24px' }}>
              Arrastra y suelta los conductores en el turno correspondiente.
            </p>

            {errors[3] && <ErrorMessage message={errors[3]} />}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
              {/* Available Drivers */}
              <div>
                <h3 style={{ fontWeight: '600', color: '#1F2937', marginBottom: '16px', fontSize: '14px' }}>
                  Conductores Disponibles
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {DRIVERS.filter(d => !dayDrivers.includes(d.id) && !nightDrivers.includes(d.id)).map(driver => (
                    <div
                      key={driver.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, driver.id)}
                      className="driver-card"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <User size={18} style={{ color: '#E63946', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '500', color: '#1F2937', fontSize: '14px' }}>{driver.name}</div>
                          <div style={{ fontSize: '12px', color: '#6B7280' }}>ID: {driver.id}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Drop Zones */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Day Shift */}
                <div>
                  <h3 style={{ fontWeight: '600', color: '#1F2937', marginBottom: '10px', fontSize: '14px' }}>
                    Turno Diurno
                  </h3>
                  <div
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'day')}
                    className="drop-zone"
                  >
                    {dayDrivers.length > 0 ? (
                      dayDrivers.map(driverId => (
                        <div key={driverId} className="assigned-driver">
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                              <User size={18} style={{ color: '#E63946', flexShrink: 0 }} />
                              <div>
                                <div style={{ fontWeight: '500', color: '#1F2937', fontSize: '14px' }}>
                                  {driverNameMap[driverId]}
                                </div>
                                <div style={{ fontSize: '12px', color: '#6B7280' }}>ID: {driverId}</div>
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveDriver(driverId, 'day')}
                              style={{
                                color: '#E63946',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: '14px', padding: '40px 0' }}>
                        Arrastra conductores aquí
                      </div>
                    )}
                  </div>
                </div>

                {/* Night Shift */}
                <div>
                  <h3 style={{ fontWeight: '600', color: '#1F2937', marginBottom: '10px', fontSize: '14px' }}>
                    Turno Nocturno
                  </h3>
                  <div
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'night')}
                    className="drop-zone"
                  >
                    {nightDrivers.length > 0 ? (
                      nightDrivers.map(driverId => (
                        <div key={driverId} className="assigned-driver">
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                              <User size={18} style={{ color: '#E63946', flexShrink: 0 }} />
                              <div>
                                <div style={{ fontWeight: '500', color: '#1F2937', fontSize: '14px' }}>
                                  {driverNameMap[driverId]}
                                </div>
                                <div style={{ fontSize: '12px', color: '#6B7280' }}>ID: {driverId}</div>
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveDriver(driverId, 'night')}
                              style={{
                                color: '#E63946',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: '14px', padding: '40px 0' }}>
                        Arrastra conductores aquí
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
              <button onClick={handlePreviousStep} className="btn-secondary">
                <ChevronLeft size={16} /> Atrás
              </button>
              <button onClick={handleFinalizeAssignment} disabled={!isComplete} className="btn-primary">
                <Check size={16} /> Finalizar Asignación
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

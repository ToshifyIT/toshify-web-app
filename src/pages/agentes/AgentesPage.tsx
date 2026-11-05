// src/pages/agentes/AgentesPage.tsx
// Agentes: Estado de Flota por agente de ventas (guía responsable de cada vehículo).
import { AsignacionesActivasModule } from '../../modules/asignaciones/AsignacionesActivasModule'

export function AgentesPage() {
  return <AsignacionesActivasModule modo="agentes" />
}

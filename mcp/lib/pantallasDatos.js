// mcp/lib/pantallasDatos.js
// GENERADO por mcp/generadores/generarPantallasDatos.mjs el 2026-11-27: no editar a mano.
// Volver a generar cuando cambien las pantallas (src/pages/HomePage.tsx) o el catálogo.
//
// Para cada dataset del catálogo y cada reporte: las pantallas de Toshibase que lo
// consultan, con la condición de acceso de su ProtectedRoute (menuName y/o submenuName;
// admin = solo rol admin). Una persona ve el dataset si puede entrar a alguna.
// Sin pantalla (no los ve nadie por login; sí las keys con datos:read): ninguno.

export const PANTALLAS_POR_DATASET = {
  "conductores": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": "leads",
      "submenu": null,
      "admin": false,
      "ruta": "/leads"
    },
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    },
    {
      "menu": "visitas",
      "submenu": null,
      "admin": false,
      "ruta": "/gestion-de-visitas"
    },
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    },
    {
      "menu": "estado-de-flota",
      "submenu": null,
      "admin": false,
      "ruta": "/estado-de-flota"
    },
    {
      "menu": null,
      "submenu": "agentes",
      "admin": false,
      "ruta": "/onboarding/agentes"
    },
    {
      "menu": null,
      "submenu": "asignaciones",
      "admin": false,
      "ruta": "/onboarding/asignaciones"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": null,
      "submenu": "bitacora-gps",
      "admin": false,
      "ruta": "/integraciones/gps/bitacora"
    },
    {
      "menu": null,
      "submenu": "ctrl-exceso-km",
      "admin": false,
      "ruta": "/integraciones/gps/exceso-km"
    },
    {
      "menu": null,
      "submenu": "cabify",
      "admin": false,
      "ruta": "/integraciones/cabify"
    },
    {
      "menu": null,
      "submenu": "didi",
      "admin": false,
      "ruta": "/integraciones/didi"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-kpis",
      "admin": false,
      "ruta": "/reportes/dashboard-kpis"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-general",
      "admin": false,
      "ruta": "/reportes/dashboard-general"
    },
    {
      "menu": "reportes",
      "submenu": "control-gestores",
      "admin": false,
      "ruta": "/reportes/control-gestores"
    },
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    },
    {
      "menu": null,
      "submenu": "cresium-conductores",
      "admin": false,
      "ruta": "/administracion/cresium-conductores"
    },
    {
      "menu": null,
      "submenu": "sedes",
      "admin": false,
      "ruta": "/administracion/sedes"
    },
    {
      "menu": null,
      "submenu": "telepase-historico",
      "admin": false,
      "ruta": "/multas-telepase/telepase-historico"
    },
    {
      "menu": null,
      "submenu": "multas",
      "admin": false,
      "ruta": "/multas-telepase/multas"
    },
    {
      "menu": "seguimiento-conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/seguimiento-conductores/guias"
    },
    {
      "menu": "seguimiento-conductores",
      "submenu": "escuela-conductores",
      "admin": false,
      "ruta": "/seguimiento-conductores/escuela"
    }
  ],
  "conductores_estados": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": "leads",
      "submenu": null,
      "admin": false,
      "ruta": "/leads"
    },
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    },
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-kpis",
      "admin": false,
      "ruta": "/reportes/dashboard-kpis"
    }
  ],
  "conductores_historial_bajas": [
    {
      "menu": null,
      "submenu": "gestion-vehiculos",
      "admin": false,
      "ruta": "/vehiculos"
    },
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    },
    {
      "menu": null,
      "submenu": "asignaciones",
      "admin": false,
      "ruta": "/onboarding/asignaciones"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": null,
      "submenu": "bitacora-gps",
      "admin": false,
      "ruta": "/integraciones/gps/bitacora"
    },
    {
      "menu": null,
      "submenu": "ctrl-exceso-km",
      "admin": false,
      "ruta": "/integraciones/gps/exceso-km"
    }
  ],
  "conductores_licencias_categorias": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": "leads",
      "submenu": null,
      "admin": false,
      "ruta": "/leads"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    }
  ],
  "conductores_licencias_tipos": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": "leads",
      "submenu": null,
      "admin": false,
      "ruta": "/leads"
    },
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    },
    {
      "menu": "visitas",
      "submenu": null,
      "admin": false,
      "ruta": "/gestion-de-visitas"
    },
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    },
    {
      "menu": "estado-de-flota",
      "submenu": null,
      "admin": false,
      "ruta": "/estado-de-flota"
    },
    {
      "menu": null,
      "submenu": "agentes",
      "admin": false,
      "ruta": "/onboarding/agentes"
    },
    {
      "menu": null,
      "submenu": "asignaciones",
      "admin": false,
      "ruta": "/onboarding/asignaciones"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": null,
      "submenu": "bitacora-gps",
      "admin": false,
      "ruta": "/integraciones/gps/bitacora"
    },
    {
      "menu": null,
      "submenu": "ctrl-exceso-km",
      "admin": false,
      "ruta": "/integraciones/gps/exceso-km"
    },
    {
      "menu": null,
      "submenu": "cabify",
      "admin": false,
      "ruta": "/integraciones/cabify"
    },
    {
      "menu": null,
      "submenu": "didi",
      "admin": false,
      "ruta": "/integraciones/didi"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-kpis",
      "admin": false,
      "ruta": "/reportes/dashboard-kpis"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-general",
      "admin": false,
      "ruta": "/reportes/dashboard-general"
    },
    {
      "menu": "reportes",
      "submenu": "control-gestores",
      "admin": false,
      "ruta": "/reportes/control-gestores"
    },
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    },
    {
      "menu": null,
      "submenu": "cresium-conductores",
      "admin": false,
      "ruta": "/administracion/cresium-conductores"
    },
    {
      "menu": null,
      "submenu": "sedes",
      "admin": false,
      "ruta": "/administracion/sedes"
    },
    {
      "menu": null,
      "submenu": "telepase-historico",
      "admin": false,
      "ruta": "/multas-telepase/telepase-historico"
    },
    {
      "menu": null,
      "submenu": "multas",
      "admin": false,
      "ruta": "/multas-telepase/multas"
    },
    {
      "menu": "seguimiento-conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/seguimiento-conductores/guias"
    },
    {
      "menu": "seguimiento-conductores",
      "submenu": "escuela-conductores",
      "admin": false,
      "ruta": "/seguimiento-conductores/escuela"
    }
  ],
  "conductor_calificaciones": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores/panel"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    }
  ],
  "conductor_emparajamientos": [
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    }
  ],
  "licencias_categorias": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": "leads",
      "submenu": null,
      "admin": false,
      "ruta": "/leads"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    }
  ],
  "licencias_estados": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": "leads",
      "submenu": null,
      "admin": false,
      "ruta": "/leads"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    }
  ],
  "licencias_tipos": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": "leads",
      "submenu": null,
      "admin": false,
      "ruta": "/leads"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    }
  ],
  "estados_civiles": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": "leads",
      "submenu": null,
      "admin": false,
      "ruta": "/leads"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    }
  ],
  "nacionalidades": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": "leads",
      "submenu": null,
      "admin": false,
      "ruta": "/leads"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    }
  ],
  "bonos_referidos": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": "leads",
      "submenu": null,
      "admin": false,
      "ruta": "/leads"
    },
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    },
    {
      "menu": "visitas",
      "submenu": null,
      "admin": false,
      "ruta": "/gestion-de-visitas"
    },
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    },
    {
      "menu": "estado-de-flota",
      "submenu": null,
      "admin": false,
      "ruta": "/estado-de-flota"
    },
    {
      "menu": null,
      "submenu": "agentes",
      "admin": false,
      "ruta": "/onboarding/agentes"
    },
    {
      "menu": null,
      "submenu": "asignaciones",
      "admin": false,
      "ruta": "/onboarding/asignaciones"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": null,
      "submenu": "bitacora-gps",
      "admin": false,
      "ruta": "/integraciones/gps/bitacora"
    },
    {
      "menu": null,
      "submenu": "ctrl-exceso-km",
      "admin": false,
      "ruta": "/integraciones/gps/exceso-km"
    },
    {
      "menu": null,
      "submenu": "cabify",
      "admin": false,
      "ruta": "/integraciones/cabify"
    },
    {
      "menu": null,
      "submenu": "didi",
      "admin": false,
      "ruta": "/integraciones/didi"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-kpis",
      "admin": false,
      "ruta": "/reportes/dashboard-kpis"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-general",
      "admin": false,
      "ruta": "/reportes/dashboard-general"
    },
    {
      "menu": "reportes",
      "submenu": "control-gestores",
      "admin": false,
      "ruta": "/reportes/control-gestores"
    },
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    },
    {
      "menu": null,
      "submenu": "cresium-conductores",
      "admin": false,
      "ruta": "/administracion/cresium-conductores"
    },
    {
      "menu": null,
      "submenu": "sedes",
      "admin": false,
      "ruta": "/administracion/sedes"
    },
    {
      "menu": null,
      "submenu": "telepase-historico",
      "admin": false,
      "ruta": "/multas-telepase/telepase-historico"
    },
    {
      "menu": null,
      "submenu": "multas",
      "admin": false,
      "ruta": "/multas-telepase/multas"
    },
    {
      "menu": "seguimiento-conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/seguimiento-conductores/guias"
    },
    {
      "menu": "seguimiento-conductores",
      "submenu": "escuela-conductores",
      "admin": false,
      "ruta": "/seguimiento-conductores/escuela"
    }
  ],
  "vehiculos": [
    {
      "menu": null,
      "submenu": "gestion-vehiculos",
      "admin": false,
      "ruta": "/vehiculos"
    },
    {
      "menu": null,
      "submenu": "registro-vencimientos",
      "admin": false,
      "ruta": "/vehiculos/vencimientos"
    },
    {
      "menu": null,
      "submenu": "control-combustible",
      "admin": false,
      "ruta": "/vehiculos/control-combustible"
    },
    {
      "menu": null,
      "submenu": "oferta-locacion",
      "admin": false,
      "ruta": "/vehiculos/oferta-locacion"
    },
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": null,
      "submenu": "inventario-movimientos-registrar",
      "admin": false,
      "ruta": "/logistica/inventario/movimientos"
    },
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    },
    {
      "menu": "visitas",
      "submenu": null,
      "admin": false,
      "ruta": "/gestion-de-visitas"
    },
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    },
    {
      "menu": "estado-de-flota",
      "submenu": null,
      "admin": false,
      "ruta": "/estado-de-flota"
    },
    {
      "menu": null,
      "submenu": "agentes",
      "admin": false,
      "ruta": "/onboarding/agentes"
    },
    {
      "menu": null,
      "submenu": "asignaciones",
      "admin": false,
      "ruta": "/onboarding/asignaciones"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": null,
      "submenu": "bitacora-gps",
      "admin": false,
      "ruta": "/integraciones/gps/bitacora"
    },
    {
      "menu": null,
      "submenu": "ctrl-exceso-km",
      "admin": false,
      "ruta": "/integraciones/gps/exceso-km"
    },
    {
      "menu": null,
      "submenu": "cabify",
      "admin": false,
      "ruta": "/integraciones/cabify"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-kpis",
      "admin": false,
      "ruta": "/reportes/dashboard-kpis"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-general",
      "admin": false,
      "ruta": "/reportes/dashboard-general"
    },
    {
      "menu": "reportes",
      "submenu": "control-gestores",
      "admin": false,
      "ruta": "/reportes/control-gestores"
    },
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    },
    {
      "menu": null,
      "submenu": "telepase-historico",
      "admin": false,
      "ruta": "/multas-telepase/telepase-historico"
    },
    {
      "menu": null,
      "submenu": "multas",
      "admin": false,
      "ruta": "/multas-telepase/multas"
    },
    {
      "menu": "seguimiento-conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/seguimiento-conductores/guias"
    }
  ],
  "vehiculos_estados": [
    {
      "menu": null,
      "submenu": "gestion-vehiculos",
      "admin": false,
      "ruta": "/vehiculos"
    },
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    },
    {
      "menu": "estado-de-flota",
      "submenu": null,
      "admin": false,
      "ruta": "/estado-de-flota"
    },
    {
      "menu": null,
      "submenu": "agentes",
      "admin": false,
      "ruta": "/onboarding/agentes"
    },
    {
      "menu": null,
      "submenu": "asignaciones",
      "admin": false,
      "ruta": "/onboarding/asignaciones"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-general",
      "admin": false,
      "ruta": "/reportes/dashboard-general"
    }
  ],
  "vehiculos_tipos": [
    {
      "menu": null,
      "submenu": "gestion-vehiculos",
      "admin": false,
      "ruta": "/vehiculos"
    },
    {
      "menu": null,
      "submenu": "registro-vencimientos",
      "admin": false,
      "ruta": "/vehiculos/vencimientos"
    },
    {
      "menu": null,
      "submenu": "control-combustible",
      "admin": false,
      "ruta": "/vehiculos/control-combustible"
    },
    {
      "menu": null,
      "submenu": "oferta-locacion",
      "admin": false,
      "ruta": "/vehiculos/oferta-locacion"
    },
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": null,
      "submenu": "inventario-movimientos-registrar",
      "admin": false,
      "ruta": "/logistica/inventario/movimientos"
    },
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    },
    {
      "menu": "visitas",
      "submenu": null,
      "admin": false,
      "ruta": "/gestion-de-visitas"
    },
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    },
    {
      "menu": "estado-de-flota",
      "submenu": null,
      "admin": false,
      "ruta": "/estado-de-flota"
    },
    {
      "menu": null,
      "submenu": "agentes",
      "admin": false,
      "ruta": "/onboarding/agentes"
    },
    {
      "menu": null,
      "submenu": "asignaciones",
      "admin": false,
      "ruta": "/onboarding/asignaciones"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": null,
      "submenu": "bitacora-gps",
      "admin": false,
      "ruta": "/integraciones/gps/bitacora"
    },
    {
      "menu": null,
      "submenu": "ctrl-exceso-km",
      "admin": false,
      "ruta": "/integraciones/gps/exceso-km"
    },
    {
      "menu": null,
      "submenu": "cabify",
      "admin": false,
      "ruta": "/integraciones/cabify"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-kpis",
      "admin": false,
      "ruta": "/reportes/dashboard-kpis"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-general",
      "admin": false,
      "ruta": "/reportes/dashboard-general"
    },
    {
      "menu": "reportes",
      "submenu": "control-gestores",
      "admin": false,
      "ruta": "/reportes/control-gestores"
    },
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    },
    {
      "menu": null,
      "submenu": "telepase-historico",
      "admin": false,
      "ruta": "/multas-telepase/telepase-historico"
    },
    {
      "menu": null,
      "submenu": "multas",
      "admin": false,
      "ruta": "/multas-telepase/multas"
    },
    {
      "menu": "seguimiento-conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/seguimiento-conductores/guias"
    }
  ],
  "combustibles_tipos": [
    {
      "menu": null,
      "submenu": "gestion-vehiculos",
      "admin": false,
      "ruta": "/vehiculos"
    },
    {
      "menu": null,
      "submenu": "registro-vencimientos",
      "admin": false,
      "ruta": "/vehiculos/vencimientos"
    },
    {
      "menu": null,
      "submenu": "control-combustible",
      "admin": false,
      "ruta": "/vehiculos/control-combustible"
    },
    {
      "menu": null,
      "submenu": "oferta-locacion",
      "admin": false,
      "ruta": "/vehiculos/oferta-locacion"
    },
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": null,
      "submenu": "inventario-movimientos-registrar",
      "admin": false,
      "ruta": "/logistica/inventario/movimientos"
    },
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    },
    {
      "menu": "visitas",
      "submenu": null,
      "admin": false,
      "ruta": "/gestion-de-visitas"
    },
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    },
    {
      "menu": "estado-de-flota",
      "submenu": null,
      "admin": false,
      "ruta": "/estado-de-flota"
    },
    {
      "menu": null,
      "submenu": "agentes",
      "admin": false,
      "ruta": "/onboarding/agentes"
    },
    {
      "menu": null,
      "submenu": "asignaciones",
      "admin": false,
      "ruta": "/onboarding/asignaciones"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": null,
      "submenu": "bitacora-gps",
      "admin": false,
      "ruta": "/integraciones/gps/bitacora"
    },
    {
      "menu": null,
      "submenu": "ctrl-exceso-km",
      "admin": false,
      "ruta": "/integraciones/gps/exceso-km"
    },
    {
      "menu": null,
      "submenu": "cabify",
      "admin": false,
      "ruta": "/integraciones/cabify"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-kpis",
      "admin": false,
      "ruta": "/reportes/dashboard-kpis"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-general",
      "admin": false,
      "ruta": "/reportes/dashboard-general"
    },
    {
      "menu": "reportes",
      "submenu": "control-gestores",
      "admin": false,
      "ruta": "/reportes/control-gestores"
    },
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    },
    {
      "menu": null,
      "submenu": "telepase-historico",
      "admin": false,
      "ruta": "/multas-telepase/telepase-historico"
    },
    {
      "menu": null,
      "submenu": "multas",
      "admin": false,
      "ruta": "/multas-telepase/multas"
    },
    {
      "menu": "seguimiento-conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/seguimiento-conductores/guias"
    }
  ],
  "gps_tipos": [
    {
      "menu": null,
      "submenu": "gestion-vehiculos",
      "admin": false,
      "ruta": "/vehiculos"
    },
    {
      "menu": null,
      "submenu": "registro-vencimientos",
      "admin": false,
      "ruta": "/vehiculos/vencimientos"
    },
    {
      "menu": null,
      "submenu": "control-combustible",
      "admin": false,
      "ruta": "/vehiculos/control-combustible"
    },
    {
      "menu": null,
      "submenu": "oferta-locacion",
      "admin": false,
      "ruta": "/vehiculos/oferta-locacion"
    },
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": null,
      "submenu": "inventario-movimientos-registrar",
      "admin": false,
      "ruta": "/logistica/inventario/movimientos"
    },
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    },
    {
      "menu": "visitas",
      "submenu": null,
      "admin": false,
      "ruta": "/gestion-de-visitas"
    },
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    },
    {
      "menu": "estado-de-flota",
      "submenu": null,
      "admin": false,
      "ruta": "/estado-de-flota"
    },
    {
      "menu": null,
      "submenu": "agentes",
      "admin": false,
      "ruta": "/onboarding/agentes"
    },
    {
      "menu": null,
      "submenu": "asignaciones",
      "admin": false,
      "ruta": "/onboarding/asignaciones"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": null,
      "submenu": "bitacora-gps",
      "admin": false,
      "ruta": "/integraciones/gps/bitacora"
    },
    {
      "menu": null,
      "submenu": "ctrl-exceso-km",
      "admin": false,
      "ruta": "/integraciones/gps/exceso-km"
    },
    {
      "menu": null,
      "submenu": "cabify",
      "admin": false,
      "ruta": "/integraciones/cabify"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-kpis",
      "admin": false,
      "ruta": "/reportes/dashboard-kpis"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-general",
      "admin": false,
      "ruta": "/reportes/dashboard-general"
    },
    {
      "menu": "reportes",
      "submenu": "control-gestores",
      "admin": false,
      "ruta": "/reportes/control-gestores"
    },
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    },
    {
      "menu": null,
      "submenu": "telepase-historico",
      "admin": false,
      "ruta": "/multas-telepase/telepase-historico"
    },
    {
      "menu": null,
      "submenu": "multas",
      "admin": false,
      "ruta": "/multas-telepase/multas"
    },
    {
      "menu": "seguimiento-conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/seguimiento-conductores/guias"
    }
  ],
  "vehiculos_estado_historial": [
    {
      "menu": null,
      "submenu": "gestion-vehiculos",
      "admin": false,
      "ruta": "/vehiculos"
    }
  ],
  "vehiculos_gnc_historial": [
    {
      "menu": null,
      "submenu": "gestion-vehiculos",
      "admin": false,
      "ruta": "/vehiculos"
    },
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    },
    {
      "menu": null,
      "submenu": "asignaciones",
      "admin": false,
      "ruta": "/onboarding/asignaciones"
    },
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "vehiculos_telepase_historial": [
    {
      "menu": null,
      "submenu": "gestion-vehiculos",
      "admin": false,
      "ruta": "/vehiculos"
    }
  ],
  "vehiculos_guia_historial": [
    {
      "menu": "reportes",
      "submenu": "control-gestores",
      "admin": false,
      "ruta": "/reportes/control-gestores"
    }
  ],
  "vehiculos_notas": [
    {
      "menu": null,
      "submenu": "gestion-vehiculos",
      "admin": false,
      "ruta": "/vehiculos"
    }
  ],
  "vehiculos_titulares": [
    {
      "menu": null,
      "submenu": "gestion-vehiculos",
      "admin": false,
      "ruta": "/vehiculos"
    }
  ],
  "vehiculos_turnos_ocupados": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": null,
      "submenu": "asignaciones",
      "admin": false,
      "ruta": "/onboarding/asignaciones"
    }
  ],
  "historial_vehiculos": [
    {
      "menu": null,
      "submenu": "gestion-vehiculos",
      "admin": false,
      "ruta": "/vehiculos"
    },
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    },
    {
      "menu": "estado-de-flota",
      "submenu": null,
      "admin": false,
      "ruta": "/estado-de-flota"
    },
    {
      "menu": null,
      "submenu": "agentes",
      "admin": false,
      "ruta": "/onboarding/agentes"
    },
    {
      "menu": null,
      "submenu": "asignaciones",
      "admin": false,
      "ruta": "/onboarding/asignaciones"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-general",
      "admin": false,
      "ruta": "/reportes/dashboard-general"
    },
    {
      "menu": "reportes",
      "submenu": "control-gestores",
      "admin": false,
      "ruta": "/reportes/control-gestores"
    }
  ],
  "vencimientos": [
    {
      "menu": null,
      "submenu": "gestion-vehiculos",
      "admin": false,
      "ruta": "/vehiculos"
    },
    {
      "menu": null,
      "submenu": "registro-vencimientos",
      "admin": false,
      "ruta": "/vehiculos/vencimientos"
    }
  ],
  "asignaciones": [
    {
      "menu": null,
      "submenu": "gestion-vehiculos",
      "admin": false,
      "ruta": "/vehiculos"
    },
    {
      "menu": null,
      "submenu": "control-combustible",
      "admin": false,
      "ruta": "/vehiculos/control-combustible"
    },
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": "leads",
      "submenu": null,
      "admin": false,
      "ruta": "/leads"
    },
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    },
    {
      "menu": "visitas",
      "submenu": null,
      "admin": false,
      "ruta": "/gestion-de-visitas"
    },
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    },
    {
      "menu": "estado-de-flota",
      "submenu": null,
      "admin": false,
      "ruta": "/estado-de-flota"
    },
    {
      "menu": null,
      "submenu": "agentes",
      "admin": false,
      "ruta": "/onboarding/agentes"
    },
    {
      "menu": null,
      "submenu": "asignaciones",
      "admin": false,
      "ruta": "/onboarding/asignaciones"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": null,
      "submenu": "ctrl-exceso-km",
      "admin": false,
      "ruta": "/integraciones/gps/exceso-km"
    },
    {
      "menu": null,
      "submenu": "cabify",
      "admin": false,
      "ruta": "/integraciones/cabify"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-kpis",
      "admin": false,
      "ruta": "/reportes/dashboard-kpis"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-general",
      "admin": false,
      "ruta": "/reportes/dashboard-general"
    },
    {
      "menu": "reportes",
      "submenu": "control-gestores",
      "admin": false,
      "ruta": "/reportes/control-gestores"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-marketing",
      "admin": false,
      "ruta": "/reportes/dashboard-marketing"
    },
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    },
    {
      "menu": null,
      "submenu": "telepase-historico",
      "admin": false,
      "ruta": "/multas-telepase/telepase-historico"
    },
    {
      "menu": null,
      "submenu": "multas",
      "admin": false,
      "ruta": "/multas-telepase/multas"
    }
  ],
  "asignaciones_conductores": [
    {
      "menu": null,
      "submenu": "gestion-vehiculos",
      "admin": false,
      "ruta": "/vehiculos"
    },
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": "leads",
      "submenu": null,
      "admin": false,
      "ruta": "/leads"
    },
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    },
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    },
    {
      "menu": "estado-de-flota",
      "submenu": null,
      "admin": false,
      "ruta": "/estado-de-flota"
    },
    {
      "menu": null,
      "submenu": "agentes",
      "admin": false,
      "ruta": "/onboarding/agentes"
    },
    {
      "menu": null,
      "submenu": "asignaciones",
      "admin": false,
      "ruta": "/onboarding/asignaciones"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": null,
      "submenu": "bitacora-gps",
      "admin": false,
      "ruta": "/integraciones/gps/bitacora"
    },
    {
      "menu": null,
      "submenu": "ctrl-exceso-km",
      "admin": false,
      "ruta": "/integraciones/gps/exceso-km"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-kpis",
      "admin": false,
      "ruta": "/reportes/dashboard-kpis"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-general",
      "admin": false,
      "ruta": "/reportes/dashboard-general"
    },
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    },
    {
      "menu": "seguimiento-conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/seguimiento-conductores/guias"
    }
  ],
  "devoluciones": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": null,
      "submenu": "asignaciones",
      "admin": false,
      "ruta": "/onboarding/asignaciones"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    }
  ],
  "horarios_conduccion": [
    {
      "menu": null,
      "submenu": "gestion-vehiculos",
      "admin": false,
      "ruta": "/vehiculos"
    },
    {
      "menu": null,
      "submenu": "control-combustible",
      "admin": false,
      "ruta": "/vehiculos/control-combustible"
    },
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": "leads",
      "submenu": null,
      "admin": false,
      "ruta": "/leads"
    },
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    },
    {
      "menu": "visitas",
      "submenu": null,
      "admin": false,
      "ruta": "/gestion-de-visitas"
    },
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    },
    {
      "menu": "estado-de-flota",
      "submenu": null,
      "admin": false,
      "ruta": "/estado-de-flota"
    },
    {
      "menu": null,
      "submenu": "agentes",
      "admin": false,
      "ruta": "/onboarding/agentes"
    },
    {
      "menu": null,
      "submenu": "asignaciones",
      "admin": false,
      "ruta": "/onboarding/asignaciones"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": null,
      "submenu": "ctrl-exceso-km",
      "admin": false,
      "ruta": "/integraciones/gps/exceso-km"
    },
    {
      "menu": null,
      "submenu": "cabify",
      "admin": false,
      "ruta": "/integraciones/cabify"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-kpis",
      "admin": false,
      "ruta": "/reportes/dashboard-kpis"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-general",
      "admin": false,
      "ruta": "/reportes/dashboard-general"
    },
    {
      "menu": "reportes",
      "submenu": "control-gestores",
      "admin": false,
      "ruta": "/reportes/control-gestores"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-marketing",
      "admin": false,
      "ruta": "/reportes/dashboard-marketing"
    },
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    },
    {
      "menu": null,
      "submenu": "telepase-historico",
      "admin": false,
      "ruta": "/multas-telepase/telepase-historico"
    },
    {
      "menu": null,
      "submenu": "multas",
      "admin": false,
      "ruta": "/multas-telepase/multas"
    }
  ],
  "leads": [
    {
      "menu": "leads",
      "submenu": null,
      "admin": false,
      "ruta": "/leads"
    },
    {
      "menu": "visitas",
      "submenu": null,
      "admin": false,
      "ruta": "/gestion-de-visitas"
    },
    {
      "menu": null,
      "submenu": "asignaciones",
      "admin": false,
      "ruta": "/onboarding/asignaciones"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-general",
      "admin": false,
      "ruta": "/reportes/dashboard-general"
    },
    {
      "menu": "reportes",
      "submenu": "control-gestores",
      "admin": false,
      "ruta": "/reportes/control-gestores"
    },
    {
      "menu": null,
      "submenu": "riesgo-bcra",
      "admin": false,
      "ruta": "/parametros/riesgo-bcra"
    }
  ],
  "parejas_lead": [
    {
      "menu": "leads",
      "submenu": null,
      "admin": false,
      "ruta": "/leads"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    }
  ],
  "programaciones_onboarding": [
    {
      "menu": "leads",
      "submenu": null,
      "admin": false,
      "ruta": "/leads"
    },
    {
      "menu": null,
      "submenu": "asignaciones",
      "admin": false,
      "ruta": "/onboarding/asignaciones"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    },
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "v_programaciones_onboarding": [
    {
      "menu": "leads",
      "submenu": null,
      "admin": false,
      "ruta": "/leads"
    },
    {
      "menu": "estado-de-flota",
      "submenu": null,
      "admin": false,
      "ruta": "/estado-de-flota"
    },
    {
      "menu": null,
      "submenu": "agentes",
      "admin": false,
      "ruta": "/onboarding/agentes"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    }
  ],
  "incidencias": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores/panel"
    },
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    },
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": null,
      "submenu": "ctrl-exceso-km",
      "admin": false,
      "ruta": "/integraciones/gps/exceso-km"
    },
    {
      "menu": null,
      "submenu": "telepase-historico",
      "admin": false,
      "ruta": "/multas-telepase/telepase-historico"
    },
    {
      "menu": null,
      "submenu": "multas",
      "admin": false,
      "ruta": "/multas-telepase/multas"
    }
  ],
  "v_incidencias_completas": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores/panel"
    },
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    }
  ],
  "incidencias_estados": [
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    },
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    },
    {
      "menu": null,
      "submenu": "ctrl-exceso-km",
      "admin": false,
      "ruta": "/integraciones/gps/exceso-km"
    },
    {
      "menu": null,
      "submenu": "telepase-historico",
      "admin": false,
      "ruta": "/multas-telepase/telepase-historico"
    },
    {
      "menu": null,
      "submenu": "multas",
      "admin": false,
      "ruta": "/multas-telepase/multas"
    }
  ],
  "penalidades": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    },
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": null,
      "submenu": "ctrl-exceso-km",
      "admin": false,
      "ruta": "/integraciones/gps/exceso-km"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-kpis",
      "admin": false,
      "ruta": "/reportes/dashboard-kpis"
    },
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    },
    {
      "menu": null,
      "submenu": "telepase-historico",
      "admin": false,
      "ruta": "/multas-telepase/telepase-historico"
    },
    {
      "menu": null,
      "submenu": "multas",
      "admin": false,
      "ruta": "/multas-telepase/multas"
    }
  ],
  "v_penalidades_completas": [
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    }
  ],
  "penalidades_rechazos": [
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    },
    {
      "menu": null,
      "submenu": "multas",
      "admin": false,
      "ruta": "/multas-telepase/multas"
    }
  ],
  "tipos_cobro_descuento": [
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    },
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    },
    {
      "menu": null,
      "submenu": "ctrl-exceso-km",
      "admin": false,
      "ruta": "/integraciones/gps/exceso-km"
    },
    {
      "menu": null,
      "submenu": "telepase-historico",
      "admin": false,
      "ruta": "/multas-telepase/telepase-historico"
    },
    {
      "menu": null,
      "submenu": "multas",
      "admin": false,
      "ruta": "/multas-telepase/multas"
    }
  ],
  "tipos_penalidad": [
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    }
  ],
  "siniestros": [
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    },
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "v_siniestros_completos": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores/panel"
    },
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    },
    {
      "menu": "estado-de-flota",
      "submenu": null,
      "admin": false,
      "ruta": "/estado-de-flota"
    },
    {
      "menu": null,
      "submenu": "agentes",
      "admin": false,
      "ruta": "/onboarding/agentes"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-kpis",
      "admin": false,
      "ruta": "/reportes/dashboard-kpis"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-general",
      "admin": false,
      "ruta": "/reportes/dashboard-general"
    }
  ],
  "siniestros_categorias": [
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    }
  ],
  "siniestros_estados": [
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    }
  ],
  "siniestros_seguimientos": [
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    }
  ],
  "seguros": [
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    }
  ],
  "multas_historico": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores/panel"
    },
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    },
    {
      "menu": "estado-de-flota",
      "submenu": null,
      "admin": false,
      "ruta": "/estado-de-flota"
    },
    {
      "menu": null,
      "submenu": "agentes",
      "admin": false,
      "ruta": "/onboarding/agentes"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-general",
      "admin": false,
      "ruta": "/reportes/dashboard-general"
    },
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    },
    {
      "menu": null,
      "submenu": "multas",
      "admin": false,
      "ruta": "/multas-telepase/multas"
    }
  ],
  "telepase_historico": [
    {
      "menu": null,
      "submenu": "telepase-historico",
      "admin": false,
      "ruta": "/multas-telepase/telepase-historico"
    }
  ],
  "guias_historial_semanal": [
    {
      "menu": "seguimiento-conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/seguimiento-conductores/guias"
    }
  ],
  "guias_acciones_implementadas": [
    {
      "menu": "seguimiento-conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/seguimiento-conductores/guias"
    }
  ],
  "visitas": [
    {
      "menu": "visitas",
      "submenu": null,
      "admin": false,
      "ruta": "/gestion-de-visitas"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    }
  ],
  "visitas_atendedores": [
    {
      "menu": "visitas",
      "submenu": null,
      "admin": false,
      "ruta": "/gestion-de-visitas"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    }
  ],
  "visitas_categorias": [
    {
      "menu": "visitas",
      "submenu": null,
      "admin": false,
      "ruta": "/gestion-de-visitas"
    }
  ],
  "visitas_motivos": [
    {
      "menu": "visitas",
      "submenu": null,
      "admin": false,
      "ruta": "/gestion-de-visitas"
    }
  ],
  "visitas_horarios": [
    {
      "menu": "visitas",
      "submenu": null,
      "admin": false,
      "ruta": "/gestion-de-visitas"
    }
  ],
  "visitas_motivo_atendedor": [
    {
      "menu": "visitas",
      "submenu": null,
      "admin": false,
      "ruta": "/gestion-de-visitas"
    }
  ],
  "productos": [
    {
      "menu": null,
      "submenu": "productos",
      "admin": false,
      "ruta": "/logistica/productos"
    },
    {
      "menu": null,
      "submenu": "inventario-dashboard",
      "admin": false,
      "ruta": "/logistica/inventario/dashboard"
    },
    {
      "menu": null,
      "submenu": "inventario-movimientos-registrar",
      "admin": false,
      "ruta": "/logistica/inventario/movimientos"
    },
    {
      "menu": null,
      "submenu": "inventario-control-movimientos",
      "admin": false,
      "ruta": "/logistica/inventario/control-movimientos"
    },
    {
      "menu": null,
      "submenu": "inventario-pedidos",
      "admin": false,
      "ruta": "/logistica/inventario/pedidos"
    }
  ],
  "productos_estados": [
    {
      "menu": null,
      "submenu": "productos",
      "admin": false,
      "ruta": "/logistica/productos"
    }
  ],
  "categorias": [
    {
      "menu": null,
      "submenu": "productos",
      "admin": false,
      "ruta": "/logistica/productos"
    }
  ],
  "unidades_medida": [
    {
      "menu": null,
      "submenu": "productos",
      "admin": false,
      "ruta": "/logistica/productos"
    }
  ],
  "inventario": [
    {
      "menu": null,
      "submenu": "productos",
      "admin": false,
      "ruta": "/logistica/productos"
    },
    {
      "menu": null,
      "submenu": "proveedores",
      "admin": false,
      "ruta": "/logistica/proveedores"
    },
    {
      "menu": null,
      "submenu": "inventario-movimientos-registrar",
      "admin": false,
      "ruta": "/logistica/inventario/movimientos"
    },
    {
      "menu": null,
      "submenu": "inventario-asignaciones",
      "admin": false,
      "ruta": "/logistica/inventario/asignaciones-activas"
    }
  ],
  "inventario_disponible_detallado": [
    {
      "menu": null,
      "submenu": "productos",
      "admin": false,
      "ruta": "/logistica/productos"
    },
    {
      "menu": null,
      "submenu": "proveedores",
      "admin": false,
      "ruta": "/logistica/proveedores"
    },
    {
      "menu": null,
      "submenu": "inventario-movimientos-registrar",
      "admin": false,
      "ruta": "/logistica/inventario/movimientos"
    },
    {
      "menu": null,
      "submenu": "inventario-asignaciones",
      "admin": false,
      "ruta": "/logistica/inventario/asignaciones-activas"
    }
  ],
  "inventario_total_por_producto": [
    {
      "menu": null,
      "submenu": "productos",
      "admin": false,
      "ruta": "/logistica/productos"
    },
    {
      "menu": null,
      "submenu": "proveedores",
      "admin": false,
      "ruta": "/logistica/proveedores"
    },
    {
      "menu": null,
      "submenu": "inventario-movimientos-registrar",
      "admin": false,
      "ruta": "/logistica/inventario/movimientos"
    },
    {
      "menu": null,
      "submenu": "inventario-asignaciones",
      "admin": false,
      "ruta": "/logistica/inventario/asignaciones-activas"
    }
  ],
  "movimientos": [
    {
      "menu": null,
      "submenu": "inventario-movimientos-registrar",
      "admin": false,
      "ruta": "/logistica/inventario/movimientos"
    },
    {
      "menu": null,
      "submenu": "inventario-control-movimientos",
      "admin": false,
      "ruta": "/logistica/inventario/control-movimientos"
    },
    {
      "menu": null,
      "submenu": "inventario-historial",
      "admin": false,
      "ruta": "/logistica/inventario/historial"
    },
    {
      "menu": null,
      "submenu": "inventario-pedidos",
      "admin": false,
      "ruta": "/logistica/inventario/pedidos"
    }
  ],
  "pedidos_inventario": [
    {
      "menu": null,
      "submenu": "inventario-movimientos-registrar",
      "admin": false,
      "ruta": "/logistica/inventario/movimientos"
    }
  ],
  "pedido_items": [
    {
      "menu": null,
      "submenu": "productos",
      "admin": false,
      "ruta": "/logistica/productos"
    },
    {
      "menu": null,
      "submenu": "inventario-movimientos-registrar",
      "admin": false,
      "ruta": "/logistica/inventario/movimientos"
    }
  ],
  "pedido_seguimiento": [
    {
      "menu": null,
      "submenu": "inventario-control-movimientos",
      "admin": false,
      "ruta": "/logistica/inventario/control-movimientos"
    },
    {
      "menu": null,
      "submenu": "inventario-pedidos",
      "admin": false,
      "ruta": "/logistica/inventario/pedidos"
    }
  ],
  "proveedores": [
    {
      "menu": null,
      "submenu": "proveedores",
      "admin": false,
      "ruta": "/logistica/proveedores"
    },
    {
      "menu": null,
      "submenu": "inventario-movimientos-registrar",
      "admin": false,
      "ruta": "/logistica/inventario/movimientos"
    },
    {
      "menu": null,
      "submenu": "inventario-control-movimientos",
      "admin": false,
      "ruta": "/logistica/inventario/control-movimientos"
    },
    {
      "menu": null,
      "submenu": "inventario-pedidos",
      "admin": false,
      "ruta": "/logistica/inventario/pedidos"
    }
  ],
  "v_stock_productos": [
    {
      "menu": null,
      "submenu": "inventario-dashboard",
      "admin": false,
      "ruta": "/logistica/inventario/dashboard"
    },
    {
      "menu": null,
      "submenu": "inventario-control-movimientos",
      "admin": false,
      "ruta": "/logistica/inventario/control-movimientos"
    },
    {
      "menu": null,
      "submenu": "inventario-pedidos",
      "admin": false,
      "ruta": "/logistica/inventario/pedidos"
    }
  ],
  "v_entradas_en_transito": [
    {
      "menu": null,
      "submenu": "inventario-dashboard",
      "admin": false,
      "ruta": "/logistica/inventario/dashboard"
    },
    {
      "menu": null,
      "submenu": "inventario-control-movimientos",
      "admin": false,
      "ruta": "/logistica/inventario/control-movimientos"
    },
    {
      "menu": null,
      "submenu": "inventario-pedidos",
      "admin": false,
      "ruta": "/logistica/inventario/pedidos"
    }
  ],
  "v_movimientos_pendientes": [
    {
      "menu": null,
      "submenu": "inventario-dashboard",
      "admin": false,
      "ruta": "/logistica/inventario/dashboard"
    },
    {
      "menu": null,
      "submenu": "inventario-control-movimientos",
      "admin": false,
      "ruta": "/logistica/inventario/control-movimientos"
    },
    {
      "menu": null,
      "submenu": "inventario-pedidos",
      "admin": false,
      "ruta": "/logistica/inventario/pedidos"
    }
  ],
  "v_pedidos_en_transito": [
    {
      "menu": null,
      "submenu": "inventario-dashboard",
      "admin": false,
      "ruta": "/logistica/inventario/dashboard"
    },
    {
      "menu": null,
      "submenu": "inventario-control-movimientos",
      "admin": false,
      "ruta": "/logistica/inventario/control-movimientos"
    },
    {
      "menu": null,
      "submenu": "inventario-pedidos",
      "admin": false,
      "ruta": "/logistica/inventario/pedidos"
    }
  ],
  "v_herramientas_por_conductor": [
    {
      "menu": null,
      "submenu": "productos",
      "admin": false,
      "ruta": "/logistica/productos"
    },
    {
      "menu": null,
      "submenu": "proveedores",
      "admin": false,
      "ruta": "/logistica/proveedores"
    },
    {
      "menu": null,
      "submenu": "inventario-movimientos-registrar",
      "admin": false,
      "ruta": "/logistica/inventario/movimientos"
    },
    {
      "menu": null,
      "submenu": "inventario-asignaciones",
      "admin": false,
      "ruta": "/logistica/inventario/asignaciones-activas"
    }
  ],
  "kpi_diario": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    }
  ],
  "kpi_bajas": [
    {
      "menu": "estado-de-flota",
      "submenu": null,
      "admin": false,
      "ruta": "/estado-de-flota"
    },
    {
      "menu": null,
      "submenu": "agentes",
      "admin": false,
      "ruta": "/onboarding/agentes"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-general",
      "admin": false,
      "ruta": "/reportes/dashboard-general"
    },
    {
      "menu": "reportes",
      "submenu": "control-gestores",
      "admin": false,
      "ruta": "/reportes/control-gestores"
    }
  ],
  "kpi_flota_diaria": [
    {
      "menu": "estado-de-flota",
      "submenu": null,
      "admin": false,
      "ruta": "/estado-de-flota"
    },
    {
      "menu": null,
      "submenu": "agentes",
      "admin": false,
      "ruta": "/onboarding/agentes"
    }
  ],
  "kpi_foto_tarjetas": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    }
  ],
  "cabify_historico": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": "seguimiento-conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/seguimiento-conductores/guias"
    },
    {
      "menu": "seguimiento-conductores",
      "submenu": "escuela-conductores",
      "admin": false,
      "ruta": "/seguimiento-conductores/escuela"
    }
  ],
  "cabify_historico_bariloche": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": "seguimiento-conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/seguimiento-conductores/guias"
    },
    {
      "menu": "seguimiento-conductores",
      "submenu": "escuela-conductores",
      "admin": false,
      "ruta": "/seguimiento-conductores/escuela"
    }
  ],
  "geotab_historico": [
    {
      "menu": null,
      "submenu": "control-combustible",
      "admin": false,
      "ruta": "/vehiculos/control-combustible"
    }
  ],
  "geotab_bitacora": [
    {
      "menu": null,
      "submenu": "control-combustible",
      "admin": false,
      "ruta": "/vehiculos/control-combustible"
    }
  ],
  "geotab_excesos_velocidad": [
    {
      "menu": null,
      "submenu": "ctrl-exceso-vel",
      "admin": false,
      "ruta": "/integraciones/gps"
    }
  ],
  "geotab_fault_data": [
    {
      "menu": null,
      "submenu": "alertas-mantenimiento",
      "admin": false,
      "ruta": "/vehiculos/alertas-mantenimiento"
    }
  ],
  "geotab_fillups": [
    {
      "menu": null,
      "submenu": "control-combustible",
      "admin": false,
      "ruta": "/vehiculos/control-combustible"
    }
  ],
  "geotab_fuel_summary": [
    {
      "menu": null,
      "submenu": "control-combustible",
      "admin": false,
      "ruta": "/vehiculos/control-combustible"
    }
  ],
  "uss_historico": [
    {
      "menu": null,
      "submenu": "gestion-vehiculos",
      "admin": false,
      "ruta": "/vehiculos"
    }
  ],
  "uss_excesos_velocidad": [
    {
      "menu": null,
      "submenu": "ctrl-exceso-vel",
      "admin": false,
      "ruta": "/integraciones/gps"
    }
  ],
  "wialon_bitacora": [
    {
      "menu": null,
      "submenu": "bitacora-gps",
      "admin": false,
      "ruta": "/integraciones/gps/bitacora"
    }
  ],
  "bitacora_checklist": [
    {
      "menu": null,
      "submenu": "bitacora-gps",
      "admin": false,
      "ruta": "/integraciones/gps/bitacora"
    }
  ],
  "mediciones_rutas": [
    {
      "menu": "leads",
      "submenu": null,
      "admin": false,
      "ruta": "/leads"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    }
  ],
  "sedes": [
    {
      "menu": null,
      "submenu": "gestion-vehiculos",
      "admin": false,
      "ruta": "/vehiculos"
    },
    {
      "menu": null,
      "submenu": "registro-vencimientos",
      "admin": false,
      "ruta": "/vehiculos/vencimientos"
    },
    {
      "menu": null,
      "submenu": "alertas-mantenimiento",
      "admin": false,
      "ruta": "/vehiculos/alertas-mantenimiento"
    },
    {
      "menu": null,
      "submenu": "control-combustible",
      "admin": false,
      "ruta": "/vehiculos/control-combustible"
    },
    {
      "menu": null,
      "submenu": "oferta-locacion",
      "admin": false,
      "ruta": "/vehiculos/oferta-locacion"
    },
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": "leads",
      "submenu": null,
      "admin": false,
      "ruta": "/leads"
    },
    {
      "menu": null,
      "submenu": "productos",
      "admin": false,
      "ruta": "/logistica/productos"
    },
    {
      "menu": null,
      "submenu": "proveedores",
      "admin": false,
      "ruta": "/logistica/proveedores"
    },
    {
      "menu": null,
      "submenu": "inventario-dashboard",
      "admin": false,
      "ruta": "/logistica/inventario/dashboard"
    },
    {
      "menu": null,
      "submenu": "inventario-movimientos-registrar",
      "admin": false,
      "ruta": "/logistica/inventario/movimientos"
    },
    {
      "menu": null,
      "submenu": "inventario-control-movimientos",
      "admin": false,
      "ruta": "/logistica/inventario/control-movimientos"
    },
    {
      "menu": null,
      "submenu": "inventario-asignaciones",
      "admin": false,
      "ruta": "/logistica/inventario/asignaciones-activas"
    },
    {
      "menu": null,
      "submenu": "inventario-historial",
      "admin": false,
      "ruta": "/logistica/inventario/historial"
    },
    {
      "menu": null,
      "submenu": "inventario-pedidos",
      "admin": false,
      "ruta": "/logistica/inventario/pedidos"
    },
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    },
    {
      "menu": "visitas",
      "submenu": null,
      "admin": false,
      "ruta": "/gestion-de-visitas"
    },
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    },
    {
      "menu": "estado-de-flota",
      "submenu": null,
      "admin": false,
      "ruta": "/estado-de-flota"
    },
    {
      "menu": null,
      "submenu": "agentes",
      "admin": false,
      "ruta": "/onboarding/agentes"
    },
    {
      "menu": null,
      "submenu": "asignaciones",
      "admin": false,
      "ruta": "/onboarding/asignaciones"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": null,
      "submenu": "ctrl-exceso-vel",
      "admin": false,
      "ruta": "/integraciones/gps"
    },
    {
      "menu": null,
      "submenu": "bitacora-gps",
      "admin": false,
      "ruta": "/integraciones/gps/bitacora"
    },
    {
      "menu": null,
      "submenu": "ctrl-exceso-km",
      "admin": false,
      "ruta": "/integraciones/gps/exceso-km"
    },
    {
      "menu": null,
      "submenu": "cabify",
      "admin": false,
      "ruta": "/integraciones/cabify"
    },
    {
      "menu": null,
      "submenu": "didi",
      "admin": false,
      "ruta": "/integraciones/didi"
    },
    {
      "menu": null,
      "submenu": "twochat-llamadas",
      "admin": false,
      "ruta": "/integraciones/2chat/llamadas"
    },
    {
      "menu": null,
      "submenu": "twochat-mensajes",
      "admin": false,
      "ruta": "/integraciones/2chat/mensajes"
    },
    {
      "menu": null,
      "submenu": "twochat-contactos",
      "admin": false,
      "ruta": "/integraciones/2chat/contactos"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-kpis",
      "admin": false,
      "ruta": "/reportes/dashboard-kpis"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-directivo",
      "admin": false,
      "ruta": "/reportes/dashboard-directivo"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-kpis-v2",
      "admin": false,
      "ruta": "/reportes/dashboard-kpis-v2"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-general",
      "admin": false,
      "ruta": "/reportes/dashboard-general"
    },
    {
      "menu": "reportes",
      "submenu": "control-gestores",
      "admin": false,
      "ruta": "/reportes/control-gestores"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-marketing",
      "admin": false,
      "ruta": "/reportes/dashboard-marketing"
    },
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    },
    {
      "menu": null,
      "submenu": "cresium-conductores",
      "admin": false,
      "ruta": "/administracion/cresium-conductores"
    },
    {
      "menu": null,
      "submenu": "gestion-usuarios",
      "admin": false,
      "ruta": "/administracion/gestion-usuarios"
    },
    {
      "menu": null,
      "submenu": "sedes",
      "admin": false,
      "ruta": "/administracion/sedes"
    },
    {
      "menu": null,
      "submenu": "integraciones-tokens",
      "admin": false,
      "ruta": "/administracion/integraciones-tokens"
    },
    {
      "menu": null,
      "submenu": "telepase-historico",
      "admin": false,
      "ruta": "/multas-telepase/telepase-historico"
    },
    {
      "menu": null,
      "submenu": "multas",
      "admin": false,
      "ruta": "/multas-telepase/multas"
    },
    {
      "menu": null,
      "submenu": "parametros-sistema",
      "admin": false,
      "ruta": "/parametros/grupos-flota"
    },
    {
      "menu": null,
      "submenu": "riesgo-bcra",
      "admin": false,
      "ruta": "/parametros/riesgo-bcra"
    },
    {
      "menu": "seguimiento-conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/seguimiento-conductores/guias"
    },
    {
      "menu": "seguimiento-conductores",
      "submenu": "escuela-conductores",
      "admin": false,
      "ruta": "/seguimiento-conductores/escuela"
    }
  ],
  "zonas_peligrosas": [
    {
      "menu": "leads",
      "submenu": null,
      "admin": false,
      "ruta": "/leads"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    },
    {
      "menu": null,
      "submenu": "zonas-peligrosas",
      "admin": false,
      "ruta": "/onboarding/zonas"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    }
  ],
  "zonas_tipos": [
    {
      "menu": null,
      "submenu": "zonas-peligrosas",
      "admin": false,
      "ruta": "/onboarding/zonas"
    }
  ],
  "twochat_contactos": [
    {
      "menu": null,
      "submenu": "twochat-contactos",
      "admin": false,
      "ruta": "/integraciones/2chat/contactos"
    }
  ],
  "twochat_llamadas": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores/panel"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": "reportes",
      "submenu": "control-gestores",
      "admin": false,
      "ruta": "/reportes/control-gestores"
    }
  ],
  "cresium_movimientos": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores/panel"
    },
    {
      "menu": "leads",
      "submenu": null,
      "admin": false,
      "ruta": "/leads"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    },
    {
      "menu": null,
      "submenu": "cresium-conductores",
      "admin": false,
      "ruta": "/administracion/cresium-conductores"
    }
  ],
  "alegra_comprobantes": [
    {
      "menu": null,
      "submenu": "alegra-compras-44dreams",
      "admin": false,
      "ruta": "/integraciones/alegra/44dreams"
    },
    {
      "menu": null,
      "submenu": "alegra-compras-grupocg",
      "admin": false,
      "ruta": "/integraciones/alegra/grupocg"
    }
  ],
  "cabify_efectivo_log": [
    {
      "menu": null,
      "submenu": "cabify",
      "admin": false,
      "ruta": "/integraciones/cabify"
    }
  ],
  "kpi_forecast": [
    {
      "menu": "reportes",
      "submenu": "dashboard-kpis-v2",
      "admin": false,
      "ruta": "/reportes/dashboard-kpis-v2"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-general",
      "admin": false,
      "ruta": "/reportes/dashboard-general"
    }
  ],
  "dashboard_insights": [
    {
      "menu": "reportes",
      "submenu": "dashboard-directivo",
      "admin": false,
      "ruta": "/reportes/dashboard-directivo"
    }
  ],
  "ofertas_locacion": [
    {
      "menu": null,
      "submenu": "gestion-vehiculos",
      "admin": false,
      "ruta": "/vehiculos"
    },
    {
      "menu": null,
      "submenu": "oferta-locacion",
      "admin": false,
      "ruta": "/vehiculos/oferta-locacion"
    }
  ],
  "titulares": [
    {
      "menu": null,
      "submenu": "gestion-vehiculos",
      "admin": false,
      "ruta": "/vehiculos"
    }
  ],
  "v_estado_flota_hoy": [
    {
      "menu": null,
      "submenu": "gestion-vehiculos",
      "admin": false,
      "ruta": "/vehiculos"
    },
    {
      "menu": null,
      "submenu": "registro-vencimientos",
      "admin": false,
      "ruta": "/vehiculos/vencimientos"
    },
    {
      "menu": null,
      "submenu": "control-combustible",
      "admin": false,
      "ruta": "/vehiculos/control-combustible"
    },
    {
      "menu": null,
      "submenu": "oferta-locacion",
      "admin": false,
      "ruta": "/vehiculos/oferta-locacion"
    },
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores"
    },
    {
      "menu": null,
      "submenu": "inventario-movimientos-registrar",
      "admin": false,
      "ruta": "/logistica/inventario/movimientos"
    },
    {
      "menu": "siniestros",
      "submenu": null,
      "admin": false,
      "ruta": "/siniestros"
    },
    {
      "menu": "visitas",
      "submenu": null,
      "admin": false,
      "ruta": "/gestion-de-visitas"
    },
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    },
    {
      "menu": "estado-de-flota",
      "submenu": null,
      "admin": false,
      "ruta": "/estado-de-flota"
    },
    {
      "menu": null,
      "submenu": "agentes",
      "admin": false,
      "ruta": "/onboarding/agentes"
    },
    {
      "menu": null,
      "submenu": "asignaciones",
      "admin": false,
      "ruta": "/onboarding/asignaciones"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": null,
      "submenu": "bitacora-gps",
      "admin": false,
      "ruta": "/integraciones/gps/bitacora"
    },
    {
      "menu": null,
      "submenu": "ctrl-exceso-km",
      "admin": false,
      "ruta": "/integraciones/gps/exceso-km"
    },
    {
      "menu": null,
      "submenu": "cabify",
      "admin": false,
      "ruta": "/integraciones/cabify"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-kpis",
      "admin": false,
      "ruta": "/reportes/dashboard-kpis"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-general",
      "admin": false,
      "ruta": "/reportes/dashboard-general"
    },
    {
      "menu": "reportes",
      "submenu": "control-gestores",
      "admin": false,
      "ruta": "/reportes/control-gestores"
    },
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    },
    {
      "menu": null,
      "submenu": "telepase-historico",
      "admin": false,
      "ruta": "/multas-telepase/telepase-historico"
    },
    {
      "menu": null,
      "submenu": "multas",
      "admin": false,
      "ruta": "/multas-telepase/multas"
    },
    {
      "menu": "seguimiento-conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/seguimiento-conductores/guias"
    }
  ],
  "v_vencimientos_proximos": [
    {
      "menu": null,
      "submenu": "gestion-vehiculos",
      "admin": false,
      "ruta": "/vehiculos"
    },
    {
      "menu": null,
      "submenu": "registro-vencimientos",
      "admin": false,
      "ruta": "/vehiculos/vencimientos"
    }
  ],
  "v_leads_semanales": [
    {
      "menu": "leads",
      "submenu": null,
      "admin": false,
      "ruta": "/leads"
    },
    {
      "menu": "visitas",
      "submenu": null,
      "admin": false,
      "ruta": "/gestion-de-visitas"
    },
    {
      "menu": null,
      "submenu": "asignaciones",
      "admin": false,
      "ruta": "/onboarding/asignaciones"
    },
    {
      "menu": null,
      "submenu": "programacion-entregas",
      "admin": false,
      "ruta": "/onboarding/programacion-v2"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-general",
      "admin": false,
      "ruta": "/reportes/dashboard-general"
    },
    {
      "menu": "reportes",
      "submenu": "control-gestores",
      "admin": false,
      "ruta": "/reportes/control-gestores"
    },
    {
      "menu": null,
      "submenu": "riesgo-bcra",
      "admin": false,
      "ruta": "/parametros/riesgo-bcra"
    }
  ],
  "v_multas_historico": [
    {
      "menu": "conductores",
      "submenu": null,
      "admin": false,
      "ruta": "/conductores/panel"
    },
    {
      "menu": "incidencias",
      "submenu": null,
      "admin": false,
      "ruta": "/incidencias"
    },
    {
      "menu": "estado-de-flota",
      "submenu": null,
      "admin": false,
      "ruta": "/estado-de-flota"
    },
    {
      "menu": null,
      "submenu": "agentes",
      "admin": false,
      "ruta": "/onboarding/agentes"
    },
    {
      "menu": null,
      "submenu": "distribucion-mapa",
      "admin": false,
      "ruta": "/onboarding/distribucion-mapa-v2"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-general",
      "admin": false,
      "ruta": "/reportes/dashboard-general"
    },
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    },
    {
      "menu": null,
      "submenu": "multas",
      "admin": false,
      "ruta": "/multas-telepase/multas"
    }
  ],
  "periodos_facturacion": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "facturacion_conductores": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "facturacion_detalle": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "facturacion_cabify": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "conductores_semana_facturacion": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "saldos_conductores": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "v_ultimo_saldo_conductor": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "control_saldos": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "pagos_conductores": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "abonos_conductores": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "cobros_fraccionados": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "penalidades_cuotas": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "excesos_kilometraje": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "tickets_favor": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "garantias_conductores": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "garantias_pagos": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "garantias_devoluciones": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "garantias_ediciones_historial": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "control_garantias": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "promociones": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "promociones_historial": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "promocion_b1_pagos": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "conceptos_nomina": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ],
  "conceptos_facturacion_historial": [
    {
      "menu": null,
      "submenu": "facturacion",
      "admin": false,
      "ruta": "/administracion/facturacion"
    }
  ]
};

export const PANTALLAS_POR_REPORTE = {
  "dashboard_directivo": [
    {
      "menu": "reportes",
      "submenu": "dashboard-directivo",
      "admin": false,
      "ruta": "/reportes/dashboard-directivo"
    }
  ],
  "dashboard_marketing": [
    {
      "menu": "reportes",
      "submenu": "dashboard-general",
      "admin": false,
      "ruta": "/reportes/dashboard-general"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-marketing",
      "admin": false,
      "ruta": "/reportes/dashboard-marketing"
    }
  ],
  "dashboard_kpis": [
    {
      "menu": "reportes",
      "submenu": "dashboard-kpis-v2",
      "admin": false,
      "ruta": "/reportes/dashboard-kpis-v2"
    },
    {
      "menu": "reportes",
      "submenu": "dashboard-general",
      "admin": false,
      "ruta": "/reportes/dashboard-general"
    }
  ]
};

export const SIN_PANTALLA = [];

// Datasets automáticos (ver lib/tablasFueraMcp.js): tablas de pantallas que no están en
// el catálogo. Sus columnas se leen de la base al arrancar el MCP (lib/tablasAuto.js).
export const PANTALLAS_POR_TABLA_AUTO = {
  "didi_conductores": [
    {
      "menu": null,
      "submenu": "didi",
      "admin": false,
      "ruta": "/integraciones/didi"
    }
  ],
  "didi_semanal": [
    {
      "menu": null,
      "submenu": "didi",
      "admin": false,
      "ruta": "/integraciones/didi"
    }
  ]
};

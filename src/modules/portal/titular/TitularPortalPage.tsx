// Mi Espacio del titular (proveedor de flota): estado de su flota y lo que genera.
//
// Ingreso con documento (solo números: CUIT si es empresa, DNI si es persona) y
// contraseña, igual que el portal del conductor. Funciones en
// sql/portal_titular_login.sql.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDays, differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth,
} from 'date-fns';
import { CalendarDays, Car, Search } from 'lucide-react';
import type { DateRange } from '../../../components/ui/DateRangeSelector';
import type {
  DatosTitular, SemanaTitular, SituacionVehiculo, TitularPortal, TramoAlquiler,
} from './titularPortalService';
import { cargarDatosTitular, restaurarSesionTitular } from './titularPortalService';
import { TitularCambioPassword, TitularLogin } from './TitularIngreso';
import { formatFecha, formatNumero, formatPlata } from '../../../utils/format';
import { DateRangeSelector } from '../../../components/ui/DateRangeSelector';
import { TabsBar } from '../../../components/ui/TabsBar';
import { PatenteBadge } from '../../../components/ui/PatenteBadge';
import { Spinner } from '../../../components/ui/LoadingOverlay';
import logoToshifyWordmarkUrl from '../../../assets/logo-toshify-wordmark.png';
import '../PortalPage.css';
import './TitularPortalPage.css';

// Id del titular que ingresó, para no pedir la contraseña al recargar. Se borra
// con "Salir". La contraseña nunca se guarda.
const TITULAR_SESION_KEY = 'portal_titular_id';

const SITUACION_LABEL: Record<SituacionVehiculo, string> = {
  generando: 'Generando',
  disponible: 'Disponible sin conductor',
  preparacion: 'En preparación',
  taller: 'En taller',
  fuera: 'Fuera de servicio',
};

function leerSesion(): string | null {
  try {
    return localStorage.getItem(TITULAR_SESION_KEY);
  } catch {
    return null;
  }
}

function guardarSesion(titularId: string | null) {
  try {
    if (titularId) localStorage.setItem(TITULAR_SESION_KEY, titularId);
    else localStorage.removeItem(TITULAR_SESION_KEY);
  } catch {
    // Sin localStorage (modo privado): la sesión simplemente no se recuerda.
  }
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function rangoMesActual(): DateRange {
  const hoy = new Date();
  return {
    startDate: format(startOfMonth(hoy), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(hoy), 'yyyy-MM-dd'),
    label: `${MESES[hoy.getMonth()]} ${hoy.getFullYear()}`,
    type: 'month',
  };
}

interface IngresoPeriodo {
  esperado: number;
  cobrado: number;
  cobradoCabify: number;
}

/**
 * Suma lo facturado y cobrado dentro del rango elegido. La facturación es semanal:
 * si el rango corta una semana (un día, un mes que empieza a mitad de semana), se
 * toma la parte proporcional por día.
 */
function ingresosEnRango(semanas: SemanaTitular[], rango: DateRange) {
  const total: IngresoPeriodo = { esperado: 0, cobrado: 0, cobradoCabify: 0 };
  const porVehiculo: Record<string, IngresoPeriodo> = {};
  let hayProrrateo = false;
  let hayAbierta = false;
  let semanasIncluidas = 0;
  let semanasCerradas = 0;

  for (const s of semanas) {
    const desde = s.fechaInicio > rango.startDate ? s.fechaInicio : rango.startDate;
    const hasta = s.fechaFin < rango.endDate ? s.fechaFin : rango.endDate;
    if (desde > hasta) continue;
    const diasSemana = differenceInCalendarDays(parseISO(s.fechaFin), parseISO(s.fechaInicio)) + 1;
    const diasDentro = differenceInCalendarDays(parseISO(hasta), parseISO(desde)) + 1;
    const factor = diasSemana > 0 ? diasDentro / diasSemana : 1;
    if (factor < 1) hayProrrateo = true;
    if (s.abierta) hayAbierta = true;
    semanasIncluidas += 1;
    if (!s.abierta) semanasCerradas += 1;

    total.esperado += s.esperado * factor;
    total.cobrado += s.cobrado * factor;
    total.cobradoCabify += s.cobradoCabify * factor;
    for (const v of Object.values(s.porVehiculo)) {
      const fila = porVehiculo[v.patente]
        ?? (porVehiculo[v.patente] = { esperado: 0, cobrado: 0, cobradoCabify: 0 });
      fila.esperado += v.esperado * factor;
      fila.cobrado += v.cobrado * factor;
      fila.cobradoCabify += v.cobradoCabify * factor;
    }
  }
  // Cobranza sin sentido todavía: el período solo tiene la semana en curso, cuyos
  // cobros se cargan al cierre. Se muestra N/A en vez de un 0% que alarma.
  const cobranzaPendiente = semanasIncluidas > 0 && semanasCerradas === 0;
  return { total, porVehiculo, hayProrrateo, hayAbierta, semanasIncluidas, cobranzaPendiente };
}

/**
 * Días en que el auto tuvo al menos un conductor, sobre los días que estuvo activo
 * dentro del período: desde su activación (o el inicio del período, lo que sea
 * después) hasta hoy (o el fin del período). Dos conductores el mismo día cuentan
 * como un día.
 */
function diasAlquilado(
  tramos: TramoAlquiler[],
  activoDesde: string,
  rango: DateRange,
): { dias: number; total: number } {
  const hoy = format(new Date(), 'yyyy-MM-dd');
  const inicio = activoDesde > rango.startDate ? activoDesde : rango.startDate;
  const fin = rango.endDate < hoy ? rango.endDate : hoy;
  if (fin < inicio) return { dias: 0, total: 0 };
  const total = differenceInCalendarDays(parseISO(fin), parseISO(inicio)) + 1;
  const dias = new Set<string>();
  for (const t of tramos) {
    const desde = t.desde > inicio ? t.desde : inicio;
    const hasta = t.hasta && t.hasta < fin ? t.hasta : fin;
    for (let d = parseISO(desde); format(d, 'yyyy-MM-dd') <= hasta; d = addDays(d, 1)) {
      dias.add(format(d, 'yyyy-MM-dd'));
    }
  }
  return { dias: dias.size, total };
}

/** Minúsculas, sin tildes ni espacios: "En preparación" coincide con "preparacion". */
function normalizarBusqueda(valor: string): string {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '');
}

function porcentaje(parte: number, total: number): string {
  if (total <= 0) return '-';
  return `${formatNumero((parte / total) * 100, 0)}%`;
}

export function TitularPortalPage() {
  const [titular, setTitular] = useState<TitularPortal | null>(null);
  const [datos, setDatos] = useState<DatosTitular | null>(null);
  // Arranca cargando si hay una sesión guardada, para no mostrar el login un instante.
  const [isLoading, setIsLoading] = useState(() => leerSesion() !== null);
  const [errorMsg, setErrorMsg] = useState('');
  const [rango, setRango] = useState<DateRange>(rangoMesActual);
  const [pestana, setPestana] = useState<'vehiculos' | 'historial'>('vehiculos');
  const [busqueda, setBusqueda] = useState('');

  const cargarTablero = useCallback(async (actual: TitularPortal) => {
    setTitular(actual);
    guardarSesion(actual.id);
    if (actual.debeCambiarPassword) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMsg('');
    try {
      setDatos(await cargarDatosTitular(actual.id));
    } catch (error) {
      console.error('No se pudieron cargar los datos del titular:', error);
      setErrorMsg('No se pudieron cargar los datos. Probá de nuevo en unos minutos.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const guardado = leerSesion();
    if (!guardado) return;
    restaurarSesionTitular(guardado)
      .then(encontrado => {
        if (encontrado) return cargarTablero(encontrado);
        guardarSesion(null);
        setIsLoading(false);
      })
      .catch(error => {
        console.error('No se pudo restaurar la sesión del titular:', error);
        setIsLoading(false);
      });
  }, [cargarTablero]);

  const handleSalir = () => {
    guardarSesion(null);
    setTitular(null);
    setDatos(null);
    setErrorMsg('');
    setIsLoading(false);
  };

  const vehiculosVisibles = useMemo(() => {
    const vehiculos = datos?.vehiculos ?? [];
    const texto = normalizarBusqueda(busqueda);
    if (!texto) return vehiculos;
    return vehiculos.filter(v => [v.patente, v.descripcion, SITUACION_LABEL[v.situacion], v.estadoDescripcion]
      .some(campo => normalizarBusqueda(campo).includes(texto)));
  }, [datos, busqueda]);

  const periodo = useMemo(
    () => ingresosEnRango(datos?.semanas ?? [], rango),
    [datos, rango],
  );

  const flota = useMemo(() => {
    const vehiculos = datos?.vehiculos ?? [];
    const generando = vehiculos.filter(v => v.situacion === 'generando').length;
    const operativos = vehiculos.filter(
      v => v.situacion === 'generando' || v.situacion === 'disponible',
    );
    return {
      total: vehiculos.length,
      generando,
      parados: vehiculos.length - generando,
      turnosCubiertos: operativos.reduce((s, v) => s + v.turnosCubiertos, 0),
      turnosTotales: operativos.reduce((s, v) => s + v.turnosTotales, 0),
    };
  }, [datos]);

  // ---------------- Ingreso ----------------
  if (!titular) {
    if (isLoading) return <div className="portal portal-login"><Spinner /></div>;
    return <TitularLogin onIngreso={actual => void cargarTablero(actual)} />;
  }

  if (titular.debeCambiarPassword) {
    return (
      <TitularCambioPassword
        titular={titular}
        onListo={() => void cargarTablero({ ...titular, debeCambiarPassword: false })}
        onSalir={handleSalir}
      />
    );
  }

  if (!datos) {
    return (
      <div className="portal portal-login">
        {errorMsg ? (
          <div className="portal-login-card">
            <p className="titular-error">{errorMsg}</p>
            <button type="button" className="portal-login-btn" onClick={() => void cargarTablero(titular)}>
              Reintentar
            </button>
          </div>
        ) : <Spinner />}
      </div>
    );
  }

  const { total } = periodo;
  const pendiente = Math.max(0, total.esperado - total.cobrado);

  return (
    <div className="titular">
      <header className="titular-header">
        <img src={logoToshifyWordmarkUrl} alt="Toshify" className="titular-header-logo" />
        <div className="titular-header-quien">
          <span className="titular-header-nombre">{titular.nombre}</span>
          <span className="titular-header-cuit">
            {titular.tipo === 'empresa' ? 'CUIT' : 'DNI'} {titular.documento}
          </span>
        </div>
        <button type="button" className="titular-salir" onClick={handleSalir}>Salir</button>
      </header>

      <main className="titular-main">
        <section className="titular-kpis">
          <div className="titular-kpi">
            <span className="titular-kpi-label">Vehículos</span>
            <span className="titular-kpi-valor">{flota.total}</span>
            <span className="titular-kpi-sub">
              <span className="titular-txt-ok">{flota.generando} generando</span>
              {' · '}
              <span className="titular-txt-alerta">{flota.parados} parados</span>
            </span>
          </div>
          <div className="titular-kpi">
            <span className="titular-kpi-label">Ocupación</span>
            <span className="titular-kpi-valor">{porcentaje(flota.generando, flota.total)}</span>
            <span className="titular-kpi-sub">
              Turnos cubiertos: {flota.turnosCubiertos} de {flota.turnosTotales}
            </span>
          </div>
          <div className="titular-kpi">
            <span className="titular-kpi-label">Ingreso esperado</span>
            <span className="titular-kpi-valor">{formatPlata(total.esperado)}</span>
            <span className="titular-kpi-sub">
              {periodo.semanasIncluidas > 0 ? rango.label : 'Sin facturación en el período'}
            </span>
          </div>
          <div className="titular-kpi">
            <span className="titular-kpi-label">Ingreso cobrado</span>
            <span className="titular-kpi-valor">{formatPlata(total.cobrado)}</span>
            <span className="titular-kpi-sub">
              Cabify: {formatPlata(total.cobradoCabify)}
            </span>
          </div>
          <div className="titular-kpi">
            <span className="titular-kpi-label">Cobranza</span>
            <span className="titular-kpi-valor">
              {periodo.cobranzaPendiente ? 'N/A' : porcentaje(total.cobrado, total.esperado)}
            </span>
            <span className="titular-kpi-sub">
              {periodo.cobranzaPendiente
                ? 'Se calcula al cierre'
                : `Pendiente: ${formatPlata(pendiente)}`}
            </span>
          </div>
        </section>

        <section className="titular-bloque">
          <div className="titular-barra">
            <TabsBar
              tabs={[
                { id: 'vehiculos', label: 'Mis vehículos', icon: Car, count: datos.vehiculos.length },
                { id: 'historial', label: 'Historial semanal', icon: CalendarDays, count: datos.semanas.length },
              ]}
              active={pestana}
              onChange={setPestana}
              ariaLabel="Secciones"
            />
          </div>
          <div className="titular-subbarra">
            <p className="titular-nota">
              {rango.startDate === rango.endDate
                ? `Ingresos del ${formatFecha(rango.startDate)}.`
                : `Ingresos de ${rango.label.toLowerCase()} (${formatFecha(rango.startDate)} al ${formatFecha(rango.endDate)}).`}
              {periodo.hayProrrateo
                && ' La facturación es semanal: de las semanas que el período corta se toma la parte proporcional por día.'}
              {periodo.hayAbierta
                && ' Incluye la semana en curso: los montos pueden cambiar y los cobros se cargan al cierre.'}
            </p>
            <div className="titular-barra-filtros">
              {pestana === 'vehiculos' && (
                <label className="titular-buscar">
                  <Search size={15} />
                  <input
                    type="search"
                    placeholder="Buscar patente, modelo o situación"
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                  />
                </label>
              )}
              <DateRangeSelector
                selectedRange={rango}
                onRangeChange={setRango}
                allowMonthYear
                mesCalendario
                sinAtajos
                conDia
                showAllOption={false}
              />
            </div>
          </div>

          <div className="titular-tabla-scroll">
          {pestana === 'vehiculos' ? (
          <table className="titular-tabla">
            <thead>
              <tr>
                <th>Patente</th>
                <th>Vehículo</th>
                <th>Situación</th>
                <th>Turnos</th>
                <th className="num">Días alquilado</th>
                <th className="num">Días parado</th>
                <th className="num">Esperado</th>
                <th className="num">Cobrado</th>
                <th className="num">Cobranza</th>
              </tr>
            </thead>
            <tbody>
              {vehiculosVisibles.map(v => {
                const ingreso = periodo.porVehiculo[v.patente];
                const alquiler = diasAlquilado(v.tramosAlquiler, v.activoDesde, rango);
                return (
                  <tr key={v.vehiculoId}>
                    <td data-label="Patente"><PatenteBadge patente={v.patente} size="sm" /></td>
                    <td data-label="Vehículo">{v.descripcion || '-'}</td>
                    <td data-label="Situación">
                      <div>
                        <span className={`titular-sit titular-sit--${v.situacion}`}>
                          {SITUACION_LABEL[v.situacion]}
                        </span>
                        <span className="titular-sit-detalle">{v.estadoDescripcion}</span>
                      </div>
                    </td>
                    <td data-label="Turnos">
                      {v.situacion === 'generando' ? `${v.turnosCubiertos} de ${v.turnosTotales}` : '-'}
                    </td>
                    <td data-label="Días alquilado" className="num">
                      {alquiler.total > 0 ? `${alquiler.dias} de ${alquiler.total}` : '-'}
                    </td>
                    <td data-label="Días parado" className="num">
                      {alquiler.total > 0 ? alquiler.total - alquiler.dias : '-'}
                    </td>
                    <td data-label="Esperado" className="num">
                      {ingreso ? formatPlata(ingreso.esperado) : '-'}
                    </td>
                    <td data-label="Cobrado" className="num">
                      {ingreso ? formatPlata(ingreso.cobrado) : '-'}
                    </td>
                    <td data-label="Cobranza" className="num">
                      {!ingreso ? '-' : periodo.cobranzaPendiente
                        ? 'N/A'
                        : porcentaje(ingreso.cobrado, ingreso.esperado)}
                    </td>
                  </tr>
                );
              })}
              {vehiculosVisibles.length === 0 && (
                <tr>
                  <td colSpan={9} className="titular-vacio">
                    {datos.vehiculos.length === 0
                      ? 'No hay vehículos a tu nombre.'
                      : 'Ningún vehículo coincide con la búsqueda.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          ) : (
          <table className="titular-tabla">
            <thead>
              <tr>
                <th>Semana</th>
                <th>Período</th>
                <th className="num">Vehículos facturados</th>
                <th className="num">Esperado</th>
                <th className="num">Cobrado</th>
                <th className="num">Cobranza</th>
              </tr>
            </thead>
            <tbody>
              {datos.semanas.map(s => (
                <tr key={s.clave}>
                  <td data-label="Semana">
                    <div>
                      {s.semana}/{s.anio}
                      {s.abierta && <span className="titular-sit-detalle">En curso</span>}
                    </div>
                  </td>
                  <td data-label="Período">
                    {formatFecha(s.fechaInicio)} al {formatFecha(s.fechaFin)}
                  </td>
                  <td data-label="Vehículos facturados" className="num">
                    {Object.keys(s.porVehiculo).length}
                  </td>
                  <td data-label="Esperado" className="num">{formatPlata(s.esperado)}</td>
                  <td data-label="Cobrado" className="num">{formatPlata(s.cobrado)}</td>
                  <td data-label="Cobranza" className="num">
                    {s.abierta ? 'N/A' : porcentaje(s.cobrado, s.esperado)}
                  </td>
                </tr>
              ))}
              {datos.semanas.length === 0 && (
                <tr>
                  <td colSpan={6} className="titular-vacio">
                    Todavía no hay facturación sobre tus vehículos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          )}
          </div>
        </section>
      </main>
    </div>
  );
}

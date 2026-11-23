// Ingreso al espacio del titular y cambio obligatorio de contraseña en el primer
// ingreso. Mismos estilos y reglas que el portal del conductor.
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { TitularPortal } from './titularPortalService';
import { cambiarPasswordTitular, loginTitular } from './titularPortalService';
import logoToshifyWordmarkUrl from '../../../assets/logo-toshify-wordmark.png';

const MAX_INTENTOS_POR_MINUTO = 5;

function validarNuevaPassword(password: string): string[] {
  const errores: string[] = [];
  if (password.length < 8) errores.push('Mínimo 8 caracteres');
  if (!/[A-Z]/.test(password)) errores.push('Al menos una mayúscula');
  if (!/[a-z]/.test(password)) errores.push('Al menos una minúscula');
  if (!/[0-9]/.test(password)) errores.push('Al menos un número');
  return errores;
}

interface CampoPasswordProps {
  id: string;
  label: string;
  value: string;
  onChange: (valor: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
}

function CampoPassword({ id, label, value, onChange, autoComplete, autoFocus }: CampoPasswordProps) {
  const [isVisible, setIsVisible] = useState(false);
  return (
    <div className="portal-login-field">
      <label className="portal-login-label" htmlFor={id}>{label}</label>
      <div className="portal-login-input-wrapper">
        <input
          id={id}
          type={isVisible ? 'text' : 'password'}
          className="portal-login-input"
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
        />
        <button
          type="button"
          className="portal-login-toggle"
          onClick={() => setIsVisible(v => !v)}
          tabIndex={-1}
          aria-label={isVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        >
          {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Ingreso

export function TitularLogin({ onIngreso }: { onIngreso: (titular: TitularPortal) => void }) {
  const [documento, setDocumento] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [intentos, setIntentos] = useState<number[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Solo números: sin puntos, guiones ni espacios, para que no haya dudas de
    // cómo escribirlo.
    if (!/^\d+$/.test(documento)) {
      setErrorMsg('Ingresá el documento solo con números, sin puntos ni guiones.');
      return;
    }
    const ahora = Date.now();
    const recientes = intentos.filter(t => ahora - t < 60000);
    if (recientes.length >= MAX_INTENTOS_POR_MINUTO) {
      setErrorMsg('Demasiados intentos. Esperá un minuto.');
      return;
    }
    setIntentos([...recientes, ahora]);

    setIsLoading(true);
    setErrorMsg('');
    try {
      const resultado = await loginTitular(documento, password);
      if (!resultado.ok) {
        setErrorMsg(resultado.error);
        return;
      }
      setPassword('');
      onIngreso(resultado.titular);
    } catch (error) {
      console.error('Error al ingresar al espacio del titular:', error);
      setErrorMsg('Error de conexión. Intentá de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="portal portal-login">
      <img src={logoToshifyWordmarkUrl} alt="Toshify" className="portal-login-brand-logo" />
      <form className="portal-login-card" onSubmit={handleSubmit}>
        <h1 className="portal-login-title">Iniciar sesión</h1>
        <p className="portal-login-subtitle">Portal de titulares</p>

        <div className="portal-login-field">
          <label className="portal-login-label" htmlFor="titular-login-doc">
            CUIT (empresa) o DNI (persona)
          </label>
          <input
            id="titular-login-doc"
            type="text"
            className="portal-login-input"
            value={documento}
            onChange={e => { setDocumento(e.target.value.replace(/\D/g, '')); setErrorMsg(''); }}
            placeholder="Solo números"
            inputMode="numeric"
            autoComplete="username"
            autoFocus
          />
        </div>

        <CampoPassword
          id="titular-login-password"
          label="Contraseña"
          value={password}
          onChange={valor => { setPassword(valor); setErrorMsg(''); }}
          autoComplete="current-password"
        />

        <button
          type="submit"
          className="portal-login-btn"
          disabled={isLoading || !documento || !password}
        >
          {isLoading ? 'Ingresando...' : 'Ingresar'}
        </button>

        {errorMsg && <div className="portal-login-error">{errorMsg}</div>}

        <p className="titular-login-ayuda">
          La primera vez, tu contraseña es el mismo documento. Después te vamos a pedir
          que elijas una nueva.
        </p>
      </form>
    </div>
  );
}

// ---------------------------------------------------- Cambio de contraseña

interface TitularCambioPasswordProps {
  titular: TitularPortal;
  onListo: () => void;
  onSalir: () => void;
}

export function TitularCambioPassword({ titular, onListo, onSalir }: TitularCambioPasswordProps) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [errores, setErrores] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const limpiarErrores = () => setErrores([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actual) {
      setErrores(['Ingresá tu contraseña actual']);
      return;
    }
    if (nueva !== confirmar) {
      setErrores(['Las contraseñas nuevas no coinciden']);
      return;
    }
    const validacion = validarNuevaPassword(nueva);
    if (validacion.length > 0) {
      setErrores(validacion);
      return;
    }

    setIsLoading(true);
    try {
      const resultado = await cambiarPasswordTitular(titular.id, actual, nueva);
      if (!resultado.ok) {
        setErrores([resultado.error]);
        return;
      }
      onListo();
    } catch (error) {
      console.error('Error al cambiar la contraseña del titular:', error);
      setErrores(['Error de conexión. Intentá de nuevo.']);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="portal portal-login">
      <img src={logoToshifyWordmarkUrl} alt="Toshify" className="portal-login-brand-logo" />
      <form className="portal-login-card" onSubmit={handleSubmit}>
        <h1 className="portal-login-title">Creá tu nueva contraseña</h1>
        <p className="portal-login-subtitle">
          Hola, {titular.nombre}. Por seguridad tenés que elegir una contraseña nueva antes de
          continuar.
        </p>

        <CampoPassword
          id="titular-cp-actual"
          label="Contraseña actual"
          value={actual}
          onChange={valor => { setActual(valor); limpiarErrores(); }}
          autoComplete="current-password"
          autoFocus
        />
        <CampoPassword
          id="titular-cp-nueva"
          label="Nueva contraseña"
          value={nueva}
          onChange={valor => { setNueva(valor); limpiarErrores(); }}
          autoComplete="new-password"
        />
        <CampoPassword
          id="titular-cp-confirmar"
          label="Confirmar nueva contraseña"
          value={confirmar}
          onChange={valor => { setConfirmar(valor); limpiarErrores(); }}
          autoComplete="new-password"
        />

        {errores.length > 0 && (
          <div className="portal-login-error">
            <ul className="portal-login-error-list">
              {errores.map(err => <li key={err}>{err}</li>)}
            </ul>
          </div>
        )}

        <div className="portal-login-requirements">
          <div className="portal-login-requirements-title">Requisitos</div>
          <ul>
            <li>Mínimo 8 caracteres</li>
            <li>Al menos una mayúscula</li>
            <li>Al menos una minúscula</li>
            <li>Al menos un número</li>
          </ul>
        </div>

        <button
          type="submit"
          className="portal-login-btn"
          disabled={isLoading || !actual || !nueva || !confirmar}
        >
          {isLoading ? 'Guardando...' : 'Cambiar contraseña'}
        </button>

        <button type="button" className="portal-login-forgot" onClick={onSalir}>
          Volver a iniciar sesión
        </button>
      </form>
    </div>
  );
}

import { useState, useEffect } from 'react';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

interface DeviceInfo {
  type: DeviceType;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouchDevice: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  viewportWidth: number;
  viewportHeight: number;
}

// Breakpoints en pixels CSS (no resolución física)
const BREAKPOINTS = {
  mobile: 768,   // < 768px = mobile
  tablet: 1024,  // 768-1024px = tablet
  // > 1024px = desktop
};

/**
 * Detecta el tipo de dispositivo usando múltiples señales:
 * 1. User-Agent (para detectar iOS/Android específicamente)
 * 2. Touch capability (pointer: coarse)
 * 3. Viewport width (respeta el meta viewport)
 * 4. Hover capability (móviles no tienen hover real)
 */
function detectDeviceType(): DeviceInfo {
  const ua = navigator.userAgent.toLowerCase();
  
  // Detectar sistema operativo móvil
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  const isMobileUA = isIOS || isAndroid || /mobile|phone/.test(ua);
  
  // Detectar capacidad táctil
  const isTouchDevice = 
    'ontouchstart' in window || 
    navigator.maxTouchPoints > 0 ||
    window.matchMedia('(pointer: coarse)').matches;
  
  // Detectar si NO tiene hover real (móviles)
  const noHover = window.matchMedia('(hover: none)').matches;
  
  // Viewport actual (respeta meta viewport, no resolución física)
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Determinar tipo de dispositivo
  let type: DeviceType;
  
  if (isMobileUA && isTouchDevice) {
    // Es un dispositivo móvil confirmado por UA y touch
    if (viewportWidth < BREAKPOINTS.mobile || (isIOS && !ua.includes('ipad')) || (isAndroid && !ua.includes('tablet'))) {
      type = 'mobile';
    } else if (viewportWidth < BREAKPOINTS.tablet || ua.includes('ipad') || ua.includes('tablet')) {
      type = 'tablet';
    } else {
      // Móvil con pantalla grande o en modo desktop
      type = isTouchDevice && noHover ? 'tablet' : 'desktop';
    }
  } else if (isTouchDevice && noHover && viewportWidth < BREAKPOINTS.tablet) {
    // Touch device sin hover, probablemente móvil/tablet
    type = viewportWidth < BREAKPOINTS.mobile ? 'mobile' : 'tablet';
  } else {
    // Desktop o laptop
    type = 'desktop';
  }
  
  return {
    type,
    isMobile: type === 'mobile',
    isTablet: type === 'tablet',
    isDesktop: type === 'desktop',
    isTouchDevice,
    isIOS,
    isAndroid,
    viewportWidth,
    viewportHeight,
  };
}

/**
 * Hook para detectar el tipo de dispositivo y mantenerlo actualizado
 * cuando cambia el viewport (rotación, resize).
 * 
 * Agrega clases CSS al body:
 * - device-mobile, device-tablet, device-desktop
 * - device-touch (si es táctil)
 * - device-ios, device-android (si aplica)
 */
export function useDeviceType(): DeviceInfo {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(() => detectDeviceType());

  useEffect(() => {
    const updateDeviceInfo = () => {
      const newInfo = detectDeviceType();
      setDeviceInfo(newInfo);
      
      // Actualizar clases en el body
      const body = document.body;
      
      // Remover clases anteriores
      body.classList.remove('device-mobile', 'device-tablet', 'device-desktop');
      body.classList.remove('device-touch', 'device-ios', 'device-android');
      
      // Agregar nuevas clases
      body.classList.add(`device-${newInfo.type}`);
      
      if (newInfo.isTouchDevice) {
        body.classList.add('device-touch');
      }
      if (newInfo.isIOS) {
        body.classList.add('device-ios');
      }
      if (newInfo.isAndroid) {
        body.classList.add('device-android');
      }
    };

    // Detectar al montar
    updateDeviceInfo();

    // Escuchar cambios de viewport (rotación, resize)
    window.addEventListener('resize', updateDeviceInfo);
    window.addEventListener('orientationchange', updateDeviceInfo);

    return () => {
      window.removeEventListener('resize', updateDeviceInfo);
      window.removeEventListener('orientationchange', updateDeviceInfo);
    };
  }, []);

  return deviceInfo;
}

/**
 * Hook simplificado que solo retorna si es móvil o no
 */
export function useIsMobile(): boolean {
  const { isMobile } = useDeviceType();
  return isMobile;
}

/**
 * Hook simplificado que solo retorna si es touch o no
 */
export function useIsTouchDevice(): boolean {
  const { isTouchDevice } = useDeviceType();
  return isTouchDevice;
}

// src/components/ui/AddressAutocomplete.tsx
import { useState, useCallback, useRef, useEffect } from 'react'
import { GoogleMap, useJsApiLoader, Marker, Autocomplete } from '@react-google-maps/api'
import { MapPin, X, Loader2 } from 'lucide-react'

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

// Librerías necesarias para Places API
const libraries: ("places")[] = ['places']

// Centro por defecto: Buenos Aires, Argentina
const DEFAULT_CENTER = {
  lat: -34.6037,
  lng: -58.3816
}

const mapContainerStyle = {
  width: '100%',
  height: '250px',
  borderRadius: '8px',
  marginTop: '12px',
  border: '1px solid #e5e7eb'
}

interface AddressAutocompleteProps {
  value: string
  onChange: (address: string, lat?: number, lng?: number) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}

export function AddressAutocomplete({
  value,
  onChange,
  disabled = false,
  placeholder = 'Buscar dirección...',
  className = ''
}: AddressAutocompleteProps) {
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER)
  const [markerPosition, setMarkerPosition] = useState<{ lat: number; lng: number } | null>(null)
  const [showMap, setShowMap] = useState(false)
  const [inputValue, setInputValue] = useState(value) // Estado local para el input
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Sincronizar inputValue con value cuando cambia externamente
  useEffect(() => {
    setInputValue(value)
  }, [value])

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries,
    language: 'es',
    region: 'AR'
  })

  // Si hay un valor inicial y el mapa está cargado, mostrar el mapa y geocodificar
  useEffect(() => {
    if (isLoaded && value && !markerPosition) {
      setShowMap(true) // Mostrar mapa automáticamente si hay dirección
      const geocoder = new google.maps.Geocoder()
      geocoder.geocode({ address: value }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          const location = results[0].geometry.location
          const newPosition = { lat: location.lat(), lng: location.lng() }
          setMarkerPosition(newPosition)
          setMapCenter(newPosition)
        }
      })
    }
  }, [isLoaded, value, markerPosition])

  const onAutocompleteLoad = useCallback((autocomplete: google.maps.places.Autocomplete) => {
    autocompleteRef.current = autocomplete
  }, [])

  const onPlaceChanged = useCallback(() => {
    if (autocompleteRef.current) {
      const place = autocompleteRef.current.getPlace()

      if (place.geometry && place.geometry.location) {
        const lat = place.geometry.location.lat()
        const lng = place.geometry.location.lng()
        const address = place.formatted_address || ''

        setMarkerPosition({ lat, lng })
        setMapCenter({ lat, lng })
        setShowMap(true)
        setInputValue(address) // Actualizar el input
        onChange(address, lat, lng)
      } else if (place.name) {
        setInputValue(place.name)
        onChange(place.name)
      }
    }
  }, [onChange])

  const onMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (e.latLng && !disabled) {
      const lat = e.latLng.lat()
      const lng = e.latLng.lng()

      // Geocodificación inversa para obtener la dirección
      const geocoder = new google.maps.Geocoder()
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          const address = results[0].formatted_address
          setMarkerPosition({ lat, lng })
          setInputValue(address) // Actualizar el input
          onChange(address, lat, lng)
        }
      })
    }
  }, [disabled, onChange])

  const clearAddress = useCallback(() => {
    setInputValue('')
    setMarkerPosition(null)
    setShowMap(false)
    onChange('', undefined, undefined)
  }, [onChange])

  if (loadError) {
    console.error('Google Maps load error:', loadError)
    return (
      <div className="address-autocomplete-error">
        <input
          type="text"
          className={`form-input ${className}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
        />
        <small style={{ color: '#f87171', marginTop: '4px', display: 'block' }}>
          Error al cargar Google Maps. Verifica que las APIs (Maps JavaScript, Places, Geocoding) estén habilitadas en Google Cloud Console.
        </small>
      </div>
    )
  }

  // Si no hay API key configurada, mostrar input simple
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="address-autocomplete-no-api">
        <input
          type="text"
          className={`form-input ${className}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
        />
        <small style={{ color: '#f59e0b', marginTop: '4px', display: 'block' }}>
          Google Maps no configurado. Ingresa la dirección manualmente.
        </small>
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="address-autocomplete-loading">
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            className={`form-input ${className}`}
            value={value}
            disabled
            placeholder="Cargando Google Maps..."
          />
          <Loader2
            size={18}
            className="spinner"
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              animation: 'spin 1s linear infinite'
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="address-autocomplete">
      <div style={{ position: 'relative' }}>
        <Autocomplete
          onLoad={onAutocompleteLoad}
          onPlaceChanged={onPlaceChanged}
          options={{
            componentRestrictions: { country: 'ar' },
            types: ['address'],
            fields: ['formatted_address', 'geometry', 'name']
          }}
        >
          <input
            ref={inputRef}
            type="text"
            className={`form-input ${className}`}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={disabled}
            placeholder={placeholder}
            onFocus={() => setShowMap(true)}
            style={{ paddingRight: inputValue ? '70px' : '40px' }}
          />
        </Autocomplete>

        <div style={{
          position: 'absolute',
          right: '8px',
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          {inputValue && !disabled && (
            <button
              type="button"
              onClick={clearAddress}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                color: '#9ca3af'
              }}
              title="Limpiar dirección"
            >
              <X size={16} />
            </button>
          )}
          <MapPin size={18} style={{ color: '#6b7280' }} />
        </div>
      </div>

      {showMap && (
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={mapCenter}
          zoom={markerPosition ? 16 : 12}
          onClick={onMapClick}
          options={{
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
            zoomControl: true,
            gestureHandling: disabled ? 'none' : 'cooperative'
          }}
        >
          {markerPosition && (
            <Marker
              position={markerPosition}
              draggable={!disabled}
              onDragEnd={(e) => {
                if (e.latLng) {
                  const lat = e.latLng.lat()
                  const lng = e.latLng.lng()

                  const geocoder = new google.maps.Geocoder()
                  geocoder.geocode({ location: { lat, lng } }, (results, status) => {
                    if (status === 'OK' && results && results[0]) {
                      const address = results[0].formatted_address
                      setMarkerPosition({ lat, lng })
                      setInputValue(address) // Actualizar el input
                      onChange(address, lat, lng)
                    }
                  })
                }
              }}
            />
          )}
        </GoogleMap>
      )}

      {showMap && (
        <small style={{ color: '#6b7280', marginTop: '4px', display: 'block' }}>
          Puedes hacer clic en el mapa o arrastrar el marcador para ajustar la ubicación
        </small>
      )}

      <style>{`
        @keyframes spin {
          from { transform: translateY(-50%) rotate(0deg); }
          to { transform: translateY(-50%) rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
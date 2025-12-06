// src/contexts/ThemeContext.tsx
/**
 * @fileoverview Context para manejo de temas (Light/Dark mode)
 * Soporta preferencias del sistema y persistencia en localStorage
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  /** Tema actual configurado por el usuario */
  theme: Theme;
  /** Tema efectivo (resuelto de system a light/dark) */
  resolvedTheme: "light" | "dark";
  /** Cambia el tema */
  setTheme: (theme: Theme) => void;
  /** Alterna entre light y dark */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_KEY = "toshify-theme";

/**
 * Obtiene la preferencia del sistema
 */
function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Obtiene el tema guardado en localStorage
 * @returns El tema guardado o "light" por defecto
 */
function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return "light"; // Default to light theme
}

interface ThemeProviderProps {
  children: ReactNode;
  /** Tema inicial por defecto @default "light" */
  defaultTheme?: Theme;
}

/**
 * Provider para manejo de temas en la aplicación
 *
 * @example
 * ```tsx
 * // En App.tsx o main.tsx
 * <ThemeProvider>
 *   <App />
 * </ThemeProvider>
 * ```
 *
 * @example
 * ```tsx
 * // Uso en componentes
 * function ThemeToggle() {
 *   const { theme, toggleTheme, resolvedTheme } = useTheme();
 *
 *   return (
 *     <button onClick={toggleTheme}>
 *       {resolvedTheme === 'dark' ? '☀️' : '🌙'}
 *     </button>
 *   );
 * }
 * ```
 */
export function ThemeProvider({
  children,
  defaultTheme = "light",
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Evitar hydration mismatch - iniciar con default
    if (typeof window === "undefined") return defaultTheme;
    return getStoredTheme();
  });

  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const stored = getStoredTheme();
    return stored === "light" || stored === "dark" ? stored : "light";
  });

  // Aplicar tema al documento
  useEffect(() => {
    const root = document.documentElement;
    const resolved = theme === "system" ? getSystemTheme() : theme;

    // Remover temas anteriores
    root.removeAttribute("data-theme");

    // Aplicar nuevo tema
    root.setAttribute("data-theme", resolved);
    setResolvedTheme(resolved);

    // Actualizar meta theme-color para mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute(
        "content",
        resolved === "dark" ? "#0F172A" : "#FFFFFF"
      );
    }
  }, [theme]);

  // Escuchar cambios en preferencia del sistema
  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      const newTheme = e.matches ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", newTheme);
      setResolvedTheme(newTheme);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_KEY, newTheme);
  };

  const toggleTheme = () => {
    const newTheme = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(newTheme);
  };

  return (
    <ThemeContext.Provider
      value={{ theme, resolvedTheme, setTheme, toggleTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook para acceder al contexto de tema
 *
 * @returns {ThemeContextType} Contexto de tema
 * @throws {Error} Si se usa fuera de ThemeProvider
 *
 * @example
 * ```tsx
 * const { theme, setTheme, toggleTheme, resolvedTheme } = useTheme();
 * ```
 */
export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

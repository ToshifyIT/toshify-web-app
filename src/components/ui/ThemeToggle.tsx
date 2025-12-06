// src/components/ui/ThemeToggle.tsx
/**
 * Componente para alternar entre temas (claro/oscuro/sistema)
 */

import { useState, useRef, useEffect } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";

type Theme = "light" | "dark" | "system";

interface ThemeOption {
  value: Theme;
  label: string;
  icon: React.ReactNode;
}

const themeOptions: ThemeOption[] = [
  { value: "light", label: "Claro", icon: <Sun size={14} /> },
  { value: "dark", label: "Oscuro", icon: <Moon size={14} /> },
  { value: "system", label: "Sistema", icon: <Monitor size={14} /> },
];

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getCurrentIcon = () => {
    if (theme === "system") {
      return <Monitor size={16} />;
    }
    return resolvedTheme === "dark" ? <Moon size={16} /> : <Sun size={16} />;
  };

  return (
    <div className="theme-toggle-container" ref={dropdownRef}>
      <button
        className="theme-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="Cambiar tema"
        aria-label="Cambiar tema"
      >
        {getCurrentIcon()}
      </button>

      {isOpen && (
        <div className="theme-dropdown">
          {themeOptions.map((option) => (
            <button
              key={option.value}
              className={`theme-option ${theme === option.value ? "active" : ""}`}
              onClick={() => {
                setTheme(option.value);
                setIsOpen(false);
              }}
            >
              <span className="theme-option-icon">{option.icon}</span>
              <span className="theme-option-label">{option.label}</span>
              {theme === option.value && (
                <span className="theme-option-check">✓</span>
              )}
            </button>
          ))}
        </div>
      )}

      <style>{`
        .theme-toggle-container {
          position: relative;
        }

        .theme-toggle-btn {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          border: 1px solid var(--border-primary);
          background: var(--bg-secondary);
          color: var(--text-secondary);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .theme-toggle-btn:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
          border-color: var(--border-primary);
        }

        .theme-dropdown {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 4px;
          background: var(--bg-primary);
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          box-shadow: var(--shadow-lg);
          min-width: 140px;
          z-index: 100;
          overflow: hidden;
        }

        .theme-option {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border: none;
          background: none;
          color: var(--text-secondary);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.15s;
          text-align: left;
        }

        .theme-option:hover {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }

        .theme-option.active {
          background: var(--color-primary-light);
          color: var(--color-primary);
        }

        .theme-option-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 18px;
        }

        .theme-option-label {
          flex: 1;
        }

        .theme-option-check {
          color: var(--color-primary);
          font-size: 12px;
          font-weight: 600;
        }

        @media (max-width: 768px) {
          .theme-dropdown {
            right: auto;
            left: 0;
          }
        }
      `}</style>
    </div>
  );
}

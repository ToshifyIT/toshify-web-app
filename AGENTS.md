# Toshify Web App - Agent Guidelines

Essential information for agentic coding assistants working in this repository.

## Build, Lint, and Test Commands

### Development
```bash
npm run dev              # Start Vite dev server (development mode)
npm run dev:prod         # Start Vite dev server (production mode)
npm run dev:api          # Start API server (PORT=3001)
npm run lint             # Run ESLint on all files
npm run lint -- --fix    # Auto-fix linting errors
npm run build            # TypeScript compile + Vite build
npm run preview          # Preview production build
npm start                # Start production server
```

### Testing
**No unit tests exist yet.** When adding tests:
1. Install vitest: `npm install -D vitest @testing-library/react`
2. Add scripts to `package.json`:
   - `"test": "vitest"`
   - `"test:run": "vitest run"`
   - `"test:single": "vitest run path/to/file.test.ts"`

### Sync Scripts (Data Pipelines)
```bash
npm run sync:cabify              # Sync Cabify historical data
npm run sync:cabify:weekly       # Sync last week
npm run sync:cabify:realtime     # Real-time sync
npm run sync:uss                 # Sync USS Kilometraje
npm run sync:wialon:bitacora     # Sync Wialon Bitacora
npm run scheduler                # Run scheduler daemon
```

## Git Hooks (Husky)

**Pre-commit**: Runs lint-staged on modified files
- ESLint with auto-fix on `*.ts`, `*.tsx`
- TypeScript type checking

**Pre-push**: Validates full build before pushing
- Runs `npm run build` (tsc + vite)
- Push is blocked if build fails

## TypeScript Configuration

Key settings from `tsconfig.app.json`:
- **Target**: ES2022, **Module**: ESNext
- **Strict**: true (all strict checks enabled)
- **noUnusedLocals/Parameters**: true (unused vars = compile error)
- **noFallthroughCasesInSwitch**: true
- **verbatimModuleSyntax**: true (MUST use `import type` for type-only imports)

## Code Style Guidelines

### Import Organization
```typescript
// 1. React core
import { useState, useEffect } from 'react';
// 2. Third-party packages
import { supabase } from '@supabase/supabase-js';
// 3. Type imports (REQUIRED - verbatimModuleSyntax)
import type { User, Profile } from '../types';
// 4. Internal modules (contexts, hooks, services)
import { useAuth } from '../contexts/AuthContext';
import { formatDate } from '../utils/formatters';
// 5. Components
import { Button } from '../components/ui/Button';
// 6. CSS/assets (always last)
import './styles.css';
```

### Naming Conventions
| Element | Convention | Example |
|---------|------------|---------|
| Components | PascalCase | `ProtectedRoute`, `UserManagement` |
| Functions/variables | camelCase | `loadProfile`, `setUser` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES`, `API_URL` |
| Types/Interfaces | PascalCase | `UserProfile`, `AuthContextType` |
| Component files | PascalCase.tsx | `AuthContext.tsx`, `Button.tsx` |
| Service/util files | camelCase.ts | `ussService.ts`, `formatters.ts` |
| Directories | lowercase | `src/services`, `src/components` |
| Boolean variables | is/has/can prefix | `isLoading`, `hasPermission` |

### Formatting Rules
- **Indentation**: 2 spaces
- **Semicolons**: Required
- **Quotes**: Single quotes for strings
- **Trailing commas**: Use in multiline arrays/objects
- **Max line length**: ~100 characters (soft limit)
- **Blank lines**: One between logical sections

### Component Pattern
```typescript
interface ComponentProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary';
  onAction?: () => void;
}

export function MyComponent({ children, variant = 'default', onAction }: ComponentProps) {
  const [isLoading, setIsLoading] = useState(false);
  
  const handleClick = async () => {
    setIsLoading(true);
    try {
      await onAction?.();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`variant-${variant}`}>
      {children}
    </div>
  );
}
```

### Error Handling
```typescript
// API calls - always wrap in try-catch
try {
  const { data, error } = await supabase.from('table').select();
  if (error) throw error;
  return data;
} catch (error) {
  console.error('Operation failed:', error);
  Swal.fire('Error', 'No se pudo completar la operacion', 'error');
  throw error;
}
```

- Use SweetAlert2 (`Swal`) for user-facing error messages
- Log errors with `console.error()` for debugging
- Re-throw errors when caller needs to handle them

## Project Structure

```
src/
├── components/       # Reusable UI components
│   ├── ui/          # Base components (Button, Modal, DataTable)
│   └── forms/       # Form components
├── contexts/        # React Context providers
│   ├── AuthContext.tsx
│   ├── PermissionsContext.tsx
│   └── ThemeContext.tsx
├── hooks/           # Custom React hooks
├── lib/             # Library setup (Supabase client)
├── modules/         # Feature modules (self-contained)
│   ├── facturacion/
│   ├── siniestros/
│   └── incidencias/
├── pages/           # Route page components
├── services/        # API clients & business logic
├── types/           # TypeScript type definitions
└── utils/           # Utility functions
```

## Common Patterns

### Route Protection
```typescript
<ProtectedRoute menuName="Conductores" action="view">
  <ConductoresPage />
</ProtectedRoute>
```

### Context Hooks
- `useAuth()` - Authentication state and user info
- `usePermissions()` - Check user permissions
- `useEffectivePermissions()` - Combined role + user permissions

### Modal Pattern
```typescript
const [showModal, setShowModal] = useState(false);
// ...
{showModal && <MyModal onClose={() => setShowModal(false)} />}
```

### Service Classes
```typescript
// Encapsulate API logic - never expose credentials in frontend
class MyService {
  async getData(): Promise<Data[]> {
    const { data, error } = await supabase.from('table').select();
    if (error) throw error;
    return data;
  }
}
export const myService = new MyService();
```

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | React 19 + React Router 7 |
| Language | TypeScript 5.9 (strict mode) |
| Build | Vite 7 |
| CSS | Tailwind CSS 4 |
| Database | Supabase (PostgreSQL) |
| Tables | TanStack React Table |
| Charts | Recharts |
| PDF | jsPDF + html2canvas |
| Validation | Zod |
| Icons | Lucide React |
| HTTP | Axios |
| Alerts | SweetAlert2 |

## Security Practices

- **API Keys**: Never in frontend code; use Supabase Edge Functions
- **User Input**: Sanitize with `dompurify` before rendering HTML
- **Auth**: Always check `useAuth()` before protected operations
- **Permissions**: Use `usePermissions()` to verify access
- Redirect unauthorized users to `/unauthorized`

## Before Committing

Git hooks will automatically validate, but you can run manually:

1. `npm run lint` - Fix all linting errors
2. `npm run build` - Ensure TypeScript compiles without errors
3. Verify all type imports use `import type`
4. Remove unused imports/variables (compiler will catch these)
5. Ensure proper error handling with user feedback

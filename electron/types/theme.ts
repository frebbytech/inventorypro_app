// src/preload/types.d.ts (or global.d.ts in Next.js)

export interface IThemePayload {
  theme: 'light' | 'dark' | 'system';
  accentColor?: string; // Accepts HEX string (e.g., "#3b82f6")
}


export interface ThemeAPI {
  changeTheme: (payload: IThemePayload) => void;
    toggleFS: () => void;
}

declare global {
  interface Window {
    themeAPI?: ThemeAPI;
  }
}

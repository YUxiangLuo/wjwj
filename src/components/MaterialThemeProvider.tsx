import { StyledEngineProvider, ThemeProvider } from "@mui/material/styles";
import { createContext, useContext, type ReactNode } from "react";
import { muiTheme } from "@/theme/mui-theme";

const MaterialThemeMountedContext = createContext(false);

export interface MaterialThemeProviderProps {
    children: ReactNode;
}

/**
 * Idempotent Material Design 3 theme + CSS cascade layer (`@layer mui`) provider.
 * Safe to mount at both SPA entrypoints (`student.tsx` / `teacher.tsx` / `admin.tsx`),
 * root App components (`StudentApp` / `TeacherApp` / `AdminApp`), and isolated test trees.
 * Intentionally omits global `CssBaseline` so `styles/theme.css` `@layer base` owns document resets.
 */
export function MaterialThemeProvider({ children }: MaterialThemeProviderProps) {
    const alreadyMounted = useContext(MaterialThemeMountedContext);
    if (alreadyMounted) {
        return <>{children}</>;
    }

    return (
        <MaterialThemeMountedContext.Provider value={true}>
            <StyledEngineProvider enableCssLayer>
                <ThemeProvider theme={muiTheme}>{children}</ThemeProvider>
            </StyledEngineProvider>
        </MaterialThemeMountedContext.Provider>
    );
}

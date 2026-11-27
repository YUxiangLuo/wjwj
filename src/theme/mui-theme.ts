import { createTheme } from "@mui/material/styles";

/**
 * Google Material Design 3 Productivity Light theme tokens.
 * Synchronized 1:1 with `:root` in `styles/theme.css` (light-only, desktop >= 1024x768).
 */
export const MD3_LIGHT_TOKENS = {
    background: "#f8fafd",
    foreground: "#1f1f1f",
    card: "#ffffff",
    cardForeground: "#1f1f1f",
    popover: "#ffffff",
    popoverForeground: "#1f1f1f",
    muted: "#f0f4f9",
    mutedForeground: "#444746",
    secondary: "#e9eef6",
    secondaryForeground: "#1f1f1f",
    border: "#dde3ea",
    input: "#747775",
    ring: "#0b57d0",
    primary: "#0b57d0",
    primaryHover: "#0842a0",
    primaryActive: "#062e6f",
    primaryForeground: "#ffffff",
    primaryMuted: "#edf2fc",
    primaryBorder: "#a8c7fa",
    accent: "#c2e7ff",
    accentForeground: "#001d35",
    success: "#146c2e",
    successHover: "#0f5223",
    successForeground: "#ffffff",
    successMuted: "#e6f4ea",
    successBorder: "#ceead6",
    warning: "#8c4a00",
    warningHover: "#6e3900",
    warningForeground: "#ffffff",
    warningMuted: "#fef7e0",
    warningBorder: "#fde293",
    destructive: "#b3261e",
    destructiveHover: "#8c1d18",
    destructiveForeground: "#ffffff",
    destructiveMuted: "#fce8e6",
    destructiveBorder: "#f9dedc",
    info: "#00639b",
    infoHover: "#004a77",
    infoForeground: "#ffffff",
    infoMuted: "#e8f0fe",
    infoBorder: "#c2e7ff",
    auxiliary: "#65558f",
    auxiliaryHover: "#4f378b",
    auxiliaryForeground: "#ffffff",
    auxiliaryStrong: "#4f378b",
    auxiliaryMuted: "#f3edf7",
    auxiliaryBorder: "#eaddff",
    navigation: "#f0f4f9",
    navigationForeground: "#1f1f1f",
    navigationMuted: "#444746",
    navigationHover: "#e1e7ef",
    navigationHoverForeground: "#1f1f1f",
    navigationActive: "#c2e7ff",
    navigationActiveForeground: "#001d35",
    navigationBorder: "#dde3ea",
} as const;

export const MD3_FONT_FAMILY =
    '"Roboto", "Noto Sans SC", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "WenQuanYi Micro Hei", sans-serif';

export const muiTheme = createTheme({
    palette: {
        mode: "light",
        primary: {
            main: MD3_LIGHT_TOKENS.primary,
            dark: MD3_LIGHT_TOKENS.primaryHover,
            light: MD3_LIGHT_TOKENS.primaryMuted,
            contrastText: MD3_LIGHT_TOKENS.primaryForeground,
        },
        secondary: {
            main: MD3_LIGHT_TOKENS.info,
            dark: MD3_LIGHT_TOKENS.infoHover,
            light: MD3_LIGHT_TOKENS.accent,
            contrastText: MD3_LIGHT_TOKENS.infoForeground,
        },
        error: {
            main: MD3_LIGHT_TOKENS.destructive,
            dark: MD3_LIGHT_TOKENS.destructiveHover,
            light: MD3_LIGHT_TOKENS.destructiveMuted,
            contrastText: MD3_LIGHT_TOKENS.destructiveForeground,
        },
        warning: {
            main: MD3_LIGHT_TOKENS.warning,
            dark: MD3_LIGHT_TOKENS.warningHover,
            light: MD3_LIGHT_TOKENS.warningMuted,
            contrastText: MD3_LIGHT_TOKENS.warningForeground,
        },
        info: {
            main: MD3_LIGHT_TOKENS.info,
            dark: MD3_LIGHT_TOKENS.infoHover,
            light: MD3_LIGHT_TOKENS.infoMuted,
            contrastText: MD3_LIGHT_TOKENS.infoForeground,
        },
        success: {
            main: MD3_LIGHT_TOKENS.success,
            dark: MD3_LIGHT_TOKENS.successHover,
            light: MD3_LIGHT_TOKENS.successMuted,
            contrastText: MD3_LIGHT_TOKENS.successForeground,
        },
        background: {
            default: MD3_LIGHT_TOKENS.background,
            paper: MD3_LIGHT_TOKENS.card,
        },
        text: {
            primary: MD3_LIGHT_TOKENS.foreground,
            secondary: MD3_LIGHT_TOKENS.mutedForeground,
            disabled: MD3_LIGHT_TOKENS.input,
        },
        divider: MD3_LIGHT_TOKENS.border,
    },
    shape: {
        borderRadius: 8,
    },
    typography: {
        fontFamily: MD3_FONT_FAMILY,
        fontSize: 14,
        button: {
            textTransform: "none",
            fontWeight: 500,
            fontSize: "0.9375rem",
            lineHeight: "1.375rem",
        },
    },
    components: {
        MuiButtonBase: {
            defaultProps: {
                disableRipple: true,
            },
        },
        MuiButton: {
            defaultProps: {
                disableElevation: true,
                disableRipple: true,
            },
            styleOverrides: {
                root: {
                    borderRadius: 9999,
                    textTransform: "none",
                    fontWeight: 500,
                    boxShadow: "none",
                    "&.Mui-disabled": {
                        opacity: 1,
                    },
                },
            },
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    fontWeight: 500,
                    "&.Mui-disabled": {
                        opacity: 1,
                    },
                },
            },
        },
        MuiPaper: {
            defaultProps: {
                elevation: 0,
            },
            styleOverrides: {
                root: {
                    backgroundImage: "none",
                },
            },
        },
        MuiModal: {
            defaultProps: {
                closeAfterTransition: false,
            },
        },
        MuiDialog: {
            defaultProps: {
                transitionDuration: 0,
            },
            styleOverrides: {
                paper: {
                    borderRadius: 24,
                    backgroundImage: "none",
                },
            },
        },
        MuiPopover: {
            defaultProps: {
                transitionDuration: 0,
            },
            styleOverrides: {
                paper: {
                    borderRadius: 12,
                    backgroundImage: "none",
                },
            },
        },
        MuiMenu: {
            defaultProps: {
                transitionDuration: 0,
            },
            styleOverrides: {
                paper: {
                    borderRadius: 12,
                    backgroundImage: "none",
                },
            },
        },
        MuiMenuItem: {
            styleOverrides: {
                root: {
                    "&.Mui-disabled": {
                        opacity: 1,
                    },
                },
            },
        },
        MuiSwitch: {
            styleOverrides: {
                input: {
                    left: 0,
                    width: "100%",
                },
            },
        },
        MuiTabs: {
            styleOverrides: {
                indicator: {
                    height: 3,
                    borderTopLeftRadius: 3,
                    borderTopRightRadius: 3,
                    backgroundColor: MD3_LIGHT_TOKENS.primary,
                },
            },
        },
        MuiTab: {
            defaultProps: {
                disableRipple: true,
            },
            styleOverrides: {
                root: {
                    textTransform: "none",
                    fontWeight: 500,
                    minHeight: 40,
                    opacity: 1,
                    flexDirection: "row",
                    maxWidth: "none",
                    overflow: "visible",
                    "&.Mui-disabled": {
                        opacity: 1,
                    },
                },
            },
        },
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    zIndex: 20,
                    backgroundColor: MD3_LIGHT_TOKENS.navigation,
                    color: MD3_LIGHT_TOKENS.navigationForeground,
                    borderColor: MD3_LIGHT_TOKENS.navigationBorder,
                    backgroundImage: "none",
                },
            },
        },
        MuiAppBar: {
            defaultProps: {
                elevation: 0,
                color: "inherit",
            },
            styleOverrides: {
                root: {
                    backgroundColor: MD3_LIGHT_TOKENS.card,
                    color: MD3_LIGHT_TOKENS.foreground,
                    backgroundImage: "none",
                },
            },
        },
    },
});

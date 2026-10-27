import { Platform } from "react-native";
export const colors = { bg: "#f4f2ee", card: "#fffdf9", ink: "#0d0d0f", accent: "#ff5a1f", lime: "#d7ff3e", sand: "#eadcc8", sage: "#d8e6d3", sky: "#dcebf4", lilac: "#e5ddf3", blush: "#f3d9d4", muted: "#726d67", border: "#ded8d0", danger: "#c73824", success: "#22734d" };
export const radius = { sm: 10, md: 16, lg: 28, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const shadow = Platform.select({ ios: { shadowColor: "#0d0d0f", shadowOpacity: .08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } }, android: { elevation: 2 }, default: {} });

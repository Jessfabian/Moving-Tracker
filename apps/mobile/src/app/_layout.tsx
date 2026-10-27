import { Stack, Link, usePathname } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Pressable, Text, View } from "react-native";
import { StoreProvider } from "../lib/store-context";
import { colors } from "../lib/theme";
import { useDuoLayout } from "../lib/layout";

const tabs = [{ href: "/", label: "Home", icon: "⌂" }, { href: "/calendar", label: "Calendar", icon: "◷" }, { href: "/scan", label: "Scan", icon: "▦" }, { href: "/inventory", label: "Inventory", icon: "▤" }];
function Navigation() { const layout = useDuoLayout(); const path = usePathname(); if (layout.rail) return <View style={{ width: 84, backgroundColor: colors.ink, paddingTop: layout.insets.top + 16, alignItems: "center", gap: 18 }}>{tabs.map(t => <Link key={t.href} href={t.href} asChild><Pressable style={{ alignItems: "center", opacity: path === t.href ? 1 : .65 }}><Text style={{ color: colors.lime, fontSize: 24 }}>{t.icon}</Text><Text style={{ color: "white", fontSize: 10 }}>{t.label}</Text></Pressable></Link>)}</View>; return <View style={{ flexDirection: "row", backgroundColor: colors.ink, paddingBottom: layout.insets.bottom + 8, paddingTop: 8, justifyContent: "space-around" }}>{tabs.map(t => <Link key={t.href} href={t.href} asChild><Pressable style={{ alignItems: "center", opacity: path === t.href ? 1 : .65 }}><Text style={{ color: colors.lime, fontSize: 22 }}>{t.icon}</Text><Text style={{ color: "white", fontSize: 11 }}>{t.label}</Text></Pressable></Link>)}</View> }
export default function RootLayout() { const layout = useDuoLayout(); return <SafeAreaProvider><StoreProvider><View style={{ flex: 1, flexDirection: layout.rail ? "row" : "column", backgroundColor: colors.bg }}>{layout.rail && <Navigation />}<View style={{ flex: 1 }}><Stack screenOptions={{ headerShown: false }} /></View>{!layout.rail && <Navigation />}</View></StoreProvider></SafeAreaProvider>; }

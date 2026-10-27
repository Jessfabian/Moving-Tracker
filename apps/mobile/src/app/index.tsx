import { Stack } from "expo-router";
import { View } from "react-native";
import { colors } from "../lib/theme";
import { Dashboard } from "../components/EntityScreen";
export default function Home() { return <View style={{ flex: 1, backgroundColor: colors.bg }}><Stack.Screen options={{ title: "Moving Tracker" }} /><Dashboard /></View>; }

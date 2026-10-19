import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Platform } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { LoginScreen } from "@/components/login-screen";
import { useReminderNotifications } from "@/lib/notifications";

function ReminderSync() {
  useReminderNotifications();
  return null;
}

export default function TabLayout() {
  const { user, loading } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  if (loading || !user) {
    return <LoginScreen loading={loading} />;
  }

  return (
    <>
    <ReminderSync />
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Hoy",
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Tareas",
          tabBarIcon: ({ color }) => <IconSymbol size={25} name="checkmark.circle" color={color} />,
        }}
      />
      <Tabs.Screen
        name="capture"
        options={{
          title: "Capturar",
          tabBarIcon: ({ color }) => <IconSymbol size={30} name="plus.circle.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: ({ color }) => <IconSymbol size={25} name="message.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="subjects"
        options={{
          title: "Materias",
          tabBarIcon: ({ color }) => <IconSymbol size={25} name="book.closed" color={color} />,
        }}
      />
    </Tabs>
    </>
  );
}

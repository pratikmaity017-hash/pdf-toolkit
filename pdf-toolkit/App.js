import { StatusBar } from "expo-status-bar";
import { Text } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import HomeScreen from "./src/screens/HomeScreen";
import LibraryScreen from "./src/screens/LibraryScreen";
import ToolsScreen from "./src/screens/ToolsScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />

      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#6C63FF",
          tabBarInactiveTintColor: "#8A8FA3",
          tabBarStyle: {
            height: 68,
            paddingTop: 8,
            paddingBottom: 10,
            backgroundColor: "#FFFFFF",
            borderTopColor: "#E9EAF2",
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "600",
          },
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarLabel: "Home",
            tabBarIcon: () => <Text style={{ fontSize: 22 }}>⌂</Text>,
          }}
        />

        <Tab.Screen
          name="Library"
          component={LibraryScreen}
          options={{
            tabBarLabel: "Library",
            tabBarIcon: () => <Text style={{ fontSize: 22 }}>▤</Text>,
          }}
        />

        <Tab.Screen
          name="Tools"
          component={ToolsScreen}
          options={{
            tabBarLabel: "Tools",
            tabBarIcon: () => <Text style={{ fontSize: 22 }}>✎</Text>,
          }}
        />

        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarLabel: "Settings",
            tabBarIcon: () => <Text style={{ fontSize: 22 }}>⚙</Text>,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

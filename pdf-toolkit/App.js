import { useCallback, useEffect, useRef } from "react";
import { AppState, Linking, Text } from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  NavigationContainer,
  useNavigationContainerRef,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useIncomingShare } from "expo-sharing";

import HomeScreen from "./src/screens/HomeScreen";
import LibraryScreen from "./src/screens/LibraryScreen";
import ToolsScreen from "./src/screens/ToolsScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

const Tab = createBottomTabNavigator();

function getFilenameFromUri(uri) {
  try {
    const path = uri.split(/[?#]/)[0];
    const lastPart = path.split("/").pop();

    if (lastPart) {
      return decodeURIComponent(lastPart);
    }

    if (filename.toLowerCase().endsWith(".pdf")) {
      return filename;
    }
  } catch {
    // Use the fallback filename below.
  }

  return "Opened document.pdf";
}

export default function App() {
  const navigationRef = useNavigationContainerRef();
  const pendingPdfsRef = useRef([]);
  const handledViewUrisRef = useRef(new Set());

  const { resolvedSharedPayloads, clearSharedPayloads, refreshSharePayloads } =
    useIncomingShare();

  const flushPendingPdfs = useCallback(() => {
    if (!navigationRef.isReady() || pendingPdfsRef.current.length === 0) {
      return;
    }

    const incomingPdfs = pendingPdfsRef.current;
    pendingPdfsRef.current = [];

    navigationRef.navigate("Library", {
      incomingPdfs,
      incomingPdfRequestId: Date.now(),
    });
  }, [navigationRef]);

  const sendPdfsToLibrary = useCallback(
    (pdfs) => {
      if (!pdfs?.length) {
        return;
      }

      pendingPdfsRef.current.push(...pdfs);
      flushPendingPdfs();
    },
    [flushPendingPdfs],
  );

  // Handle PDFs received through Android's VIEW action.
  const handleIncomingUrl = useCallback(
    (url) => {
      if (
        typeof url !== "string" ||
        (!url.startsWith("content://") && !url.startsWith("file://"))
      ) {
        return;
      }

      if (handledViewUrisRef.current.has(url)) {
        return;
      }

      handledViewUrisRef.current.add(url);

      const name = getFilenameFromUri(url);

      sendPdfsToLibrary([
        {
          uri: url,
          name: name.toLowerCase().endsWith(".pdf")
            ? name
            : "Opened document.pdf",
          mimeType: "application/pdf",
          size: 0,
          source: "view",
        },
      ]);
    },
    [sendPdfsToLibrary],
  );

  useEffect(() => {
    let active = true;

    Linking.getInitialURL()
      .then((url) => {
        if (active && url) {
          handleIncomingUrl(url);
        }
      })
      .catch((error) => {
        console.warn("Unable to read the initial PDF URL:", error);
      });

    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleIncomingUrl(url);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [handleIncomingUrl]);

  // Handle PDFs received through Android's SEND / SEND_MULTIPLE actions.
  useEffect(() => {
    if (!resolvedSharedPayloads.length) {
      return;
    }

    const incomingPdfs = resolvedSharedPayloads
      .filter((payload) => {
        if (!payload.contentUri) {
          return false;
        }

        const mimeType = (payload.contentMimeType || payload.mimeType || "")
          .split(";")[0]
          .trim()
          .toLowerCase();

        const filename = payload.originalName || payload.value || "";

        return (
          mimeType === "application/pdf" ||
          filename.toLowerCase().split(/[?#]/)[0].endsWith(".pdf")
        );
      })
      .map((payload) => ({
        uri: payload.contentUri,
        name:
          payload.originalName &&
          payload.originalName.toLowerCase().endsWith(".pdf")
            ? payload.originalName
            : "Shared document.pdf",
        mimeType: payload.contentMimeType || payload.mimeType,
        size: payload.contentSize || 0,
        source: "share",
      }));

    if (incomingPdfs.length) {
      sendPdfsToLibrary(incomingPdfs);
    }

    clearSharedPayloads();
    refreshSharePayloads();
  }, [
    resolvedSharedPayloads,
    sendPdfsToLibrary,
    clearSharedPayloads,
    refreshSharePayloads,
  ]);

  // Retry any pending navigation when the app returns to the foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        flushPendingPdfs();
        refreshSharePayloads();
      }
    });

    return () => subscription.remove();
  }, [flushPendingPdfs, refreshSharePayloads]);

  return (
    <NavigationContainer ref={navigationRef} onReady={flushPendingPdfs}>
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

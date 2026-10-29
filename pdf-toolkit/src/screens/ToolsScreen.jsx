import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";

import MergePDFsScreen from "./MergePDFsScreen";
import ScannerScreen from "./ScannerScreen";
import ConvertFilesToPDFScreen from "./ConvertFilesToPDFScreen";
import SplitPDFScreen from "./SplitPDFScreen";

const tools = [
  ["PDF Reader", "Open and read PDF documents"],
  ["Create PDF", "Create a PDF from text"],
  ["Convert Files to PDF", "Convert images and documents into PDFs"],
  ["Merge PDFs", "Combine multiple PDF files"],
  ["Split PDF", "Separate pages into new files"],
  ["Rotate Pages", "Correct page orientation"],
  ["Scan Document", "Capture documents with your camera"],
  ["Annotate PDF", "Add notes, highlights and signatures"],
];

export default function ToolsScreen({ navigation, route }) {
  const [showMergeScreen, setShowMergeScreen] = useState(false);
  const [showScannerScreen, setShowScannerScreen] = useState(false);
  const [showConverterScreen, setShowConverterScreen] = useState(false);
  const [showSplitScreen, setShowSplitScreen] = useState(false);

  useEffect(() => {
    const feature = route?.params?.openFeature;

    if (feature === "ScanPDF") {
      setShowScannerScreen(true);
    } else if (feature === "ConvertPDF") {
      setShowConverterScreen(true);
    } else if (feature === "MergePDFs") {
      setShowMergeScreen(true);
    } else if (feature === "SplitPDF") {
      setShowSplitScreen(true);
    }

    if (feature) {
      navigation.setParams({ openFeature: undefined });
    }
  }, [route?.params?.openFeature]);

  if (showMergeScreen) {
    return <MergePDFsScreen onBack={() => setShowMergeScreen(false)} />;
  }

  if (showScannerScreen) {
    return <ScannerScreen onBack={() => setShowScannerScreen(false)} />;
  }

  if (showConverterScreen) {
    return (
      <ConvertFilesToPDFScreen onBack={() => setShowConverterScreen(false)} />
    );
  }

  if (showSplitScreen) {
    return <SplitPDFScreen onBack={() => setShowSplitScreen(false)} />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>WORK WITH DOCUMENTS</Text>

      <Text style={styles.title}>PDF Tools</Text>

      <Text style={styles.description}>
        Everything you need to manage your documents in one place.
      </Text>

      {tools.map(([title, description], index) => (
        <Pressable
          style={styles.card}
          key={title}
          onPress={() => {
            if (title === "Merge PDFs") {
              setShowMergeScreen(true);
            } else if (title === "Scan Document") {
              setShowScannerScreen(true);
            } else if (title === "Convert Files to PDF") {
              setShowConverterScreen(true);
            } else if (title === "Split PDF") {
              setShowSplitScreen(true);
            }
          }}
        >
          <View style={styles.number}>
            <Text style={styles.numberText}>
              {String(index + 1).padStart(2, "0")}
            </Text>
          </View>

          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardDescription}>{description}</Text>
          </View>

          <Text style={styles.arrow}>›</Text>
        </Pressable>
      ))}

      <Text style={styles.footer}>
        Tools will be implemented one by one and tested on your device.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F6F7FC",
  },
  content: {
    padding: 22,
    paddingTop: 35,
    paddingBottom: 30,
  },
  eyebrow: {
    color: "#777D91",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: {
    color: "#171A2B",
    fontSize: 29,
    fontWeight: "800",
    marginTop: 7,
  },
  description: {
    color: "#85899A",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 22,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 15,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ECECF4",
  },
  number: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: "#EFEEFF",
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: {
    color: "#6C63FF",
    fontWeight: "800",
    fontSize: 12,
  },
  cardText: {
    flex: 1,
    marginLeft: 13,
  },
  cardTitle: {
    color: "#24263A",
    fontSize: 14,
    fontWeight: "700",
  },
  cardDescription: {
    color: "#85899A",
    fontSize: 11,
    marginTop: 5,
  },
  arrow: {
    color: "#999DB0",
    fontSize: 25,
    marginLeft: 8,
  },
  footer: {
    color: "#85899A",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 10,
  },
});

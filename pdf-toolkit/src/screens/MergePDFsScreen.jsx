import { useEffect, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getDocuments, saveDocument } from "../database/database";
import { mergePdfFiles } from "../services/pdfMergeService";

export default function MergePDFsScreen({ onBack }) {
  const [documents, setDocuments] = useState([]);
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [outputName, setOutputName] = useState("Merged Document");
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    async function loadDocuments() {
      try {
        const result = await getDocuments();
        setDocuments(result);
      } catch (error) {
        Alert.alert("Error", "Could not load your PDF library.");
      } finally {
        setLoading(false);
      }
    }

    loadDocuments();
  }, []);

  function toggleDocument(document) {
    setSelectedDocuments((current) => {
      const alreadySelected = current.some((item) => item.id === document.id);

      if (alreadySelected) {
        return current.filter((item) => item.id !== document.id);
      }

      return [...current, document];
    });
  }

  function moveDocument(index, direction) {
    setSelectedDocuments((current) => {
      const next = [...current];
      const targetIndex = index + direction;

      if (targetIndex < 0 || targetIndex >= next.length) {
        return current;
      }

      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];

      return next;
    });
  }

  async function handleMerge() {
    if (selectedDocuments.length < 2) {
      Alert.alert("Select PDFs", "Choose at least two PDF files.");
      return;
    }

    if (!outputName.trim()) {
      Alert.alert("Filename required", "Enter a name for the merged PDF.");
      return;
    }

    setMerging(true);

    try {
      const mergedDocument = await mergePdfFiles(selectedDocuments, outputName);

      await saveDocument(mergedDocument);

      Alert.alert(
        "Merge complete",
        `${mergedDocument.name} was saved to your PDF library.`,
        [{ text: "OK", onPress: onBack }],
      );
    } catch (error) {
      console.error("PDF merge error:", error);

      Alert.alert(
        "Merge failed",
        error?.message || "Something went wrong while merging PDFs.",
      );
    } finally {
      setMerging(false);
    }
  }

  const [showMergeScreen, setShowMergeScreen] = useState(false);

  if (showMergeScreen) {
    return <MergePDFsScreen onBack={() => setShowMergeScreen(false)} />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹ Back to Tools</Text>
        </Pressable>

        <Text style={styles.eyebrow}>PDF TOOL</Text>
        <Text style={styles.title}>Merge PDFs</Text>
        <Text style={styles.description}>
          Select your files, arrange their order, and combine them into one PDF.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Choose PDF files</Text>
          <Text style={styles.helper}>
            Select at least two files. Tap a selected file again to remove it.
          </Text>

          {loading ? (
            <ActivityIndicator size="large" color="#6C63FF" />
          ) : documents.length === 0 ? (
            <Text style={styles.emptyText}>
              Your library is empty. Import PDFs from the Library tab first.
            </Text>
          ) : (
            documents.map((document) => {
              const selected = selectedDocuments.some(
                (item) => item.id === document.id,
              );

              return (
                <Pressable
                  key={document.id}
                  onPress={() => toggleDocument(document)}
                  style={[styles.fileRow, selected && styles.fileRowSelected]}
                >
                  <View
                    style={[
                      styles.checkbox,
                      selected && styles.checkboxSelected,
                    ]}
                  >
                    <Text style={styles.checkmark}>{selected ? "✓" : ""}</Text>
                  </View>

                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName}>{document.name}</Text>
                    <Text style={styles.fileSize}>
                      {document.size
                        ? `${(document.size / (1024 * 1024)).toFixed(2)} MB`
                        : "PDF document"}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            2. Arrange page order ({selectedDocuments.length})
          </Text>
          <Text style={styles.helper}>
            Pages will be combined in this order.
          </Text>

          {selectedDocuments.map((document, index) => (
            <View key={document.id} style={styles.orderRow}>
              <Text style={styles.orderNumber}>{index + 1}</Text>

              <Text style={styles.orderName} numberOfLines={2}>
                {document.name}
              </Text>

              <Pressable
                accessibilityLabel={`Move ${document.name} up`}
                disabled={index === 0}
                onPress={() => moveDocument(index, -1)}
                style={styles.orderButton}
              >
                <Text style={styles.orderButtonText}>↑</Text>
              </Pressable>

              <Pressable
                accessibilityLabel={`Move ${document.name} down`}
                disabled={index === selectedDocuments.length - 1}
                onPress={() => moveDocument(index, 1)}
                style={styles.orderButton}
              >
                <Text style={styles.orderButtonText}>↓</Text>
              </Pressable>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Name the new PDF</Text>

          <TextInput
            value={outputName}
            onChangeText={setOutputName}
            placeholder="Merged Document"
            placeholderTextColor="#8A8FA3"
            autoCapitalize="sentences"
            returnKeyType="done"
            submitBehavior="blurAndSubmit"
            style={styles.input}
          />

          <Text style={styles.helper}>
            Your original PDFs will remain unchanged.
          </Text>
        </View>

        <Pressable
          disabled={merging || loading || selectedDocuments.length < 2}
          onPress={handleMerge}
          style={[
            styles.mergeButton,
            (merging || loading || selectedDocuments.length < 2) &&
              styles.mergeButtonDisabled,
          ]}
        >
          {merging ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.mergeButtonText}>
              Merge {selectedDocuments.length} PDFs
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F8FC",
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    marginBottom: 14,
  },
  backText: {
    color: "#6C63FF",
    fontSize: 15,
    fontWeight: "700",
  },
  eyebrow: {
    color: "#6C63FF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  title: {
    color: "#20243A",
    fontSize: 29,
    fontWeight: "800",
    marginTop: 6,
  },
  description: {
    color: "#777D92",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 22,
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E9EAF2",
  },
  sectionTitle: {
    color: "#20243A",
    fontSize: 16,
    fontWeight: "800",
  },
  helper: {
    color: "#858A9E",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 12,
  },
  emptyText: {
    color: "#777D92",
    lineHeight: 21,
    marginTop: 10,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#E9EAF2",
    borderRadius: 12,
    marginTop: 8,
  },
  fileRowSelected: {
    backgroundColor: "#F0EFFF",
    borderColor: "#6C63FF",
  },
  checkbox: {
    width: 23,
    height: 23,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "#C8CBDA",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  checkboxSelected: {
    backgroundColor: "#6C63FF",
    borderColor: "#6C63FF",
  },
  checkmark: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    color: "#252941",
    fontSize: 13,
    fontWeight: "700",
  },
  fileSize: {
    color: "#858A9E",
    fontSize: 11,
    marginTop: 4,
  },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#F7F8FC",
  },
  orderNumber: {
    color: "#6C63FF",
    fontSize: 13,
    fontWeight: "800",
    width: 24,
  },
  orderName: {
    flex: 1,
    color: "#30344B",
    fontSize: 12,
    fontWeight: "600",
    marginRight: 6,
  },
  orderButton: {
    width: 30,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
    borderWidth: 1,
    borderColor: "#E9EAF2",
  },
  orderButtonText: {
    color: "#6C63FF",
    fontSize: 17,
    fontWeight: "800",
  },
  input: {
    borderWidth: 1,
    borderColor: "#E2E4EF",
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: "#252941",
    fontSize: 14,
    marginTop: 12,
  },
  mergeButton: {
    backgroundColor: "#6C63FF",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 2,
  },
  mergeButtonDisabled: {
    opacity: 0.45,
  },
  mergeButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});

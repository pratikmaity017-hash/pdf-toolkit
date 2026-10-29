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
import { splitPdfFile } from "../services/pdfSplitService";
import PDFPagePreview from "./PDFPagePreview";

export default function SplitPDFScreen({ onBack }) {
  const [documents, setDocuments] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [selectedPages, setSelectedPages] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [outputName, setOutputName] = useState("Extracted Pages");
  const [loading, setLoading] = useState(true);
  const [splitting, setSplitting] = useState(false);
  const [stage, setStage] = useState("choose");

  useEffect(() => {
    async function loadDocuments() {
      try {
        setDocuments(await getDocuments());
      } catch {
        Alert.alert("Error", "Could not load your PDF library.");
      } finally {
        setLoading(false);
      }
    }

    loadDocuments();
  }, []);

  function chooseDocument(document) {
    setSelectedDocument(document);
    setSelectedPages([]);
    setTotalPages(0);
  }

  function confirmPages(pages) {
    if (!pages.length) {
      Alert.alert("Pages required", "Select at least one page.");
      return;
    }

    setSelectedPages([...pages].sort((a, b) => a - b));
    setStage("extract");
  }

  async function handleSplit() {
    if (!selectedDocument || selectedPages.length === 0) {
      Alert.alert("Pages required", "Go back and select pages first.");
      return;
    }

    if (!outputName.trim()) {
      Alert.alert("Filename required", "Enter a name for the new PDF.");
      return;
    }

    setSplitting(true);

    try {
      const pageSelection = selectedPages.join(",");

      const splitDocument = await splitPdfFile(
        selectedDocument,
        pageSelection,
        outputName,
      );

      await saveDocument(splitDocument);

      Alert.alert(
        "Split complete",
        `${splitDocument.name} was saved to your PDF library with ${splitDocument.pageCount} pages.`,
        [{ text: "OK", onPress: onBack }],
      );
    } catch (error) {
      console.error("PDF split error:", error);
      Alert.alert(
        "Split failed",
        error?.message || "Something went wrong while splitting the PDF.",
      );
    } finally {
      setSplitting(false);
    }
  }

  function Header({ title, subtitle }) {
    return (
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (stage === "choose") onBack?.();
            else if (stage === "preview") setStage("choose");
            else setStage("preview");
          }}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>

        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
        </View>
      </View>
    );
  }

  if (stage === "preview" && selectedDocument) {
    return (
      <View style={styles.fullScreen}>
        <Header title="Select Pages" subtitle={selectedDocument.name} />

        <PDFPagePreview
          document={selectedDocument}
          initialSelectedPages={selectedPages}
          onSelectionChange={setSelectedPages}
          onPageCount={setTotalPages}
          onConfirm={confirmPages}
        />
      </View>
    );
  }

  if (stage === "extract") {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Header
          title="Extract Pages"
          subtitle="Review your selection before creating the PDF."
        />

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Selected PDF</Text>
            <Text style={styles.fileName}>{selectedDocument?.name}</Text>

            <Text style={styles.helper}>
              {selectedPages.length} page(s) selected:{" "}
              {selectedPages.join(", ")}
            </Text>

            <Pressable
              style={styles.secondaryButton}
              onPress={() => setStage("preview")}
            >
              <Text style={styles.secondaryButtonText}>Change Selection</Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Name your new PDF</Text>

            <TextInput
              value={outputName}
              onChangeText={setOutputName}
              placeholder="Extracted Pages"
              placeholderTextColor="#8A8FA3"
              autoCapitalize="sentences"
              returnKeyType="done"
              submitBehavior="blurAndSubmit"
              style={styles.input}
            />

            <Text style={styles.helper}>
              The original PDF will remain unchanged.
            </Text>
          </View>

          <Pressable
            disabled={splitting}
            onPress={handleSplit}
            style={[styles.primaryButton, splitting && styles.disabledButton]}
          >
            {splitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Extract Pages</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Split PDF" subtitle="Choose a PDF to get started." />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose a PDF</Text>
          <Text style={styles.helper}>
            Select a document, then open its page preview.
          </Text>

          {loading ? (
            <ActivityIndicator size="large" color="#6C63FF" />
          ) : documents.length === 0 ? (
            <Text style={styles.helper}>
              Your library is empty. Import a PDF from the Library tab first.
            </Text>
          ) : (
            documents.map((document) => {
              const selected = selectedDocument?.id === document.id;

              return (
                <View
                  key={document.id}
                  style={[styles.fileRow, selected && styles.fileRowSelected]}
                >
                  <Pressable
                    style={styles.fileInfo}
                    onPress={() => chooseDocument(document)}
                  >
                    <Text style={styles.fileName}>{document.name}</Text>
                    <Text style={styles.fileSize}>
                      {document.size
                        ? `${(document.size / (1024 * 1024)).toFixed(2)} MB`
                        : "PDF document"}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.selectButton,
                      !selected && styles.selectButtonInactive,
                    ]}
                    onPress={() => {
                      if (!selected) chooseDocument(document);
                      setStage("preview");
                    }}
                  >
                    <Text
                      style={[
                        styles.selectButtonText,
                        !selected && styles.selectButtonTextInactive,
                      ]}
                    >
                      Select Pages
                    </Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F8FC",
  },
  fullScreen: {
    flex: 1,
    backgroundColor: "#F7F8FC",
  },
  header: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E9EAF2",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#F0EFFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  backText: {
    color: "#6C63FF",
    fontSize: 30,
    lineHeight: 34,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    color: "#20243A",
    fontSize: 18,
    fontWeight: "800",
  },
  headerSubtitle: {
    color: "#858A9E",
    fontSize: 11,
    marginTop: 3,
  },
  content: {
    padding: 18,
    paddingBottom: 36,
  },
  section: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E9EAF2",
    marginBottom: 16,
  },
  sectionTitle: {
    color: "#20243A",
    fontSize: 16,
    fontWeight: "800",
  },
  helper: {
    color: "#858A9E",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 8,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#E9EAF2",
    marginTop: 10,
  },
  fileRowSelected: {
    backgroundColor: "#F0EFFF",
    borderColor: "#6C63FF",
  },
  fileInfo: {
    flex: 1,
    paddingVertical: 5,
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
  selectButton: {
    backgroundColor: "#6C63FF",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 11,
  },
  selectButtonInactive: {
    backgroundColor: "#F0EFFF",
  },
  selectButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  selectButtonTextInactive: {
    color: "#6C63FF",
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
  primaryButton: {
    backgroundColor: "#6C63FF",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  disabledButton: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    alignSelf: "flex-start",
    marginTop: 12,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F0EFFF",
  },
  secondaryButtonText: {
    color: "#6C63FF",
    fontSize: 12,
    fontWeight: "800",
  },
});

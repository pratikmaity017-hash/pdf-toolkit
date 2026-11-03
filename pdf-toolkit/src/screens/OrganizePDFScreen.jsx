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
  Keyboard,
} from "react-native";

import { getDocuments, saveDocument } from "../database/database";
import { organizePdfFile } from "../services/pdfOrganizerService";
import PDFOrganizerPreview from "../components/PDFOrganizerPreview";

export default function OrganizePDFScreen({ onBack, initialDocument = null }) {
  const [documents, setDocuments] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState(initialDocument);
  const [pageOperations, setPageOperations] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [outputName, setOutputName] = useState("Organized PDF");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState(initialDocument ? "preview" : "choose");

  useEffect(() => {
    let mounted = true;

    async function loadDocuments() {
      try {
        const result = await getDocuments();

        if (mounted) {
          setDocuments(result);
        }
      } catch (error) {
        console.error("Could not load PDFs:", error);
        Alert.alert("Error", "Could not load your PDF library.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadDocuments();

    return () => {
      mounted = false;
    };
  }, []);

  function chooseDocument(document) {
    setSelectedDocument(document);
    setPageOperations([]);
    setTotalPages(0);

    const baseName = document.name.replace(/\.pdf$/i, "");
    setOutputName(`${baseName} - Organized`);
    setStage("preview");
  }

  function handleOperationsChange(operations) {
    setPageOperations(operations);
  }

  function handlePageCount(count) {
    setTotalPages(count);
  }

  async function handleSave() {
    if (!selectedDocument) {
      Alert.alert("PDF required", "Please select a PDF first.");
      return;
    }

    if (pageOperations.length === 0) {
      Alert.alert("Pages required", "Your PDF must contain at least one page.");
      return;
    }

    if (!outputName.trim()) {
      Alert.alert("Filename required", "Enter a name for the new PDF.");
      return;
    }

    setSaving(true);

    try {
      const organizedDocument = await organizePdfFile(
        selectedDocument,
        pageOperations,
        outputName,
      );

      await saveDocument(organizedDocument);

      Alert.alert(
        "PDF organized",
        `${organizedDocument.name} was saved to your Library with ${organizedDocument.pageCount} pages.`,
        [{ text: "OK", onPress: onBack }],
      );
    } catch (error) {
      console.error("PDF organization failed:", error);

      Alert.alert(
        "Organization failed",
        error?.message || "Could not organize this PDF.",
      );
    } finally {
      setSaving(false);
    }
  }

  function Header({ title, subtitle }) {
    return (
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (stage === "choose") {
              onBack?.();
            } else {
              setStage("choose");
              setSelectedDocument(null);
              setPageOperations([]);
              setTotalPages(0);
            }
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
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <Header title="Organize Pages" subtitle={selectedDocument.name} />

        <View style={styles.previewContainer}>
          <PDFOrganizerPreview
            key={selectedDocument.uri}
            document={selectedDocument}
            onOperationsChange={handleOperationsChange}
            onPageCount={handlePageCount}
          />
        </View>

        <View style={styles.bottomPanel}>
          <Text style={styles.pageSummary}>
            {pageOperations.length} page(s) in output
            {totalPages > 0 ? ` · ${totalPages} original` : ""}
          </Text>

          <TextInput
            value={outputName}
            onChangeText={setOutputName}
            placeholder="Enter output PDF name"
            placeholderTextColor="#8A8FA3"
            style={styles.input}
            editable={!saving}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          <Text style={styles.helper}>
            Your original PDF will remain unchanged.
          </Text>

          <Pressable
            onPress={handleSave}
            disabled={saving || pageOperations.length === 0}
            style={[
              styles.primaryButton,
              (saving || pageOperations.length === 0) && styles.disabledButton,
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Save Organized PDF</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Organize PDF"
        subtitle="Choose a PDF to manage its pages."
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose a PDF</Text>

          <Text style={styles.helper}>
            Select a PDF from your Library to reorder, rotate, duplicate or
            delete individual pages.
          </Text>

          {loading ? (
            <ActivityIndicator
              size="large"
              color="#6C63FF"
              style={styles.loader}
            />
          ) : documents.length === 0 ? (
            <Text style={styles.helper}>
              Your Library is empty. Import a PDF first.
            </Text>
          ) : (
            documents.map((document) => (
              <View key={document.id} style={styles.fileRow}>
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName} numberOfLines={2}>
                    {document.name}
                  </Text>

                  <Text style={styles.fileSize}>
                    {document.size
                      ? `${(document.size / (1024 * 1024)).toFixed(2)} MB`
                      : "PDF document"}
                  </Text>
                </View>

                <Pressable
                  style={styles.selectButton}
                  onPress={() => chooseDocument(document)}
                >
                  <Text style={styles.selectButtonText}>Select</Text>
                </Pressable>
              </View>
            ))
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
  previewContainer: {
    flex: 1,
    minHeight: 0,
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
  loader: {
    marginTop: 25,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 11,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#E9EAF2",
    marginTop: 12,
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
  selectButton: {
    backgroundColor: "#6C63FF",
    borderRadius: 10,
    paddingHorizontal: 17,
    paddingVertical: 11,
  },
  selectButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  bottomPanel: {
    padding: 15,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E9EAF2",
  },
  pageSummary: {
    color: "#252941",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 9,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E2E4EF",
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: "#252941",
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: "#6C63FF",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 12,
  },
  disabledButton: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

import { getDocuments, saveDocument } from "../database/database";
import { addTextWatermark } from "../services/pdfWatermarkService";

function Field({ label, value, onChangeText, placeholder, keyboardType }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8A8FA3"
        keyboardType={keyboardType || "default"}
        autoCapitalize="none"
        style={styles.input}
      />
    </View>
  );
}

export default function PDFWatermarkScreen({ onBack }) {
  const [documents, setDocuments] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState(null);

  const [watermarkText, setWatermarkText] = useState("CONFIDENTIAL");
  const [outputName, setOutputName] = useState("Watermarked Document");
  const [color, setColor] = useState("#777777");
  const [fontSize, setFontSize] = useState("40");
  const [opacity, setOpacity] = useState("0.25");
  const [rotation, setRotation] = useState("-45");

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

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

  async function handleApplyWatermark() {
    if (!selectedDocument) {
      Alert.alert("PDF required", "Select a PDF first.");
      return;
    }

    if (!watermarkText.trim()) {
      Alert.alert("Text required", "Enter your watermark text.");
      return;
    }

    if (!outputName.trim()) {
      Alert.alert("Filename required", "Enter a name for the new PDF.");
      return;
    }

    setProcessing(true);

    try {
      const watermarkedDocument = await addTextWatermark(selectedDocument, {
        text: watermarkText,
        outputName,
        color,
        fontSize,
        opacity,
        rotation,
      });

      await saveDocument(watermarkedDocument);

      Alert.alert(
        "Watermark added",
        `${watermarkedDocument.name} was saved to your PDF library.`,
        [{ text: "OK", onPress: onBack }],
      );
    } catch (error) {
      console.error("PDF watermark error:", error);

      Alert.alert(
        "Watermark failed",
        error?.message || "Something went wrong while adding the watermark.",
      );
    } finally {
      setProcessing(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>

        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>PDF Watermark</Text>
          <Text style={styles.headerSubtitle}>
            Add a text watermark to your PDF.
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Choose a PDF</Text>

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
                <Pressable
                  key={document.id}
                  onPress={() => setSelectedDocument(document)}
                  style={[styles.fileRow, selected && styles.fileRowSelected]}
                >
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName}>{document.name}</Text>
                    <Text style={styles.fileSize}>
                      {document.size
                        ? `${(document.size / (1024 * 1024)).toFixed(2)} MB`
                        : "PDF document"}
                    </Text>
                  </View>

                  <Text
                    style={[styles.selectText, selected && styles.selectedText]}
                  >
                    {selected ? "Selected" : "Select"}
                  </Text>
                </Pressable>
              );
            })
          )}

          {selectedDocument && (
            <Text style={styles.helper}>Selected: {selectedDocument.name}</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Watermark settings</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Watermark text</Text>

            <TextInput
              value={watermarkText}
              onChangeText={setWatermarkText}
              placeholder="CONFIDENTIAL"
              placeholderTextColor="#8A8FA3"
              style={styles.input}
            />

            <Pressable
              onPress={() => setWatermarkText("")}
              style={{ alignSelf: "flex-start", paddingVertical: 10 }}
            >
              <Text style={{ color: "#6C63FF", fontWeight: "700" }}>
                Clear entire text
              </Text>
            </Pressable>
          </View>

          <Field
            label="Text color (HEX)"
            value={color}
            onChangeText={setColor}
            placeholder="#777777"
          />

          <Field
            label="Font size (8–150)"
            value={fontSize}
            onChangeText={setFontSize}
            keyboardType="numeric"
          />

          <Field
            label="Opacity (0.05–1)"
            value={opacity}
            onChangeText={setOpacity}
            keyboardType="decimal-pad"
          />

          <Field
            label="Rotation (-90 to 90 degrees)"
            value={rotation}
            onChangeText={setRotation}
            keyboardType="numbers-and-punctuation"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Output PDF</Text>

          <Field
            label="New PDF filename"
            value={outputName}
            onChangeText={setOutputName}
            placeholder="Watermarked Document"
          />

          <Text style={styles.helper}>
            The watermark will be added to every page. Your original PDF will
            remain unchanged.
          </Text>
        </View>

        <Pressable
          disabled={processing || loading || documents.length === 0}
          onPress={handleApplyWatermark}
          style={[styles.primaryButton, processing && styles.disabledButton]}
        >
          {processing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Apply Watermark</Text>
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
    marginBottom: 12,
  },
  field: {
    marginTop: 10,
  },
  label: {
    color: "#555B70",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 7,
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
  helper: {
    color: "#858A9E",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 10,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#E9EAF2",
    marginTop: 9,
  },
  fileRowSelected: {
    backgroundColor: "#F0EFFF",
    borderColor: "#6C63FF",
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
  selectText: {
    color: "#858A9E",
    fontSize: 11,
    fontWeight: "800",
    marginLeft: 8,
  },
  selectedText: {
    color: "#6C63FF",
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
});

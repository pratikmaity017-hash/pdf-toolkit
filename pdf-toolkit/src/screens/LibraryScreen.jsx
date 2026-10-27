import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getDocuments, saveDocument } from "../database/database";
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";

const PDF_DIRECTORY = new Directory(Paths.document, "pdf-toolkit");

export default function LibraryScreen() {
  const [documents, setDocuments] = useState([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadDocuments() {
      try {
        const savedDocuments = await getDocuments();

        if (isMounted) {
          setDocuments(savedDocuments);
        }
      } catch (error) {
        console.error("Failed to load saved PDFs:", error);
        Alert.alert("Library error", "Could not load your saved documents.");
      }
    }

    loadDocuments();

    return () => {
      isMounted = false;
    };
  }, []);

  async function importPDF() {
    try {
      setImporting(true);

      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: false,
        multiple: false,
      });

      if (result.canceled) return;

      const asset = result.assets?.[0];

      if (!asset?.uri) {
        Alert.alert("Import failed", "Could not read the selected PDF.");
        return;
      }

      const fileName = asset.name || "document.pdf";

      if (
        asset.mimeType !== "application/pdf" &&
        !fileName.toLowerCase().endsWith(".pdf")
      ) {
        Alert.alert("Invalid file", "Please select a PDF document.");
        return;
      }

      if (!PDF_DIRECTORY.exists) {
        PDF_DIRECTORY.create({
          intermediates: true,
          idempotent: true,
        });
      }

      const safeName = fileName.replace(/[\\/]/g, "_");
      const storedName = `${Date.now()}-${safeName}`;

      const destinationFile = new File(PDF_DIRECTORY, storedName);

      await FileSystem.copyAsync({
        from: asset.uri,
        to: destinationFile.uri,
      });

      const newDocument = {
        id: storedName,
        name: fileName,
        uri: destinationFile.uri,
        size: destinationFile.size || asset.size || 0,
      };

      await saveDocument(newDocument);

      setDocuments((current) => [newDocument, ...current]);

      Alert.alert(
        "Import successful",
        `${fileName} was added to your library.`,
      );
    } catch (error) {
      console.error("PDF import failed:", error);

      Alert.alert(
        "Import failed",
        error?.message || "Could not import this PDF. Please try again.",
      );
    } finally {
      setImporting(false);
    }
  }

  function formatSize(bytes) {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function renderDocument({ item }) {
    return (
      <View style={styles.documentCard}>
        <View style={styles.pdfIcon}>
          <Text style={styles.pdfIconText}>PDF</Text>
        </View>

        <View style={styles.documentInfo}>
          <Text style={styles.documentName} numberOfLines={2}>
            {item.name}
          </Text>

          <Text style={styles.documentSize}>{formatSize(item.size)}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>YOUR FILES</Text>
      <Text style={styles.title}>My Library</Text>
      <Text style={styles.description}>
        Import and manage PDFs stored on your device.
      </Text>

      <Pressable
        style={({ pressed }) => [
          styles.importButton,
          pressed && styles.pressed,
          importing && styles.disabled,
        ]}
        onPress={importPDF}
        disabled={importing}
      >
        {importing ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.importButtonText}>＋ Import PDF</Text>
        )}
      </Pressable>

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>Your Documents</Text>
        <Text style={styles.count}>{documents.length}</Text>
      </View>

      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        renderItem={renderDocument}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>▤</Text>
            <Text style={styles.emptyTitle}>No PDFs yet</Text>
            <Text style={styles.emptyText}>
              Import a PDF to add your first document to this library.
            </Text>
          </View>
        }
      />

      <Text style={styles.footer}>
        Imported documents are copied into this app's private storage.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F6F7FC",
    paddingHorizontal: 22,
    paddingTop: 35,
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
  },
  importButton: {
    backgroundColor: "#6C63FF",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginTop: 23,
  },
  importButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.6,
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 27,
    marginBottom: 14,
  },
  sectionTitle: {
    color: "#24263A",
    fontSize: 18,
    fontWeight: "800",
  },
  count: {
    color: "#6C63FF",
    backgroundColor: "#EFEEFF",
    overflow: "hidden",
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 10,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 15,
  },
  documentCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ECECF4",
    marginBottom: 11,
  },
  pdfIcon: {
    width: 48,
    height: 54,
    borderRadius: 12,
    backgroundColor: "#FCEBED",
    alignItems: "center",
    justifyContent: "center",
  },
  pdfIconText: {
    color: "#D64555",
    fontSize: 12,
    fontWeight: "900",
  },
  documentInfo: {
    flex: 1,
    marginLeft: 13,
  },
  documentName: {
    color: "#24263A",
    fontSize: 13,
    fontWeight: "700",
  },
  documentSize: {
    color: "#85899A",
    fontSize: 11,
    marginTop: 6,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 25,
    alignItems: "center",
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#ECECF4",
  },
  emptyIcon: {
    color: "#6C63FF",
    fontSize: 42,
  },
  emptyTitle: {
    color: "#24263A",
    fontSize: 17,
    fontWeight: "800",
    marginTop: 12,
  },
  emptyText: {
    color: "#85899A",
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 7,
  },
  footer: {
    color: "#85899A",
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    paddingTop: 10,
    paddingBottom: 12,
  },
});

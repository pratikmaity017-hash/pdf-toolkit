import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  Modal,
  TextInput,
} from "react-native";
import {
  getDocuments,
  saveDocument,
  renameDocument,
  deleteDocument,
  markDocumentOpened,
} from "../database/database";
import ReaderScreen from "./ReaderScreen";
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";

const PDF_DIRECTORY = new Directory(Paths.document, "pdf-toolkit");

export default function LibraryScreen() {
  const [documents, setDocuments] = useState([]);
  const [importing, setImporting] = useState(false);
  const [renameVisible, setRenameVisible] = useState(false);
  const [documentToRename, setDocumentToRename] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);

  const [menuDocument, setMenuDocument] = useState(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("date-newest");

  useFocusEffect(
    useCallback(() => {
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
    }, []),
  );

  async function importPDF() {
    try {
      setImporting(true);

      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: false,
        multiple: true,
      });

      if (result.canceled) return;

      const assets = result.assets ?? [];

      if (assets.length === 0) {
        Alert.alert("No files selected", "Please select at least one PDF.");
        return;
      }

      if (!PDF_DIRECTORY.exists) {
        PDF_DIRECTORY.create({
          intermediates: true,
          idempotent: true,
        });
      }

      const importedDocuments = [];
      const failedFiles = [];

      for (const asset of assets) {
        try {
          const fileName = asset.name || "document.pdf";

          const isPDF =
            asset.mimeType === "application/pdf" ||
            fileName.toLowerCase().endsWith(".pdf");

          if (!asset.uri || !isPDF) {
            failedFiles.push(fileName);
            continue;
          }

          const safeName = fileName.replace(/[\\/]/g, "_");
          const storedName = `${Date.now()}-${importedDocuments.length}-${safeName}`;
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
          importedDocuments.push(newDocument);
        } catch (error) {
          console.error(`Failed to import ${asset.name}:`, error);
          failedFiles.push(asset.name || "Unknown PDF");
        }
      }

      if (importedDocuments.length > 0) {
        setDocuments((current) => [...importedDocuments, ...current]);
      }

      if (failedFiles.length === 0) {
        Alert.alert(
          "Import successful",
          `${importedDocuments.length} PDF(s) added to your library.`,
        );
      } else {
        Alert.alert(
          "Import completed",
          `${importedDocuments.length} PDF(s) imported successfully.\n${failedFiles.length} file(s) could not be imported.`,
        );
      }
    } catch (error) {
      console.error("PDF import failed:", error);
      Alert.alert(
        "Import failed",
        error?.message || "Could not import the selected PDFs.",
      );
    } finally {
      setImporting(false);
    }
  }

  const filteredDocuments = documents
    .filter((document) =>
      document.name.toLowerCase().includes(searchQuery.trim().toLowerCase()),
    )
    .sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "date-oldest":
          return (a.created_at ?? 0) - (b.created_at ?? 0);
        case "size-largest":
          return b.size - a.size;
        case "size-smallest":
          return a.size - b.size;
        case "recently-opened":
          return (b.last_opened_at ?? 0) - (a.last_opened_at ?? 0);
        case "date-newest":
        default:
          return (b.created_at ?? 0) - (a.created_at ?? 0);
      }
    });

  function formatSize(bytes = 0) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatDate(timestamp) {
    if (!timestamp) return "Not available";
    return new Date(timestamp).toLocaleString();
  }

  function openRename(item) {
    setDocumentToRename(item);
    setRenameValue(item.name);
    setRenameVisible(true);
  }

  function closeRename() {
    if (renaming) return;

    setRenameVisible(false);
    setDocumentToRename(null);
    setRenameValue("");
  }

  function closeDeleteConfirmation() {
    if (deleting) return;

    setDeleteConfirmVisible(false);
    setDocumentToDelete(null);
  }

  async function openDocument(item) {
    setMenuDocument(null);

    if (!item) return;

    try {
      await markDocumentOpened(item.id);
    } catch (error) {
      console.error("Failed to update last-opened time:", error);
    }

    setSelectedDocument(item);
  }

  async function handleRename() {
    if (!documentToRename || renaming) return;

    const trimmedName = renameValue.trim();

    if (!trimmedName) {
      Alert.alert("Invalid name", "Please enter a document name.");
      return;
    }

    const newName = trimmedName.toLowerCase().endsWith(".pdf")
      ? trimmedName
      : `${trimmedName}.pdf`;

    if (/[\\/]/.test(newName)) {
      Alert.alert("Invalid name", "A document name cannot contain / or \\.");
      return;
    }

    try {
      setRenaming(true);

      await renameDocument(documentToRename.id, newName);

      setDocuments((current) =>
        current.map((document) =>
          document.id === documentToRename.id
            ? { ...document, name: newName }
            : document,
        ),
      );

      setRenameVisible(false);
      setDocumentToRename(null);
      setRenameValue("");

      Alert.alert("Rename successful", "Document name updated.");
    } catch (error) {
      console.error("Failed to rename PDF:", error);
      Alert.alert("Rename failed", "Could not rename this document.");
    } finally {
      setRenaming(false);
    }
  }

  // Deletes the file and its database record.
  // Confirmation is handled by the custom Delete Confirmation Modal.
  async function handleDelete(item) {
    if (!item || deleting) return;

    try {
      setDeleting(true);

      const file = new File(item.uri);

      if (file.exists) {
        file.delete();
      }

      await deleteDocument(item.id);

      setDocuments((current) =>
        current.filter((document) => document.id !== item.id),
      );

      setDeleteConfirmVisible(false);
      setDocumentToDelete(null);

      Alert.alert("Deleted", "The PDF was deleted successfully.");
    } catch (error) {
      console.error("Failed to delete PDF:", error);

      Alert.alert(
        "Delete failed",
        "Could not delete this PDF. Please try again.",
      );
    } finally {
      setDeleting(false);
    }
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

        <Pressable
          onPress={() => setMenuDocument(item)}
          style={styles.menuButton}
          accessibilityRole="button"
          accessibilityLabel={`Options for ${item.name}`}
        >
          <Text style={styles.menuButtonText}>{"\u22EE"}</Text>
        </Pressable>
      </View>
    );
  }

  if (selectedDocument) {
    return (
      <ReaderScreen
        document={selectedDocument}
        onBack={async () => {
          setSelectedDocument(null);

          try {
            const updatedDocuments = await getDocuments();
            setDocuments(updatedDocuments);
          } catch (error) {
            console.error("Failed to refresh Library:", error);
          }
        }}
      />
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

      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>⌕</Text>

        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search your PDFs..."
          placeholderTextColor="#9293A4"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      <View style={styles.sortContainer}>
        <Text style={styles.sortLabel}>Sort by</Text>

        <View style={styles.sortOptions}>
          {[
            { label: "Date Added", value: "date-newest" },
            { label: "Recently Opened", value: "recently-opened" },
            { label: "Name A–Z", value: "name-asc" },
            { label: "Name Z–A", value: "name-desc" },
            { label: "Largest", value: "size-largest" },
            { label: "Smallest", value: "size-smallest" },
            { label: "Oldest", value: "date-oldest" },
          ].map((option) => (
            <Pressable
              key={option.value}
              style={[
                styles.sortChip,
                sortBy === option.value && styles.sortChipActive,
              ]}
              onPress={() => setSortBy(option.value)}
            >
              <Text
                style={[
                  styles.sortChipText,
                  sortBy === option.value && styles.sortChipTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>Your Documents</Text>
        <Text style={styles.count}>{filteredDocuments.length}</Text>
      </View>

      <FlatList
        data={filteredDocuments}
        keyExtractor={(item) => item.id}
        renderItem={renderDocument}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>▤</Text>
            <Text style={styles.emptyTitle}>
              {searchQuery.trim() ? "No documents found" : "No PDFs yet"}
            </Text>

            <Text style={styles.emptyText}>
              {searchQuery.trim()
                ? "Try another document name."
                : "Import a PDF to add your first document to this library."}
            </Text>
          </View>
        }
      />

      <Text style={styles.footer}>
        Imported documents are copied into this app's private storage.
      </Text>

      {/* Document Options Modal — outside renderDocument */}
      <Modal
        visible={!!menuDocument}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuDocument(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setMenuDocument(null)}
        >
          <Pressable
            style={styles.optionsModal}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.optionsTitle}>Document Options</Text>
            <Text style={styles.optionsSubtitle} numberOfLines={2}>
              {menuDocument?.name}
            </Text>

            <Pressable
              style={styles.optionRow}
              onPress={() => openDocument(menuDocument)}
            >
              <Text style={styles.optionText}>Open PDF</Text>
            </Pressable>

            <Pressable
              style={styles.optionRow}
              onPress={() => {
                const item = menuDocument;
                setMenuDocument(null);

                if (!item) return;

                Alert.alert(
                  "PDF Details",
                  [
                    `Name: ${item.name}`,
                    `File size: ${formatSize(item.size ?? 0)}`,
                    `Pages: ${
                      item.page_count > 0 ? item.page_count : "Not available"
                    }`,
                    `Date added: ${formatDate(item.created_at)}`,
                    `Last opened: ${formatDate(item.last_opened_at)}`,
                  ].join("\n"),
                  [{ text: "Close" }],
                );
              }}
            >
              <Text style={styles.optionText}>Details</Text>
            </Pressable>

            <Pressable
              style={styles.optionRow}
              onPress={() => {
                const item = menuDocument;
                setMenuDocument(null);

                if (item) openRename(item);
              }}
            >
              <Text style={styles.optionText}>Rename</Text>
            </Pressable>

            <Pressable
              style={styles.optionRow}
              onPress={() => {
                const item = menuDocument;
                setMenuDocument(null);

                if (item) {
                  setDocumentToDelete(item);
                  setDeleteConfirmVisible(true);
                }
              }}
            >
              <Text style={styles.deleteOptionText}>Delete PDF</Text>
            </Pressable>

            <Pressable
              style={[styles.optionRow, styles.optionCancel]}
              onPress={() => setMenuDocument(null)}
            >
              <Text style={styles.optionCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete Confirmation Modal — outside renderDocument */}
      <Modal
        visible={deleteConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteConfirmation}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.optionsModal}>
            <Text style={styles.optionsTitle}>Delete PDF?</Text>

            <Text style={styles.optionsSubtitle}>
              Are you sure you want to delete "{documentToDelete?.name}"? This
              action cannot be undone.
            </Text>

            <View style={styles.renameActions}>
              <Pressable
                style={[styles.renameButton, styles.cancelButton]}
                onPress={closeDeleteConfirmation}
                disabled={deleting}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.renameButton,
                  styles.deleteConfirmButton,
                  deleting && styles.disabled,
                ]}
                onPress={() => handleDelete(documentToDelete)}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.deleteConfirmText}>Delete</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Existing Rename Modal */}
      <Modal
        visible={renameVisible}
        transparent
        animationType="fade"
        onRequestClose={closeRename}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.renameModal}>
            <Text style={styles.renameTitle}>Rename PDF</Text>

            <Text style={styles.renameDescription}>
              Enter a new name for your document.
            </Text>

            <TextInput
              style={styles.renameInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Document name"
              placeholderTextColor="#9293A4"
              autoCapitalize="sentences"
              autoCorrect={false}
              selectTextOnFocus
              editable={!renaming}
              returnKeyType="done"
              onSubmitEditing={handleRename}
            />

            <View style={styles.renameActions}>
              <Pressable
                style={[styles.renameButton, styles.cancelButton]}
                onPress={closeRename}
                disabled={renaming}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.renameButton, styles.saveButton]}
                onPress={handleRename}
                disabled={renaming}
              >
                {renaming ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#ECECF4",
    borderRadius: 14,
    paddingHorizontal: 14,
    marginTop: 20,
    minHeight: 50,
  },
  searchIcon: {
    fontSize: 25,
    color: "#777D91",
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: "#24263A",
    fontSize: 14,
    paddingVertical: 12,
  },
  sortContainer: {
    marginTop: 15,
  },
  sortLabel: {
    color: "#777D91",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 10,
  },
  sortOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#ECECF4",
  },
  sortChipActive: {
    backgroundColor: "#EFEEFF",
    borderColor: "#6C63FF",
  },
  sortChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#777D91",
  },
  sortChipTextActive: {
    color: "#6C63FF",
    fontWeight: "800",
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
  menuButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  menuButtonText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#6C63FF",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(20, 20, 40, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  renameModal: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 22,
  },
  renameTitle: {
    fontSize: 21,
    fontWeight: "700",
    color: "#171A2B",
  },
  renameDescription: {
    fontSize: 14,
    color: "#77798B",
    marginTop: 8,
    marginBottom: 18,
  },
  renameInput: {
    borderWidth: 1,
    borderColor: "#DAD9F5",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#171A2B",
  },
  renameActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 20,
  },
  renameButton: {
    minWidth: 90,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: "#F0F0F8",
  },
  saveButton: {
    backgroundColor: "#6C63FF",
  },
  cancelButtonText: {
    color: "#414258",
    fontWeight: "600",
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  optionsModal: {
    width: "90%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 20,
  },
  optionsTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#171A2B",
  },
  optionsSubtitle: {
    fontSize: 13,
    color: "#77798B",
    marginTop: 6,
    marginBottom: 12,
  },
  optionRow: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: "#EEEEF5",
  },
  optionText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#24263A",
  },
  deleteOptionText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#D32F45",
  },
  optionCancel: {
    marginTop: 4,
    borderTopWidth: 0,
    backgroundColor: "#F2F1FA",
    borderRadius: 10,
    alignItems: "center",
  },
  optionCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#5147A8",
  },
  deleteConfirmButton: {
    backgroundColor: "#D32F45",
  },
  deleteConfirmText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});

import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  Text,
  View,
} from "react-native";

import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { PDFDocument } from "pdf-lib";
import { Directory, File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import { Asset } from "expo-asset";
import fontkit from "@pdf-lib/fontkit";
import * as Mammoth from "mammoth/mammoth.browser";
import * as Print from "expo-print";

import { saveDocument } from "../database/database";

const PDF_DIRECTORY = new Directory(Paths.document, "pdf-toolkit");

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const PAGE_MARGIN = 36;

export default function ConvertFilesToPDFScreen({ onBack }) {
  const [selectedImages, setSelectedImages] = useState([]);
  const [converting, setConverting] = useState(false);
  const [pdfName, setPdfName] = useState("");
  const [selectedTextFile, setSelectedTextFile] = useState(null);
  const [textContent, setTextContent] = useState("");
  const [textPdfName, setTextPdfName] = useState("");
  const [selectedDocxFile, setSelectedDocxFile] = useState(null);
  const [docxPdfName, setDocxPdfName] = useState("");
  async function selectFromGallery() {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission required",
          "Allow photo access to select images from your gallery.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: 20,
        quality: 1,
      });

      if (result.canceled) return;

      addImages(result.assets ?? []);
    } catch (error) {
      console.error("Gallery selection failed:", error);
      Alert.alert("Error", "Could not open your photo gallery.");
    }
  }

  async function selectFromFiles() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/jpeg", "image/png"],
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      addImages(result.assets ?? []);
    } catch (error) {
      console.error("File selection failed:", error);
      Alert.alert("Error", "Could not select image files.");
    }
  }

  async function selectTextFile() {
    try {
      const result = await File.pickFileAsync({
        mimeTypes: ["text/plain"],
      });

      if (result.canceled) return;

      const pickedFile = result.result;
      const fileName = pickedFile.name || "document.txt";

      // Android may return a filename without the .txt extension.
      // Since the picker already filters for text/plain, don't
      // reject the file based only on its displayed filename.
      const content = await pickedFile.text();

      setSelectedTextFile({
        uri: pickedFile.uri,
        name: fileName,
      });

      setTextContent(content);

      setTextPdfName(fileName.replace(/\.txt$/i, "") || "My Text Document");
    } catch (error) {
      console.error("TXT file selection failed:", error);

      Alert.alert(
        "Could not open file",
        error?.message || "Please try selecting another TXT file.",
      );
    }
  }

  async function selectDocxFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const pickedFile = result.assets?.[0];

      if (!pickedFile?.uri) {
        Alert.alert("Could not open file", "Please select a DOCX file.");
        return;
      }

      const fileName = pickedFile.name || "document.docx";

      if (!fileName.toLowerCase().endsWith(".docx")) {
        Alert.alert(
          "Unsupported file",
          "Please select a Microsoft Word DOCX file.",
        );
        return;
      }

      setSelectedDocxFile({
        uri: pickedFile.uri,
        name: fileName,
        size: pickedFile.size || 0,
      });

      setDocxPdfName(fileName.replace(/\.docx$/i, "") || "My Word Document");
    } catch (error) {
      console.error("DOCX selection failed:", error);

      Alert.alert(
        "Could not select DOCX",
        error?.message || "Please try selecting another Word document.",
      );
    }
  }

  async function convertDocxToPDF() {
    if (!selectedDocxFile?.uri) {
      Alert.alert("No DOCX selected", "Please select a Word document first.");
      return;
    }

    const outputName = docxPdfName.trim();

    if (!outputName) {
      Alert.alert("PDF name required", "Please enter a name for the PDF.");
      return;
    }

    setConverting(true);

    try {
      // 1. Read the selected DOCX file.
      const response = await fetch(selectedDocxFile.uri);
      const arrayBuffer = await response.arrayBuffer();

      // 2. Convert DOCX content into HTML.
      const result = await Mammoth.convertToHtml({ arrayBuffer });

      if (!result.value?.trim()) {
        throw new Error("No readable text was found in this Word document.");
      }

      // 3. Escape the filename before placing it in HTML.
      const safeTitle = outputName.replace(/[&<>"']/g, (char) => {
        const entities = {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        };

        return entities[char];
      });

      // 4. Prepare printable HTML.
      const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            @page {
              size: A4;
              margin: 22mm 18mm;
            }

            body {
              font-family: Arial, sans-serif;
              font-size: 12pt;
              line-height: 1.6;
              color: #222;
              overflow-wrap: break-word;
            }

            h1, h2, h3, h4 {
              line-height: 1.3;
              page-break-after: avoid;
            }

            p {
              margin: 0 0 12px;
            }

            img {
              max-width: 100%;
              height: auto;
            }

            table {
              max-width: 100%;
              border-collapse: collapse;
            }

            td, th {
              border: 1px solid #999;
              padding: 5px;
            }

            pre {
              white-space: pre-wrap;
              overflow-wrap: break-word;
            }
          </style>
        </head>
        <body>
          <h1>${safeTitle}</h1>
          ${result.value}
        </body>
      </html>
    `;

      // 5. Render the HTML as a temporary PDF.
      const printed = await Print.printToFileAsync({
        html,
        width: 595,
        height: 842,
        base64: true,
      });

      if (!printed.base64) {
        throw new Error("Expo Print did not return PDF data.");
      }

      if (!printed?.uri) {
        throw new Error("The PDF could not be generated.");
      }

      // 6. Create the app's PDF directory if necessary.
      PDF_DIRECTORY.create({
        intermediates: true,
        idempotent: true,
      });

      // 7. Copy the generated PDF into the app's library folder.
      const id = `docx-${Date.now()}`;
      const destination = new File(PDF_DIRECTORY, `${id}.pdf`);
      await FileSystem.writeAsStringAsync(destination.uri, printed.base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.log("PDF saved:", destination.uri);

      // 8. Register the PDF in the existing SQLite library.
      const fileInfo = await FileSystem.getInfoAsync(destination.uri);

      await saveDocument({
        id,
        name: `${outputName}.pdf`,
        uri: destination.uri,
        size: fileInfo.size || 0,
        pageCount: printed.numberOfPages || 0,
      });

      Alert.alert(
        "Conversion successful",
        `${outputName}.pdf has been saved to your PDF Toolkit library.`,
      );

      setSelectedDocxFile(null);
      setDocxPdfName("");
    } catch (error) {
      console.error("DOCX to PDF conversion failed:", error);

      Alert.alert(
        "Conversion failed",
        error?.message || "Could not convert this Word document.",
      );
    } finally {
      setConverting(false);
    }
  }

  async function convertTextToPDF() {
    if (converting) return;

    if (!selectedTextFile) {
      Alert.alert("Select a TXT file", "Please select a text file first.");
      return;
    }

    const trimmedName = textPdfName.trim();

    if (!trimmedName) {
      Alert.alert("PDF name required", "Please enter a PDF filename.");
      return;
    }

    const cleanName = trimmedName.replace(/\.pdf$/i, "").trim();

    if (!cleanName || /[\\/]/.test(cleanName)) {
      Alert.alert(
        "Invalid filename",
        "Enter a valid filename without / or \\.",
      );
      return;
    }

    if (!textContent.trim()) {
      Alert.alert(
        "Empty text",
        "The selected TXT file has no text to convert.",
      );
      return;
    }

    let outputFile = null;
    let savedToDatabase = false;

    try {
      setConverting(true);

      if (!PDF_DIRECTORY.exists) {
        PDF_DIRECTORY.create({
          intermediates: true,
          idempotent: true,
        });
      }

      const baseName = `${cleanName}.pdf`;
      const id = `${Date.now()}-${baseName}`;
      outputFile = new File(PDF_DIRECTORY, id);

      const pdfDocument = await PDFDocument.create();

      pdfDocument.registerFontkit(fontkit);

      const fontAsset = Asset.fromModule(
        require("../../assets/fonts/NotoSansBengali-VariableFont_wdth,wght.ttf"),
      );

      await fontAsset.downloadAsync();

      if (!fontAsset.localUri) {
        throw new Error("Could not load the Bengali font file.");
      }

      const fontBytes = await new File(fontAsset.localUri).bytes();

      const font = await pdfDocument.embedFont(fontBytes, {
        subset: true,
      });

      const fontSize = 11;
      const lineHeight = 16;
      const left = PAGE_MARGIN;
      const top = PAGE_HEIGHT - PAGE_MARGIN;
      const maxWidth = PAGE_WIDTH - PAGE_MARGIN * 2;

      let page = null;
      let y = 0;

      function addPage() {
        page = pdfDocument.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = top;
      }

      function drawLine(line) {
        if (!page || y - lineHeight < PAGE_MARGIN) {
          addPage();
        }

        page.drawText(line, {
          x: left,
          y: y - fontSize,
          size: fontSize,
          font,
          maxWidth,
        });

        y -= lineHeight;
      }

      const paragraphs = textContent.replace(/\r\n?/g, "\n").split("\n");

      for (const paragraph of paragraphs) {
        if (!paragraph.trim()) {
          drawLine("");
          continue;
        }

        const words = paragraph.split(/\s+/);
        let currentLine = "";

        for (const word of words) {
          const candidate = currentLine ? `${currentLine} ${word}` : word;

          if (
            currentLine &&
            font.widthOfTextAtSize(candidate, fontSize) > maxWidth
          ) {
            drawLine(currentLine);
            currentLine = word;
          } else {
            currentLine = candidate;
          }
        }

        if (currentLine) {
          drawLine(currentLine);
        }
      }

      const pdfBase64 = await pdfDocument.saveAsBase64({
        dataUri: false,
      });

      await FileSystem.writeAsStringAsync(outputFile.uri, pdfBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await saveDocument({
        id,
        name: baseName,
        uri: outputFile.uri,
        size: outputFile.size || 0,
        pageCount: pdfDocument.getPageCount(),
      });

      savedToDatabase = true;

      Alert.alert(
        "PDF created successfully",
        `${baseName}\n${pdfDocument.getPageCount()} page(s) saved to your library.`,
      );
    } catch (error) {
      console.error("TXT-to-PDF conversion failed:", error);

      if (!savedToDatabase && outputFile?.exists) {
        try {
          outputFile.delete();
        } catch (cleanupError) {
          console.error("PDF cleanup failed:", cleanupError);
        }
      }

      Alert.alert(
        "Conversion failed",
        error?.message || "Could not convert this TXT file to PDF.",
      );
    } finally {
      setConverting(false);
    }
  }

  function addImages(images) {
    const supportedImages = images.filter((image) => {
      const name = image.fileName || image.name || "";
      const mimeType = (image.mimeType || "").toLowerCase();
      const lowerName = name.toLowerCase();

      return (
        mimeType === "image/jpeg" ||
        mimeType === "image/png" ||
        /\.(jpe?g|png)$/.test(lowerName)
      );
    });

    if (supportedImages.length === 0) {
      Alert.alert("No supported images", "Select JPG, JPEG, or PNG images.");
      return;
    }

    setSelectedImages((current) => {
      const combined = [...current, ...supportedImages];
      const unique = [];
      const seen = new Set();

      for (const image of combined) {
        if (!seen.has(image.uri)) {
          seen.add(image.uri);
          unique.push(image);
        }
      }

      return unique;
    });
  }

  function removeImage(index) {
    setSelectedImages((current) =>
      current.filter((_, imageIndex) => imageIndex !== index),
    );
  }

  async function convertImagesToPDF() {
    if (converting) return;

    if (selectedImages.length === 0) {
      Alert.alert(
        "Select images",
        "Choose at least one JPG, JPEG, or PNG image first.",
      );
      return;
    }

    let outputFile = null;

    try {
      setConverting(true);

      if (!PDF_DIRECTORY.exists) {
        PDF_DIRECTORY.create({
          intermediates: true,
          idempotent: true,
        });
      }

      const pdfDocument = await PDFDocument.create();

      for (const asset of selectedImages) {
        const name = asset.fileName || asset.name || "";
        const mimeType = (asset.mimeType || "").toLowerCase();
        const lowerName = name.toLowerCase();

        const isPNG = mimeType === "image/png" || lowerName.endsWith(".png");

        const isJPEG =
          mimeType === "image/jpeg" || /\.(jpe?g)$/.test(lowerName);

        if (!asset.uri || (!isPNG && !isJPEG)) {
          throw new Error(
            `Unsupported image format: ${name || "Unknown image"}`,
          );
        }

        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const embeddedImage = isPNG
          ? await pdfDocument.embedPng(base64)
          : await pdfDocument.embedJpg(base64);

        const page = pdfDocument.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

        const availableWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
        const availableHeight = PAGE_HEIGHT - PAGE_MARGIN * 2;

        const scale = Math.min(
          availableWidth / embeddedImage.width,
          availableHeight / embeddedImage.height,
        );

        const width = embeddedImage.width * scale;
        const height = embeddedImage.height * scale;

        page.drawImage(embeddedImage, {
          x: (PAGE_WIDTH - width) / 2,
          y: (PAGE_HEIGHT - height) / 2,
          width,
          height,
        });
      }

      const trimmedName = pdfName.trim();

      if (!trimmedName) {
        Alert.alert("PDF name required", "Please enter a name for your PDF.");
        return;
      }

      const cleanName = trimmedName.replace(/\.pdf$/i, "").trim();

      if (!cleanName || /[\\/]/.test(cleanName)) {
        Alert.alert("Invalid PDF name", "Enter a valid name without / or \\.");
        return;
      }

      const baseName = `${cleanName}.pdf`;
      const id = `${Date.now()}-${baseName}`;
      outputFile = new File(PDF_DIRECTORY, id);

      const pdfBase64 = await pdfDocument.saveAsBase64({
        dataUri: false,
      });

      await FileSystem.writeAsStringAsync(outputFile.uri, pdfBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await saveDocument({
        id,
        name: baseName,
        uri: outputFile.uri,
        size: outputFile.size || 0,
        pageCount: selectedImages.length,
      });

      const pageCount = selectedImages.length;

      setSelectedImages([]);

      Alert.alert(
        "PDF created successfully",
        `${baseName}\n${pageCount} page(s) saved to your PDF Toolkit library.`,
      );
    } catch (error) {
      console.error("Image-to-PDF conversion failed:", error);

      // Remove an incomplete output file if creation or registration fails.
      if (outputFile?.exists) {
        try {
          outputFile.delete();
        } catch (cleanupError) {
          console.error("Could not clean up PDF:", cleanupError);
        }
      }

      Alert.alert(
        "Conversion failed",
        error?.message ||
          "Could not convert these images. Please try different images.",
      );
    } finally {
      setConverting(false);
    }
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
        keyboardDismissMode="on-drag"
      >
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹ Back to Tools</Text>
        </Pressable>

        <Text style={styles.eyebrow}>DOCUMENT CONVERSION</Text>
        <Text style={styles.title}>Convert Files to PDF</Text>

        <Text style={styles.description}>
          Select images from your phone and combine them into a PDF. Your
          generated file will be saved locally.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Images to PDF</Text>
          <Text style={styles.cardDescription}>
            Select JPG, JPEG, or PNG images. Each image becomes one PDF page.
          </Text>

          <Pressable
            style={styles.primaryButton}
            onPress={selectFromGallery}
            disabled={converting}
          >
            <Text style={styles.primaryButtonText}>Select from Gallery</Text>
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={selectFromFiles}
            disabled={converting}
          >
            <Text style={styles.secondaryButtonText}>Select Image Files</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.selectionHeader}>
            <Text style={styles.cardTitle}>Selected Images</Text>
            <Text style={styles.count}>{selectedImages.length}</Text>
          </View>
          <Text style={styles.inputLabel}>PDF file name</Text>

          <TextInput
            style={styles.nameInput}
            value={pdfName}
            onChangeText={setPdfName}
            placeholder="Enter PDF name"
            placeholderTextColor="#9293A4"
            autoCapitalize="sentences"
            autoCorrect={false}
            editable={!converting}
            returnKeyType="done"
            maxLength={100}
          />

          {selectedImages.length === 0 ? (
            <Text style={styles.emptyText}>No images selected yet.</Text>
          ) : (
            selectedImages.map((image, index) => (
              <View style={styles.imageRow} key={`${image.uri}-${index}`}>
                <View style={styles.imageInfo}>
                  <Text style={styles.imageNumber}>
                    {String(index + 1).padStart(2, "0")}
                  </Text>
                  <Text style={styles.imageName} numberOfLines={2}>
                    {image.fileName || image.name || `Image ${index + 1}`}
                  </Text>
                </View>

                <Pressable
                  onPress={() => removeImage(index)}
                  disabled={converting}
                  style={styles.removeButton}
                >
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            ))
          )}

          <Pressable
            style={[
              styles.primaryButton,
              (converting || selectedImages.length === 0) &&
                styles.disabledButton,
            ]}
            onPress={convertImagesToPDF}
            disabled={converting || selectedImages.length === 0}
          >
            {converting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Create PDF</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Text to PDF</Text>

          <Text style={styles.cardDescription}>
            Select a TXT file, preview its contents, and prepare it for PDF
            conversion.
          </Text>

          <Pressable
            style={styles.primaryButton}
            onPress={selectTextFile}
            disabled={converting}
          >
            <Text style={styles.primaryButtonText}>Select TXT File</Text>
          </Pressable>

          {selectedTextFile && (
            <View style={styles.textPreview}>
              <Text style={styles.cardTitle}>{selectedTextFile.name}</Text>

              <Text style={styles.inputLabel}>PDF file name</Text>

              <TextInput
                style={styles.nameInput}
                value={textPdfName}
                onChangeText={setTextPdfName}
                placeholder="Enter PDF name"
                placeholderTextColor="#9293A4"
                autoCapitalize="sentences"
                autoCorrect={false}
                editable={!converting}
                maxLength={100}
              />

              <Text style={styles.inputLabel}>Text preview</Text>

              <Text style={styles.textContent}>
                {textContent || "(This text file is empty.)"}
              </Text>

              <Pressable
                style={[
                  styles.primaryButton,
                  converting && styles.disabledButton,
                ]}
                onPress={convertTextToPDF}
                disabled={converting}
              >
                {converting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    Convert TXT to PDF
                  </Text>
                )}
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>DOCX to PDF</Text>

          <Text style={styles.cardDescription}>
            Select a Microsoft Word DOCX document to prepare it for PDF
            conversion.
          </Text>

          <Pressable
            style={styles.primaryButton}
            onPress={selectDocxFile}
            disabled={converting}
          >
            <Text style={styles.primaryButtonText}>Select DOCX File</Text>
          </Pressable>

          {selectedDocxFile && (
            <View style={styles.textPreview}>
              <Text style={styles.cardTitle}>Selected Document</Text>

              <Text style={styles.cardDescription}>
                {selectedDocxFile.name}
              </Text>

              <Text style={styles.inputLabel}>PDF file name</Text>

              <TextInput
                style={styles.nameInput}
                value={docxPdfName}
                onChangeText={setDocxPdfName}
                placeholder="Enter PDF name"
                placeholderTextColor="#9293A4"
                autoCapitalize="sentences"
                autoCorrect={false}
                editable={!converting}
                maxLength={100}
              />

              {/* Convert button */}
              <Pressable
                style={[
                  styles.primaryButton,
                  converting && styles.disabledButton,
                ]}
                onPress={convertDocxToPDF}
                disabled={converting}
              >
                {converting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    Convert DOCX to PDF
                  </Text>
                )}
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F6F7FC",
  },
  content: {
    padding: 22,
    paddingTop: 25,
    paddingBottom: 35,
  },
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    marginBottom: 18,
  },
  backText: {
    color: "#6C63FF",
    fontSize: 15,
    fontWeight: "700",
  },
  eyebrow: {
    color: "#777D91",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: {
    color: "#171A2B",
    fontSize: 26,
    fontWeight: "800",
    marginTop: 7,
  },
  description: {
    color: "#85899A",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 9,
    marginBottom: 22,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ECECF4",
    padding: 17,
    marginBottom: 14,
  },
  cardTitle: {
    color: "#24263A",
    fontSize: 15,
    fontWeight: "700",
  },
  cardDescription: {
    color: "#85899A",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
  },
  primaryButton: {
    backgroundColor: "#6C63FF",
    borderRadius: 12,
    minHeight: 47,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 15,
    marginTop: 16,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "#EFEEFF",
    borderRadius: 12,
    minHeight: 47,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 15,
    marginTop: 10,
  },
  secondaryButtonText: {
    color: "#6C63FF",
    fontSize: 14,
    fontWeight: "700",
  },
  selectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  count: {
    color: "#6C63FF",
    backgroundColor: "#EFEEFF",
    borderRadius: 9,
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "800",
  },
  emptyText: {
    color: "#85899A",
    fontSize: 12,
    marginTop: 14,
  },
  imageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#EEEEF5",
    paddingVertical: 12,
    marginTop: 10,
    gap: 10,
  },
  imageInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  imageNumber: {
    color: "#6C63FF",
    fontSize: 12,
    fontWeight: "800",
  },
  imageName: {
    flex: 1,
    color: "#24263A",
    fontSize: 12,
    lineHeight: 18,
  },
  removeButton: {
    padding: 7,
  },
  removeText: {
    color: "#D64555",
    fontSize: 12,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.55,
  },

  inputLabel: {
    color: "#777D91",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 18,
    marginBottom: 8,
  },

  nameInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DAD9F5",
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: "#24263A",
    fontSize: 14,
  },

  textPreview: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#EEEEF5",
  },

  textContent: {
    color: "#42465A",
    backgroundColor: "#F8F8FC",
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
});

import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  Text,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Directory, File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import { PDFDocument } from "pdf-lib";
import { saveDocument } from "../database/database";

export default function ScannerScreen({ onBack }) {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedImage, setCapturedImage] = useState(null);
  const [capturedPages, setCapturedPages] = useState([]);
  const [capturing, setCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [fileName, setFileName] = useState("Scanned-Document");
  const [creatingPdf, setCreatingPdf] = useState(false);

  async function takePicture() {
    if (!cameraRef.current || capturing || capturedImage || !cameraReady) {
      return;
    }

    try {
      setCapturing(true);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        exif: false,
      });

      if (photo?.uri) {
        setCapturedImage(photo);
      } else {
        Alert.alert("Capture failed", "Please try taking the photo again.");
      }
    } catch (error) {
      Alert.alert(
        "Capture failed",
        error?.message || "Could not capture the document.",
      );
    } finally {
      setCapturing(false);
    }
  }

  function addCurrentPage() {
    if (!capturedImage?.uri) return;

    setCapturedPages((previousPages) => [
      ...previousPages,
      {
        id: `${Date.now()}-${previousPages.length}`,
        uri: capturedImage.uri,
      },
    ]);

    setCapturedImage(null);
  }

  function removePage(pageId) {
    setCapturedPages((previousPages) =>
      previousPages.filter((page) => page.id !== pageId),
    );
  }

  function retakeLastPage() {
    if (capturedPages.length === 0) {
      setCapturedImage(null);
      return;
    }

    const lastPage = capturedPages[capturedPages.length - 1];

    setCapturedPages((previousPages) => previousPages.slice(0, -1));

    setCapturedImage({ uri: lastPage.uri });
  }

  async function createPDF() {
    if (creatingPdf) return;

    if (capturedImage) {
      Alert.alert(
        "Add current page",
        "PDF তৈরি করার আগে বর্তমান ছবিটির জন্য Add Page চাপো।",
      );
      return;
    }

    if (capturedPages.length === 0) {
      Alert.alert("No pages", "প্রথমে অন্তত একটি page scan করো।");
      return;
    }

    const baseName = fileName
      .trim()
      .replace(/\.pdf$/i, "")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");

    if (!baseName) {
      Alert.alert("Filename required", "PDF-এর একটি নাম দাও।");
      return;
    }

    try {
      setCreatingPdf(true);

      const pdfDocument = await PDFDocument.create();

      // Standard A4 page dimensions in PDF points.
      const pageWidth = 595.28;
      const pageHeight = 841.89;

      for (const scannedPage of capturedPages) {
        // CameraView produces JPEG images.
        const imageBase64 = await FileSystem.readAsStringAsync(
          scannedPage.uri,
          {
            encoding: FileSystem.EncodingType.Base64,
          },
        );

        const embeddedImage = await pdfDocument.embedJpg(imageBase64);

        const page = pdfDocument.addPage([pageWidth, pageHeight]);
        // Fit the image inside A4 without stretching it.
        const scale = Math.min(
          pageWidth / embeddedImage.width,
          pageHeight / embeddedImage.height,
        );

        const imageWidth = embeddedImage.width * scale;
        const imageHeight = embeddedImage.height * scale;

        page.drawImage(embeddedImage, {
          x: (pageWidth - imageWidth) / 2,
          y: (pageHeight - imageHeight) / 2,
          width: imageWidth,
          height: imageHeight,
        });
      }

      // Save the PDF in the same app folder used by the Library.
      const pdfDirectory = new Directory(Paths.document, "pdf-toolkit");

      if (!pdfDirectory.exists) {
        pdfDirectory.create({
          intermediates: true,
          idempotent: true,
        });
      }

      const timestamp = Date.now();
      const id = `scan-${timestamp}-${baseName}.pdf`;
      const destinationFile = new File(pdfDirectory, id);

      const pdfBytes = await pdfDocument.save();

      const pdfBase64 = bytesToBase64(pdfBytes);

      await FileSystem.writeAsStringAsync(destinationFile.uri, pdfBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Register the saved PDF in the existing SQLite database.

      // Register the saved PDF in the existing SQLite database.
      await saveDocument({
        id,
        name: `${baseName}.pdf`,
        uri: destinationFile.uri,
        size: destinationFile.size || pdfBytes.length,
        pageCount: capturedPages.length,
      });

      Alert.alert(
        "PDF created successfully",
        `${baseName}.pdf\n${capturedPages.length} page(s) saved to your Library.`,
        [
          {
            text: "OK",
            onPress: () => {
              setCapturedPages([]);
              setCapturedImage(null);
              setFileName("Scanned-Document");
              setCameraReady(false);
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        "PDF creation failed",
        error?.message || "Could not create and save the PDF.",
      );
    } finally {
      setCreatingPdf(false);
    }
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6C63FF" />
        <Text style={styles.infoText}>Checking camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionCard}>
          <Text style={styles.title}>Camera permission required</Text>

          <Text style={styles.infoText}>
            Allow camera access to scan paper documents and convert them into
            PDFs.
          </Text>

          {permission.canAskAgain ? (
            <Pressable style={styles.primaryButton} onPress={requestPermission}>
              <Text style={styles.primaryButtonText}>Allow Camera</Text>
            </Pressable>
          ) : (
            <Text style={styles.infoText}>
              Camera access is disabled. Enable it in your phone's app settings,
              then reopen the scanner.
            </Text>
          )}

          <Pressable style={styles.secondaryButton} onPress={onBack}>
            <Text style={styles.secondaryButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={onBack}
          disabled={capturing}
        >
          <Text style={styles.backButtonText}>‹ Back</Text>
        </Pressable>

        <Text style={styles.headerTitle}>Scan Document</Text>

        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.previewContainer}>
        {capturedImage ? (
          <Image
            source={{ uri: capturedImage.uri }}
            style={styles.preview}
            resizeMode="contain"
          />
        ) : (
          <CameraView
            ref={cameraRef}
            style={{
              width: "100%",
              height: "100%",
            }}
            facing="back"
            mode="picture"
            onCameraReady={() => {
              setCameraReady(true);
            }}
            onMountError={(event) => {
              Alert.alert("Camera Error", event.message);
            }}
          />
        )}

        {!capturedImage && (
          <View pointerEvents="none" style={styles.scanFrame}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
        )}
      </View>

      {capturedPages.length > 0 && (
        <View style={styles.pagesSection}>
          <Text style={styles.pagesTitle}>
            Scanned Pages ({capturedPages.length})
          </Text>

          <View style={styles.pagesList}>
            {capturedPages.map((page, index) => (
              <View key={page.id} style={styles.pageItem}>
                <Image
                  source={{ uri: page.uri }}
                  style={styles.pageThumbnail}
                  resizeMode="cover"
                />

                <Text style={styles.pageNumber}>Page {index + 1}</Text>

                <Pressable
                  style={styles.removePageButton}
                  onPress={() => removePage(page.id)}
                >
                  <Text style={styles.removePageText}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>

          <View style={styles.pagesActions}>
            <Pressable style={styles.secondaryButton} onPress={retakeLastPage}>
              <Text style={styles.secondaryButtonText}>Retake Last</Text>
            </Pressable>

            <Text style={styles.pageCountText}>
              {capturedPages.length} page
              {capturedPages.length === 1 ? "" : "s"} ready
            </Text>
          </View>
          <Text style={styles.filenameLabel}>PDF filename</Text>

          <TextInput
            style={styles.filenameInput}
            value={fileName}
            onChangeText={setFileName}
            placeholder="Enter PDF filename"
            placeholderTextColor="#9296A8"
            autoCapitalize="words"
            editable={!creatingPdf}
            maxLength={100}
          />

          <Pressable
            style={[
              styles.createPdfButton,
              creatingPdf && styles.disabledButton,
            ]}
            onPress={createPDF}
            disabled={creatingPdf}
          >
            {creatingPdf ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Create PDF</Text>
            )}
          </Pressable>
        </View>
      )}

      <View style={styles.controls}>
        <Text style={styles.instruction}>
          {capturedImage
            ? "Preview your captured document"
            : "Align the document inside the frame"}
        </Text>

        {capturedImage ? (
          <View style={styles.actionRow}>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => setCapturedImage(null)}
            >
              <Text style={styles.secondaryButtonText}>Retake</Text>
            </Pressable>

            <Pressable style={styles.primaryButton} onPress={addCurrentPage}>
              <Text style={styles.primaryButtonText}>Add Page</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.captureButton, capturing && styles.disabledButton]}
            onPress={takePicture}
            disabled={capturing}
          >
            {capturing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <View style={styles.captureInner} />
            )}
          </Pressable>
        )}

        <Text style={styles.footerText}>
          Your scans will be processed locally on your device.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function bytesToBase64(bytes) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  let result = "";

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const hasB = i + 1 < bytes.length;
    const hasC = i + 2 < bytes.length;
    const b = hasB ? bytes[i + 1] : 0;
    const c = hasC ? bytes[i + 2] : 0;

    result += alphabet[a >> 2];
    result += alphabet[((a & 3) << 4) | (b >> 4)];
    result += hasB ? alphabet[((b & 15) << 2) | (c >> 6)] : "=";
    result += hasC ? alphabet[c & 63] : "=";
  }

  return result;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F6F7FC",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F6F7FC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  backButton: {
    minWidth: 65,
    paddingVertical: 8,
  },
  backButtonText: {
    color: "#6C63FF",
    fontSize: 15,
    fontWeight: "700",
  },
  headerTitle: {
    color: "#171A2B",
    fontSize: 18,
    fontWeight: "800",
  },
  headerSpacer: {
    width: 65,
  },
  previewContainer: {
    flex: 1,
    marginHorizontal: 14,
    marginTop: 6,
    marginBottom: 12,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#171A2B",
    justifyContent: "center",
    alignItems: "center",
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
  preview: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  scanFrame: {
    position: "absolute",
    width: "78%",
    height: "68%",
  },
  corner: {
    position: "absolute",
    width: 30,
    height: 30,
    borderColor: "#FFFFFF",
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 8,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 8,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  controls: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 18,
    alignItems: "center",
  },
  instruction: {
    color: "#777D91",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 20,
  },
  captureButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#6C63FF",
    borderWidth: 5,
    borderColor: "#DCD9FF",
    alignItems: "center",
    justifyContent: "center",
  },
  captureInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FFFFFF",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  primaryButton: {
    backgroundColor: "#6C63FF",
    borderRadius: 13,
    paddingHorizontal: 22,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#ECECF4",
    borderRadius: 13,
    paddingHorizontal: 22,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#393B52",
    fontSize: 14,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.55,
  },
  permissionCard: {
    flex: 1,
    padding: 28,
    justifyContent: "center",
  },
  title: {
    color: "#171A2B",
    fontSize: 25,
    fontWeight: "800",
    marginBottom: 12,
  },
  infoText: {
    color: "#777D91",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
    marginBottom: 18,
  },
  footerText: {
    color: "#9296A8",
    fontSize: 11,
    marginTop: 18,
    textAlign: "center",
  },
  pagesSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },

  pagesTitle: {
    color: "#171A2B",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
  },

  pagesList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  pageItem: {
    width: 76,
    position: "relative",
    alignItems: "center",
  },

  pageThumbnail: {
    width: 72,
    height: 88,
    borderRadius: 8,
    backgroundColor: "#E4E5EE",
  },

  pageNumber: {
    color: "#393B52",
    fontSize: 10,
    marginTop: 5,
  },

  removePageButton: {
    position: "absolute",
    top: -7,
    right: -4,
    width: 23,
    height: 23,
    borderRadius: 12,
    backgroundColor: "#E5484D",
    alignItems: "center",
    justifyContent: "center",
  },

  removePageText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 20,
  },

  pagesActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },

  pageCountText: {
    color: "#777D91",
    fontSize: 12,
    fontWeight: "600",
  },
  pagesSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pagesTitle: {
    color: "#171A2B",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
  },
  pagesList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  pageItem: {
    width: 76,
    alignItems: "center",
  },
  pageThumbnail: {
    width: 72,
    height: 88,
    borderRadius: 8,
    backgroundColor: "#E4E5EE",
  },
  pageNumber: {
    color: "#393B52",
    fontSize: 10,
    marginTop: 5,
  },
  filenameLabel: {
    color: "#393B52",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
  },

  filenameInput: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E4E5EE",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#171A2B",
    fontSize: 14,
  },

  createPdfButton: {
    width: "100%",
    minHeight: 48,
    backgroundColor: "#6C63FF",
    borderRadius: 13,
    paddingHorizontal: 18,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
});

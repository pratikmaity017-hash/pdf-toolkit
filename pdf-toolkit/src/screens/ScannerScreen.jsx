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
  ScrollView,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Directory, File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import { PDFDocument } from "pdf-lib";
import { saveDocument } from "../database/database";

export default function ScannerScreen({ onBack }) {
  const cameraRef = useRef(null);
  const scrollViewRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedImage, setCapturedImage] = useState(null);
  const [capturedPages, setCapturedPages] = useState([]);
  const [capturing, setCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [fileName, setFileName] = useState("Scanned-Document");
  const [creatingPdf, setCreatingPdf] = useState(false);
  const [smartScanning, setSmartScanning] = useState(false);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [cameraSessionKey, setCameraSessionKey] = useState(0);
  const { height: screenHeight } = useWindowDimensions();

  const hasPages = capturedPages.length > 0;
  const compactPreview = hasPages || Boolean(capturedImage);

  const previewHeight = Math.min(screenHeight * 0.42, 300);

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

  async function startSmartScan() {
    if (smartScanning || capturing || creatingPdf || capturedImage) {
      return;
    }

    try {
      setSmartScanning(true);

      const result = await CameraView.scanDocumentAsync({
        requestPdf: false,
        quality: 1,
      });

      // User cancel korle ba kono page scan na hole.
      if (!result?.pages?.length) {
        return;
      }

      // Scanner-er temporary images nijer cache folder-e copy kori.
      const scanDirectory = new Directory(
        Paths.cache,
        "pdf-toolkit-smart-scans",
      );

      if (!scanDirectory.exists) {
        scanDirectory.create({
          intermediates: true,
          idempotent: true,
        });
      }

      const batchId = Date.now();
      const newPages = [];

      for (let index = 0; index < result.pages.length; index++) {
        const sourceUri = result.pages[index];

        const destinationFile = new File(
          scanDirectory,
          `scan-${batchId}-${index}.jpg`,
        );

        await FileSystem.copyAsync({
          from: sourceUri,
          to: destinationFile.uri,
        });

        newPages.push({
          id: `smart-${batchId}-${index}`,
          uri: destinationFile.uri,
        });
      }

      // Existing scanned pages preserve kore notun pages add kori.
      setCapturedPages((previousPages) => [...previousPages, ...newPages]);

      Alert.alert(
        "Smart Scan Complete",
        `${newPages.length} page(s) captured successfully.`,
      );
    } catch (error) {
      Alert.alert(
        "Smart Scan Failed",
        error?.message || "Could not scan the document. Please try again.",
      );
    } finally {
      setSmartScanning(false);
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

              // Reset the camera after the success alert is dismissed.
              setCameraReady(false);
              setCameraSessionKey((previous) => previous + 1);
              setFlashEnabled(false);
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
      <SafeAreaView
        // style={styles.container}
        ref={scrollViewRef}
        style={[styles.bottomPanel, hasPages && styles.bottomPanelExpanded]}
        contentContainerStyle={styles.bottomPanelContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
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
          disabled={capturing || smartScanning || creatingPdf}
        >
          <Text style={styles.backButtonText}>‹ Back</Text>
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Scan Document</Text>
          <Text style={styles.headerSubtitle}>Scan your pages into a PDF</Text>
        </View>

        <View style={styles.headerSpacer} />
      </View>

      <View
        style={[
          styles.previewContainer,
          compactPreview && {
            flex: 0,
            height: previewHeight,
          },
        ]}
      >
        {capturedImage ? (
          <Image
            source={{ uri: capturedImage.uri }}
            style={styles.camera}
            resizeMode="contain"
          />
        ) : (
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            mode="picture"
            key={cameraSessionKey}
            enableTorch={flashEnabled}
            onCameraReady={() => setCameraReady(true)}
            onMountError={(event) => {
              Alert.alert("Camera Error", event.message);
            }}
          />
        )}

        <Pressable
          style={[styles.flashButton, flashEnabled && styles.flashButtonActive]}
          onPress={() => setFlashEnabled((previous) => !previous)}
        >
          <Text style={styles.flashButtonText}>
            {flashEnabled ? "⚡ Flash On" : "⚡ Flash Off"}
          </Text>
        </Pressable>

        {!capturedImage && (
          <View pointerEvents="none" style={styles.scanFrame}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
        )}

        <View style={styles.previewBadge}>
          <View style={styles.previewBadgeDot} />
          <Text style={styles.previewBadgeText}>
            {capturedImage ? "Page Preview" : "Live Camera"}
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={[styles.bottomPanel, hasPages && styles.bottomPanelExpanded]}
        contentContainerStyle={styles.bottomPanelContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
      >
        {hasPages && (
          <View style={styles.pagesSection}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.pagesTitle}>Your Scanned Pages</Text>
                <Text style={styles.sectionSubtitle}>
                  Review and manage your document
                </Text>
              </View>

              <View style={styles.pageCountBadge}>
                <Text style={styles.pageCountBadgeText}>
                  {capturedPages.length}
                </Text>
              </View>
            </View>

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
                    accessibilityRole="button"
                    accessibilityLabel={`Remove page ${index + 1}`}
                  >
                    <Text style={styles.removePageText}>×</Text>
                  </Pressable>
                </View>
              ))}
            </View>

            <View style={styles.pagesActions}>
              <Pressable
                style={styles.secondaryButton}
                onPress={retakeLastPage}
              >
                <Text style={styles.secondaryButtonText}>Retake Last</Text>
              </Pressable>

              <Text style={styles.pageCountText}>
                {capturedPages.length} page
                {capturedPages.length === 1 ? "" : "s"} ready
              </Text>
            </View>

            <View style={styles.formDivider} />

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
                <View style={styles.loadingRow}>
                  <ActivityIndicator color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>Creating PDF...</Text>
                </View>
              ) : (
                <Text style={styles.primaryButtonText}>
                  Create PDF · {capturedPages.length}{" "}
                  {capturedPages.length === 1 ? "Page" : "Pages"}
                </Text>
              )}
            </Pressable>
          </View>
        )}

        <View style={styles.controls}>
          {!capturedImage && (
            <Pressable
              style={[
                styles.smartScanButton,
                (smartScanning || capturing || creatingPdf) &&
                  styles.disabledButton,
              ]}
              onPress={startSmartScan}
              disabled={smartScanning || capturing || creatingPdf}
            >
              {smartScanning ? (
                <View style={styles.smartScanButtonContent}>
                  <ActivityIndicator color="#FFFFFF" />
                  <Text style={styles.smartScanButtonText}>
                    Scanning document...
                  </Text>
                </View>
              ) : (
                <View style={styles.smartScanButtonContent}>
                  <Text style={styles.smartScanIcon}>✦</Text>
                  <View style={styles.smartScanTextGroup}>
                    <Text style={styles.smartScanButtonText}>
                      Smart Auto Scan
                    </Text>
                    <Text style={styles.smartScanSubtext}>
                      Automatically detect document pages
                    </Text>
                  </View>
                </View>
              )}
            </Pressable>
          )}

          <Text style={styles.instruction}>
            {capturedImage
              ? "Review this image before adding it"
              : "Or align a page inside the frame and capture it manually"}
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
                <Text style={styles.primaryButtonText}>+ Add Page</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={[
                styles.captureButton,
                (capturing || !cameraReady) && styles.disabledButton,
              ]}
              onPress={takePicture}
              disabled={capturing || !cameraReady || smartScanning}
            >
              {capturing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <View style={styles.captureInner} />
              )}
            </Pressable>
          )}

          {!capturedImage && (
            <Text style={styles.manualCaptureLabel}>TAP TO CAPTURE</Text>
          )}

          <Text style={styles.footerText}>
            Your scans are processed locally on your device.
          </Text>
        </View>
      </ScrollView>
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
  keyboardAvoiding: {
    flex: 1,
  },
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
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
    minHeight: 66,
  },

  backButton: {
    minWidth: 62,
    paddingVertical: 9,
  },

  backButtonText: {
    color: "#6C63FF",
    fontSize: 15,
    fontWeight: "800",
  },

  headerCenter: {
    flex: 1,
    alignItems: "center",
  },

  headerTitle: {
    color: "#171A2B",
    fontSize: 18,
    fontWeight: "800",
  },

  headerSubtitle: {
    color: "#9296A8",
    fontSize: 11,
    marginTop: 3,
  },

  headerSpacer: {
    width: 62,
  },

  previewContainer: {
    flex: 1,
    minHeight: 140,
    marginHorizontal: 14,
    marginTop: 2,
    marginBottom: 8,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#171A2B",
  },

  camera: {
    width: "100%",
    height: "100%",
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
    alignSelf: "center",
    top: "16%",
  },

  corner: {
    position: "absolute",
    width: 30,
    height: 30,
    borderColor: "#FFFFFF",
    borderWidth: 0,
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

  previewBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 18, 35, 0.78)",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
  },

  previewBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#8D83FF",
    marginRight: 7,
  },

  previewBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },

  bottomPanel: {
    flex: 0,
    flexShrink: 1,
    maxHeight: "52%",
  },

  bottomPanelExpanded: {
    flex: 1,
    maxHeight: undefined,
  },
  bottomPanelContent: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 12,
  },

  controls: {
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 8,
  },

  smartScanButton: {
    width: "100%",
    minHeight: 66,
    backgroundColor: "#292D45",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 15,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#414662",
  },

  smartScanButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 11,
  },

  smartScanIcon: {
    color: "#C6C0FF",
    fontSize: 26,
    fontWeight: "700",
  },

  smartScanTextGroup: {
    flex: 1,
  },

  smartScanButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },

  smartScanSubtext: {
    color: "#C0C3D5",
    fontSize: 11,
    marginTop: 4,
  },

  instruction: {
    color: "#777D91",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginBottom: 14,
    paddingHorizontal: 8,
  },

  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#6C63FF",
    borderWidth: 5,
    borderColor: "#DCD9FF",
    alignItems: "center",
    justifyContent: "center",
  },

  captureInner: {
    width: 49,
    height: 49,
    borderRadius: 25,
    backgroundColor: "#FFFFFF",
  },

  manualCaptureLabel: {
    color: "#777D91",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: 8,
  },

  actionRow: {
    width: "100%",
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  primaryButton: {
    flex: 1,
    minHeight: 46,
    backgroundColor: "#6C63FF",
    borderRadius: 13,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },

  secondaryButton: {
    minHeight: 46,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E4E5EE",
    borderRadius: 13,
    paddingHorizontal: 17,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryButtonText: {
    color: "#393B52",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
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
    fontSize: 10,
    lineHeight: 15,
    marginTop: 13,
    textAlign: "center",
  },

  pagesSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#EAEAF3",
    padding: 14,
    marginBottom: 15,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },

  pagesTitle: {
    color: "#171A2B",
    fontSize: 15,
    fontWeight: "800",
  },

  sectionSubtitle: {
    color: "#9296A8",
    fontSize: 11,
    marginTop: 4,
  },

  pageCountBadge: {
    minWidth: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#EFEDFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },

  pageCountBadgeText: {
    color: "#6C63FF",
    fontSize: 14,
    fontWeight: "800",
  },

  pagesList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },

  pageItem: {
    width: 76,
    position: "relative",
    alignItems: "center",
  },

  pageThumbnail: {
    width: 72,
    height: 88,
    borderRadius: 9,
    backgroundColor: "#E4E5EE",
    borderWidth: 1,
    borderColor: "#E4E5EE",
  },

  pageNumber: {
    color: "#555970",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 6,
  },

  removePageButton: {
    position: "absolute",
    top: -7,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#E5484D",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },

  removePageText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 19,
  },

  pagesActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 15,
  },

  pageCountText: {
    color: "#777D91",
    fontSize: 11,
    fontWeight: "700",
  },

  formDivider: {
    height: 1,
    backgroundColor: "#EEEEF5",
    marginTop: 16,
  },

  filenameLabel: {
    color: "#393B52",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 15,
    marginBottom: 8,
  },

  filenameInput: {
    width: "100%",
    minHeight: 47,
    backgroundColor: "#F8F8FC",
    borderWidth: 1,
    borderColor: "#E4E5EE",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: "#171A2B",
    fontSize: 14,
    marginBottom: 12,
  },

  createPdfButton: {
    width: "100%",
    minHeight: 49,
    backgroundColor: "#6C63FF",
    borderRadius: 13,
    paddingHorizontal: 18,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },

  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  flashButton: {
    position: "absolute",
    top: 14,
    right: 14,
    zIndex: 10,
    backgroundColor: "rgba(23, 26, 43, 0.85)",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
  },

  flashButtonActive: {
    backgroundColor: "#6C63FF",
    borderColor: "#8D86FF",
  },

  flashButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
});

import { useEffect, useState, useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { getDocuments, saveDocument } from "../database/database";

import { saveAnnotatedPdf } from "../services/pdfAnnotatorService";
const PDFJS_BUNDLE = require("../../assets/pdfjs.bundle.txt");
const PDFJS_WORKER_BUNDLE = require("../../assets/pdfjs.worker.bundle.txt");

export default function PDFAnnotatorScreen({ onBack }) {
  const [documents, setDocuments] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState(null);

  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [viewerHtml, setViewerHtml] = useState("");

  const [pageCount, setPageCount] = useState(0);
  const [renderedPages, setRenderedPages] = useState(0);

  const webViewRef = useRef(null);

  const [annotationTool, setAnnotationTool] = useState("view");
  const [annotationColor, setAnnotationColor] = useState("#FF3B30");
  const [annotationCount, setAnnotationCount] = useState(0);
  const [textAnnotation, setTextAnnotation] = useState("");
  const [saving, setSaving] = useState(false);

  const colors = [
    "#FF3B30",
    "#FFCC00",
    "#34C759",
    "#007AFF",
    "#AF52DE",
    "#000000",
  ];

  function sendWebViewCommand(command) {
    webViewRef.current?.injectJavaScript(`${command}; true;`);
  }

  function changeAnnotationTool(tool) {
    setAnnotationTool(tool);

    sendWebViewCommand(`window.setAnnotationTool(${JSON.stringify(tool)})`);
  }

  function changeAnnotationColor(color) {
    setAnnotationColor(color);

    sendWebViewCommand(`window.setAnnotationColor(${JSON.stringify(color)})`);
  }

  function undoAnnotation() {
    sendWebViewCommand("window.undoAnnotation()");
  }

  function clearAnnotations() {
    if (annotationCount === 0) return;

    Alert.alert(
      "Clear annotations?",
      "This will remove all annotations from the current preview.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => sendWebViewCommand("window.clearAnnotations()"),
        },
      ],
    );
  }

  function applyAnnotationSettings() {
    sendWebViewCommand(
      `window.setAnnotationTool(${JSON.stringify(annotationTool)})`,
    );

    sendWebViewCommand(
      `window.setAnnotationColor(${JSON.stringify(annotationColor)})`,
    );
  }

  async function handleExportedAnnotations(annotations) {
    let savedDocument = null;

    try {
      if (!selectedDocument) {
        throw new Error("No PDF is selected.");
      }

      savedDocument = await saveAnnotatedPdf(selectedDocument, annotations);

      await saveDocument(savedDocument);

      setDocuments(await getDocuments());

      Alert.alert(
        "PDF saved successfully",
        `${savedDocument.name}\n\n${savedDocument.pageCount} pages saved to your Library. The original PDF is unchanged.`,
      );
    } catch (error) {
      console.error("PDF annotation export failed:", error);

      Alert.alert(
        "Save failed",
        error?.message || "Could not save the annotated PDF.",
      );
    } finally {
      setSaving(false);
    }
  }

  function saveAnnotations() {
    if (annotationCount === 0) {
      Alert.alert(
        "No annotations",
        "Add at least one annotation before saving.",
      );
      return;
    }

    if (saving) return;

    setSaving(true);

    sendWebViewCommand("window.exportAnnotations()");
  }

  // Load PDFs already saved in the Library.
  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const result = await getDocuments();

      setDocuments(result);
    } catch (err) {
      setError(err.message || "Could not load your PDF Library.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Prepare PDF.js and generate the WebView HTML.
  useEffect(() => {
    let cancelled = false;

    async function prepareAnnotator() {
      if (!selectedDocument?.uri) return;

      try {
        setPreparing(true);
        setError("");
        setViewerHtml("");
        setPageCount(0);
        setRenderedPages(0);

        const bundleAsset = Asset.fromModule(PDFJS_BUNDLE);
        const workerAsset = Asset.fromModule(PDFJS_WORKER_BUNDLE);

        await Promise.all([
          bundleAsset.downloadAsync(),
          workerAsset.downloadAsync(),
        ]);

        if (!bundleAsset.localUri || !workerAsset.localUri) {
          throw new Error("Unable to load the PDF.js engine.");
        }

        const [pdfjsSource, workerSource, pdfBase64] = await Promise.all([
          FileSystem.readAsStringAsync(bundleAsset.localUri),
          FileSystem.readAsStringAsync(workerAsset.localUri),
          FileSystem.readAsStringAsync(selectedDocument.uri, {
            encoding: FileSystem.EncodingType.Base64,
          }),
        ]);

        if (cancelled) return;

        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1, maximum-scale=3, user-scalable=yes"
            />

            <style>
              * {
                box-sizing: border-box;
              }

              html, body {
                margin: 0;
                padding: 0;
                width: 100%;
                height: 100%;
                overflow: hidden;
                background: #F6F7FC;
                font-family: Arial, sans-serif;
              }

              #status {
                padding: 12px;
                color: #555B72;
                font-size: 13px;
                text-align: center;
                background: #FFFFFF;
                border-bottom: 1px solid #ECECF4;
              }

              #pages {
                height: calc(100% - 42px);
                overflow-y: auto;
                overflow-x: hidden;
                padding: 12px 6px 30px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 16px;
                -webkit-overflow-scrolling: touch;
              }

              .page-shell {
                width: 100%;
                max-width: 900px;
                flex: 0 0 auto;
                position: relative;
                background: #FFFFFF;
                box-shadow: 0 2px 10px rgba(30, 30, 60, 0.12);
                overflow: hidden;
               }

               .page-shell canvas:not(.annotation-layer) {
                  display: block;
                  width: 100%;
                  height: auto;
                }

                .annotation-layer {
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                z-index: 2;
                touch-action: none;
                }

              .page-shell canvas {
                display: block;
                width: 100%;
                height: auto;
              }

              .page-label {
                position: absolute;
                top: 7px;
                right: 7px;
                padding: 4px 8px;
                border-radius: 6px;
                background: rgba(30, 30, 45, 0.7);
                color: #FFFFFF;
                font-size: 11px;
              }
              .annotation-layer {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 2;
                touch-action: none;
                }

                .page-label {
                z-index: 3;
                pointer-events: none;
                }
            </style>
          </head>

          <body>
            <div id="status">Preparing PDF preview...</div>
            <div id="pages"></div>

            <script>
              window.PDF_DATA = "${pdfBase64}";
            </script>

            <script>
              ${pdfjsSource}
            </script>

            <script>
              window.PDFJS_WORKER_SOURCE =
                ${JSON.stringify(workerSource)};
            </script>

            <script>
              (async function () {
                const status = document.getElementById("status");
                const pagesContainer = document.getElementById("pages");

                let pdf = null;
                let observer = null;

                                
                let annotationTool = "view";
                let annotationColor = "#FF3B30";
                let annotationText = "";

                const annotations = [];

                function notifyAnnotationCount() {
                notifyNative("annotationCount:" + annotations.length);
                }

                function redrawOverlay(overlay) {
                const rect = overlay.getBoundingClientRect();

                if (!rect.width || !rect.height) return;

                const ratio = Math.min(window.devicePixelRatio || 1, 2);

                overlay.width = Math.round(rect.width * ratio);
                overlay.height = Math.round(rect.height * ratio);

                const ctx = overlay.getContext("2d");

                ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
                ctx.clearRect(0, 0, rect.width, rect.height);

                annotations.forEach((annotation) => {
                    if (annotation.overlay !== overlay) return;

                    ctx.strokeStyle = annotation.color;
                    ctx.fillStyle = annotation.color;

                    if (annotation.type === "pen") {
                    const points = annotation.points;

                    if (points.length < 2) return;

                    ctx.beginPath();
                    ctx.lineWidth = 3;
                    ctx.lineCap = "round";
                    ctx.lineJoin = "round";

                    ctx.moveTo(
                        points[0].x * rect.width,
                        points[0].y * rect.height
                    );

                    for (let i = 1; i < points.length; i++) {
                        ctx.lineTo(
                        points[i].x * rect.width,
                        points[i].y * rect.height
                        );
                    }

                    ctx.stroke();
                    }

                    if (annotation.type === "highlight") {
                    const x = Math.min(annotation.x1, annotation.x2) * rect.width;
                    const y = Math.min(annotation.y1, annotation.y2) * rect.height;

                    const width = Math.abs(annotation.x2 - annotation.x1) * rect.width;
                    const height = Math.abs(annotation.y2 - annotation.y1) * rect.height;

                    ctx.globalAlpha = 0.3;
                    ctx.fillRect(x, y, width, height);
                    ctx.globalAlpha = 1;
                    }

                    if (annotation.type === "text") {
                        ctx.font = "16px Arial";
                        ctx.textBaseline = "top";

                        const lines = String(annotation.text).split("\\n");

                        lines.forEach((line, index) => {
                            ctx.fillText(
                            line,
                            annotation.x * rect.width,
                            annotation.y * rect.height + index * 19,
                            Math.max(20, rect.width - annotation.x * rect.width - 5),
                            );
                        });
                    }
                });
                }

                function createAnnotationLayer(shell, pageNumber) {
                const overlay = document.createElement("canvas");

                overlay.className = "annotation-layer";

                overlay.style.position = "absolute";
                overlay.style.top = "0";
                overlay.style.left = "0";
                overlay.style.width = "100%";
                overlay.style.height = "100%";
                overlay.style.zIndex = "2";
                overlay.style.touchAction = "none";

                shell.appendChild(overlay);
                overlay.style.pointerEvents = annotationTool === "view" ? "none" : "auto";

                pagesContainer.style.overflowY = annotationTool === "view" ? "auto" : "hidden";

                overlay.style.width = "100%";
                overlay.style.height = "100%";
                overlay.style.display = "block";

                function getPosition(event) {
                    const rect = overlay.getBoundingClientRect();

                    return {
                    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
                    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
                    };
                }

                let currentAnnotation = null;

                overlay.addEventListener("pointerdown", (event) => {
                    if (annotationTool === "view") return;

                    if (annotationTool === "text" && !annotationText.trim()) {
                        return;
                    }

                    event.preventDefault();
                    event.stopPropagation();

                    overlay.setPointerCapture(event.pointerId);

                    const position = getPosition(event);

                    if (annotationTool === "pen") {
                    currentAnnotation = {
                        type: "pen",
                        pageNumber,
                        color: annotationColor,
                        points: [position],
                        overlay,
                    };
                    } else if (annotationTool === "highlight") {
                    currentAnnotation = {
                        type: "highlight",
                        pageNumber,
                        color: annotationColor,
                        x1: position.x,
                        y1: position.y,
                        x2: position.x,
                        y2: position.y,
                        overlay,
                    };
                   } else if (annotationTool === "text") {
                        const textAnnotation = {
                            type: "text",
                            pageNumber,
                            color: annotationColor,
                            x: position.x,
                            y: position.y,
                            text: annotationText.trim(),
                            overlay,
                        };

                        annotations.push(textAnnotation);

                        redrawOverlay(overlay);
                        notifyAnnotationCount();

                        return;
                    }
                });

                overlay.addEventListener("pointermove", (event) => {
                    if (!currentAnnotation) return;

                    event.preventDefault();

                    const position = getPosition(event);

                    if (currentAnnotation.type === "pen") {
                    currentAnnotation.points.push(position);
                    } else {
                    currentAnnotation.x2 = position.x;
                    currentAnnotation.y2 = position.y;
                    }

                    redrawOverlay(overlay);

                    // Draw the current unfinished annotation as a preview.
                    annotations.push(currentAnnotation);
                    redrawOverlay(overlay);
                    annotations.pop();
                });

                function finishDrawing() {
                    if (!currentAnnotation) return;

                    if (
                    currentAnnotation.type === "pen" &&
                    currentAnnotation.points.length < 2
                    ) {
                    currentAnnotation = null;
                    return;
                    }

                    if (
                    currentAnnotation.type === "highlight" &&
                    (
                        Math.abs(currentAnnotation.x2 - currentAnnotation.x1) < 0.005 ||
                        Math.abs(currentAnnotation.y2 - currentAnnotation.y1) < 0.005
                    )
                    ) {
                    currentAnnotation = null;
                    return;
                    }

                    annotations.push(currentAnnotation);
                    currentAnnotation = null;

                    redrawOverlay(overlay);
                    notifyAnnotationCount();
                }

                overlay.addEventListener("pointerup", finishDrawing);
                overlay.addEventListener("pointercancel", finishDrawing);

                redrawOverlay(overlay);

                return overlay;
                }

                window.setAnnotationTool = function (tool) {
                annotationTool = tool;

                document.querySelectorAll(".annotation-layer").forEach((overlay) => {
                    overlay.style.pointerEvents =
                    tool === "view" ? "none" : "auto";

                    const pages = document.getElementById("pages");

                    pages.style.overflowY =
                    tool === "view" ? "auto" : "hidden";
                });
                };

                window.setAnnotationColor = function (color) {
                annotationColor = color;
                };

                window.undoAnnotation = function () {
                if (annotations.length === 0) return;

                const last = annotations.pop();

                redrawOverlay(last.overlay);
                notifyAnnotationCount();
                };

                window.clearAnnotations = function () {
                annotations.length = 0;

                document.querySelectorAll(".annotation-layer").forEach((overlay) => {
                    redrawOverlay(overlay);
                });

                notifyAnnotationCount();
                };

                window.setAnnotationText = function (text) {
                annotationText = String(text || "");
                };

                window.exportAnnotations = function () {
                const exportData = annotations.map((annotation) => {
                    const {
                    overlay,
                    ...safeAnnotation
                    } = annotation;

                    return safeAnnotation;
                });

                notifyNative("annotations:" + JSON.stringify(exportData));
                };


                function notifyNative(message) {
                  window.ReactNativeWebView?.postMessage(message);
                }

                
                async function renderPage(pageNumber, shell) {
                if (
                    shell.dataset.rendered === "true" ||
                    shell.dataset.rendering === "true"
                ) {
                    return;
                }

                shell.dataset.rendering = "true";

                try {
                    const page = await pdf.getPage(pageNumber);

                    const originalViewport = page.getViewport({
                    scale: 1,
                    });

                    const availableWidth = Math.max(
                    200,
                    Math.min(pagesContainer.clientWidth - 12, 900)
                    );

                    const scale = availableWidth / originalViewport.width;
                    const viewport = page.getViewport({ scale });

                    const pixelRatio = Math.min(
                    window.devicePixelRatio || 1,
                    2
                    );

                    const canvas = document.createElement("canvas");
                    const context = canvas.getContext("2d");

                    canvas.width = Math.ceil(viewport.width * pixelRatio);
                    canvas.height = Math.ceil(viewport.height * pixelRatio);

                    canvas.style.width = "100%";
                    canvas.style.height = "auto";

                    await page.render({
                    canvasContext: context,
                    viewport,
                    transform: [
                        pixelRatio, 0,
                        0, pixelRatio,
                        0, 0,
                    ],
                    }).promise;

                    shell.insertBefore(canvas, shell.firstChild);

                    // Set the page shell to the actual rendered page dimensions.
                    shell.style.width = viewport.width + "px";
                    shell.style.height = viewport.height + "px";

                    // Create annotation overlay after setting page dimensions.
                    createAnnotationLayer(shell, pageNumber);

                    shell.dataset.rendered = "true";

                    notifyNative("pageRendered:" + pageNumber);

                } catch (err) {
                    shell.dataset.rendered = "error";

                    notifyNative(
                    "pageError:" +
                    pageNumber +
                    ":" +
                    (err.message || "Rendering failed")
                    );

                } finally {
                    shell.dataset.rendering = "false";
                }
                }


                try {
                  const binary = atob(window.PDF_DATA);

                  const bytes = new Uint8Array(binary.length);

                  for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                  }

                  const workerBlob = new Blob(
                    [window.PDFJS_WORKER_SOURCE],
                    { type: "text/javascript" }
                  );

                  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                    URL.createObjectURL(workerBlob);

                  pdf = await window.pdfjsLib.getDocument({
                    data: bytes
                  }).promise;

                  notifyNative("ready:" + pdf.numPages);

                  status.textContent =
                    pdf.numPages + " pages · Scroll to preview";

                  // Create page containers without rendering
                  // every page immediately.
                  for (
                    let pageNumber = 1;
                    pageNumber <= pdf.numPages;
                    pageNumber++
                  ) {
                    const shell = document.createElement("div");

                    shell.className = "page-shell";
                    shell.dataset.page = String(pageNumber);
                    shell.dataset.rendered = "false";
                    shell.dataset.rendering = "false";

                    const label = document.createElement("div");

                    label.className = "page-label";
                    label.textContent = "Page " + pageNumber;

                    shell.appendChild(label);
                    pagesContainer.appendChild(shell);
                  }

                  if ("IntersectionObserver" in window) {
                    observer = new IntersectionObserver(
                      (entries) => {
                        entries.forEach((entry) => {
                          if (!entry.isIntersecting) return;

                          const pageNumber = Number(
                            entry.target.dataset.page
                          );

                          renderPage(pageNumber, entry.target);
                        });
                      },
                      {
                        root: pagesContainer,
                        rootMargin: "400px"
                      }
                    );

                    document.querySelectorAll(".page-shell")
                      .forEach((shell) => observer.observe(shell));

                  } else {
                    // Fallback for WebViews without IntersectionObserver.
                    const shells = document.querySelectorAll(".page-shell");

                    for (const shell of shells) {
                      await renderPage(
                        Number(shell.dataset.page),
                        shell
                      );
                    }
                  }

                } catch (err) {
                  status.textContent =
                    "Could not open PDF: " +
                    (err.message || "Unknown error");

                  notifyNative(
                    "error:" + (err.message || "PDF loading failed")
                  );
                }
              })();
            </script>
          </body>
          </html>
        `;

        if (!cancelled) {
          setViewerHtml(html);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Could not prepare the PDF.");
        }
      } finally {
        if (!cancelled) {
          setPreparing(false);
        }
      }
    }

    prepareAnnotator();

    return () => {
      cancelled = true;
    };
  }, [selectedDocument]);

  // Receive messages sent by the WebView.
  function handleWebViewMessage(event) {
    const message = event.nativeEvent.data;

    if (message.startsWith("ready:")) {
      setPageCount(Number(message.slice("ready:".length)));
      applyAnnotationSettings();
      return;
    }

    if (message.startsWith("pageRendered:")) {
      setRenderedPages((previous) => previous + 1);
      return;
    }

    if (message.startsWith("error:")) {
      setError(message.slice("error:".length));
      return;
    }

    if (message.startsWith("pageError:")) {
      console.warn("PDF page rendering error:", message);
    }
    if (message.startsWith("annotationCount:")) {
      setAnnotationCount(Number(message.slice("annotationCount:".length)));
      return;
    }
    if (message.startsWith("annotations:")) {
      try {
        const annotations = JSON.parse(message.slice("annotations:".length));

        handleExportedAnnotations(annotations);
      } catch (error) {
        setSaving(false);

        Alert.alert(
          "Export failed",
          "Could not read the annotations from the PDF preview.",
        );
      }

      return;
    }
  }

  function selectDocument(document) {
    setAnnotationCount(0);
    setTextAnnotation("");
    setAnnotationTool("view");
    setAnnotationColor("#FF3B30");
    setSaving(false);

    setSelectedDocument(document);
  }
  function goBackToSelection() {
    setSelectedDocument(null);
    setViewerHtml("");
    setError("");
    setPageCount(0);
    setRenderedPages(0);
    setAnnotationCount(0);
    setTextAnnotation("");
    setAnnotationTool("view");
    setSaving(false);
  }

  function renderDocument({ item }) {
    return (
      <Pressable
        style={styles.documentCard}
        onPress={() => selectDocument(item)}
      >
        <View style={styles.pdfIcon}>
          <Text style={styles.pdfIconText}>PDF</Text>
        </View>

        <View style={styles.documentInfo}>
          <Text style={styles.documentName} numberOfLines={1}>
            {item.name}
          </Text>

          <Text style={styles.documentMeta}>
            {item.page_count || "Unknown"} pages
          </Text>
        </View>

        <Text style={styles.arrow}>›</Text>
      </Pressable>
    );
  }

  // PDF selection screen.
  if (!selectedDocument) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>

          <View style={styles.headerText}>
            <Text style={styles.title}>Annotate PDF</Text>
            <Text style={styles.subtitle}>
              Choose a document to get started
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#6C63FF" />
            <Text style={styles.loadingText}>Loading your Library...</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>

            <Pressable style={styles.retryButton} onPress={loadDocuments}>
              <Text style={styles.retryText}>Try Again</Text>
            </Pressable>
          </View>
        ) : documents.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>No PDFs found</Text>
            <Text style={styles.emptyText}>
              Import a PDF into your Library before annotating.
            </Text>
          </View>
        ) : (
          <FlatList
            data={documents}
            keyExtractor={(item) => item.id}
            renderItem={renderDocument}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
    );
  }

  // PDF preview screen.
  return (
    <View style={styles.container}>
      <View style={styles.viewerHeader}>
        <Pressable onPress={goBackToSelection} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>

        <View style={styles.viewerTitleContainer}>
          <Text style={styles.viewerTitle} numberOfLines={1}>
            {selectedDocument.name}
          </Text>

          <Text style={styles.subtitle}>
            {pageCount > 0 ? `${pageCount} pages` : "Preparing preview..."}
          </Text>
        </View>
      </View>

      <View style={styles.annotationToolbar}>
        <View style={styles.toolRow}>
          {[
            ["view", "View"],
            ["pen", "Pen"],
            ["highlight", "Highlight"],
            ["text", "Text"],
          ].map(([tool, label]) => (
            <Pressable
              key={tool}
              onPress={() => changeAnnotationTool(tool)}
              style={[
                styles.toolButton,
                annotationTool === tool && styles.activeTool,
              ]}
            >
              <Text
                style={[
                  styles.toolText,
                  annotationTool === tool && styles.activeToolText,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {annotationTool === "text" && (
          <TextInput
            value={textAnnotation}
            onChangeText={(value) => {
              setTextAnnotation(value);

              sendWebViewCommand(
                `window.setAnnotationText(${JSON.stringify(value)})`,
              );
            }}
            placeholder="Enter text, then tap on the PDF page"
            placeholderTextColor="#999DB0"
            style={styles.annotationTextInput}
            multiline
          />
        )}

        <View style={styles.toolRow}>
          {colors.map((color) => (
            <Pressable
              key={color}
              onPress={() => changeAnnotationColor(color)}
              style={[
                styles.colorButton,
                { backgroundColor: color },
                annotationColor === color && styles.selectedColor,
              ]}
            />
          ))}

          <Pressable onPress={undoAnnotation} style={styles.actionButton}>
            <Text style={styles.actionText}>Undo</Text>
          </Pressable>

          <Pressable onPress={clearAnnotations} style={styles.actionButton}>
            <Text style={styles.actionText}>Clear</Text>
          </Pressable>
          <Pressable
            style={[styles.saveButton, saving && styles.disabledSaveButton]}
            onPress={saveAnnotations}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.saveButtonText}>Save PDF</Text>
            )}
          </Pressable>
        </View>
      </View>

      {preparing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#6C63FF" />
          <Text style={styles.loadingText}>Preparing PDF preview...</Text>
        </View>
      )}

      {!!error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={goBackToSelection}>
            <Text style={styles.retryText}>Choose another PDF</Text>
          </Pressable>
        </View>
      )}

      {!!viewerHtml && !error && (
        <WebView
          ref={webViewRef}
          key={selectedDocument.id}
          source={{ html: viewerHtml }}
          originWhitelist={["*"]}
          javaScriptEnabled
          allowFileAccess
          onMessage={handleWebViewMessage}
          onLoadEnd={applyAnnotationSettings}
          onError={() => setError("Unable to display the PDF preview.")}
          style={styles.webview}
        />
      )}

      {pageCount > 0 && (
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Preview ready · {renderedPages} page(s) rendered
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F6F7FC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    paddingTop: 24,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#ECECF4",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#EFEEFF",
    alignItems: "center",
    justifyContent: "center",
  },
  backText: {
    fontSize: 30,
    color: "#6C63FF",
    lineHeight: 34,
  },
  headerText: {
    marginLeft: 13,
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#171A2B",
  },
  subtitle: {
    fontSize: 12,
    color: "#85899A",
    marginTop: 4,
  },
  listContent: {
    padding: 18,
    paddingBottom: 30,
  },
  documentCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 11,
    borderWidth: 1,
    borderColor: "#ECECF4",
  },
  pdfIcon: {
    width: 45,
    height: 45,
    borderRadius: 12,
    backgroundColor: "#EFEEFF",
    alignItems: "center",
    justifyContent: "center",
  },
  pdfIconText: {
    color: "#6C63FF",
    fontWeight: "800",
    fontSize: 12,
  },
  documentInfo: {
    flex: 1,
    marginLeft: 13,
  },
  documentName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#24263A",
  },
  documentMeta: {
    fontSize: 11,
    color: "#85899A",
    marginTop: 5,
  },
  arrow: {
    fontSize: 25,
    color: "#999DB0",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 25,
  },
  loadingText: {
    color: "#777D91",
    marginTop: 12,
    fontSize: 13,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#24263A",
  },
  emptyText: {
    color: "#85899A",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  errorText: {
    color: "#B42318",
    textAlign: "center",
    fontSize: 13,
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 15,
    backgroundColor: "#6C63FF",
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 10,
  },
  retryText: {
    color: "#6C63FF",
    fontWeight: "700",
    marginTop: 12,
  },
  viewerHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#ECECF4",
  },
  viewerTitleContainer: {
    flex: 1,
    marginLeft: 12,
  },
  viewerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#24263A",
  },
  webview: {
    flex: 1,
    backgroundColor: "#F6F7FC",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
    backgroundColor: "#F6F7FC",
    alignItems: "center",
    justifyContent: "center",
  },
  errorContainer: {
    padding: 20,
    alignItems: "center",
  },
  footer: {
    padding: 9,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#ECECF4",
    alignItems: "center",
  },
  footerText: {
    fontSize: 11,
    color: "#777D91",
  },
  annotationToolbar: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#ECECF4",
    gap: 10,
  },

  toolRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
  },

  toolButton: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: "#F1F1F6",
  },

  activeTool: {
    backgroundColor: "#6C63FF",
  },

  toolText: {
    color: "#555B72",
    fontSize: 12,
    fontWeight: "700",
  },

  activeToolText: {
    color: "#FFFFFF",
  },

  colorButton: {
    width: 23,
    height: 23,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  selectedColor: {
    borderColor: "#24263A",
    borderWidth: 3,
  },

  actionButton: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#EFEEFF",
  },

  actionText: {
    color: "#6C63FF",
    fontSize: 11,
    fontWeight: "800",
  },

  annotationTextInput: {
    minHeight: 42,
    maxHeight: 90,
    backgroundColor: "#F6F7FC",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ECECF4",
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: "#24263A",
    fontSize: 13,
  },
  saveButton: {
    backgroundColor: "#16A34A",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  disabledSaveButton: {
    opacity: 0.6,
  },

  saveButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 11,
  },
});

import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";

const PDFJS_BUNDLE = require("../../assets/pdfjs.bundle.txt");
const PDFJS_WORKER_BUNDLE = require("../../assets/pdfjs.worker.bundle.txt");

export default function PDFPagePreview({
  document,
  initialSelectedPages = [],
  onSelectionChange,
  onPageCount,
  onConfirm,
}) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function preparePreview() {
      setHtml("");
      setError("");
      setLoading(true);

      try {
        if (!document?.uri) {
          throw new Error("Select a PDF to preview its pages.");
        }

        const bundleAsset = Asset.fromModule(PDFJS_BUNDLE);
        const workerAsset = Asset.fromModule(PDFJS_WORKER_BUNDLE);

        await Promise.all([
          bundleAsset.downloadAsync(),
          workerAsset.downloadAsync(),
        ]);

        if (!bundleAsset.localUri || !workerAsset.localUri) {
          throw new Error("Unable to load the PDF preview engine.");
        }

        const [pdfjsSource, workerSource, pdfBase64] = await Promise.all([
          FileSystem.readAsStringAsync(bundleAsset.localUri),
          FileSystem.readAsStringAsync(workerAsset.localUri),
          FileSystem.readAsStringAsync(document.uri, {
            encoding: FileSystem.EncodingType.Base64,
          }),
        ]);

        if (cancelled) return;
        const initialSelectionJSON = JSON.stringify(
          initialSelectedPages.map(Number),
        );

        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
<style>
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: Arial, sans-serif;
  color: #20243A;
  background: #F7F8FC;
}
body {
  display: flex;
  flex-direction: column;
}
.topbar {
  flex-shrink: 0;
  padding: 10px 12px;
  background: white;
  border-bottom: 1px solid #E9EAF2;
}
#status {
  font-size: 12px;
  color: #777D92;
  margin-bottom: 9px;
}
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
button {
  border: 0;
  border-radius: 10px;
  padding: 11px 12px;
  font-size: 12px;
  font-weight: 700;
}
.secondary {
  color: #6C63FF;
  background: #F0EFFF;
}
.primary {
  color: white;
  background: #6C63FF;
}
button:disabled {
  opacity: 0.45;
}
#count {
  flex: 1;
  color: #454A61;
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}
#scrollArea {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 10px;
}
#grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 12px;
}
.page {
  min-width: 0;
  padding: 6px;
  border: 2px solid #E3E5EF;
  border-radius: 12px;
  background: white;
  position: relative;
  overflow: hidden;
}
.page.selected {
  border-color: #6C63FF;
  background: #F0EFFF;
}
.page canvas {
  display: block;
  width: 100%;
  height: auto;
  background: white;
}
.pageNumber {
  padding: 7px 0 3px;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  color: #555B72;
}
.check {
  position: absolute;
  top: 9px;
  right: 9px;
  z-index: 1;
  width: 22px;
  height: 22px;
  border: 1px solid #C8CBDA;
  border-radius: 7px;
  color: transparent;
  background: white;
  text-align: center;
  line-height: 22px;
  font-weight: bold;
}
.page.selected .check {
  color: white;
  background: #6C63FF;
  border-color: #6C63FF;
}
.bottomBar {
  flex-shrink: 0;
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  background: white;
  border-top: 1px solid #E9EAF2;
}
.bottomBar button {
  flex: 1;
  padding: 14px 8px;
  font-size: 13px;
}
</style>
</head>
<body>
  <div class="topbar">
    <div id="status">Preparing page previews…</div>
    <div class="actions">
      <button class="secondary" id="selectAll" disabled>Select All</button>
      <div id="count">0 selected</div>
      <button class="secondary" id="clear" disabled>Clear Selection</button>
    </div>
  </div>

  <div id="scrollArea">
    <div id="grid"></div>
  </div>

  <div class="bottomBar">
    <button class="primary" id="confirm" disabled>Confirm Selection</button>
  </div>

  <script>window.PDF_DATA = "${pdfBase64}";</script>
  <script>${pdfjsSource}</script>
  <script>
    window.PDFJS_WORKER_SOURCE = ${JSON.stringify(workerSource)};
  </script>

  <script>
  (async function () {
    const status = document.getElementById("status");
    const grid = document.getElementById("grid");
    const count = document.getElementById("count");
    const selectAllButton = document.getElementById("selectAll");
    const clearButton = document.getElementById("clear");
    const confirmButton = document.getElementById("confirm");

    const selected = new Set();
    const cards = new Map();
    let pdf = null;
    let observer = null;

    function notifyNative(message) {
      window.ReactNativeWebView?.postMessage(message);
    }

    function sendSelection() {
      const pages = Array.from(selected).sort((a, b) => a - b);

      count.textContent = pages.length + " selected";
      clearButton.disabled = pages.length === 0;
      confirmButton.disabled = pages.length === 0;

      notifyNative("selection:" + JSON.stringify(pages));
    }

    function setPageSelected(number, isSelected) {
      const card = cards.get(number);
      if (!card) return;

      if (isSelected) {
        selected.add(number);
        card.classList.add("selected");
      } else {
        selected.delete(number);
        card.classList.remove("selected");
      }
    }

    selectAllButton.addEventListener("click", () => {
      if (!pdf) return;

      for (let number = 1; number <= pdf.numPages; number++) {
        setPageSelected(number, true);
      }

      sendSelection();
    });

    clearButton.addEventListener("click", () => {
      for (const number of Array.from(selected)) {
        setPageSelected(number, false);
      }

      sendSelection();
    });

    confirmButton.addEventListener("click", () => {
      if (selected.size === 0) return;

      const pages = Array.from(selected).sort((a, b) => a - b);
      notifyNative("confirmSelection:" + JSON.stringify(pages));
    });

    async function renderPage(number, canvas) {
      if (canvas.dataset.rendered === "true") return;
      canvas.dataset.rendered = "true";

      try {
        const page = await pdf.getPage(number);
        const original = page.getViewport({ scale: 1 });

        const availableWidth = Math.max(
          100,
          (grid.clientWidth - 12) / 2 - 16
        );

        const scale = availableWidth / original.width;
        const viewport = page.getViewport({ scale });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.ceil(viewport.width * ratio);
        canvas.height = Math.ceil(viewport.height * ratio);

        await page.render({
          canvasContext: canvas.getContext("2d"),
          viewport,
          transform: [ratio, 0, 0, ratio, 0, 0],
        }).promise;
      } catch (err) {
        canvas.dataset.rendered = "error";
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

      pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;

      notifyNative("previewReady:" + pdf.numPages);
      status.textContent = pdf.numPages + " pages · Tap pages to select";

      for (let number = 1; number <= pdf.numPages; number++) {
        const card = document.createElement("div");
        card.className = "page";

        const check = document.createElement("div");
        check.className = "check";
        check.textContent = "✓";

        const canvas = document.createElement("canvas");
        const label = document.createElement("div");
        label.className = "pageNumber";
        label.textContent = "Page " + number;

        card.appendChild(check);
        card.appendChild(canvas);
        card.appendChild(label);
        grid.appendChild(card);
        cards.set(number, card);

        card.addEventListener("click", () => {
          setPageSelected(number, !selected.has(number));
          sendSelection();
        });

        observer = observer || new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;

            const number = Number(entry.target.dataset.page);
            const canvas = entry.target.querySelector("canvas");

            renderPage(number, canvas);
            observer.unobserve(entry.target);
          });
        }, { root: document.getElementById("scrollArea"), rootMargin: "250px" });

        card.dataset.page = String(number);
        observer.observe(card);
      }
      // Restore previously selected pages
      const initialSelection = ${initialSelectionJSON};

      initialSelection.forEach((pageNumber) => {
        setPageSelected(Number(pageNumber), true);
      });   

      selectAllButton.disabled = false;
      status.textContent = pdf.numPages + " pages · Scroll to see all pages";
      sendSelection();
    } catch (err) {
      status.textContent = "Could not preview this PDF: " +
        (err.message || "Unknown error");
      notifyNative("previewError:" + (err.message || "Preview failed"));
    }
  })();
  </script>
</body>
</html>
        `;

        if (!cancelled) setHtml(htmlContent);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not prepare previews.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    preparePreview();

    return () => {
      cancelled = true;
    };
  }, [document?.uri]);

  function handleMessage(event) {
    const message = event.nativeEvent.data;

    if (message.startsWith("selection:")) {
      try {
        onSelectionChange(JSON.parse(message.slice("selection:".length)));
      } catch {
        onSelectionChange([]);
      }
    } else if (message.startsWith("previewReady:")) {
      onPageCount?.(Number(message.slice("previewReady:".length)));
    } else if (message.startsWith("confirmSelection:")) {
      try {
        const pages = JSON.parse(message.slice("confirmSelection:".length));
        onSelectionChange(pages);
        onConfirm?.(pages);
      } catch {
        onSelectionChange([]);
      }
    } else if (message.startsWith("previewError:")) {
      setError(message.slice("previewError:".length));
    }
  }

  return (
    <View style={styles.container}>
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#6C63FF" />
          <Text style={styles.loadingText}>Preparing page previews…</Text>
        </View>
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}

      {!!html && !error && (
        <WebView
          key={document?.uri}
          source={{ html }}
          originWhitelist={["*"]}
          javaScriptEnabled
          allowFileAccess
          onMessage={handleMessage}
          style={styles.webview}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F8FC",
  },
  webview: {
    flex: 1,
    backgroundColor: "#F7F8FC",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7F8FC",
  },
  loadingText: {
    marginTop: 10,
    color: "#555B72",
    fontSize: 13,
  },
  error: {
    padding: 16,
    color: "#B42318",
    fontSize: 13,
  },
});

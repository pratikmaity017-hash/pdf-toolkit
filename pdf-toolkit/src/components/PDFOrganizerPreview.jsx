import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";

const PDFJS_BUNDLE = require("../../assets/pdfjs.bundle.txt");
const PDFJS_WORKER_BUNDLE = require("../../assets/pdfjs.worker.bundle.txt");

export default function PDFOrganizerPreview({
  document,
  onOperationsChange,
  onPageCount,
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
          throw new Error("Select a PDF to organize its pages.");
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

        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>

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
  padding: 12px;
  background: white;
  border-bottom: 1px solid #E9EAF2;
}

#status {
  color: #777D92;
  font-size: 12px;
}

#count {
  margin-top: 6px;
  color: #454A61;
  font-size: 12px;
  font-weight: bold;
}

#scrollArea {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 12px;
}

#grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 12px;
}

.page {
  min-width: 0;
  padding: 7px;
  border: 2px solid #E3E5EF;
  border-radius: 13px;
  background: white;
  overflow: hidden;
}

.page canvas {
  display: block;
  width: 100%;
  height: auto;
  background: white;
}

.pageInfo {
  padding: 8px 0;
  text-align: center;
  font-size: 12px;
  font-weight: bold;
  color: #454A61;
}

.sourceInfo {
  text-align: center;
  font-size: 10px;
  color: #858A9E;
  margin-bottom: 8px;
}

.controls {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
}

button {
  border: 0;
  border-radius: 8px;
  padding: 9px 2px;
  font-size: 12px;
  font-weight: bold;
  background: #F0EFFF;
  color: #6C63FF;
}

button:disabled {
  opacity: 0.35;
}

.deleteButton {
  background: #FFF0F0;
  color: #D92D20;
}

#saveInfo {
  flex-shrink: 0;
  padding: 11px 14px;
  text-align: center;
  background: white;
  border-top: 1px solid #E9EAF2;
  color: #555B72;
  font-size: 12px;
}
</style>
</head>

<body>

<div class="topbar">
  <div id="status">Preparing page previews...</div>
  <div id="count">0 pages</div>
</div>

<div id="scrollArea">
  <div id="grid"></div>
</div>

<div id="saveInfo">
  Use the controls to organize your pages.
</div>

<script>
window.PDF_DATA = "${pdfBase64}";
</script>

<script>${pdfjsSource}</script>

<script>
window.PDFJS_WORKER_SOURCE = ${JSON.stringify(workerSource)};
</script>

<script>
(async function () {
  const status = document.getElementById("status");
  const count = document.getElementById("count");
  const grid = document.getElementById("grid");

  let pdf = null;
  let operations = [];
  let observer = null;
  let operationId = 0;

  const renderedPages = new Set();

  function notifyNative(message) {
    window.ReactNativeWebView?.postMessage(message);
  }

  function sendOperations() {
    notifyNative(
      "operations:" + JSON.stringify(operations)
    );

    count.textContent =
      operations.length + " page(s) in output PDF";
  }

  function movePage(index, direction) {
    const newIndex = index + direction;

    if (newIndex < 0 || newIndex >= operations.length) {
      return;
    }

    const [page] = operations.splice(index, 1);
    operations.splice(newIndex, 0, page);

    renderCards();
    sendOperations();
  }

  function rotatePage(index) {
    const page = operations[index];

    if (!page) return;

    page.rotation = (page.rotation + 90) % 360;

    renderCards();
    sendOperations();
  }

  function duplicatePage(index) {
    const page = operations[index];

    if (!page) return;

    const duplicate = {
      id: ++operationId,
      sourcePageIndex: page.sourcePageIndex,
      rotation: page.rotation,
    };

    operations.splice(index + 1, 0, duplicate);

    renderCards();
    sendOperations();
  }

  function deletePage(index) {
    if (operations.length <= 1) {
      notifyNative("lastPageWarning");
      return;
    }

    operations.splice(index, 1);

    renderCards();
    sendOperations();
  }

  async function renderThumbnail(canvas, sourcePageIndex) {
    const cacheKey = sourcePageIndex;

    try {
      const page = await pdf.getPage(sourcePageIndex + 1);

      const originalViewport = page.getViewport({
        scale: 1,
      });

      const availableWidth = Math.max(
        100,
        (grid.clientWidth - 12) / 2 - 18
      );

      const scale = Math.min(
        availableWidth / originalViewport.width,
        1.5
      );

      const viewport = page.getViewport({ scale });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.ceil(viewport.width * ratio);
      canvas.height = Math.ceil(viewport.height * ratio);

      await page.render({
        canvasContext: canvas.getContext("2d"),
        viewport,
        transform: [ratio, 0, 0, ratio, 0, 0],
      }).promise;

      renderedPages.add(cacheKey);
    } catch (error) {
      console.warn("Thumbnail rendering failed:", error);
    }
  }

  function renderCards() {
    if (observer) {
      observer.disconnect();
    }

    grid.innerHTML = "";

    operations.forEach((operation, index) => {
      const card = document.createElement("div");
      card.className = "page";

      const canvas = document.createElement("canvas");

      const info = document.createElement("div");
      info.className = "pageInfo";
      info.textContent = "Output page " + (index + 1);

      const source = document.createElement("div");
      source.className = "sourceInfo";

      source.textContent =
        "Original page " +
        (operation.sourcePageIndex + 1) +
        " · " +
        operation.rotation +
        "°";

      const controls = document.createElement("div");
      controls.className = "controls";

      const up = document.createElement("button");
      up.textContent = "↑";
      up.disabled = index === 0;
      up.addEventListener("click", () => {
        movePage(index, -1);
      });

      const down = document.createElement("button");
      down.textContent = "↓";
      down.disabled = index === operations.length - 1;
      down.addEventListener("click", () => {
        movePage(index, 1);
      });

      const rotate = document.createElement("button");
      rotate.textContent = "↻";
      rotate.addEventListener("click", () => {
        rotatePage(index);
      });

      const duplicate = document.createElement("button");
      duplicate.textContent = "Copy";
      duplicate.addEventListener("click", () => {
        duplicatePage(index);
      });

      const remove = document.createElement("button");
      remove.textContent = "Delete";
      remove.className = "deleteButton";
      remove.addEventListener("click", () => {
        deletePage(index);
      });

      controls.appendChild(up);
      controls.appendChild(down);
      controls.appendChild(rotate);
      controls.appendChild(duplicate);
      controls.appendChild(remove);

      card.appendChild(canvas);
      card.appendChild(info);
      card.appendChild(source);
      card.appendChild(controls);

      grid.appendChild(card);

      card.dataset.sourcePageIndex = String(
        operation.sourcePageIndex
      );

      card._canvas = canvas;
    });

    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const card = entry.target;
        const sourceIndex = Number(
          card.dataset.sourcePageIndex
        );

        renderThumbnail(card._canvas, sourceIndex);
        observer.unobserve(card);
      });
    }, {
      root: document.getElementById("scrollArea"),
      rootMargin: "250px",
    });

    Array.from(grid.children).forEach((card) => {
      observer.observe(card);
    });
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
      data: bytes,
    }).promise;

    for (let index = 0; index < pdf.numPages; index++) {
      operations.push({
        id: ++operationId,
        sourcePageIndex: index,
        rotation: 0,
      });
    }

    status.textContent =
      "PDF loaded · Use the controls to organize pages";

    renderCards();
    sendOperations();

    notifyNative("previewReady:" + pdf.numPages);

  } catch (error) {
    status.textContent =
      "Could not preview PDF: " +
      (error.message || "Unknown error");

    notifyNative(
      "previewError:" + (error.message || "Preview failed")
    );
  }
})();
</script>

</body>
</html>
        `;

        if (!cancelled) {
          setHtml(htmlContent);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Could not prepare PDF preview.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    preparePreview();

    return () => {
      cancelled = true;
    };
  }, [document?.uri]);

  function handleMessage(event) {
    const message = event.nativeEvent.data;

    if (message.startsWith("operations:")) {
      try {
        const operations = JSON.parse(message.slice("operations:".length));

        onOperationsChange?.(operations);
      } catch (error) {
        console.error("Invalid organizer operations:", error);
      }
    } else if (message.startsWith("previewReady:")) {
      onPageCount?.(Number(message.slice("previewReady:".length)));
    } else if (message === "lastPageWarning") {
      setError(
        "A PDF must contain at least one page. Add or duplicate a page before deleting the last one.",
      );
    } else if (message.startsWith("previewError:")) {
      setError(message.slice("previewError:".length));
    }
  }

  return (
    <View style={styles.container}>
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#6C63FF" />
          <Text style={styles.loadingText}>Preparing page previews...</Text>
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

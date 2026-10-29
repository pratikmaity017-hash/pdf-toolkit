import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { updateDocumentPageCount } from "../database/database";

const PDFJS_BUNDLE = require("../../assets/pdfjs.bundle.txt");
const PDFJS_WORKER_BUNDLE = require("../../assets/pdfjs.worker.bundle.txt");

export default function ReaderScreen({ document, onBack }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewerHtml, setViewerHtml] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function prepareReader() {
      setLoading(true);
      setError("");
      setViewerHtml("");

      try {
        if (!document?.uri) {
          throw new Error("No PDF file was selected.");
        }

        // Load the bundled PDF.js JavaScript asset.

        const bundleAsset = Asset.fromModule(PDFJS_BUNDLE);
        const workerAsset = Asset.fromModule(PDFJS_WORKER_BUNDLE);

        await Promise.all([
          bundleAsset.downloadAsync(),
          workerAsset.downloadAsync(),
        ]);

        if (!bundleAsset.localUri || !workerAsset.localUri) {
          throw new Error("Unable to load the PDF reader engine.");
        }

        const pdfjsSource = await FileSystem.readAsStringAsync(
          bundleAsset.localUri,
        );

        const workerSource = await FileSystem.readAsStringAsync(
          workerAsset.localUri,
        );

        // Read the local PDF as Base64.
        const pdfBase64 = await FileSystem.readAsStringAsync(document.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        if (cancelled) return;

        const html = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta
                name="viewport"
                content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover"
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
                  min-height: 0;
                  overflow: hidden;
                  background: #F6F7FC;
                  font-family: Arial, sans-serif;
                  color: #171A2B;
                }

                body {
                  display: flex;
                  flex-direction: column;
                }

                .toolbar {
                  position: sticky;
                  top: 0;
                  z-index: 2;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  gap: 16px;
                  padding: 12px;
                  background: #FFFFFF;
                  border-bottom: 1px solid #ECECF4;
                }

                #toolbar {
                  position: sticky;
                  top: 0;
                  z-index: 100;
                  transform: none !important;
                  zoom: 1 !important;
                  flex-shrink: 0;
                }

                button {
                  border: none;
                  border-radius: 9px;
                  padding: 10px 14px;
                  background: #6C63FF;
                  color: white;
                  font-size: 14px;
                  font-weight: 600;
                }

                button:disabled {
                  background: #C9C7E8;
                }

                #pageInfo {
                  min-width: 90px;
                  text-align: center;
                  font-size: 13px;
                  color: #414258;
                }

               

               

                #status {
                  flex: 0 0 auto;
                  padding: 8px 12px;
                  background: #F6F7FC;
                }

                #pages {
                  width: 100%;
                  height: auto;
                  flex: 1 1 0;
                  min-height: 0;
                  display: flex;
                  flex-direction: column;
                  align-items: flex-start;
                  gap: 14px;
                  padding: 8px 0 28px;
                  overflow-y: auto;
                  overflow-x: auto;
                  overscroll-behavior: contain;
                  -webkit-overflow-scrolling: touch;
                }

                .page-shell {
                  flex: 0 0 auto;
                  width: calc(100% - 12px);
                  margin: 0 6px;
                  position: relative;
                  background: #FFFFFF;
                  box-shadow: 0 2px 10px rgba(30, 30, 60, 0.12);
                  overflow: visible;
                }

                .page-shell canvas {
                  display: block;
                  width: 100%;
                  height: auto;
                  max-width: none;
                  transform: none;
                  touch-action: pan-x pan-y pinch-zoom;
                }

                #pages.single-page-mode {
                  height: auto;
                  flex: 1 1 0;
                  min-height: 0;
                  padding: 8px 0 24px;
                  overflow: auto;
                }

                #pages.single-page-mode .page-shell {
                  display: none;
                }

                #pages.single-page-mode .page-shell.active-page {
                  display: block;
                  width: 100%;
                  margin: 0;
                  overflow: auto;
                  box-shadow: none;
                }

                #pages.single-page-mode .page-shell.active-page canvas {
                  width: 100%;
                  height: auto;
                  max-width: none;
                }

                #toolbar.single-page-mode {
                  flex-wrap: wrap;
                  gap: 8px;
                }
              </style>
            </head>

            <body>
             
              <div class="toolbar" id="toolbar">
                <button id="previous" disabled>Previous</button>
                <span id="pageInfo">Loading…</span>
                <button id="next" disabled>Next</button>
                <button id="closeSinglePage" style="display: none;">
                  Close
                </button>
              </div>


              <div id="status">Preparing your PDF…</div>
              <div id="pages"></div>

              <script>
                window.PDF_DATA = "${pdfBase64}";
              </script>

              
              <script>
                ${pdfjsSource}
              </script>

              <script>
                window.PDFJS_WORKER_SOURCE = ${JSON.stringify(workerSource)};
              </script>


              <script>
                
                (async function () {
                  const status = document.getElementById("status");
                  const pages = document.getElementById("pages");
                  const previous = document.getElementById("previous");
                  const next = document.getElementById("next");
                  const pageInfo = document.getElementById("pageInfo");

                  let pdf = null;
                  let currentPage = 1;
                  
                  let singlePageMode = false;

                  

                  const toolbar = document.getElementById("toolbar");
                  const closeSinglePage = document.getElementById("closeSinglePage");

                  
                  function showSinglePage(pageNumber) {
                    singlePageMode = true;
                    currentPage = pageNumber;

                    pages.classList.add("single-page-mode");
                    toolbar.classList.add("single-page-mode");

                    pageElements.forEach((shell, index) => {
                      const isActive = index === pageNumber - 1;

                      shell.classList.toggle("active-page", isActive);

                      if (!isActive) {
                        const canvas = shell.querySelector("canvas");

                        if (canvas) {
                          canvas.style.transform = "scale(1)";
                        }

                        shell.dataset.zoomed = "false";
                      }
                    });

                    closeSinglePage.style.display = "inline-block";

                    updateControls();
                    renderPage(pageNumber);
                  }

                  
                  let touchStartX = 0;
                  let touchStartY = 0;

                  pages.addEventListener("touchstart", (event) => {
                    if (!singlePageMode || !event.touches.length) return;

                    touchStartX = event.touches[0].clientX;
                    touchStartY = event.touches[0].clientY;
                  }, { passive: true });

                  pages.addEventListener("touchend", (event) => {
                    if (!singlePageMode || !event.changedTouches.length) return;

                    const touchEndX = event.changedTouches[0].clientX;
                    const touchEndY = event.changedTouches[0].clientY;

                    const deltaX = touchEndX - touchStartX;
                    const deltaY = touchEndY - touchStartY;

                    // Only handle a clear horizontal swipe.
                    if (
                      Math.abs(deltaX) < 60 ||
                      Math.abs(deltaX) < Math.abs(deltaY) * 1.3
                    ) {
                      return;
                    }

                    if (deltaX < 0 && currentPage < pdf.numPages) {
                      goToPage(currentPage + 1);
                    } else if (deltaX > 0 && currentPage > 1) {
                      goToPage(currentPage - 1);
                    }
                  }, { passive: true });


                  function closeSinglePageView() {
                    singlePageMode = false;

                    pages.classList.remove("single-page-mode");
                    toolbar.classList.remove("single-page-mode");

                    pageElements.forEach((shell) => {
                      shell.classList.remove("active-page");
                    });

                    closeSinglePage.style.display = "none";

                    pageElements[currentPage - 1]?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });

                    updateControls();
                  }

                  closeSinglePage.addEventListener("click", closeSinglePageView);

                  let pageElements = [];
                  let observer = null;

                  const renderedPages = new Set();
                  const renderingPages = new Set();

                  function notifyNative(message) {
                    if (window.ReactNativeWebView) {
                      window.ReactNativeWebView.postMessage(message);
                    }
                  }

                  function updateControls() {
                    if (!pdf) return;

                    pageInfo.textContent =
                      "Page " + currentPage + " of " + pdf.numPages;

                    previous.disabled = currentPage <= 1;
                    next.disabled = currentPage >= pdf.numPages;
                  }

                 
                  function goToPage(pageNumber) {
                    if (!pdf) return;

                    currentPage = Math.max(
                      1,
                      Math.min(pageNumber, pdf.numPages)
                    );

                    if (singlePageMode) {
                      showSinglePage(currentPage);
                    } else {
                      pageElements[currentPage - 1]?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });

                      updateControls();
                    }
                  }

                  async function renderPage(pageNumber) {
                    if (
                      !pdf ||
                      renderedPages.has(pageNumber) ||
                      renderingPages.has(pageNumber)
                    ) {
                      return;
                    }

                    renderingPages.add(pageNumber);

                    const shell = pageElements[pageNumber - 1];

                    try {
                      const page = await pdf.getPage(pageNumber);

                      const originalViewport = page.getViewport({
                        scale: 1,
                      });

                      const baseWidth = Number(shell.dataset.baseWidth) || Math.max(
                        200,
                        document.documentElement.clientWidth - 12
                      );

                      const baseScale = baseWidth / originalViewport.width;
                      const viewport = page.getViewport({
                        scale: baseScale * zoomLevel,
                      });

                      // Increase backing resolution for clearer text.
                      const pixelRatio = Math.min(
                        window.devicePixelRatio || 1,
                        3
                      );

                      const canvas = document.createElement("canvas");
                      const context = canvas.getContext("2d");

                      canvas.width = Math.ceil(viewport.width * pixelRatio);
                      canvas.height = Math.ceil(viewport.height * pixelRatio);

                      // Keep the displayed dimensions independent of pixel resolution.
                      canvas.style.width = "100%";
                      canvas.style.height = "auto";
                     

                      shell.appendChild(canvas);

                      await page.render({
                        canvasContext: context,
                        viewport: viewport,
                        transform: [
                          pixelRatio, 0,
                          0, pixelRatio,
                          0, 0,
                        ],
                      }).promise;

                      renderedPages.add(pageNumber);

                      if (zoomLevel > 1) {
                        applyZoomToAllPages();
                      }

                      status.style.display = "none";
                      notifyNative("ready");
                    } catch (renderError) {
                      shell.textContent =
                        "Unable to render page " +
                        pageNumber +
                        ". " +
                        (renderError.message || "");

                      notifyNative(
                        "error:" + shell.textContent
                      );
                    } finally {
                      renderingPages.delete(pageNumber);
                    }
                  }

                  function createPageShells() {
                    pages.innerHTML = "";
                    pageElements = [];

                    for (let i = 1; i <= pdf.numPages; i++) {
                      const shell = document.createElement("div");

                     
                      shell.className = "page-shell";
                      shell.dataset.page = String(i);
                      shell.style.aspectRatio = "auto";
                      shell.dataset.baseWidth = String(
                        Math.max(200, document.documentElement.clientWidth - 12)
                      );
                      setupPinchZoom(shell);

                      
                      shell.dataset.zoomed = "false";
                      shell.dataset.lastTap = "0";
                      shell.dataset.tapTimer = "0";

                      shell.addEventListener("click", () => {
                        const now = Date.now();
                        const lastTap = Number(shell.dataset.lastTap || 0);

                        if (now - lastTap < 300) {
                          clearTimeout(Number(shell.dataset.tapTimer));

                          shell.dataset.lastTap = "0";

                          zoomLevel = zoomLevel > 1 ? 1 : 2;

                          applyZoomToAllPages();

                          rerenderRenderedPages();

                          

                          return;
                        }

                        shell.dataset.lastTap = String(now);

                        const timer = setTimeout(() => {
                          shell.dataset.lastTap = "0";

                          if (!singlePageMode) {
                            showSinglePage(Number(shell.dataset.page));
                          }
                        }, 300);

                        shell.dataset.tapTimer = String(timer);
                      });


                      pages.appendChild(shell);
                      pageElements.push(shell);

                    }

                    // Update the page counter as the user scrolls.
                    
                    let pageObserver = new IntersectionObserver(
                      () => {
                        if (singlePageMode) return;

                        const viewportCenter = window.innerHeight / 2;
                        let closestPage = null;
                        let smallestDistance = Infinity;

                        pageElements.forEach((shell, index) => {
                          const rect = shell.getBoundingClientRect();

                          // Ignore pages that are not visible.
                          if (
                            rect.bottom <= 0 ||
                            rect.top >= window.innerHeight
                          ) {
                            return;
                          }

                          const pageCenter = (rect.top + rect.bottom) / 2;
                          const distance = Math.abs(pageCenter - viewportCenter);

                          if (distance < smallestDistance) {
                            smallestDistance = distance;
                            closestPage = index + 1;
                          }
                        });

                        if (closestPage !== null) {
                          currentPage = closestPage;
                          updateControls();
                        }
                      },
                      {
                        threshold: [0, 0.25, 0.5, 0.75, 1],
                      }
                    );

                    pageElements.forEach((shell) => {
                      pageObserver.observe(shell);
                    });

                    pageElements.forEach((shell) => {
                      pageObserver.observe(shell);
                    });

                    // Render pages near the visible area, rather than all
                    // pages at once. This helps reduce memory use.
                    observer = new IntersectionObserver(
                      (entries) => {
                        entries.forEach((entry) => {
                          if (entry.isIntersecting) {
                            renderPage(
                              Number(entry.target.dataset.page)
                            );

                            observer.unobserve(entry.target);
                          }
                        });
                      },
                      {
                        rootMargin: "600px 0px",
                      }
                    );

                    pageElements.forEach((shell) => {
                      observer.observe(shell);
                    });
                  }

                  let pinchStartDistance = 0;
                  let pinchStartZoom = 1;

                  let zoomLevel = 1;

                  const MIN_ZOOM = 1;
                  const MAX_ZOOM = 4;

                  function getTouchDistance(touches) {
                    const dx = touches[0].clientX - touches[1].clientX;
                    const dy = touches[0].clientY - touches[1].clientY;

                    return Math.sqrt(dx * dx + dy * dy);
                  }

                  function applyZoomToAllPages() {
                    pageElements.forEach((shell) => {
                      const canvas = shell.querySelector("canvas");
                      if (!canvas) return;

                      const baseWidth = Number(shell.dataset.baseWidth);

                      if (!baseWidth) return;

                      const zoomedWidth = baseWidth * zoomLevel;

                      shell.style.width = String(zoomedWidth) + "px";

                      canvas.style.width = String(zoomedWidth) + "px";
                      canvas.style.height = "auto";
                      canvas.style.maxWidth = "none";

                      shell.dataset.zoomed = String(zoomLevel > 1);
                    });
                  }

                  async function rerenderRenderedPages() {
                    const pagesToRender = [...renderedPages];

                    for (const pageNumber of pagesToRender) {
                      const shell = pageElements[pageNumber - 1];

                      if (!shell) continue;

                      const canvas = shell.querySelector("canvas");

                      if (canvas) {
                        canvas.remove();
                      }

                      renderedPages.delete(pageNumber);
                      renderingPages.delete(pageNumber);

                      await renderPage(pageNumber);
                    }
                  }

                  function setupPinchZoom(shell) {
                    shell.addEventListener(
                      "touchstart",
                      (event) => {
                        if (event.touches.length !== 2) return;

                        pinchStartDistance = getTouchDistance(event.touches);
                        pinchStartZoom = zoomLevel;
                      },
                      { passive: true }
                    );

                    shell.addEventListener(
                      "touchmove",
                      (event) => {
                        if (
                          event.touches.length !== 2 ||
                          pinchStartDistance === 0
                        ) {
                          return;
                        }

                        const currentDistance = getTouchDistance(event.touches);

                        zoomLevel = Math.max(
                          MIN_ZOOM,
                          Math.min(
                            pinchStartZoom * (currentDistance / pinchStartDistance),
                            MAX_ZOOM
                          )
                        );

                        applyZoomToAllPages();
                      },
                      { passive: true }
                    );

                    shell.addEventListener("touchend", (event) => {
                      if (event.touches.length < 2) {
                        const wasPinching = pinchStartDistance !== 0;
                        pinchStartDistance = 0;

                        if (wasPinching) {
                          rerenderRenderedPages();
                        }
                      }
                    });
                  }

                  previous.addEventListener("click", () => {
                    goToPage(currentPage - 1);
                  });

                  next.addEventListener("click", () => {
                    goToPage(currentPage + 1);
                  });

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

                    const workerUrl = URL.createObjectURL(workerBlob);

                    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                      workerUrl;

                    pdf = await window.pdfjsLib.getDocument({
                      data: bytes,
                    }).promise;

                    notifyNative("pageCount:" + pdf.numPages);

                    status.textContent = "Preparing pages…";

                    createPageShells();
                    updateControls();

                    // Render the first page immediately.
                    await renderPage(1);
                  } catch (loadError) {
                    status.style.display = "block";
                    status.textContent =
                      "Could not open this PDF. " +
                      (loadError.message || "Unknown error");

                    notifyNative("error:" + status.textContent);
                  }
                })();

              </script>
            </body>
          </html>
        `;

        if (!cancelled) {
          setViewerHtml(html);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to prepare the PDF reader.");
          setLoading(false);
        }
      }
    }

    prepareReader();

    return () => {
      cancelled = true;
    };
  }, [document?.uri, retryCount]);

  function handleWebViewMessage(event) {
    const message = event.nativeEvent.data;

    if (message === "ready") {
      setLoading(false);
      setError("");
    } else if (message.startsWith("error:")) {
      setLoading(false);
      setError(message.slice(6));
    }
  }

  function retry() {
    setError("");
    setLoading(true);
    setRetryCount((count) => count + 1);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to Library"
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>

        <Text style={styles.title} numberOfLines={1}>
          {document?.name || "PDF Reader"}
        </Text>
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Unable to open PDF</Text>
          <Text style={styles.errorText}>{error}</Text>

          <Pressable style={styles.retryButton} onPress={retry}>
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {viewerHtml !== "" && (
            <WebView
              key={`${document?.uri}-${retryCount}`}
              source={{ html: viewerHtml }}
              originWhitelist={["*"]}
              javaScriptEnabled
              allowFileAccess
              onMessage={async (event) => {
                const message = event.nativeEvent.data;

                // Hide the native loading overlay once PDF.js has rendered a page.
                if (message === "ready") {
                  setLoading(false);
                  setError("");
                  return;
                }

                if (message.startsWith("error:")) {
                  setLoading(false);
                  setError(message.slice("error:".length));
                  return;
                }

                if (message.startsWith("pageCount:")) {
                  const pageCount = Number(message.slice("pageCount:".length));

                  if (
                    Number.isInteger(pageCount) &&
                    pageCount > 0 &&
                    document?.id
                  ) {
                    try {
                      await updateDocumentPageCount(document.id, pageCount);
                    } catch (error) {
                      console.error("Failed to save PDF page count:", error);
                    }
                  }
                }
              }}
              onError={() => {
                setLoading(false);
                setError("The PDF viewer failed to load.");
              }}
              style={styles.viewer}
              scalesPageToFit={false}
              setBuiltInZoomControls={false}
              builtInZoomControls={false}
            />
          )}

          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#6C63FF" />
              <Text style={styles.loadingText}>Opening PDF…</Text>
            </View>
          )}
        </>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#ECECF4",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F0EFFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  backText: {
    fontSize: 32,
    lineHeight: 36,
    color: "#6C63FF",
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#171A2B",
  },
  viewer: {
    flex: 1,
    backgroundColor: "#F6F7FC",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    top: 64,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F6F7FC",
    zIndex: 1,
  },
  loadingText: {
    marginTop: 10,
    color: "#414258",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#171A2B",
  },
  errorText: {
    marginTop: 10,
    textAlign: "center",
    color: "#77798B",
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: "#6C63FF",
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  retryText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
});

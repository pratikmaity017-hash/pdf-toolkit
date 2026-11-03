import { PDFDocument, degrees } from "pdf-lib";
import { Directory, File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";

const PDF_DIRECTORY = new Directory(Paths.document, "pdf-toolkit");

/**
 * Normalize any angle to the range 0–359.
 */
function normalizeRotation(angle) {
  return ((angle % 360) + 360) % 360;
}

/**
 * Validate the page operations before generating the PDF.
 *
 * Each item represents one output page:
 * {
 *   sourcePageIndex: 0, // Original page index (zero-based)
 *   rotation: 90        // Additional rotation in degrees
 * }
 *
 * Duplicate pages are allowed because multiple output entries
 * can point to the same original page.
 */
function validatePageOperations(pageOperations, totalPages) {
  if (!Array.isArray(pageOperations) || pageOperations.length === 0) {
    throw new Error("Your PDF must contain at least one page.");
  }

  return pageOperations.map((operation, index) => {
    const { sourcePageIndex, rotation = 0 } = operation ?? {};

    if (
      !Number.isInteger(sourcePageIndex) ||
      sourcePageIndex < 0 ||
      sourcePageIndex >= totalPages
    ) {
      throw new Error(`Invalid source page at position ${index + 1}.`);
    }

    if (!Number.isInteger(rotation) || rotation % 90 !== 0) {
      throw new Error(
        `Page ${index + 1} must have a rotation in multiples of 90 degrees.`,
      );
    }

    return {
      sourcePageIndex,
      rotation: normalizeRotation(rotation),
    };
  });
}

/**
 * Generate an organized PDF.
 *
 * Page order in pageOperations determines the output order.
 * The original PDF is never modified.
 *
 * Returns metadata compatible with saveDocument().
 */
export async function organizePdfFile(document, pageOperations, outputName) {
  if (!document?.uri) {
    throw new Error("The source PDF location is missing.");
  }

  const sourceFile = new File(document.uri);

  if (!sourceFile.exists) {
    throw new Error("The selected PDF could not be found.");
  }

  const safeBaseName = (outputName || "")
    .trim()
    .replace(/\.pdf$/i, "")
    .replace(/[\\/:\"*?<>|]/g, "_");

  if (!safeBaseName) {
    throw new Error("Enter a valid output filename.");
  }

  // Read the original PDF.
  const base64 = await FileSystem.readAsStringAsync(document.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Convert Base64 into bytes for pdf-lib.
  const sourceBytes = Uint8Array.from(globalThis.atob(base64), (character) =>
    character.charCodeAt(0),
  );

  const sourcePdf = await PDFDocument.load(sourceBytes);
  const totalPages = sourcePdf.getPageCount();

  if (totalPages === 0) {
    throw new Error("The selected PDF has no pages.");
  }

  const operations = validatePageOperations(pageOperations, totalPages);

  // Create a separate output PDF.
  const outputPdf = await PDFDocument.create();

  // Copy pages in the requested order.
  for (const operation of operations) {
    const [copiedPage] = await outputPdf.copyPages(sourcePdf, [
      operation.sourcePageIndex,
    ]);

    // Preserve the original page rotation and add the user's rotation.
    const originalRotation = copiedPage.getRotation().angle;

    const finalRotation = normalizeRotation(
      originalRotation + operation.rotation,
    );

    copiedPage.setRotation(degrees(finalRotation));

    outputPdf.addPage(copiedPage);
  }

  const pdfBytes = await outputPdf.save();

  // Ensure the application PDF directory exists.
  if (!PDF_DIRECTORY.exists) {
    PDF_DIRECTORY.create({
      intermediates: true,
      idempotent: true,
    });
  }

  const fileName = `organized-${Date.now()}-${safeBaseName}.pdf`;
  const outputFile = new File(PDF_DIRECTORY, fileName);

  try {
    // Write the generated PDF to local storage.
    const base64Output = globalThis.btoa(
      Array.from(pdfBytes, (byte) => String.fromCharCode(byte)).join(""),
    );

    await FileSystem.writeAsStringAsync(outputFile.uri, base64Output, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (error) {
    // Avoid leaving an incomplete output file behind.
    try {
      if (outputFile.exists) {
        outputFile.delete();
      }
    } catch (cleanupError) {
      console.warn("Could not remove incomplete PDF:", cleanupError);
    }

    throw error;
  }

  return {
    id: fileName,
    name: `${safeBaseName}.pdf`,
    uri: outputFile.uri,
    size: outputFile.size || pdfBytes.length,
    pageCount: outputPdf.getPageCount(),
  };
}

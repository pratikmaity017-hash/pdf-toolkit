import { PDFDocument } from "pdf-lib";
import { Directory, File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";

const PDF_DIRECTORY = new Directory(Paths.document, "pdf-toolkit");

/**
 * Convert page selection such as "2-4, 7" into
 * zero-based page indices used by pdf-lib.
 *
 * The user enters page numbers starting from 1.
 */
function parsePageSelection(selection, totalPages) {
  if (typeof selection !== "string" || !selection.trim()) {
    throw new Error("Enter the pages you want to extract.");
  }

  const selectedPages = [];
  const seenPages = new Set();

  const parts = selection.split(",");

  for (const part of parts) {
    const value = part.trim();

    if (!value) {
      throw new Error("Check your page selection.");
    }

    const rangeMatch = value.match(/^(\d+)\s*-\s*(\d+)$/);
    const singleMatch = value.match(/^\d+$/);

    let startPage;
    let endPage;

    if (rangeMatch) {
      startPage = Number(rangeMatch[1]);
      endPage = Number(rangeMatch[2]);

      if (startPage > endPage) {
        throw new Error(`Invalid page range: ${value}. Use a range like 2-4.`);
      }
    } else if (singleMatch) {
      startPage = Number(value);
      endPage = startPage;
    } else {
      throw new Error(`Invalid page selection: ${value}. Example: 2-4, 7.`);
    }

    if (
      startPage < 1 ||
      endPage > totalPages ||
      !Number.isSafeInteger(startPage) ||
      !Number.isSafeInteger(endPage)
    ) {
      throw new Error(`Choose pages between 1 and ${totalPages}.`);
    }

    for (let page = startPage; page <= endPage; page += 1) {
      if (seenPages.has(page)) {
        throw new Error(`Page ${page} is selected more than once.`);
      }

      seenPages.add(page);
      selectedPages.push(page - 1);
    }
  }

  return selectedPages;
}

/**
 * Extract selected pages from an existing PDF.
 *
 * Returns a document object ready to be saved
 * using the existing saveDocument() database function.
 */
export async function splitPdfFile(document, pageSelection, outputName) {
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

  // Read the original PDF as Base64.
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

  // Validate the selection against the actual PDF.
  const pageIndices = parsePageSelection(pageSelection, totalPages);

  // Create a separate PDF without modifying the original.
  const outputPdf = await PDFDocument.create();

  const copiedPages = await outputPdf.copyPages(sourcePdf, pageIndices);

  copiedPages.forEach((page) => outputPdf.addPage(page));

  const pdfBytes = await outputPdf.save();

  // Ensure the existing application PDF directory exists.
  if (!PDF_DIRECTORY.exists) {
    PDF_DIRECTORY.create({
      intermediates: true,
      idempotent: true,
    });
  }

  const fileName = `split-${Date.now()}-${safeBaseName}.pdf`;
  const outputFile = new File(PDF_DIRECTORY, fileName);

  // Write the generated PDF to local storage.
  const base64Output = globalThis.btoa(
    Array.from(pdfBytes, (byte) => String.fromCharCode(byte)).join(""),
  );

  await FileSystem.writeAsStringAsync(outputFile.uri, base64Output, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Return metadata in the same format used by the merger.
  return {
    id: fileName,
    name: `${safeBaseName}.pdf`,
    uri: outputFile.uri,
    size: outputFile.size || pdfBytes.length,
    pageCount: outputPdf.getPageCount(),
  };
}

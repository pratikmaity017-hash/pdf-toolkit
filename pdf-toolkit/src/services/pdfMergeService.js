import { PDFDocument } from "pdf-lib";
import { Directory, File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";

const PDF_DIRECTORY = new Directory(Paths.document, "pdf-toolkit");

export async function mergePdfFiles(documents, outputName) {
  if (!Array.isArray(documents) || documents.length < 2) {
    throw new Error("Select at least two PDF files to merge.");
  }

  const safeBaseName = outputName
    .trim()
    .replace(/\.pdf$/i, "")
    .replace(/[\\/:"*?<>|]/g, "_");

  if (!safeBaseName) {
    throw new Error("Enter a valid output filename.");
  }

  if (!PDF_DIRECTORY.exists) {
    PDF_DIRECTORY.create({
      intermediates: true,
      idempotent: true,
    });
  }

  const mergedPdf = await PDFDocument.create();

  for (const document of documents) {
    if (!document.uri) {
      throw new Error(`Missing file location for ${document.name}.`);
    }

    const sourceFile = new File(document.uri);

    if (!sourceFile.exists) {
      throw new Error(`${document.name} could not be found.`);
    }

    const base64 = await FileSystem.readAsStringAsync(document.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const sourceBytes = Uint8Array.from(globalThis.atob(base64), (character) =>
      character.charCodeAt(0),
    );

    const sourcePdf = await PDFDocument.load(sourceBytes);

    const copiedPages = await mergedPdf.copyPages(
      sourcePdf,
      sourcePdf.getPageIndices(),
    );

    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  const pdfBytes = await mergedPdf.save();

  const base64Output = globalThis.btoa(
    Array.from(pdfBytes, (byte) => String.fromCharCode(byte)).join(""),
  );

  const fileName = `merged-${Date.now()}-${safeBaseName}.pdf`;
  const outputFile = new File(PDF_DIRECTORY, fileName);

  await FileSystem.writeAsStringAsync(outputFile.uri, base64Output, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return {
    id: fileName,
    name: `${safeBaseName}.pdf`,
    uri: outputFile.uri,
    size: outputFile.size || pdfBytes.length,
    pageCount: mergedPdf.getPageCount(),
  };
}

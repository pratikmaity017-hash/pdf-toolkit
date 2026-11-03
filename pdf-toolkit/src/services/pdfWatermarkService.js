import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { Directory, File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";

const PDF_DIRECTORY = new Directory(Paths.document, "pdf-toolkit");

function sanitizeFilename(name) {
  return (name || "")
    .trim()
    .replace(/\.pdf$/i, "")
    .replace(/[\\/:\"*?<>|]/g, "_");
}

function parseHexColor(hex) {
  const value = hex.trim().replace(/^#/, "");

  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error("Enter a valid 6-digit color, such as #777777.");
  }

  return rgb(
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  );
}

export async function addTextWatermark(document, options) {
  if (!document?.uri) {
    throw new Error("The source PDF location is missing.");
  }

  const watermarkText = options?.text?.trim();
  const outputName = sanitizeFilename(options?.outputName);

  if (!watermarkText) {
    throw new Error("Enter the watermark text.");
  }

  if (!outputName) {
    throw new Error("Enter a valid output filename.");
  }

  const fontSize = Number(options.fontSize);
  const opacity = Number(options.opacity);
  const rotation = Number(options.rotation);

  if (!Number.isFinite(fontSize) || fontSize < 8 || fontSize > 150) {
    throw new Error("Font size must be between 8 and 150.");
  }

  if (!Number.isFinite(opacity) || opacity < 0.05 || opacity > 1) {
    throw new Error("Opacity must be between 0.05 and 1.");
  }

  if (!Number.isFinite(rotation) || rotation < -90 || rotation > 90) {
    throw new Error("Rotation must be between -90 and 90 degrees.");
  }

  const sourceFile = new File(document.uri);

  if (!sourceFile.exists) {
    throw new Error("The selected PDF could not be found.");
  }

  const base64 = await FileSystem.readAsStringAsync(document.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const sourceBytes = Uint8Array.from(globalThis.atob(base64), (character) =>
    character.charCodeAt(0),
  );

  const pdf = await PDFDocument.load(sourceBytes);

  if (pdf.getPageCount() === 0) {
    throw new Error("The selected PDF has no pages.");
  }

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const color = parseHexColor(options.color || "#777777");

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();

    // Fit long watermark text within the page.
    const measuredWidth = font.widthOfTextAtSize(watermarkText, fontSize);
    const maxWidth = width * 0.8;
    const actualFontSize =
      measuredWidth > maxWidth
        ? fontSize * (maxWidth / measuredWidth)
        : fontSize;

    const textWidth = font.widthOfTextAtSize(watermarkText, actualFontSize);

    const textHeight = font.heightAtSize(actualFontSize);

    page.drawText(watermarkText, {
      x: (width - textWidth) / 2,
      y: (height - textHeight) / 2,
      size: actualFontSize,
      font,
      color,
      opacity,
      rotate: degrees(rotation),
    });
  }

  const pdfBytes = await pdf.save();

  if (!PDF_DIRECTORY.exists) {
    PDF_DIRECTORY.create({
      intermediates: true,
      idempotent: true,
    });
  }

  const fileName = `watermark-${Date.now()}-${outputName}.pdf`;
  const outputFile = new File(PDF_DIRECTORY, fileName);

  const base64Output = globalThis.btoa(
    Array.from(pdfBytes, (byte) => String.fromCharCode(byte)).join(""),
  );

  await FileSystem.writeAsStringAsync(outputFile.uri, base64Output, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return {
    id: fileName,
    name: `${outputName}.pdf`,
    uri: outputFile.uri,
    size: outputFile.size || pdfBytes.length,
    pageCount: pdf.getPageCount(),
  };
}

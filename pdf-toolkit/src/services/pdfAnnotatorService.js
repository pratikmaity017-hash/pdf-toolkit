import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Directory, File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";

const PDF_DIRECTORY = new Directory(Paths.document, "pdf-toolkit");

function hexToRgb(hex) {
  const clean = hex.replace("#", "");

  return rgb(
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  );
}

function normalizedPoint(point, pageWidth, pageHeight) {
  return {
    x: point.x * pageWidth,
    y: (1 - point.y) * pageHeight,
  };
}

function drawAnnotation(page, annotation, font) {
  const { width, height } = page.getSize();
  const color = hexToRgb(annotation.color || "#FF3B30");

  if (annotation.type === "pen") {
    const points = annotation.points || [];

    for (let i = 1; i < points.length; i++) {
      const start = normalizedPoint(points[i - 1], width, height);
      const end = normalizedPoint(points[i], width, height);

      page.drawLine({
        start,
        end,
        color,
        thickness: 2,
      });
    }
  }

  if (annotation.type === "highlight") {
    const x = Math.min(annotation.x1, annotation.x2) * width;
    const top = Math.min(annotation.y1, annotation.y2);
    const bottom = Math.max(annotation.y1, annotation.y2);

    const rectangleWidth = Math.abs(annotation.x2 - annotation.x1) * width;

    const rectangleHeight = (bottom - top) * height;

    page.drawRectangle({
      x,
      y: height - bottom * height,
      width: rectangleWidth,
      height: rectangleHeight,
      color,
      opacity: 0.28,
      borderWidth: 0,
    });
  }

  if (annotation.type === "text") {
    const fontSize = 14;

    page.drawText(annotation.text, {
      x: annotation.x * width,
      y: height - annotation.y * height - fontSize,
      size: fontSize,
      font,
      color,
      maxWidth: width - annotation.x * width - 8,
    });
  }
}

export async function saveAnnotatedPdf(document, annotations) {
  if (!document?.uri) {
    throw new Error("The original PDF location is missing.");
  }

  if (!Array.isArray(annotations) || annotations.length === 0) {
    throw new Error("There are no annotations to save.");
  }

  const sourceFile = new File(document.uri);

  if (!sourceFile.exists) {
    throw new Error("The original PDF could not be found.");
  }

  const base64 = await FileSystem.readAsStringAsync(document.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const sourceBytes = Uint8Array.from(globalThis.atob(base64), (character) =>
    character.charCodeAt(0),
  );

  const pdfDocument = await PDFDocument.load(sourceBytes);

  const pages = pdfDocument.getPages();
  const font = await pdfDocument.embedFont(StandardFonts.Helvetica);

  for (const annotation of annotations) {
    const pageNumber = Number(annotation.pageNumber);

    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      pageNumber > pages.length
    ) {
      continue;
    }

    const page = pages[pageNumber - 1];

    drawAnnotation(page, annotation, font);
  }

  if (!PDF_DIRECTORY.exists) {
    PDF_DIRECTORY.create({
      intermediates: true,
      idempotent: true,
    });
  }

  const originalBaseName = document.name
    .replace(/\.pdf$/i, "")
    .replace(/[\\/:*?"<>|]/g, "_");

  const safeName = `${originalBaseName}-annotated`;

  const id = `annotated-${Date.now()}-${safeName}.pdf`;
  const outputFile = new File(PDF_DIRECTORY, id);

  try {
    const pdfBytes = await pdfDocument.save();

    const outputBase64 = globalThis.btoa(
      Array.from(pdfBytes, (byte) => String.fromCharCode(byte)).join(""),
    );

    await FileSystem.writeAsStringAsync(outputFile.uri, outputBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return {
      id,
      name: `${safeName}.pdf`,
      uri: outputFile.uri,
      size: outputFile.size || pdfBytes.length,
      pageCount: pages.length,
    };
  } catch (error) {
    if (outputFile.exists) {
      outputFile.delete();
    }

    throw error;
  }
}

import { Platform } from "react-native";
import { requireNativeModule } from "expo";

const PdfMultiShare =
  Platform.OS === "android" ? requireNativeModule("PdfMultiShare") : null;

export default PdfMultiShare;

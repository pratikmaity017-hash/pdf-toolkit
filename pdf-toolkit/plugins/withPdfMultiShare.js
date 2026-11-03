const {
  withAndroidManifest,
  withDangerousMod,
} = require("@expo/config-plugins");

const fs = require("fs");
const path = require("path");

function withPdfMultiShare(config) {
  // Register FileProvider in AndroidManifest.xml.
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application?.[0];

    if (!application) {
      throw new Error("Android application manifest was not found.");
    }

    application.provider = application.provider || [];

    const authority = "${applicationId}.pdfshareprovider";

    const provider = {
      $: {
        "android:name": "androidx.core.content.FileProvider",
        "android:authorities": authority,
        "android:exported": "false",
        "android:grantUriPermissions": "true",
      },
      "meta-data": [
        {
          $: {
            "android:name": "android.support.FILE_PROVIDER_PATHS",
            "android:resource": "@xml/pdf_share_paths",
          },
        },
      ],
    };

    const existingIndex = application.provider.findIndex(
      (item) => item.$?.["android:authorities"] === authority,
    );

    if (existingIndex >= 0) {
      application.provider[existingIndex] = provider;
    } else {
      application.provider.push(provider);
    }

    return config;
  });

  // Generate FileProvider's allowed paths XML.
  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const xmlDirectory = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml",
      );

      fs.mkdirSync(xmlDirectory, { recursive: true });

      const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <files-path
        name="pdf_toolkit_documents"
        path="pdf-toolkit/" />
</paths>`;

      fs.writeFileSync(
        path.join(xmlDirectory, "pdf_share_paths.xml"),
        xmlContent,
      );

      return config;
    },
  ]);

  return config;
}

module.exports = withPdfMultiShare;

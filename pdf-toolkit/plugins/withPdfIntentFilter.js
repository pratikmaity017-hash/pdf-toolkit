const { withAndroidManifest } = require("@expo/config-plugins");

function withPdfIntentFilter(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    const mainActivity = manifest.application?.[0]?.activity?.find((activity) =>
      activity.$["android:name"]?.endsWith(".MainActivity"),
    );

    if (!mainActivity) {
      throw new Error("PDF Toolkit MainActivity was not found.");
    }

    const filters = mainActivity["intent-filter"] ?? [];

    // Avoid adding the same standalone PDF filter twice.
    const alreadyExists = filters.some((filter) => {
      const hasPdfMimeType = filter.data?.some(
        (item) => item.$?.["android:mimeType"] === "application/pdf",
      );

      const hasScheme = filter.data?.some((item) => item.$?.["android:scheme"]);

      return hasPdfMimeType && !hasScheme;
    });

    if (!alreadyExists) {
      filters.push({
        action: [
          {
            $: {
              "android:name": "android.intent.action.VIEW",
            },
          },
        ],
        category: [
          {
            $: {
              "android:name": "android.intent.category.DEFAULT",
            },
          },
          {
            $: {
              "android:name": "android.intent.category.BROWSABLE",
            },
          },
        ],
        data: [
          {
            $: {
              "android:mimeType": "application/pdf",
            },
          },
        ],
      });
    }

    mainActivity["intent-filter"] = filters;

    return config;
  });
}

module.exports = withPdfIntentFilter;

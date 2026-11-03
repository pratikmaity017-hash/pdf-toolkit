package expo.modules.pdfmultishare

import android.content.ClipData
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class PdfMultiShareModule : Module() {

    override fun definition() = ModuleDefinition {

        Name("PdfMultiShare")

        AsyncFunction("sharePdfs") { fileUris: List<String> ->

            if (fileUris.isEmpty()) {
                throw IllegalArgumentException("No PDF files were provided.")
            }

            val activity = appContext.currentActivity
                ?: throw IllegalStateException(
                    "Cannot open sharing while the app is inactive."
                )

            if (activity.isFinishing) {
                throw IllegalStateException("The current activity is finishing.")
            }

            // Convert private file:// URIs into shareable content:// URIs.
            val contentUris = fileUris.map { rawUri ->

                val parsedUri = Uri.parse(rawUri)

                if (parsedUri.scheme != "file") {
                    throw IllegalArgumentException(
                        "Unsupported PDF URI: $rawUri"
                    )
                }

                val filePath = parsedUri.path
                    ?: throw IllegalArgumentException(
                        "Invalid PDF file path."
                    )

                val pdfFile = File(filePath)

                if (!pdfFile.exists() || !pdfFile.isFile || !pdfFile.canRead()) {
                    throw IllegalArgumentException(
                        "PDF file is missing or cannot be read: ${pdfFile.name}"
                    )
                }

                FileProvider.getUriForFile(
                    activity,
                    "${activity.packageName}.pdfshareprovider",
                    pdfFile
                )
            }

            // Build one Android multiple-file sharing intent.
            val shareIntent = Intent(Intent.ACTION_SEND_MULTIPLE).apply {

                type = "application/pdf"

                putParcelableArrayListExtra(
                    Intent.EXTRA_STREAM,
                    ArrayList(contentUris)
                )

                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }

            // Include every URI in ClipData so receiving apps get access
            // to all selected files.
            val clipData = ClipData.newUri(
                activity.contentResolver,
                "PDF files",
                contentUris.first()
            )

            contentUris.drop(1).forEach { uri ->
                clipData.addItem(ClipData.Item(uri))
            }

            shareIntent.clipData = clipData

            val chooser = Intent.createChooser(
                shareIntent,
                "Share PDFs"
            ).apply {
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }

            // Android UI operations must run on the main thread.
            activity.runOnUiThread {
                activity.startActivity(chooser)
            }
        }
    }
}
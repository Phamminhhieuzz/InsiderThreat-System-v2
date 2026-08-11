using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.CustomProperties;
using DocumentFormat.OpenXml.VariantTypes;
using iText.Kernel.Pdf;
using System.IO;

namespace InsiderThreat.Server.Services
{
    public interface IWatermarkService
    {
        Stream ApplyWatermark(Stream inputStream, string extension, string trackingId);
    }

    public class WatermarkService : IWatermarkService
    {
        private readonly ILogger<WatermarkService> _logger;

        public WatermarkService(ILogger<WatermarkService> logger)
        {
            _logger = logger;
        }

        public Stream ApplyWatermark(Stream inputStream, string extension, string trackingId)
        {
            try
            {
                // We copy the stream into a MemoryStream first because we need seekability
                // and the original stream (like GridFS) might not support it.
                var internalBuffer = new MemoryStream();
                if (inputStream.CanSeek) inputStream.Position = 0; // GridFS streams might not support seeking
                inputStream.CopyTo(internalBuffer);
                internalBuffer.Position = 0;

                extension = extension.ToLowerInvariant();

                if (extension == ".docx" || extension == ".doc")
                {
                    ApplyWordWatermark(internalBuffer, trackingId);
                }
                else if (extension == ".pdf")
                {
                    var pdfBuffer = ApplyPdfWatermark(internalBuffer, trackingId);
                    // Replace internalBuffer with the watermarked PDF data
                    internalBuffer.Dispose();
                    internalBuffer = pdfBuffer;
                }

                internalBuffer.Position = 0;
                return internalBuffer;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error applying watermark for extension {extension}");
                
                // If seeking back to 0 is not supported, we might have already partially read the stream.
                // In production, you might want to re-open the stream or just return what's left.
                try 
                {
                    if (inputStream.CanSeek) inputStream.Position = 0;
                }
                catch { /* Ignore failed seek on original stream */ }
                
                return inputStream;
            }
        }

        private void ApplyWordWatermark(MemoryStream stream, string trackingId)
        {
            using (WordprocessingDocument document = WordprocessingDocument.Open(stream, true))
            {
                var customPropsPart = document.CustomFilePropertiesPart;
                if (customPropsPart == null)
                {
                    customPropsPart = document.AddCustomFilePropertiesPart();
                    customPropsPart.Properties = new DocumentFormat.OpenXml.CustomProperties.Properties();
                }

                var props = customPropsPart.Properties;
                
                // Check if already exists, remove it
                var existingProp = props.Elements<CustomDocumentProperty>().FirstOrDefault(p => p.Name != null && p.Name.Value == "InsiderThreat:ID");
                if (existingProp != null)
                {
                    existingProp.Remove();
                }

                // Create new property
                var newProp = new CustomDocumentProperty();
                int pid = 2; // PID starts from 2
                if (props.Elements<CustomDocumentProperty>().Any())
                {
                    // Safe parsing for PID
                    pid = props.Elements<CustomDocumentProperty>().Max(p => p.PropertyId?.Value ?? 1) + 1;
                }

                newProp.FormatId = "{D5CDD505-2E9C-101B-9397-08002B2CF9AE}"; // Standard FMTID for custom properties
                newProp.PropertyId = pid;
                newProp.Name = "InsiderThreat:ID";
                newProp.VTLPWSTR = new VTLPWSTR(trackingId);

                props.AppendChild(newProp);
                customPropsPart.Properties.Save();
            }
        }

        private MemoryStream ApplyPdfWatermark(MemoryStream inputStream, string trackingId)
        {
            inputStream.Position = 0;
            byte[]? result = null;

            using (var reader = new PdfReader(inputStream))
            using (var interimStream = new MemoryStream())
            {
                using (var writer = new PdfWriter(interimStream))
                using (var pdfDoc = new PdfDocument(reader, writer))
                {
                    var info = pdfDoc.GetDocumentInfo();
                    info.SetMoreInfo("InsiderThreat:ID", trackingId);
                }
                result = interimStream.ToArray();
            }
            
            return new MemoryStream(result);
        }
    }
}

using System.Text.Unicode;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Formats.Gif;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Memory;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace ChessWeb.Services.Uploads;

public sealed record SanitizedUpload(byte[] Content, string Extension, string ContentType);

public interface IUploadSanitizer
{
    /// <summary>Validates the upload and returns safe content: images are re-encoded without metadata, documents are checked against their type.</summary>
    Task<SanitizedUpload> SanitizeAsync(IFormFile file, CancellationToken cancellationToken = default);
}

public sealed class UploadSanitizer : IUploadSanitizer
{
    public const long MaxFileSizeBytes = 5 * 1024 * 1024;
    public const long MaxImagePixels = 25_000_000;
    public const long MaxDecodedPixels = 40_000_000;
    public const int MaxImageDimension = 2048;
    public const int MaxImageFrames = 100;
    public static readonly string[] AllowedExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".pgn", ".txt"];

    private static readonly TimeSpan GateTimeout = TimeSpan.FromSeconds(20);
    // Cancels decoding and encoding; in-memory pixel operations (orient/resize) are bounded by the pixel limits instead.
    private static readonly TimeSpan ProcessingTimeout = TimeSpan.FromSeconds(15);

    // Bounds concurrent decodes so a burst of large images cannot exhaust CPU or memory.
    private static readonly SemaphoreSlim ImageProcessingGate = new(2, 2);

    // Frames beyond the limit are dropped by the decoder; the allocator refuses any single buffer above the limit.
    private static readonly DecoderOptions ImageDecoderOptions = new()
    {
        MaxFrames = MaxImageFrames,
        Configuration = CreateImageConfiguration()
    };

    public async Task<SanitizedUpload> SanitizeAsync(IFormFile file, CancellationToken cancellationToken = default)
    {
        if (file == null || file.Length == 0)
        {
            throw new UploadRejectedException("The file is empty.");
        }
        if (file.Length > MaxFileSizeBytes)
        {
            throw new UploadRejectedException($"File size exceeds the maximum allowed limit of {MaxFileSizeBytes / (1024 * 1024)} MB.");
        }

        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedExtensions.Contains(extension))
        {
            throw new UploadRejectedException($"File type '{extension}' is not permitted. Allowed extensions: {string.Join(", ", AllowedExtensions)}");
        }

        if (IsImageExtension(extension))
        {
            return new SanitizedUpload(await ReencodeImageAsync(file, extension, cancellationToken), extension, ContentTypeFor(extension));
        }

        var content = await ReadAllAsync(file, cancellationToken);
        return extension == ".pdf"
            ? new SanitizedUpload(RequirePdf(content), extension, ContentTypeFor(extension))
            : new SanitizedUpload(RequireUtf8Text(content), extension, ContentTypeFor(extension));
    }

    public static bool IsImageExtension(string extension) =>
        extension.ToLowerInvariant() is ".jpg" or ".jpeg" or ".png" or ".gif" or ".webp";

    public static string ContentTypeFor(string extension) => extension switch
    {
        ".jpg" or ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".gif" => "image/gif",
        ".webp" => "image/webp",
        ".pdf" => "application/pdf",
        ".pgn" => "application/x-chess-pgn",
        ".txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream"
    };

    private static Configuration CreateImageConfiguration()
    {
        var configuration = Configuration.Default.Clone();
        configuration.MemoryAllocator = MemoryAllocator.Create(new MemoryAllocatorOptions { AllocationLimitMegabytes = 256 });
        return configuration;
    }

    private static async Task<byte[]> ReadAllAsync(IFormFile file, CancellationToken cancellationToken)
    {
        var content = new byte[file.Length];
        await using var input = file.OpenReadStream();
        await input.ReadExactlyAsync(content, cancellationToken);
        return content;
    }

    private static byte[] RequirePdf(byte[] content)
    {
        var start = content.AsSpan();
        if (start.StartsWith("\xEF\xBB\xBF"u8)) start = start[3..];
        start = start.TrimStart(" \t\r\n\f\0"u8);
        if (!start.StartsWith("%PDF-"u8))
        {
            throw new UploadRejectedException("The file is not a valid PDF document.");
        }
        return content;
    }

    private static byte[] RequireUtf8Text(byte[] content)
    {
        if (!Utf8.IsValid(content) || content.AsSpan().IndexOf((byte)0) >= 0)
        {
            throw new UploadRejectedException("Text files must be valid UTF-8 text.");
        }
        return content;
    }

    private static async Task<byte[]> ReencodeImageAsync(IFormFile file, string extension, CancellationToken cancellationToken)
    {
        if (!await ImageProcessingGate.WaitAsync(GateTimeout, cancellationToken))
        {
            throw new UploadUnavailableException("Image processing is busy.");
        }

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(ProcessingTimeout);
        try
        {
            var content = await ReadAllAsync(file, timeout.Token);

            using var identifyStream = new MemoryStream(content, writable: false);
            var info = await Image.IdentifyAsync(ImageDecoderOptions, identifyStream, timeout.Token);
            if (!MatchesExtension(info.Metadata.DecodedImageFormat, extension))
            {
                throw new UploadRejectedException("The image content does not match its file extension.");
            }
            var framePixels = (long)info.Width * info.Height;
            if (framePixels > MaxImagePixels)
            {
                throw new UploadRejectedException($"Images may have at most {MaxImagePixels / 1_000_000} megapixels.");
            }
            if (framePixels * Math.Max(1, info.FrameMetadataCollection.Count) > MaxDecodedPixels)
            {
                throw new UploadRejectedException("The animated image is too large.");
            }

            using var decodeStream = new MemoryStream(content, writable: false);
            using var image = await Image.LoadAsync<Rgba32>(ImageDecoderOptions, decodeStream, timeout.Token);
            image.Mutate(context =>
            {
                context.AutoOrient();
                var size = context.GetCurrentSize();
                if (size.Width > MaxImageDimension || size.Height > MaxImageDimension)
                {
                    context.Resize(new ResizeOptions { Mode = ResizeMode.Max, Size = new Size(MaxImageDimension, MaxImageDimension) });
                }
            });
            StripMetadata(image);

            using var output = new MemoryStream();
            await image.SaveAsync(output, EncoderFor(extension), timeout.Token);
            return output.ToArray();
        }
        catch (Exception exception) when (exception is ImageFormatException or NotSupportedException or InvalidMemoryOperationException)
        {
            throw new UploadRejectedException("The file is not a valid image.");
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new UploadUnavailableException("Image processing timed out.");
        }
        finally
        {
            ImageProcessingGate.Release();
        }
    }

    private static void StripMetadata(Image image)
    {
        image.Metadata.ExifProfile = null;
        image.Metadata.IptcProfile = null;
        image.Metadata.XmpProfile = null;
        image.Metadata.IccProfile = null;
        image.Metadata.GetPngMetadata().TextData.Clear();
        image.Metadata.GetGifMetadata().Comments.Clear();
        image.Metadata.GetJpegMetadata().Comments.Clear();
        foreach (var frame in image.Frames)
        {
            frame.Metadata.ExifProfile = null;
            frame.Metadata.IptcProfile = null;
            frame.Metadata.XmpProfile = null;
            frame.Metadata.IccProfile = null;
        }
    }

    private static bool MatchesExtension(IImageFormat? format, string extension) => (format, extension) switch
    {
        (JpegFormat, ".jpg" or ".jpeg") => true,
        (PngFormat, ".png") => true,
        (GifFormat, ".gif") => true,
        (WebpFormat, ".webp") => true,
        _ => false
    };

    private static IImageEncoder EncoderFor(string extension) => extension switch
    {
        ".jpg" or ".jpeg" => new JpegEncoder { Quality = 85 },
        ".png" => new PngEncoder(),
        ".gif" => new GifEncoder(),
        ".webp" => new WebpEncoder { Quality = 85 },
        _ => throw new ArgumentOutOfRangeException(nameof(extension), extension, "Not an image extension.")
    };
}

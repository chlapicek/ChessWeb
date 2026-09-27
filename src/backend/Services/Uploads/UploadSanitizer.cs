using System.Text.Unicode;
using SkiaSharp;

namespace ChessWeb.Services.Uploads;

/// <summary>Sanitized upload content. <see cref="Extension"/> can differ from the uploaded one (GIFs are stored as PNG).</summary>
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
    public const int MaxImageDimension = 2048;
    public const int JpegWebpQuality = 85;
    public static readonly string[] AllowedExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".pgn", ".txt"];

    private static readonly TimeSpan GateTimeout = TimeSpan.FromSeconds(20);

    // Bounds concurrent decodes so a burst of large images cannot exhaust CPU or memory.
    private static readonly SemaphoreSlim ImageProcessingGate = new(2, 2);

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
            return await ReencodeImageAsync(file, extension, cancellationToken);
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

    private static async Task<SanitizedUpload> ReencodeImageAsync(IFormFile file, string extension, CancellationToken cancellationToken)
    {
        if (!await ImageProcessingGate.WaitAsync(GateTimeout, cancellationToken))
        {
            throw new UploadUnavailableException("Image processing is busy.");
        }

        try
        {
            var content = await ReadAllAsync(file, cancellationToken);
            var (outputFormat, outputExtension) = OutputFor(extension);
            return new SanitizedUpload(Reencode(content, extension, outputFormat), outputExtension, ContentTypeFor(outputExtension));
        }
        finally
        {
            ImageProcessingGate.Release();
        }
    }

    // Decoding only the pixels and encoding them into a fresh file drops EXIF, ICC, XMP, comments and anything appended.
    private static byte[] Reencode(byte[] content, string extension, SKEncodedImageFormat outputFormat)
    {
        using var data = SKData.CreateCopy(content);
        using var codec = SKCodec.Create(data) ?? throw new UploadRejectedException("The file is not a valid image.");
        if (!MatchesExtension(codec.EncodedFormat, extension))
        {
            throw new UploadRejectedException("The image content does not match its file extension.");
        }

        var header = codec.Info;
        if (header.Width <= 0 || header.Height <= 0 || (long)header.Width * header.Height > MaxImagePixels)
        {
            throw new UploadRejectedException($"Images may have at most {MaxImagePixels / 1_000_000} megapixels.");
        }

        // Only the first frame of animated GIF/WebP files is kept; pixels are converted to sRGB because the ICC profile is dropped.
        var alphaType = header.AlphaType == SKAlphaType.Opaque ? SKAlphaType.Opaque : SKAlphaType.Premul;
        var decodeInfo = new SKImageInfo(header.Width, header.Height, SKColorType.Rgba8888, alphaType, SKColorSpace.CreateSrgb());
        using var decoded = new SKBitmap(decodeInfo);
        var decodeResult = codec.GetPixels(decodeInfo, decoded.GetPixels());
        if (decodeResult != SKCodecResult.Success)
        {
            throw new UploadRejectedException(decodeResult == SKCodecResult.IncompleteInput ? "The image is truncated." : "The file is not a valid image.");
        }

        // Downscaling first keeps the rotation cheap; it only depends on the longest side, which rotation preserves.
        using var resized = Downscale(decoded);
        var fitted = resized ?? decoded;
        using var oriented = ApplyOrigin(fitted, codec.EncodedOrigin);
        using var pixels = (oriented ?? fitted).PeekPixels();
        using var encoded = pixels.Encode(outputFormat, JpegWebpQuality)
            ?? throw new UploadRejectedException("The image could not be processed.");
        return encoded.ToArray();
    }

    /// <summary>Returns a new bitmap rotated/flipped per the EXIF origin, or null when no change is needed.</summary>
    private static SKBitmap? ApplyOrigin(SKBitmap source, SKEncodedOrigin origin)
    {
        float w = source.Width, h = source.Height;
        // Maps a source pixel (x, y) to its display position: x' = ScaleX*x + SkewX*y + TransX, y' = SkewY*x + ScaleY*y + TransY.
        SKMatrix? matrix = origin switch
        {
            SKEncodedOrigin.TopRight => new SKMatrix(-1, 0, w, 0, 1, 0, 0, 0, 1),
            SKEncodedOrigin.BottomRight => new SKMatrix(-1, 0, w, 0, -1, h, 0, 0, 1),
            SKEncodedOrigin.BottomLeft => new SKMatrix(1, 0, 0, 0, -1, h, 0, 0, 1),
            SKEncodedOrigin.LeftTop => new SKMatrix(0, 1, 0, 1, 0, 0, 0, 0, 1),
            SKEncodedOrigin.RightTop => new SKMatrix(0, -1, h, 1, 0, 0, 0, 0, 1),
            SKEncodedOrigin.RightBottom => new SKMatrix(0, -1, h, -1, 0, w, 0, 0, 1),
            SKEncodedOrigin.LeftBottom => new SKMatrix(0, 1, 0, -1, 0, w, 0, 0, 1),
            _ => null
        };
        if (matrix == null) return null;

        var swapsAxes = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
        var result = new SKBitmap(swapsAxes ? source.Info.WithSize(source.Height, source.Width) : source.Info);
        try
        {
            using var canvas = new SKCanvas(result);
            canvas.Clear(SKColors.Transparent);
            canvas.SetMatrix(matrix.Value);
            canvas.DrawBitmap(source, 0, 0);
            return result;
        }
        catch
        {
            result.Dispose();
            throw;
        }
    }

    /// <summary>Returns a copy whose longest side is at most <see cref="MaxImageDimension"/>, or null when it already fits.</summary>
    private static SKBitmap? Downscale(SKBitmap source)
    {
        var longest = Math.Max(source.Width, source.Height);
        if (longest <= MaxImageDimension) return null;

        var scale = (double)MaxImageDimension / longest;
        var target = source.Info.WithSize(
            Math.Max(1, (int)Math.Round(source.Width * scale)),
            Math.Max(1, (int)Math.Round(source.Height * scale)));
        // Mipmapped linear sampling avoids aliasing on large reduction ratios.
        return source.Resize(target, new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear))
            ?? throw new UploadRejectedException("The image could not be processed.");
    }

    private static (SKEncodedImageFormat Format, string Extension) OutputFor(string extension) => extension switch
    {
        ".jpg" or ".jpeg" => (SKEncodedImageFormat.Jpeg, extension),
        ".png" => (SKEncodedImageFormat.Png, ".png"),
        // Skia cannot write GIF, so GIFs are stored as a static PNG of the first frame.
        ".gif" => (SKEncodedImageFormat.Png, ".png"),
        ".webp" => (SKEncodedImageFormat.Webp, ".webp"),
        _ => throw new ArgumentOutOfRangeException(nameof(extension), extension, "Not an image extension.")
    };

    private static bool MatchesExtension(SKEncodedImageFormat format, string extension) => (format, extension) switch
    {
        (SKEncodedImageFormat.Jpeg, ".jpg" or ".jpeg") => true,
        (SKEncodedImageFormat.Png, ".png") => true,
        (SKEncodedImageFormat.Gif, ".gif") => true,
        (SKEncodedImageFormat.Webp, ".webp") => true,
        _ => false
    };
}

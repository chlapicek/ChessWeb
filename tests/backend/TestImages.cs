using System.Buffers.Binary;
using System.Text;
using SkiaSharp;

namespace ChessWeb.Tests;

internal static class TestImages
{
    // Skia cannot encode GIF, so a known 1x1 GIF is embedded.
    public static readonly byte[] Gif = Convert.FromBase64String("R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==");

    public static byte[] Png(int width = 4, int height = 4) => Encode(width, height, SKEncodedImageFormat.Png, new SKColor(30, 120, 70));

    public static byte[] Webp(int width = 4, int height = 4) => Encode(width, height, SKEncodedImageFormat.Webp, new SKColor(30, 120, 70));

    /// <summary>A JPEG whose top-left quadrant is red (rest blue), with an EXIF orientation tag and a private string.</summary>
    public static byte[] JpegWithExif(int width = 128, int height = 64, ushort orientation = 6, string secret = "Secret Photographer")
    {
        byte[] jpeg;
        using (var bitmap = new SKBitmap(width, height))
        using (var canvas = new SKCanvas(bitmap))
        using (var red = new SKPaint { Color = SKColors.Red })
        {
            canvas.Clear(SKColors.Blue);
            canvas.DrawRect(0, 0, width / 2f, height / 2f, red);
            using var image = SKImage.FromBitmap(bitmap);
            using var data = image.Encode(SKEncodedImageFormat.Jpeg, 95);
            jpeg = data.ToArray();
        }

        var tiff = new List<byte>();
        tiff.AddRange("II*\0"u8.ToArray());
        tiff.AddRange(BitConverter.GetBytes(8u));
        tiff.AddRange(BitConverter.GetBytes((ushort)1));
        tiff.AddRange(BitConverter.GetBytes((ushort)0x0112)); // Orientation tag
        tiff.AddRange(BitConverter.GetBytes((ushort)3));      // SHORT
        tiff.AddRange(BitConverter.GetBytes(1u));
        tiff.AddRange(BitConverter.GetBytes((uint)orientation));
        tiff.AddRange(BitConverter.GetBytes(0u));
        tiff.AddRange(Encoding.ASCII.GetBytes(secret));

        var payload = "Exif\0\0"u8.ToArray().Concat(tiff).ToArray();
        var segment = new byte[4 + payload.Length];
        segment[0] = 0xFF;
        segment[1] = 0xE1;
        BinaryPrimitives.WriteUInt16BigEndian(segment.AsSpan(2), (ushort)(payload.Length + 2));
        payload.CopyTo(segment, 4);

        // Insert right after the SOI marker (first two bytes).
        return jpeg[..2].Concat(segment).Concat(jpeg[2..]).ToArray();
    }

    public static SKImageInfo Identify(byte[] content)
    {
        using var data = SKData.CreateCopy(content);
        using var codec = SKCodec.Create(data) ?? throw new InvalidOperationException("Not an image.");
        return codec.Info;
    }

    private static byte[] Encode(int width, int height, SKEncodedImageFormat format, SKColor color)
    {
        using var bitmap = new SKBitmap(width, height);
        bitmap.Erase(color);
        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(format, 90);
        return data.ToArray();
    }
}

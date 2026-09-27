using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Metadata.Profiles.Exif;
using SixLabors.ImageSharp.PixelFormats;

namespace ChessWeb.Tests;

internal static class TestImages
{
    public static byte[] Png(int width = 4, int height = 4)
    {
        using var image = new Image<Rgba32>(width, height, new Rgba32(30, 120, 70));
        using var output = new MemoryStream();
        image.Save(output, new PngEncoder());
        return output.ToArray();
    }

    public static byte[] JpegWithGpsExif(int width = 8, int height = 8)
    {
        using var image = new Image<Rgba32>(width, height, new Rgba32(200, 40, 40));
        image.Metadata.ExifProfile = new ExifProfile();
        image.Metadata.ExifProfile.SetValue(ExifTag.GPSLatitudeRef, "N");
        image.Metadata.ExifProfile.SetValue(ExifTag.Artist, "Secret Photographer");
        using var output = new MemoryStream();
        image.Save(output, new JpegEncoder());
        return output.ToArray();
    }
}

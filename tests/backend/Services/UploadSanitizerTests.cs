using System.Buffers.Binary;
using System.Net;
using System.Net.Sockets;
using System.Text;
using ChessWeb.Services.Uploads;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using Xunit;

namespace ChessWeb.Tests.Services;

public class UploadSanitizerTests
{
    private readonly UploadSanitizer _sanitizer = new();

    private static FormFile CreateFile(byte[] bytes, string fileName) =>
        new(new MemoryStream(bytes), 0, bytes.Length, "file", fileName) { Headers = new HeaderDictionary() };

    [Fact]
    public async Task Jpeg_IsReencodedWithoutExif()
    {
        var result = await _sanitizer.SanitizeAsync(CreateFile(TestImages.JpegWithExif(), "photo.jpeg"));

        Assert.Equal("image/jpeg", result.ContentType);
        Assert.Equal(".jpeg", result.Extension);
        Assert.DoesNotContain("Secret Photographer", Encoding.Latin1.GetString(result.Content));
        Assert.DoesNotContain("Exif", Encoding.Latin1.GetString(result.Content));
    }

    // Source is 128x64 with a red top-left quadrant; expected size and where the red quadrant ends up.
    [Theory]
    [InlineData(2, 128, 64, "TR")]
    [InlineData(3, 128, 64, "BR")]
    [InlineData(4, 128, 64, "BL")]
    [InlineData(5, 64, 128, "TL")]
    [InlineData(6, 64, 128, "TR")]
    [InlineData(7, 64, 128, "BR")]
    [InlineData(8, 64, 128, "BL")]
    public async Task ExifOrientation_IsApplied(ushort orientation, int width, int height, string redQuadrant)
    {
        var result = await _sanitizer.SanitizeAsync(CreateFile(TestImages.JpegWithExif(orientation: orientation), "photo.jpg"));

        using var upright = SkiaSharp.SKBitmap.Decode(result.Content);
        Assert.Equal((width, height), (upright.Width, upright.Height));
        foreach (var quadrant in new[] { "TL", "TR", "BL", "BR" })
        {
            var x = quadrant[1] == 'L' ? width / 4 : width * 3 / 4;
            var y = quadrant[0] == 'T' ? height / 4 : height * 3 / 4;
            var pixel = upright.GetPixel(x, y);
            var isRed = pixel.Red > 200 && pixel.Blue < 60;
            Assert.True(isRed == (quadrant == redQuadrant), $"Quadrant {quadrant} red={isRed} for orientation {orientation}");
        }
    }

    [Fact]
    public async Task Webp_IsReencoded()
    {
        var result = await _sanitizer.SanitizeAsync(CreateFile(TestImages.Webp(), "board.webp"));

        Assert.Equal("image/webp", result.ContentType);
        Assert.Equal(4, TestImages.Identify(result.Content).Width);
    }

    [Fact]
    public async Task TruncatedImage_IsRejected()
    {
        var png = TestImages.Png(64, 64);

        await Assert.ThrowsAsync<UploadRejectedException>(() => _sanitizer.SanitizeAsync(CreateFile(png[..(png.Length / 2)], "cut.png")));
    }

    [Fact]
    public async Task Gif_IsStoredAsPng()
    {
        var result = await _sanitizer.SanitizeAsync(CreateFile(TestImages.Gif, "animation.gif"));

        Assert.Equal(".png", result.Extension);
        Assert.Equal("image/png", result.ContentType);
        Assert.Equal(1, TestImages.Identify(result.Content).Width);
    }

    [Fact]
    public async Task LargeImage_IsDownscaled()
    {
        var result = await _sanitizer.SanitizeAsync(CreateFile(TestImages.Png(3000, 100), "wide.png"));

        Assert.Equal(UploadSanitizer.MaxImageDimension, TestImages.Identify(result.Content).Width);
    }

    [Theory]
    [InlineData("fake.png")]
    [InlineData("fake.jpg")]
    public async Task NonImageContent_WithImageExtension_IsRejected(string fileName)
    {
        var html = "<html><script>alert(1)</script></html>"u8.ToArray();

        await Assert.ThrowsAsync<UploadRejectedException>(() => _sanitizer.SanitizeAsync(CreateFile(html, fileName)));
    }

    [Fact]
    public async Task ImageWithMismatchedExtension_IsRejected()
    {
        await Assert.ThrowsAsync<UploadRejectedException>(() => _sanitizer.SanitizeAsync(CreateFile(TestImages.Png(), "diagram.jpg")));
    }

    [Fact]
    public async Task ImageExceedingPixelLimit_IsRejectedBeforeDecoding()
    {
        await Assert.ThrowsAsync<UploadRejectedException>(() => _sanitizer.SanitizeAsync(CreateFile(TestImages.Png(6000, 5000), "huge.png")));
    }

    [Fact]
    public async Task Pdf_RequiresPdfHeader()
    {
        var valid = await _sanitizer.SanitizeAsync(CreateFile("%PDF-1.7\n%%EOF"u8.ToArray(), "doc.pdf"));
        Assert.Equal("application/pdf", valid.ContentType);

        await Assert.ThrowsAsync<UploadRejectedException>(() => _sanitizer.SanitizeAsync(CreateFile("<html></html>"u8.ToArray(), "doc.pdf")));
        await Assert.ThrowsAsync<UploadRejectedException>(() => _sanitizer.SanitizeAsync(CreateFile("<html><script></script>%PDF-1.7"u8.ToArray(), "polyglot.pdf")));
    }

    [Theory]
    [InlineData(new byte[] { 0xC3, 0x28 })]
    [InlineData(new byte[] { 0x31, 0x2E, 0x00, 0x65, 0x34 })]
    public async Task Text_MustBeValidUtf8WithoutNulBytes(byte[] content)
    {
        await Assert.ThrowsAsync<UploadRejectedException>(() => _sanitizer.SanitizeAsync(CreateFile(content, "game.pgn")));
    }

    [Fact]
    public async Task Text_WithUtf8Characters_IsAccepted()
    {
        var pgn = Encoding.UTF8.GetBytes("[White \"Réti\"]\n\n1. Nf3 d5 *");

        var result = await _sanitizer.SanitizeAsync(CreateFile(pgn, "game.pgn"));

        Assert.Equal(pgn, result.Content);
    }
}

public class ClamAvMalwareScannerTests
{
    [Theory]
    [InlineData("stream: OK\0", true, null)]
    [InlineData("stream: Eicar-Test-Signature FOUND\0", false, "Eicar-Test-Signature")]
    public void ParseReply_ReadsVerdict(string reply, bool clean, string? signature)
    {
        var result = ClamAvMalwareScanner.ParseReply(reply);

        Assert.Equal(clean, result.IsClean);
        Assert.Equal(signature, result.Signature);
    }

    [Fact]
    public void ParseReply_WithErrorReply_FailsClosed()
    {
        Assert.Throws<MalwareScannerUnavailableException>(() => ClamAvMalwareScanner.ParseReply("INSTREAM size limit exceeded. ERROR\0"));
    }

    [Fact]
    public async Task ScanAsync_StreamsContentUsingInstreamProtocol()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        var server = Task.Run(async () =>
        {
            using var client = await listener.AcceptTcpClientAsync();
            await using var stream = client.GetStream();
            var command = new byte[10];
            await stream.ReadExactlyAsync(command);
            Assert.Equal("zINSTREAM\0", Encoding.ASCII.GetString(command));

            var received = new MemoryStream();
            var lengthBytes = new byte[4];
            while (true)
            {
                await stream.ReadExactlyAsync(lengthBytes);
                var length = BinaryPrimitives.ReadUInt32BigEndian(lengthBytes);
                if (length == 0) break;
                var chunk = new byte[length];
                await stream.ReadExactlyAsync(chunk);
                received.Write(chunk);
            }

            var verdict = Encoding.ASCII.GetString(received.ToArray()).Contains("EICAR") ? "stream: Eicar-Test-Signature FOUND\0" : "stream: OK\0";
            await stream.WriteAsync(Encoding.ASCII.GetBytes(verdict));
        });

        var scanner = new ClamAvMalwareScanner(Options.Create(new ClamAvOptions { Enabled = true, Host = "127.0.0.1", Port = port, TimeoutSeconds = 5 }));
        var result = await scanner.ScanAsync(new MemoryStream("X5O!P%@AP EICAR test"u8.ToArray()));
        await server;

        Assert.False(result.IsClean);
        Assert.Equal("Eicar-Test-Signature", result.Signature);
    }

    [Fact]
    public async Task ScanAsync_AgainstRealClamd_DetectsEicar_WhenConfigured()
    {
        // Opt-in: set CHESSWEB_CLAMAV_HOST (e.g. 127.0.0.1) with a running clamd on port 3310.
        var host = Environment.GetEnvironmentVariable("CHESSWEB_CLAMAV_HOST");
        if (string.IsNullOrWhiteSpace(host)) return;

        var scanner = new ClamAvMalwareScanner(Options.Create(new ClamAvOptions { Enabled = true, Host = host, Port = 3310, TimeoutSeconds = 10 }));
        // Assembled at runtime so the test source itself is not flagged by local antivirus.
        var eicar = string.Concat(@"X5O!P%@AP[4\PZX54(P^)7CC)7}$", "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");

        var infected = await scanner.ScanAsync(new MemoryStream(Encoding.ASCII.GetBytes(eicar)));
        var clean = await scanner.ScanAsync(new MemoryStream("1. e4 e5 2. Nf3 *"u8.ToArray()));

        Assert.False(infected.IsClean);
        Assert.Contains("Eicar", infected.Signature);
        Assert.True(clean.IsClean);
    }

    [Fact]
    public async Task ScanAsync_WhenClamdIsUnreachable_FailsClosed()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();

        var scanner = new ClamAvMalwareScanner(Options.Create(new ClamAvOptions { Enabled = true, Host = "127.0.0.1", Port = port, TimeoutSeconds = 2 }));

        await Assert.ThrowsAsync<MalwareScannerUnavailableException>(() => scanner.ScanAsync(new MemoryStream([1, 2, 3])));
    }
}

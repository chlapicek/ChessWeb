using ChessWeb.Services;
using ChessWeb.Services.Uploads;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace ChessWeb.Tests.Services;

public class FileStorageServiceTests
{
    private readonly LocalFileStorageService _service;
    private readonly string _tempRoot;

    public FileStorageServiceTests()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), "chessweb-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tempRoot);
        _service = CreateService(_tempRoot);
    }

    private static LocalFileStorageService CreateService(string contentRoot, IConfiguration? configuration = null, IMalwareScanner? scanner = null)
    {
        var env = new Mock<IWebHostEnvironment>();
        env.SetupGet(e => e.ContentRootPath).Returns(contentRoot);
        return new LocalFileStorageService(env.Object, NullLogger<LocalFileStorageService>.Instance, new UploadSanitizer(), scanner ?? new DisabledMalwareScanner(), configuration);
    }

    private static FormFile CreateFile(byte[] bytes, string fileName, string contentType) =>
        new(new MemoryStream(bytes), 0, bytes.Length, "file", fileName)
        {
            Headers = new HeaderDictionary(),
            ContentType = contentType
        };

    [Fact]
    public async Task SaveFileAsync_WithValidFile_SavesAndReturnsMetadata()
    {
        var file = CreateFile(TestImages.Png(), "sample.png", "application/x-spoofed");

        var result = await _service.SaveFileAsync(file, "articles");

        Assert.NotNull(result.storedFileName);
        Assert.EndsWith(".png", result.storedFileName);
        Assert.Equal("image/png", result.contentType);

        var filePath = Path.Combine(_tempRoot, "App_Data", "Uploads", "articles", result.storedFileName);
        Assert.True(File.Exists(filePath));
        Assert.Equal(new FileInfo(filePath).Length, result.sizeBytes);
    }

    [Fact]
    public async Task SaveFileAsync_WithConfiguredBasePath_UsesConfiguredDirectory()
    {
        var configuredRoot = Path.Combine(_tempRoot, "configured-uploads");
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["FileStorage:BasePath"] = configuredRoot
            })
            .Build();
        var service = CreateService(Path.Combine(_tempRoot, "unused-content-root"), configuration);

        var (storedFileName, _, _) = await service.SaveFileAsync(CreateFile(TestImages.Png(), "sample.png", "image/png"), "articles");

        Assert.True(File.Exists(Path.Combine(configuredRoot, "articles", storedFileName)));
        Assert.False(File.Exists(Path.Combine(_tempRoot, "unused-content-root", "App_Data", "Uploads", "articles", storedFileName)));
    }

    [Fact]
    public async Task SaveFileAsync_WithEmptyConfiguredBasePath_UsesDefaultDirectory()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["FileStorage:BasePath"] = ""
            })
            .Build();
        var service = CreateService(_tempRoot, configuration);

        var (storedFileName, _, _) = await service.SaveFileAsync(CreateFile(TestImages.Png(), "sample.png", "image/png"), "articles");

        Assert.True(File.Exists(Path.Combine(_tempRoot, "App_Data", "Uploads", "articles", storedFileName)));
    }

    [Fact]
    public async Task SaveFileAsync_WithUnsupportedExtension_Throws()
    {
        var file = CreateFile([1, 2, 3], "sample.exe", "application/octet-stream");

        await Assert.ThrowsAsync<UploadRejectedException>(() => _service.SaveFileAsync(file, "articles"));
    }

    [Fact]
    public async Task SaveFileAsync_WithOversizedFile_Throws()
    {
        var oversizedBytes = new byte[LocalFileStorageService.MaxFileSizeBytes + 1];
        var file = CreateFile(oversizedBytes, "big.png", "image/png");

        await Assert.ThrowsAsync<UploadRejectedException>(() => _service.SaveFileAsync(file, "articles"));
    }

    [Fact]
    public async Task SaveFileAsync_WhenScannerDetectsMalware_RejectsAndStoresNothing()
    {
        var scanner = new Mock<IMalwareScanner>();
        scanner.Setup(s => s.ScanAsync(It.IsAny<Stream>(), It.IsAny<CancellationToken>())).ReturnsAsync(new MalwareScanResult(false, "Eicar-Test-Signature"));
        var service = CreateService(_tempRoot, scanner: scanner.Object);

        await Assert.ThrowsAsync<UploadRejectedException>(() => service.SaveFileAsync(CreateFile("hello"u8.ToArray(), "notes.txt", "text/plain"), "articles"));

        var articlesDir = Path.Combine(_tempRoot, "App_Data", "Uploads", "articles");
        Assert.True(!Directory.Exists(articlesDir) || Directory.GetFiles(articlesDir).Length == 0);
    }

    [Fact]
    public async Task SaveFileAsync_WhenScannerUnavailable_FailsClosed()
    {
        var scanner = new Mock<IMalwareScanner>();
        scanner.Setup(s => s.ScanAsync(It.IsAny<Stream>(), It.IsAny<CancellationToken>())).ThrowsAsync(new MalwareScannerUnavailableException("down"));
        var service = CreateService(_tempRoot, scanner: scanner.Object);

        await Assert.ThrowsAsync<MalwareScannerUnavailableException>(() => service.SaveFileAsync(CreateFile("hello"u8.ToArray(), "notes.txt", "text/plain"), "articles"));
    }

    [Fact]
    public async Task DeleteFileAsync_DeletesExistingFile()
    {
        var file = CreateFile("chess notes"u8.ToArray(), "sample.txt", "text/plain");
        var (storedFileName, _, _) = await _service.SaveFileAsync(file, "articles");

        var deleted = await _service.DeleteFileAsync(storedFileName, "articles");

        Assert.True(deleted);
        var filePath = Path.Combine(_tempRoot, "App_Data", "Uploads", "articles", storedFileName);
        Assert.False(File.Exists(filePath));
    }

    [Fact]
    public async Task GetFileAsync_WhenFileMissing_ReturnsEmptyResult()
    {
        var result = await _service.GetFileAsync("missing.txt", "articles");

        Assert.Null(result.stream);
        Assert.Equal(string.Empty, result.contentType);
        Assert.Equal(string.Empty, result.originalFileName);
    }
}

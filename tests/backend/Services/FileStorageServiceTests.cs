using ChessWeb.Services;
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

        var env = new Mock<IWebHostEnvironment>();
        env.SetupGet(e => e.ContentRootPath).Returns(_tempRoot);

        _service = new LocalFileStorageService(env.Object, NullLogger<LocalFileStorageService>.Instance);
    }

    [Fact]
    public async Task SaveFileAsync_WithValidFile_SavesAndReturnsMetadata()
    {
        var file = new FormFile(new MemoryStream(new byte[] { 1, 2, 3, 4 }), 0, 4, "file", "sample.png")
        {
            Headers = new HeaderDictionary(),
            ContentType = "image/png"
        };

        var result = await _service.SaveFileAsync(file, "articles");

        Assert.NotNull(result.storedFileName);
        Assert.EndsWith(".png", result.storedFileName);
        Assert.Equal("image/png", result.contentType);
        Assert.Equal(4, result.sizeBytes);

        var filePath = Path.Combine(_tempRoot, "App_Data", "Uploads", "articles", result.storedFileName);
        Assert.True(File.Exists(filePath));
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
        var env = new Mock<IWebHostEnvironment>();
        env.SetupGet(e => e.ContentRootPath).Returns(Path.Combine(_tempRoot, "unused-content-root"));
        var service = new LocalFileStorageService(env.Object, NullLogger<LocalFileStorageService>.Instance, configuration);
        var file = new FormFile(new MemoryStream(new byte[] { 1, 2, 3 }), 0, 3, "file", "sample.png")
        {
            Headers = new HeaderDictionary(),
            ContentType = "image/png"
        };

        var (storedFileName, _, _) = await service.SaveFileAsync(file, "articles");

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
        var env = new Mock<IWebHostEnvironment>();
        env.SetupGet(e => e.ContentRootPath).Returns(_tempRoot);
        var service = new LocalFileStorageService(env.Object, NullLogger<LocalFileStorageService>.Instance, configuration);
        var file = new FormFile(new MemoryStream(new byte[] { 1, 2, 3 }), 0, 3, "file", "sample.png")
        {
            Headers = new HeaderDictionary(),
            ContentType = "image/png"
        };

        var (storedFileName, _, _) = await service.SaveFileAsync(file, "articles");

        Assert.True(File.Exists(Path.Combine(_tempRoot, "App_Data", "Uploads", "articles", storedFileName)));
    }

    [Fact]
    public async Task SaveFileAsync_WithUnsupportedExtension_Throws()
    {
        var file = new FormFile(new MemoryStream(new byte[] { 1, 2, 3 }), 0, 3, "file", "sample.exe")
        {
            Headers = new HeaderDictionary(),
            ContentType = "application/octet-stream"
        };

        await Assert.ThrowsAsync<InvalidOperationException>(() => _service.SaveFileAsync(file, "articles"));
    }

    [Fact]
    public async Task SaveFileAsync_WithOversizedFile_Throws()
    {
        var oversizedBytes = new byte[LocalFileStorageService.MaxFileSizeBytes + 1];
        var file = new FormFile(new MemoryStream(oversizedBytes), 0, oversizedBytes.Length, "file", "big.png")
        {
            Headers = new HeaderDictionary(),
            ContentType = "image/png"
        };

        await Assert.ThrowsAsync<InvalidOperationException>(() => _service.SaveFileAsync(file, "articles"));
    }

    [Fact]
    public async Task DeleteFileAsync_DeletesExistingFile()
    {
        var file = new FormFile(new MemoryStream(new byte[] { 9, 8, 7 }), 0, 3, "file", "sample.txt")
        {
            Headers = new HeaderDictionary(),
            ContentType = "text/plain"
        };
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

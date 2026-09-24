using Amazon.S3;
using Amazon.S3.Model;
using ChessWeb.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace ChessWeb.Tests.Services;

public class S3FileStorageServiceTests
{
    private readonly Mock<IAmazonS3> _client = new();
    private readonly S3FileStorageService _service;

    public S3FileStorageServiceTests()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["FileStorage:S3:Bucket"] = "private-attachments"
            })
            .Build();

        _service = new S3FileStorageService(
            _client.Object,
            configuration,
            NullLogger<S3FileStorageService>.Instance);
    }

    [Fact]
    public async Task SaveFileAsync_UsesGeneratedPrivateKeyAndOriginalNameMetadata()
    {
        PutObjectRequest? request = null;
        _client
            .Setup(client => client.PutObjectAsync(It.IsAny<PutObjectRequest>(), It.IsAny<CancellationToken>()))
            .Callback<PutObjectRequest, CancellationToken>((capturedRequest, _) => request = capturedRequest)
            .ReturnsAsync(new PutObjectResponse());

        var file = CreateFile("../../private.txt", "text/plain", [1, 2, 3]);

        var result = await _service.SaveFileAsync(file, "articles");

        Assert.NotNull(request);
        Assert.Equal("private-attachments", request!.BucketName);
        Assert.StartsWith("articles/", request.Key);
        Assert.EndsWith(".txt", request.Key);
        Assert.Equal(result.storedFileName, Path.GetFileName(request.Key));
        Assert.DoesNotContain("private.txt", request.Key);
        Assert.Equal("private.txt", request.Metadata["original-filename"]);
        Assert.Equal("text/plain", request.ContentType);
        Assert.Equal(3, result.sizeBytes);
    }

    [Fact]
    public async Task GetFileAsync_StreamsPrivateObjectAndReturnsMetadata()
    {
        var response = new GetObjectResponse
        {
            ResponseStream = new MemoryStream([4, 5, 6])
        };
        response.Headers.ContentType = "image/png";
        response.Metadata["x-amz-meta-original-filename"] = "board.png";
        _client
            .Setup(client => client.GetObjectAsync(It.IsAny<GetObjectRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(response);

        var result = await _service.GetFileAsync("generated.png", "articles");

        Assert.NotNull(result.stream);
        Assert.Equal("image/png", result.contentType);
        Assert.Equal("board.png", result.originalFileName);
        using var reader = new MemoryStream();
        await result.stream!.CopyToAsync(reader);
        Assert.Equal([4, 5, 6], reader.ToArray());
    }

    [Fact]
    public async Task DeleteFileAsync_DeletesTheGeneratedObjectKey()
    {
        DeleteObjectRequest? request = null;
        _client
            .Setup(client => client.DeleteObjectAsync(It.IsAny<DeleteObjectRequest>(), It.IsAny<CancellationToken>()))
            .Callback<DeleteObjectRequest, CancellationToken>((capturedRequest, _) => request = capturedRequest)
            .ReturnsAsync(new DeleteObjectResponse());

        var deleted = await _service.DeleteFileAsync("generated.pdf", "articles");

        Assert.True(deleted);
        Assert.Equal("private-attachments", request!.BucketName);
        Assert.Equal("articles/generated.pdf", request.Key);
    }

    [Fact]
    public async Task SaveFileAsync_RejectsUnsupportedExtensionBeforeCallingS3()
    {
        var file = CreateFile("malware.exe", "application/octet-stream", [1]);

        await Assert.ThrowsAsync<InvalidOperationException>(() => _service.SaveFileAsync(file, "articles"));
        _client.Verify(client => client.PutObjectAsync(It.IsAny<PutObjectRequest>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    private static FormFile CreateFile(string fileName, string contentType, byte[] content)
    {
        return new FormFile(new MemoryStream(content), 0, content.Length, "file", fileName)
        {
            Headers = new HeaderDictionary(),
            ContentType = contentType
        };
    }
}
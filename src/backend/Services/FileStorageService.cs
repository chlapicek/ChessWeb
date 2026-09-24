using Amazon.S3;
using Amazon.S3.Model;

namespace ChessWeb.Services;

public interface IFileStorageService
{
    Task<(string storedFileName, string contentType, long sizeBytes)> SaveFileAsync(IFormFile file, string subFolder);
    Task<(Stream? stream, string contentType, string originalFileName)> GetFileAsync(string storedFileName, string subFolder);
    Task<bool> DeleteFileAsync(string storedFileName, string subFolder);
}

public class LocalFileStorageService : IFileStorageService
{
    private readonly string _baseStoragePath;
    private readonly ILogger<LocalFileStorageService> _logger;

    public const long MaxFileSizeBytes = FileStorageRules.MaxFileSizeBytes;
    public static readonly string[] AllowedExtensions = FileStorageRules.AllowedExtensions;

    public LocalFileStorageService(
        IWebHostEnvironment env,
        ILogger<LocalFileStorageService> logger,
        IConfiguration? configuration = null)
    {
        _logger = logger;
        var configuredBasePath = configuration?["FileStorage:BasePath"];
        _baseStoragePath = string.IsNullOrWhiteSpace(configuredBasePath)
            ? Path.Combine(env.ContentRootPath, "App_Data", "Uploads")
            : configuredBasePath;
        if (!Directory.Exists(_baseStoragePath))
        {
            Directory.CreateDirectory(_baseStoragePath);
        }
    }

    public async Task<(string storedFileName, string contentType, long sizeBytes)> SaveFileAsync(IFormFile file, string subFolder)
    {
        var ext = FileStorageRules.Validate(file);
        var safeSubFolder = FileStorageRules.ValidateSubFolder(subFolder);

        var targetDir = Path.Combine(_baseStoragePath, safeSubFolder);
        if (!Directory.Exists(targetDir))
        {
            Directory.CreateDirectory(targetDir);
        }

        var storedFileName = $"{Guid.NewGuid()}{ext}";
        var filePath = Path.Combine(targetDir, storedFileName);
        var resolvedContentType = FileStorageRules.ResolveContentType(file.ContentType, ext);

        using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        return (storedFileName, resolvedContentType, file.Length);
    }

    public Task<(Stream? stream, string contentType, string originalFileName)> GetFileAsync(string storedFileName, string subFolder)
    {
        if (!TryResolveFilePath(storedFileName, subFolder, out var filePath))
        {
            return Task.FromResult<(Stream?, string, string)>((null, string.Empty, string.Empty));
        }

        if (!File.Exists(filePath))
        {
            return Task.FromResult<(Stream?, string, string)>((null, string.Empty, string.Empty));
        }

        var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read);
        var ext = Path.GetExtension(storedFileName).ToLowerInvariant();
        var contentType = FileStorageRules.ResolveContentType(null, ext);

        return Task.FromResult<(Stream?, string, string)>((stream, contentType, storedFileName));
    }

    public Task<bool> DeleteFileAsync(string storedFileName, string subFolder)
    {
        if (!TryResolveFilePath(storedFileName, subFolder, out var filePath))
        {
            return Task.FromResult(false);
        }

        if (File.Exists(filePath))
        {
            try
            {
                File.Delete(filePath);
                return Task.FromResult(true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting file {FileName}", storedFileName);
            }
        }
        return Task.FromResult(false);
    }

    private bool TryResolveFilePath(string storedFileName, string subFolder, out string filePath)
    {
        filePath = string.Empty;
        string safeSubFolder;
        try
        {
            safeSubFolder = FileStorageRules.ValidateSubFolder(subFolder);
        }
        catch (ArgumentException)
        {
            return false;
        }

        if (string.IsNullOrWhiteSpace(storedFileName) ||
            !string.Equals(Path.GetFileName(storedFileName), storedFileName, StringComparison.Ordinal))
        {
            return false;
        }

        var storageRoot = Path.GetFullPath(_baseStoragePath);
    var candidate = Path.GetFullPath(Path.Combine(storageRoot, safeSubFolder, storedFileName));
        var rootWithSeparator = storageRoot.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
            + Path.DirectorySeparatorChar;
        if (!candidate.StartsWith(rootWithSeparator, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        filePath = candidate;
        return true;
    }
}

public sealed class S3FileStorageService : IFileStorageService
{
    private readonly IAmazonS3 _client;
    private readonly string _bucket;
    private readonly ILogger<S3FileStorageService> _logger;

    public S3FileStorageService(IAmazonS3 client, IConfiguration configuration, ILogger<S3FileStorageService> logger)
    {
        _client = client;
        _bucket = configuration["FileStorage:S3:Bucket"]
            ?? throw new InvalidOperationException("FileStorage:S3:Bucket must be configured when S3 storage is enabled.");
        _logger = logger;
    }

    public async Task<(string storedFileName, string contentType, long sizeBytes)> SaveFileAsync(IFormFile file, string subFolder)
    {
        var extension = FileStorageRules.Validate(file);
        var storedFileName = $"{Guid.NewGuid():N}{extension}";
        var contentType = FileStorageRules.ResolveContentType(file.ContentType, extension);

        await using var stream = file.OpenReadStream();
        var request = new PutObjectRequest
        {
            BucketName = _bucket,
            Key = BuildKey(subFolder, storedFileName),
            InputStream = stream,
            ContentType = contentType
        };
        request.Metadata["original-filename"] = Path.GetFileName(file.FileName);
        await _client.PutObjectAsync(request);

        return (storedFileName, contentType, file.Length);
    }

    public async Task<(Stream? stream, string contentType, string originalFileName)> GetFileAsync(string storedFileName, string subFolder)
    {
        try
        {
            var response = await _client.GetObjectAsync(new GetObjectRequest
            {
                BucketName = _bucket,
                Key = BuildKey(subFolder, storedFileName)
            });

            var originalFileName = response.Metadata["x-amz-meta-original-filename"]
                ?? response.Metadata["original-filename"]
                ?? storedFileName;
            return (response.ResponseStream, response.Headers.ContentType ?? string.Empty, originalFileName);
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound || ex.ErrorCode == "NoSuchKey")
        {
            return (null, string.Empty, string.Empty);
        }
    }

    public async Task<bool> DeleteFileAsync(string storedFileName, string subFolder)
    {
        try
        {
            await _client.DeleteObjectAsync(new DeleteObjectRequest
            {
                BucketName = _bucket,
                Key = BuildKey(subFolder, storedFileName)
            });
            return true;
        }
        catch (AmazonS3Exception ex)
        {
            _logger.LogError(ex, "Error deleting object {StoredFileName}", storedFileName);
            return false;
        }
    }

    private static string BuildKey(string subFolder, string storedFileName) =>
        $"{FileStorageRules.ValidateSubFolder(subFolder)}/{FileStorageRules.ValidateStoredFileName(storedFileName)}";
}

internal static class FileStorageRules
{
    public const long MaxFileSizeBytes = 5 * 1024 * 1024;
    public static readonly string[] AllowedExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".pgn", ".txt"];

    public static string Validate(IFormFile file)
    {
        if (file == null || file.Length == 0)
        {
            throw new ArgumentException("Invalid file provided.");
        }

        if (file.Length > MaxFileSizeBytes)
        {
            throw new InvalidOperationException($"File size exceeds the maximum allowed limit of {MaxFileSizeBytes / (1024 * 1024)} MB.");
        }

        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedExtensions.Contains(extension))
        {
            throw new InvalidOperationException($"File type '{extension}' is not permitted. Allowed extensions: {string.Join(", ", AllowedExtensions)}");
        }

        return extension;
    }

    public static string ResolveContentType(string? contentType, string extension) =>
        !string.IsNullOrWhiteSpace(contentType) ? contentType : extension switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            ".pdf" => "application/pdf",
            ".pgn" => "application/x-chess-pgn",
            ".txt" => "text/plain",
            _ => "application/octet-stream"
        };

    public static string ValidateSubFolder(string subFolder)
    {
        if (string.IsNullOrWhiteSpace(subFolder) ||
            Path.IsPathRooted(subFolder) ||
            subFolder.Contains(Path.DirectorySeparatorChar) ||
            subFolder.Contains(Path.AltDirectorySeparatorChar) ||
            subFolder == "." ||
            subFolder == "..")
        {
            throw new ArgumentException("Storage subfolder must be a single relative path segment.", nameof(subFolder));
        }

        return subFolder;
    }

    public static string ValidateStoredFileName(string storedFileName)
    {
        if (string.IsNullOrWhiteSpace(storedFileName) ||
            !string.Equals(Path.GetFileName(storedFileName), storedFileName, StringComparison.Ordinal))
        {
            throw new ArgumentException("Stored filename must be a single filename segment.", nameof(storedFileName));
        }

        return storedFileName;
    }
}

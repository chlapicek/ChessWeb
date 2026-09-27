using ChessWeb.Services.Uploads;

namespace ChessWeb.Services;

public interface IFileStorageService
{
    /// <summary>Sanitizes, malware-scans and stores an upload. Throws <see cref="UploadRejectedException"/> or <see cref="UploadUnavailableException"/>.</summary>
    Task<(string storedFileName, string contentType, long sizeBytes)> SaveFileAsync(IFormFile file, string subFolder, CancellationToken cancellationToken = default);
    Task<(Stream? stream, string contentType, string originalFileName)> GetFileAsync(string storedFileName, string subFolder);
    Task<bool> DeleteFileAsync(string storedFileName, string subFolder);
}

public class LocalFileStorageService : IFileStorageService
{
    private readonly string _baseStoragePath;
    private readonly ILogger<LocalFileStorageService> _logger;
    private readonly IUploadSanitizer _sanitizer;
    private readonly IMalwareScanner _scanner;

    public const long MaxFileSizeBytes = UploadSanitizer.MaxFileSizeBytes;
    public static readonly string[] AllowedExtensions = UploadSanitizer.AllowedExtensions;

    public LocalFileStorageService(
        IWebHostEnvironment env,
        ILogger<LocalFileStorageService> logger,
        IUploadSanitizer sanitizer,
        IMalwareScanner scanner,
        IConfiguration? configuration = null)
    {
        _logger = logger;
        _sanitizer = sanitizer;
        _scanner = scanner;
        var configuredBasePath = configuration?["FileStorage:BasePath"];
        _baseStoragePath = string.IsNullOrWhiteSpace(configuredBasePath)
            ? Path.Combine(env.ContentRootPath, "App_Data", "Uploads")
            : configuredBasePath;
        if (!Directory.Exists(_baseStoragePath))
        {
            Directory.CreateDirectory(_baseStoragePath);
        }
    }

    public async Task<(string storedFileName, string contentType, long sizeBytes)> SaveFileAsync(IFormFile file, string subFolder, CancellationToken cancellationToken = default)
    {
        var safeSubFolder = FileStorageRules.ValidateSubFolder(subFolder);
        var upload = await _sanitizer.SanitizeAsync(file, cancellationToken);

        using (var scanStream = new MemoryStream(upload.Content, writable: false))
        {
            var scan = await _scanner.ScanAsync(scanStream, cancellationToken);
            if (!scan.IsClean)
            {
                _logger.LogWarning("[UPLOAD] Rejected {FileName}: malware signature {Signature}", file.FileName.ReplaceLineEndings(" "), scan.Signature);
                throw new UploadRejectedException("The file was rejected by the virus scanner.");
            }
        }

        var targetDir = Path.Combine(_baseStoragePath, safeSubFolder);
        if (!Directory.Exists(targetDir))
        {
            Directory.CreateDirectory(targetDir);
        }

        var storedFileName = $"{Guid.NewGuid()}{upload.Extension}";
        var filePath = Path.Combine(targetDir, storedFileName);
        await File.WriteAllBytesAsync(filePath, upload.Content, cancellationToken);

        return (storedFileName, upload.ContentType, upload.Content.LongLength);
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
        var contentType = UploadSanitizer.ContentTypeFor(ext);

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

internal static class FileStorageRules
{
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

}

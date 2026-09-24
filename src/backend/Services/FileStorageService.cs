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

}

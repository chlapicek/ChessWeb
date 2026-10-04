using ChessWeb.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ChessWeb.Services.Uploads;

/// <summary>Periodically rescans stored article attachments with the latest signatures and quarantines new detections.</summary>
public sealed class AttachmentRescanService : BackgroundService
{
    private const string AttachmentsFolder = "articles";
    private const int BatchSize = 50;
    private static readonly TimeSpan StartupDelay = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan RetryDelay = TimeSpan.FromMinutes(15);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AttachmentRescanService> _logger;
    private readonly TimeSpan _interval;

    public AttachmentRescanService(IServiceScopeFactory scopeFactory, ILogger<AttachmentRescanService> logger, IOptions<ClamAvOptions> options)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _interval = TimeSpan.FromHours(Math.Max(1, options.Value.RescanIntervalHours));
    }

    public sealed record RescanOutcome(int Scanned, int Quarantined, bool Completed);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(StartupDelay, stoppingToken);
            while (!stoppingToken.IsCancellationRequested)
            {
                var completed = false;
                try
                {
                    // Files scanned during the previous run (which started one interval ago) are due again.
                    var outcome = await RescanAsync(DateTime.UtcNow - _interval * 0.9, stoppingToken);
                    completed = outcome.Completed;
                }
                catch (Exception exception) when (exception is not OperationCanceledException)
                {
                    _logger.LogError(exception, "[RESCAN] Attachment rescan failed.");
                }
                await Task.Delay(completed ? _interval : RetryDelay, stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    /// <summary>Scans every non-quarantined attachment not scanned since <paramref name="scannedBefore"/>.</summary>
    public async Task<RescanOutcome> RescanAsync(DateTime scannedBefore, CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var storage = scope.ServiceProvider.GetRequiredService<IFileStorageService>();
        var scanner = scope.ServiceProvider.GetRequiredService<IMalwareScanner>();
        if (!scanner.IsEnabled) return new RescanOutcome(0, 0, true);

        var scanned = 0;
        var quarantined = 0;
        while (!cancellationToken.IsCancellationRequested)
        {
            var batch = await context.Attachments
                .Where(a => a.QuarantinedAt == null && (a.LastScannedAt == null || a.LastScannedAt < scannedBefore))
                .OrderBy(a => a.LastScannedAt)
                .Take(BatchSize)
                .ToListAsync(cancellationToken);
            if (batch.Count == 0) break;

            foreach (var attachment in batch)
            {
                var content = await ReadStoredFileAsync(storage, attachment.StoredFileName, attachment.Id, cancellationToken);
                if (content != null)
                {
                    MalwareScanResult result;
                    try
                    {
                        result = await scanner.ScanAsync(new MemoryStream(content, writable: false), cancellationToken);
                    }
                    catch (MalwareScannerUnavailableException exception)
                    {
                        _logger.LogError(exception, "[RESCAN] Malware scanner unavailable; retrying later.");
                        return new RescanOutcome(scanned, quarantined, false);
                    }

                    if (!result.IsClean)
                    {
                        attachment.QuarantinedAt = DateTime.UtcNow;
                        attachment.QuarantineReason = result.Signature?[..Math.Min(result.Signature.Length, 300)];
                        quarantined++;
                        var safeSignature = SanitizeForLog(result.Signature);
                        _logger.LogWarning("[RESCAN] Quarantined attachment {AttachmentId}: {Signature}", attachment.Id, safeSignature);
                    }
                }

                attachment.LastScannedAt = DateTime.UtcNow;
                scanned++;
                await context.SaveChangesAsync(cancellationToken);
            }
        }

        return new RescanOutcome(scanned, quarantined, true);
    }

    private static string? SanitizeForLog(string? value)
    {
        if (value == null) return null;

        var normalized = value.Replace("\r", " ").Replace("\n", " ");
        return new string(normalized.Where(c => !char.IsControl(c)).ToArray());
    }

    private async Task<byte[]?> ReadStoredFileAsync(IFileStorageService storage, string storedFileName, Guid attachmentId, CancellationToken cancellationToken)
    {
        try
        {
            var (stream, _, _) = await storage.GetFileAsync(storedFileName, AttachmentsFolder);
            if (stream == null) return null;
            await using (stream)
            {
                using var buffer = new MemoryStream();
                await stream.CopyToAsync(buffer, cancellationToken);
                return buffer.ToArray();
            }
        }
        catch (IOException exception)
        {
            _logger.LogWarning(exception, "[RESCAN] Could not read attachment {AttachmentId}; skipping.", attachmentId);
            return null;
        }
    }
}

using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using ChessWeb.Data;
using ChessWeb.DTOs;
using ChessWeb.Services.Uploads;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace ChessWeb.Tests.Integration;

public class UploadSecurityTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string MalwareMarker = "EICAR-STANDARD-ANTIVIRUS-TEST-FILE";
    private readonly WebApplicationFactory<Program> _factory;

    public UploadSecurityTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IMalwareScanner>();
            services.AddSingleton<IMalwareScanner>(new MarkerMalwareScanner());
        }));
    }

    /// <summary>Flags content containing the marker; switchable to simulate a clamd outage.</summary>
    private sealed class MarkerMalwareScanner : IMalwareScanner
    {
        public bool IsEnabled => true;

        public async Task<MalwareScanResult> ScanAsync(Stream content, CancellationToken cancellationToken = default)
        {
            using var reader = new StreamReader(content, Encoding.Latin1);
            var text = await reader.ReadToEndAsync(cancellationToken);
            if (text.Contains("SCANNER-OUTAGE")) throw new MalwareScannerUnavailableException("simulated outage");
            return text.Contains(MalwareMarker) ? new MalwareScanResult(false, "Eicar-Test-Signature") : MalwareScanResult.Clean;
        }
    }

    private async Task<HttpClient> RegisterAsync()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            $"upload-{Guid.NewGuid():N}@chessweb.local", "Player123!#", $"Upload Tester {Guid.NewGuid():N}", null, null, null));
        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.Token);
        return client;
    }

    private static Task<HttpResponseMessage> UploadAsync(HttpClient client, byte[] bytes, string fileName)
    {
        var form = new MultipartFormDataContent();
        form.Add(new ByteArrayContent(bytes), "file", fileName);
        return client.PostAsync("/api/articles/attachments", form);
    }

    [Fact]
    public async Task DisguisedHtml_IsRejected()
    {
        var client = await RegisterAsync();

        var response = await UploadAsync(client, "<html><script>alert(1)</script></html>"u8.ToArray(), "cute-cat.png");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task InfectedFile_IsRejectedByScanner()
    {
        var client = await RegisterAsync();

        var response = await UploadAsync(client, Encoding.ASCII.GetBytes($"notes {MalwareMarker}"), "notes.txt");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("virus scanner", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ScannerOutage_ReturnsServiceUnavailable()
    {
        var client = await RegisterAsync();

        var response = await UploadAsync(client, "SCANNER-OUTAGE"u8.ToArray(), "notes.txt");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.DoesNotContain("simulated outage", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task UploadEndpoint_IsRateLimitedPerUser()
    {
        var limitedFactory = _factory.WithWebHostBuilder(builder => builder.UseSetting("Uploads:RateLimitPerMinute", "2"));
        var client = limitedFactory.CreateClient();
        var register = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            $"limit-{Guid.NewGuid():N}@chessweb.local", "Player123!#", $"Limit Tester {Guid.NewGuid():N}", null, null, null));
        var auth = await register.Content.ReadFromJsonAsync<AuthResponse>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.Token);

        Assert.Equal(HttpStatusCode.Created, (await UploadAsync(client, "one"u8.ToArray(), "a.txt")).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await UploadAsync(client, "two"u8.ToArray(), "b.txt")).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await UploadAsync(client, "three"u8.ToArray(), "c.txt")).StatusCode);
    }

    [Fact]
    public async Task Rescan_QuarantinesNewlyDetectedFile_AndBlocksDownload()
    {
        var client = await RegisterAsync();
        var upload = await UploadAsync(client, "clean at upload time"u8.ToArray(), "notes.txt");
        Assert.Equal(HttpStatusCode.Created, upload.StatusCode);
        var attachment = await upload.Content.ReadFromJsonAsync<AttachmentDto>();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/articles/attachments/{attachment!.Id}")).StatusCode);

        // Simulates a signature published after the upload by rewriting the stored file with the marker.
        using (var scope = _factory.Services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var stored = await context.Attachments.SingleAsync(a => a.Id == attachment.Id);
            var environment = scope.ServiceProvider.GetRequiredService<IWebHostEnvironment>();
            var path = Path.Combine(environment.ContentRootPath, "App_Data", "Uploads", "articles", stored.StoredFileName);
            await File.WriteAllTextAsync(path, MalwareMarker);
        }

        var rescan = new AttachmentRescanService(
            _factory.Services.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<AttachmentRescanService>.Instance,
            Options.Create(new ClamAvOptions()));
        Assert.True((await rescan.RescanAsync(DateTime.UnixEpoch, CancellationToken.None)).Quarantined >= 1);

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/articles/attachments/{attachment.Id}")).StatusCode);
        using var verifyScope = _factory.Services.CreateScope();
        var quarantined = await verifyScope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Attachments.SingleAsync(a => a.Id == attachment.Id);
        Assert.NotNull(quarantined.QuarantinedAt);
        Assert.Equal("Eicar-Test-Signature", quarantined.QuarantineReason);

        var relink = await client.PostAsync("/api/articles", new MultipartFormDataContent
        {
            { new StringContent("Relink attempt"), "Title" },
            { new StringContent($$$"""{"type":"doc","content":[{"type":"attachmentFile","attrs":{"attachmentId":"{{{attachment.Id}}}"}}]}"""), "Content" },
            { new StringContent("1"), "ContentFormat" }
        });
        Assert.Equal(HttpStatusCode.BadRequest, relink.StatusCode);
    }

    [Fact]
    public async Task Rescan_SkipsMissingFiles_AndCompletes()
    {
        var client = await RegisterAsync();
        var upload = await UploadAsync(client, "soon deleted"u8.ToArray(), "gone.txt");
        var attachment = await upload.Content.ReadFromJsonAsync<AttachmentDto>();
        using (var scope = _factory.Services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var stored = await context.Attachments.SingleAsync(a => a.Id == attachment!.Id);
            var environment = scope.ServiceProvider.GetRequiredService<IWebHostEnvironment>();
            File.Delete(Path.Combine(environment.ContentRootPath, "App_Data", "Uploads", "articles", stored.StoredFileName));
        }

        var rescan = new AttachmentRescanService(
            _factory.Services.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<AttachmentRescanService>.Instance,
            Options.Create(new ClamAvOptions()));
        var outcome = await rescan.RescanAsync(DateTime.UnixEpoch, CancellationToken.None);

        Assert.True(outcome.Completed);
        using var verifyScope = _factory.Services.CreateScope();
        var row = await verifyScope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Attachments.SingleAsync(a => a.Id == attachment!.Id);
        Assert.NotNull(row.LastScannedAt);
        Assert.Null(row.QuarantinedAt);
    }
}

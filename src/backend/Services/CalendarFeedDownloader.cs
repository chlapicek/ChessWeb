using System.Net;
using System.Net.Sockets;

namespace ChessWeb.Services;

public interface ICalendarFeedAddressResolver
{
    Task<IReadOnlyList<IPAddress>> ResolvePublicAddressesAsync(string host, CancellationToken cancellationToken);
    ValueTask<Stream> ConnectAsync(SocketsHttpConnectionContext context, CancellationToken cancellationToken);
}

public interface ICalendarFeedDownloader
{
    Task<byte[]> DownloadAsync(string feedUrl, CancellationToken cancellationToken);
}

public sealed class CalendarFeedAddressResolver : ICalendarFeedAddressResolver
{
    private static readonly IPNetwork[] NonPublicIpv4Networks =
    [
        IPNetwork.Parse("0.0.0.0/8"),
        IPNetwork.Parse("10.0.0.0/8"),
        IPNetwork.Parse("100.64.0.0/10"),
        IPNetwork.Parse("127.0.0.0/8"),
        IPNetwork.Parse("169.254.0.0/16"),
        IPNetwork.Parse("172.16.0.0/12"),
        IPNetwork.Parse("192.0.0.0/24"),
        IPNetwork.Parse("192.0.2.0/24"),
        IPNetwork.Parse("192.88.99.0/24"),
        IPNetwork.Parse("192.168.0.0/16"),
        IPNetwork.Parse("198.18.0.0/15"),
        IPNetwork.Parse("198.51.100.0/24"),
        IPNetwork.Parse("203.0.113.0/24"),
        IPNetwork.Parse("224.0.0.0/4"),
        IPNetwork.Parse("240.0.0.0/4")
    ];

    private static readonly IPNetwork GlobalIpv6Network = IPNetwork.Parse("2000::/3");
    private static readonly IPNetwork[] NonPublicIpv6Networks =
    [
        IPNetwork.Parse("2001::/23"),
        IPNetwork.Parse("2001:db8::/32"),
        IPNetwork.Parse("2002::/16")
    ];

    public async Task<IReadOnlyList<IPAddress>> ResolvePublicAddressesAsync(string host, CancellationToken cancellationToken)
    {
        var addresses = IPAddress.TryParse(host, out var literalAddress)
            ? [literalAddress]
            : await Dns.GetHostAddressesAsync(host, cancellationToken);

        if (addresses.Length == 0 || addresses.Any(address => !IsPublicAddress(address)))
        {
            throw new HttpRequestException("Calendar feed host is not publicly routable.");
        }

        return addresses;
    }

    public async ValueTask<Stream> ConnectAsync(SocketsHttpConnectionContext context, CancellationToken cancellationToken)
    {
        var addresses = await ResolvePublicAddressesAsync(context.DnsEndPoint.Host, cancellationToken);
        Exception? lastException = null;

        foreach (var address in addresses)
        {
            var socket = new Socket(address.AddressFamily, SocketType.Stream, ProtocolType.Tcp);
            try
            {
                await socket.ConnectAsync(new IPEndPoint(address, context.DnsEndPoint.Port), cancellationToken);
                return new NetworkStream(socket, ownsSocket: true);
            }
            catch (SocketException exception)
            {
                socket.Dispose();
                if (cancellationToken.IsCancellationRequested)
                {
                    throw new OperationCanceledException(cancellationToken);
                }
                lastException = exception;
            }
            catch
            {
                socket.Dispose();
                throw;
            }
        }

        throw new HttpRequestException("Unable to connect to the calendar feed host.", lastException);
    }

    public static bool IsPublicAddress(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6)
        {
            address = address.MapToIPv4();
        }

        if (IPAddress.IsLoopback(address) || address.Equals(IPAddress.Any) || address.Equals(IPAddress.IPv6Any) ||
            address.Equals(IPAddress.Broadcast) || address.IsIPv6LinkLocal || address.IsIPv6SiteLocal ||
            address.IsIPv6Multicast || address.IsIPv6Teredo)
        {
            return false;
        }

        if (address.AddressFamily == AddressFamily.InterNetwork)
        {
            return !NonPublicIpv4Networks.Any(network => network.Contains(address));
        }

        return address.AddressFamily == AddressFamily.InterNetworkV6 &&
            GlobalIpv6Network.Contains(address) &&
            !NonPublicIpv6Networks.Any(network => network.Contains(address));
    }
}

public sealed class CalendarFeedDownloader : ICalendarFeedDownloader
{
    public const int MaxResponseBytes = 5 * 1024 * 1024;
    public const int MaxFeedItems = 5000;
    public const int MaxRedirects = 3;
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(15);

    private readonly HttpClient _httpClient;
    private readonly ICalendarFeedAddressResolver _addressResolver;
    private readonly bool _allowHttp;

    public CalendarFeedDownloader(
        HttpClient httpClient,
        ICalendarFeedAddressResolver addressResolver,
        IHostEnvironment environment)
    {
        _httpClient = httpClient;
        _addressResolver = addressResolver;
        _allowHttp = environment.IsDevelopment();
    }

    public async Task<byte[]> DownloadAsync(string feedUrl, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(feedUrl, UriKind.Absolute, out var currentUri))
        {
            throw new HttpRequestException("Calendar feed URL is invalid.");
        }

        try
        {
            return await DownloadWithinTimeoutAsync(currentUri, cancellationToken);
        }
        catch (OperationCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new HttpRequestException("Calendar feed request timed out.", exception);
        }
    }

    private async Task<byte[]> DownloadWithinTimeoutAsync(Uri currentUri, CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(RequestTimeout);

        for (var redirectCount = 0; ; redirectCount++)
        {
            await ValidateUriAsync(currentUri, timeout.Token);
            using var request = new HttpRequestMessage(HttpMethod.Get, currentUri);
            using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);

            if (IsRedirect(response.StatusCode))
            {
                if (redirectCount >= MaxRedirects || response.Headers.Location == null)
                {
                    throw new HttpRequestException("Calendar feed redirect limit exceeded or redirect location was missing.");
                }

                currentUri = response.Headers.Location.IsAbsoluteUri
                    ? response.Headers.Location
                    : new Uri(currentUri, response.Headers.Location);
                continue;
            }

            response.EnsureSuccessStatusCode();
            if (response.Content.Headers.ContentLength > MaxResponseBytes)
            {
                throw new HttpRequestException("Calendar feed response is too large.");
            }

            await using var responseStream = await response.Content.ReadAsStreamAsync(timeout.Token);
            using var content = new MemoryStream();
            var buffer = new byte[81920];
            while (true)
            {
                var bytesRead = await responseStream.ReadAsync(buffer, timeout.Token);
                if (bytesRead == 0)
                {
                    break;
                }
                if (content.Length + bytesRead > MaxResponseBytes)
                {
                    throw new HttpRequestException("Calendar feed response is too large.");
                }

                await content.WriteAsync(buffer.AsMemory(0, bytesRead), timeout.Token);
            }

            return content.ToArray();
        }
    }

    private async Task ValidateUriAsync(Uri uri, CancellationToken cancellationToken)
    {
        var secureScheme = string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase);
        var allowedDevelopmentScheme = _allowHttp && string.Equals(uri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase);
        if ((!secureScheme && !allowedDevelopmentScheme) ||
            !string.IsNullOrEmpty(uri.UserInfo) ||
            !string.IsNullOrEmpty(uri.Fragment) ||
            !uri.IsDefaultPort)
        {
            throw new HttpRequestException("Calendar feed URL must use HTTPS and a standard port.");
        }

        await _addressResolver.ResolvePublicAddressesAsync(uri.IdnHost, cancellationToken);
    }

    private static bool IsRedirect(HttpStatusCode statusCode) =>
        statusCode is HttpStatusCode.MovedPermanently or HttpStatusCode.Redirect or HttpStatusCode.RedirectMethod or
            HttpStatusCode.TemporaryRedirect or HttpStatusCode.PermanentRedirect;
}
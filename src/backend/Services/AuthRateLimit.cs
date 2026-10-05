using System.Net;

namespace ChessWeb.Services;

public static class AuthRateLimit
{
    public const string LoginPolicyName = "auth-login";
    public const string RegistrationPolicyName = "auth-registration";
    public const string LoginConfigurationKey = "AuthRateLimit:LoginPermitsPerMinute";
    public const string RegistrationConfigurationKey = "AuthRateLimit:RegistrationPermitsPerMinute";
    public const int DefaultLoginPermitsPerMinute = 5;
    public const int DefaultRegistrationPermitsPerMinute = 3;

    public static int GetPermitLimit(IConfiguration configuration, string key, int defaultValue)
    {
        var limit = configuration.GetValue<int?>(key) ?? defaultValue;
        if (limit < 1)
        {
            throw new InvalidOperationException($"{key} must be greater than zero.");
        }

        return limit;
    }

    public static string GetPartitionKey(HttpContext context)
    {
        var address = context.Connection.RemoteIpAddress;
        if (address == null)
        {
            return "unknown";
        }

        if (address.IsIPv4MappedToIPv6)
        {
            address = address.MapToIPv4();
        }
        if (address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6)
        {
            var bytes = address.GetAddressBytes();
            Array.Clear(bytes, 8, bytes.Length - 8);
            return $"{new IPAddress(bytes)}/64";
        }

        return address.ToString();
    }
}
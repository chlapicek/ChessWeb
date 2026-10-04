using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using ChessWeb.Data;
using ChessWeb.Domain.Entities;
using ChessWeb.Domain.Enums;
using ChessWeb.Middleware;
using ChessWeb.Services;
using ChessWeb.Services.Uploads;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Serilog;
using Serilog.Core;
using Serilog.Events;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(options => options.AddServerHeader = false);

// Serilog: minimum level is runtime-adjustable via a shared LoggingLevelSwitch (SuperAdmin-controlled, see LoggingController).
var levelSwitch = new LoggingLevelSwitch(ParseLogEventLevel(builder.Configuration["Logging:LogLevel:Default"]));
builder.Services.AddSingleton(levelSwitch);

var logsDir = Path.Combine(AppContext.BaseDirectory, "App_Data", "Logs");
if (!Directory.Exists(logsDir))
{
    Directory.CreateDirectory(logsDir);
}
var retainedFileCountLimit = builder.Configuration.GetValue<int?>("Logging:RetainedFileCountLimit") ?? 14;

Log.Logger = new LoggerConfiguration()
    .MinimumLevel.ControlledBy(levelSwitch)
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .WriteTo.File(
        Path.Combine(logsDir, "log-.txt"),
        rollingInterval: RollingInterval.Day,
        retainedFileCountLimit: retainedFileCountLimit)
    .CreateLogger();

builder.Host.UseSerilog();

// 1. Database Configuration
var sqlServerConn = builder.Configuration.GetConnectionString("DefaultConnection");
var configuredUseSqlite = builder.Configuration.GetValue<bool?>("UseSqlite");
var useSqlite = configuredUseSqlite
    ?? string.IsNullOrWhiteSpace(sqlServerConn);
if (!useSqlite && string.IsNullOrWhiteSpace(sqlServerConn))
{
    throw new InvalidOperationException("UseSqlite is disabled but no SQL Server connection string was configured.");
}

builder.Services.AddDbContext<ApplicationDbContext>(options =>
{
    if (useSqlite || string.IsNullOrWhiteSpace(sqlServerConn))
    {
        var appDataDir = Path.Combine(AppContext.BaseDirectory, "App_Data");
        if (!Directory.Exists(appDataDir))
        {
            Directory.CreateDirectory(appDataDir);
        }
        var dbPath = Path.Combine(appDataDir, "chessweb.db");
        options.UseSqlite($"Data Source={dbPath}");
    }
    else
    {
        options.UseSqlServer(sqlServerConn);
    }
});

// 2. Identity Configuration
builder.Services.AddIdentity<ApplicationUser, ApplicationRole>(options =>
{
    options.Password.RequireDigit = false;
    options.Password.RequiredLength = 6;
    options.Password.RequireNonAlphanumeric = false;
    options.Password.RequireUppercase = false;
    options.Password.RequireLowercase = false;
    options.User.RequireUniqueEmail = true;
})
.AddEntityFrameworkStores<ApplicationDbContext>()
.AddDefaultTokenProviders();

// 3. JWT Authentication & Authorization
var jwtKey = builder.Configuration["Jwt:Key"];
if (string.IsNullOrWhiteSpace(jwtKey))
{
    throw new InvalidOperationException("Jwt:Key configuration is required.");
}
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "ChessWebAPI";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "ChessWebClient";

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtIssuer,
        ValidAudience = jwtAudience,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
    };
});

builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.Cookie.Name = "ChessWeb.Antiforgery";
    options.Cookie.HttpOnly = true;
    options.Cookie.Path = "/";
    options.Cookie.SameSite = builder.Environment.IsDevelopment() ? SameSiteMode.Lax : SameSiteMode.None;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
        ? CookieSecurePolicy.SameAsRequest
        : CookieSecurePolicy.Always;
});

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("RequireAdmin", policy => policy.RequireRole(Roles.Admin));
    options.AddPolicy("RequireRegistered", policy => policy.RequireAuthenticatedUser());
});

// 4. Register Services
builder.Services.AddScoped<IJwtService, JwtService>();
var fileStorageProvider = builder.Configuration["FileStorage:Provider"]?.Trim();
if (!string.IsNullOrWhiteSpace(fileStorageProvider) &&
    !string.Equals(fileStorageProvider, "Local", StringComparison.OrdinalIgnoreCase))
{
    throw new InvalidOperationException($"Unsupported file storage provider '{fileStorageProvider}'. Only Local storage is available.");
}
builder.Services.AddScoped<IFileStorageService, LocalFileStorageService>();
builder.Services.AddSingleton<IUploadSanitizer, UploadSanitizer>();
builder.Services.Configure<ClamAvOptions>(builder.Configuration.GetSection(ClamAvOptions.SectionName));
if (builder.Configuration.GetValue<bool>($"{ClamAvOptions.SectionName}:Enabled"))
{
    builder.Services.AddSingleton<IMalwareScanner, ClamAvMalwareScanner>();
    builder.Services.AddHostedService<AttachmentRescanService>();
}
else
{
    builder.Services.AddSingleton<IMalwareScanner, DisabledMalwareScanner>();
}
builder.Services.AddHttpClient<ICalendarSyncService, CalendarSyncService>();
builder.Services.AddScoped<ICalendarSyncService, CalendarSyncService>();
builder.Services.AddScoped<ITeamService, TeamService>();
builder.Services.AddScoped<NotificationService>();
builder.Services.AddSingleton(TimeProvider.System);

var uploadPermitsPerMinute = builder.Configuration.GetValue(UploadRateLimit.ConfigurationKey, UploadRateLimit.DefaultPermitsPerMinute);
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(UploadRateLimit.PolicyName, context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = uploadPermitsPerMinute, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

// 5. CORS (JWT auth remains explicit; antiforgery cookies are allowed only for configured frontend origins).
var trustedOrigins = new TrustedOrigins(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? []);
builder.Services.AddSingleton(trustedOrigins);
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(trustedOrigins.Origins.ToArray())
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

var app = builder.Build();

// Security headers first so they also cover error responses; then exception handling & request logging.
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseMiddleware<RequestLoggingMiddleware>();

// Seed Database
using (var scope = app.Services.CreateScope())
{
    await DbInitializer.SeedAsync(scope.ServiceProvider);

    // Apply the persisted logging level so it survives an application restart.
    var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    var persistedSettings = await dbContext.LoggingSettings.AsNoTracking().FirstOrDefaultAsync();
    if (persistedSettings != null && Enum.TryParse<LogEventLevel>(persistedSettings.MinimumLevel, ignoreCase: true, out var persistedLevel))
    {
        levelSwitch.MinimumLevel = persistedLevel;
    }
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}
else if (!app.Services.GetRequiredService<IMalwareScanner>().IsEnabled)
{
    app.Logger.LogWarning("Malware scanning is disabled (ClamAv:Enabled=false); uploads are accepted without an antivirus check.");
}

app.UseCors("AllowFrontend");
app.UseMiddleware<CsrfProtectionMiddleware>();

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapGet("/api/csrf/token", (HttpContext context, IAntiforgery antiforgery) =>
{
    context.Response.Headers.CacheControl = "no-store";
    var tokens = antiforgery.GetAndStoreTokens(context);
    return Results.Ok(new { requestToken = tokens.RequestToken });
});

app.MapControllers();

try
{
    app.Run();
}
finally
{
    Log.CloseAndFlush();
}

static LogEventLevel ParseLogEventLevel(string? configuredLevel) =>
    configuredLevel?.Trim().ToLowerInvariant() switch
    {
        "verbose" => LogEventLevel.Verbose,
        "trace" => LogEventLevel.Verbose,
        "debug" => LogEventLevel.Debug,
        "warning" => LogEventLevel.Warning,
        "error" => LogEventLevel.Error,
        "critical" => LogEventLevel.Fatal,
        "fatal" => LogEventLevel.Fatal,
        "none" => LogEventLevel.Fatal,
        _ => LogEventLevel.Information
    };

public partial class Program { }

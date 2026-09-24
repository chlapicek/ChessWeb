using System.Text;
using ChessWeb.Data;
using ChessWeb.Domain.Entities;
using ChessWeb.Domain.Enums;
using ChessWeb.Middleware;
using ChessWeb.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Serilog;
using Serilog.Core;
using Serilog.Events;

var builder = WebApplication.CreateBuilder(args);

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
builder.Services.AddHttpClient<ICalendarSyncService, CalendarSyncService>();
builder.Services.AddScoped<ICalendarSyncService, CalendarSyncService>();
builder.Services.AddScoped<ITeamService, TeamService>();
builder.Services.AddSingleton(TimeProvider.System);

// 5. CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins("http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5173", "http://127.0.0.1:3000")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

var app = builder.Build();

// Global Exception & Request Logging Middleware
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

app.UseCors("AllowFrontend");

app.UseAuthentication();
app.UseAuthorization();

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

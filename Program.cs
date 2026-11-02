using System.DirectoryServices;
using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;
using ADApi.Hubs;
using ADApi.Services;
using ADApi.Controllers;
using ADApi.Models.Security;
using ADApi.Services.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.AspNetCore.Routing.Constraints;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
var authOptions = builder.Configuration.GetSection(AuthOptions.SectionName).Get<AuthOptions>() ?? new AuthOptions();
var databasePath = authOptions.ResolveDatabasePath();
Directory.CreateDirectory(Path.GetDirectoryName(databasePath)!);

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSignalR();
builder.Services.AddDbContext<AuthDbContext>(options =>
    options.UseSqlite($"Data Source={databasePath}"));
builder.Services.Configure<AuthOptions>(builder.Configuration.GetSection(AuthOptions.SectionName));
builder.Services.AddIdentity<ApplicationUser, ApplicationRole>(options =>
    {
        options.User.RequireUniqueEmail = false;
        options.Password.RequiredLength = 8;
        options.Password.RequireDigit = true;
        options.Password.RequireLowercase = true;
        options.Password.RequireUppercase = true;
        options.Password.RequireNonAlphanumeric = true;
        options.Lockout.AllowedForNewUsers = true;
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
        options.SignIn.RequireConfirmedAccount = false;
    })
    .AddEntityFrameworkStores<AuthDbContext>()
    .AddDefaultTokenProviders();
builder.Services.AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultForbidScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(authOptions.GetSigningKey()),
            ValidateIssuer = true,
            ValidIssuer = authOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = authOptions.Audience,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            RoleClaimType = "role",
            NameClaimType = JwtRegisteredClaimNames.UniqueName
        };
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var requestPath = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken)
                    && requestPath.StartsWithSegments("/hubs/network-dashboard"))
                {
                    context.Token = accessToken;
                }
                return Task.CompletedTask;
            },
            OnTokenValidated = async context =>
            {
                var userId = context.Principal?.FindFirstValue("sub");
                var sessionId = context.Principal?.FindFirstValue("sid");
                if (string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(sessionId))
                {
                    context.Fail("Invalid session.");
                    return;
                }

                var requestServices = context.HttpContext.RequestServices;
                var db = requestServices.GetRequiredService<AuthDbContext>();
                var session = await db.AuthSessions.AsNoTracking()
                    .SingleOrDefaultAsync(item => item.Id == sessionId, context.HttpContext.RequestAborted);
                var userManager = requestServices.GetRequiredService<UserManager<ApplicationUser>>();
                var user = await userManager.FindByIdAsync(userId);
                if (session is null
                    || session.UserId != userId
                    || session.RevokedAtUtc is not null
                    || session.OriginalExpiresAtUtc <= DateTimeOffset.UtcNow
                    || user is not { IsActive: true })
                {
                    context.Fail("Invalid session.");
                }
            }
        };
    });
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});
builder.Services.AddSingleton<IAuthorizationPolicyProvider, ComponentPermissionPolicyProvider>();
builder.Services.AddScoped<IAuthorizationHandler, ComponentPermissionHandler>();
builder.Services.AddScoped<AuthTokenService>();
builder.Services.AddScoped<IAuthSessionService, AuthSessionService>();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("auth", context =>
    {
        var client = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(client, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 10,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true
        });
    });
});
builder.WebHost.UseUrls("http://0.0.0.0:5001");

// Configure Kestrel to allow large file uploads (5GB for videos)
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 5L * 1024 * 1024 * 1024; // 5 GB
});

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 5L * 1024 * 1024 * 1024; // 5 GB
});

// Register HttpClient for making HTTP requests
builder.Services.AddHttpClient();
builder.Services.AddSingleton<InventoryCacheService>();
builder.Services.AddHostedService(provider => provider.GetRequiredService<InventoryCacheService>());

// Register Active Directory service
builder.Services.AddScoped<IActiveDirectoryService, ActiveDirectoryService>();
builder.Services.Configure<ComputerOuMoverOptions>(
    builder.Configuration.GetSection(ComputerOuMoverOptions.SectionName));
builder.Services.AddScoped<IComputerOuMoverService, ComputerOuMoverService>();

// Register Kiosk/Digital Signage service
builder.Services.AddSingleton<IKioskService, KioskService>();
builder.Services.AddSingleton<NetworkMonitoringService>();
builder.Services.AddHostedService(provider => provider.GetRequiredService<NetworkMonitoringService>());
builder.Services.AddSingleton<WakeOnLanService>();

// Register SMB filesystem service
builder.Services.AddScoped<ISmbService, SmbService>();

// Register routing constraints explicitly for attribute-based routes
builder.Services.Configure<RouteOptions>(options =>
{
    options.ConstraintMap.TryAdd("regex", typeof(RegexRouteConstraint));
});

// Configure CORS for Angular app on port 4200 and same-host HTTPS origins
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAngularApp", policy =>
    {
        policy.WithOrigins(
            "http://localhost:4200",
            "https://localhost:4200",
            "http://127.0.0.1:4200",
            "https://127.0.0.1:4200",
            "http://10.140.5.32:4200",
            "https://10.140.5.32:4200",
            "http://10.140.5.254:4200",
            "https://10.140.5.254:4200",
            "http://10.140.5.27:4200",
            "https://10.140.5.27:4200"
        )
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

// Serve static files from wwwroot (for displayboard media)
app.UseStaticFiles();

// Enable CORS
app.UseCors("AllowAngularApp");

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.UseDefaultFiles(); // Serve index.html by default
app.UseStaticFiles(); // Serve static files

app.MapHub<NetworkDashboardHub>("/hubs/network-dashboard")
    .RequireAuthorization("Component:NetworkDashboard");
app.MapControllers();

// fallback for angular routing
app.MapFallbackToFile("index.html");

var bootstrapIndex = Array.IndexOf(args, "--bootstrap-admin");
if (bootstrapIndex >= 0)
{
    var username = bootstrapIndex + 1 < args.Length && !args[bootstrapIndex + 1].StartsWith("--", StringComparison.Ordinal)
        ? args[bootstrapIndex + 1]
        : "admin";
    await AuthBootstrapper.CreateInitialAdminAsync(app.Services, username);
    return;
}

if (args.Contains("--migrate-auth", StringComparer.Ordinal))
{
    await AuthBootstrapper.InitializeDatabaseAsync(app.Services);
    Console.WriteLine($"Authentication database is ready at {databasePath}.");
    return;
}

app.Run();

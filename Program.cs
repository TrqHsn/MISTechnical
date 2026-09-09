using System.DirectoryServices;
using ADApi.Services;
using ADApi.Controllers;
using Microsoft.AspNetCore.Routing.Constraints;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
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
builder.Services.AddHostedService<InventoryCacheService>();

// Register Active Directory service
builder.Services.AddScoped<IActiveDirectoryService, ActiveDirectoryService>();

// Register Kiosk/Digital Signage service
builder.Services.AddSingleton<IKioskService, KioskService>();
builder.Services.AddSingleton<NetworkMonitoringService>();
builder.Services.AddHostedService(provider => provider.GetRequiredService<NetworkMonitoringService>());
builder.Services.AddSingleton<WakeOnLanService>();

// Register SMB filesystem service
builder.Services.AddScoped<ISmbService, SmbService>();

// Register personal dashboard service
builder.Services.AddScoped<IPersonalDashboardService, PersonalDashboardService>();

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
            "http://10.140.5.32:4200",
            "https://10.140.5.32:4200",
            "http://10.140.5.32",
            "https://10.140.5.32",
            "http://10.140.5.216:4200",
            "https://10.140.5.216:4200",
            "http://10.140.5.216",
            "https://10.140.5.216",
            "http://10.140.5.254:4200",
            "https://10.140.5.254:4200"
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

app.UseAuthorization();

app.UseDefaultFiles(); // Serve index.html by default
app.UseStaticFiles(); // Serve static files

app.MapControllers();

// fallback for angular routing
app.MapFallbackToFile("index.html");

app.Run();



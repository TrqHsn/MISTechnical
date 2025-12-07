using System.DirectoryServices;
using ADApi.Services;
using ADApi.Controllers;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.WebHost.UseUrls("http://localhost:5001");

// Register Active Directory service
builder.Services.AddScoped<IActiveDirectoryService, ActiveDirectoryService>();

// Configure CORS for Angular app on port 4200
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAngularApp", policy =>
    {
        policy.WithOrigins("http://localhost:4200","http://10.140.9.10:4200")
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

// Enable CORS
app.UseCors("AllowAngularApp");

app.UseAuthorization();

app.MapControllers();

app.Run();



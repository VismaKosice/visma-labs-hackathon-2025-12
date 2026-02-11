using PensionCalculationEngine.JsonConverters;
using PensionCalculationEngine.Services;
using PensionCalculationEngine.Services.Mutations;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
        options.JsonSerializerOptions.Converters.Add(new DateOnlyJsonConverter());
        options.JsonSerializerOptions.Converters.Add(new NullableDateOnlyJsonConverter());
        // Don't use camelCase - API uses snake_case, handled by JsonPropertyName attributes
    });

// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

// Register HTTP client for scheme registry
builder.Services.AddHttpClient<SchemeRegistryClient>();

// Register mutation handlers
builder.Services.AddSingleton<IMutationHandler, CreateDossierHandler>();
builder.Services.AddSingleton<IMutationHandler, AddPolicyHandler>();
builder.Services.AddSingleton<IMutationHandler, ApplyIndexationHandler>();
builder.Services.AddSingleton<IMutationHandler>(sp => 
    new CalculateRetirementBenefitHandler(sp.GetRequiredService<SchemeRegistryClient>()));
builder.Services.AddSingleton<IMutationHandler>(sp => 
    new ProjectFutureBenefitsHandler(sp.GetRequiredService<SchemeRegistryClient>()));

// Register mutation handler registry (depends on all handlers)
builder.Services.AddSingleton<MutationHandlerRegistry>(sp =>
{
    var handlers = sp.GetServices<IMutationHandler>();
    return new MutationHandlerRegistry(handlers);
});

// Register calculation engine (depends on mutation handler registry)
builder.Services.AddSingleton<CalculationEngine>();

// Configure port from environment variable or default to 8080
var port = Environment.GetEnvironmentVariable("PORT") ?? "8080";
builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseAuthorization();

app.MapControllers();

app.Run();

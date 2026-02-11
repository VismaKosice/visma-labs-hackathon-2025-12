using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace PensionCalculationEngine.Services;

public class SchemeRegistryClient
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<SchemeRegistryClient> _logger;
    private readonly ConcurrentDictionary<string, decimal> _cache = new();
    private readonly string? _registryUrl;

    public SchemeRegistryClient(HttpClient httpClient, ILogger<SchemeRegistryClient> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
        _registryUrl = Environment.GetEnvironmentVariable("SCHEME_REGISTRY_URL");
        
        // Configure timeout
        _httpClient.Timeout = TimeSpan.FromSeconds(2);
    }

    public bool IsEnabled => !string.IsNullOrEmpty(_registryUrl);

    public async Task<decimal> GetAccrualRateAsync(string schemeId)
    {
        if (!IsEnabled)
        {
            return 0.02m; // Default accrual rate
        }

        // Check cache first
        if (_cache.TryGetValue(schemeId, out var cachedRate))
        {
            return cachedRate;
        }

        try
        {
            var url = $"{_registryUrl}/schemes/{Uri.EscapeDataString(schemeId)}";
            var response = await _httpClient.GetAsync(url);
            
            if (response.IsSuccessStatusCode)
            {
                var content = await response.Content.ReadAsStringAsync();
                var schemeData = JsonSerializer.Deserialize<SchemeData>(content);
                
                if (schemeData != null && schemeData.AccrualRate.HasValue)
                {
                    var rate = schemeData.AccrualRate.Value;
                    _cache.TryAdd(schemeId, rate);
                    return rate;
                }
            }
        }
        catch (TaskCanceledException)
        {
            _logger.LogWarning("Scheme registry request timed out for scheme {SchemeId}, using default rate", schemeId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch accrual rate for scheme {SchemeId}, using default rate", schemeId);
        }

        // Fallback to default rate
        return 0.02m;
    }

    public async Task<Dictionary<string, decimal>> GetAccrualRatesAsync(IEnumerable<string> schemeIds)
    {
        if (!IsEnabled)
        {
            return schemeIds.ToDictionary(id => id, _ => 0.02m);
        }

        var uniqueSchemeIds = schemeIds.Distinct().ToList();
        var tasks = uniqueSchemeIds.Select(id => GetAccrualRateAsync(id).ContinueWith(t => new { Id = id, Rate = t.Result }));
        var results = await Task.WhenAll(tasks);
        
        return results.ToDictionary(r => r.Id, r => r.Rate);
    }

    private class SchemeData
    {
        [JsonPropertyName("scheme_id")]
        public string? SchemeId { get; set; }
        
        [JsonPropertyName("accrual_rate")]
        public decimal? AccrualRate { get; set; }
    }
}

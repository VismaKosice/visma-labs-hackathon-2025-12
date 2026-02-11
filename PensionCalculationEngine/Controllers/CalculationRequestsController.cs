using Microsoft.AspNetCore.Mvc;
using PensionCalculationEngine.Models;
using PensionCalculationEngine.Services;
using System.Text.Json;

namespace PensionCalculationEngine.Controllers;

[ApiController]
[Route("calculation-requests")]
public class CalculationRequestsController : ControllerBase
{
    private readonly CalculationEngine _calculationEngine;
    private readonly ILogger<CalculationRequestsController> _logger;

    public CalculationRequestsController(CalculationEngine calculationEngine, ILogger<CalculationRequestsController> logger)
    {
        _calculationEngine = calculationEngine;
        _logger = logger;
    }

    [HttpPost]
    public async Task<IActionResult> Post([FromBody] CalculationRequest request)
    {
        try
        {
            if (request == null || request.CalculationInstructions?.Mutations == null || !request.CalculationInstructions.Mutations.Any())
            {
                return BadRequest(new { status = 400, message = "Invalid request: mutations are required" });
            }

            var response = await _calculationEngine.ProcessRequestAsync(request);
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing calculation request");
            return StatusCode(500, new { status = 500, message = "Internal server error" });
        }
    }
}

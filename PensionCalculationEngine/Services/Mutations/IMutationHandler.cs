using PensionCalculationEngine.Models;

namespace PensionCalculationEngine.Services.Mutations;

/// <summary>
/// Common interface for all mutation handlers.
/// Each mutation type implements this interface to provide validation and application logic.
/// </summary>
public interface IMutationHandler
{
    /// <summary>
    /// The name of the mutation this handler processes (e.g., "create_dossier", "add_policy").
    /// </summary>
    string MutationName { get; }
    
    /// <summary>
    /// Validates and applies the mutation to the current situation.
    /// </summary>
    /// <param name="mutation">The mutation to process</param>
    /// <param name="currentSituation">The current situation state</param>
    /// <param name="messages">List to add validation/error messages to</param>
    /// <returns>
    /// A tuple indicating whether there was a critical error and the updated situation.
    /// If HasCriticalError is true, the mutation processing should halt.
    /// </returns>
    Task<(bool HasCriticalError, SimplifiedSituation UpdatedSituation)> ValidateAndApplyAsync(
        CalculationMutation mutation,
        SimplifiedSituation currentSituation,
        List<CalculationMessage> messages);
}

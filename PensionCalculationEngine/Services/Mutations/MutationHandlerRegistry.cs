namespace PensionCalculationEngine.Services.Mutations;

/// <summary>
/// Registry for mutation handlers. Maps mutation names to their handler implementations.
/// </summary>
public class MutationHandlerRegistry
{
    private readonly Dictionary<string, IMutationHandler> _handlers;
    
    public MutationHandlerRegistry(IEnumerable<IMutationHandler> handlers)
    {
        _handlers = handlers.ToDictionary(h => h.MutationName, h => h);
    }
    
    /// <summary>
    /// Gets the handler for the specified mutation name.
    /// </summary>
    /// <param name="mutationName">The name of the mutation (e.g., "create_dossier")</param>
    /// <returns>The mutation handler, or null if not found</returns>
    public IMutationHandler? GetHandler(string mutationName)
    {
        return _handlers.TryGetValue(mutationName, out var handler) ? handler : null;
    }
    
    /// <summary>
    /// Checks if a handler exists for the specified mutation name.
    /// </summary>
    public bool HasHandler(string mutationName)
    {
        return _handlers.ContainsKey(mutationName);
    }
}

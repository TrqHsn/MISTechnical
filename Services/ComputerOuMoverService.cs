using System.DirectoryServices;
using System.Net;
using System.Runtime.Versioning;
using System.Text;
using ADApi.Models;
using Microsoft.Extensions.Options;

namespace ADApi.Services;

[SupportedOSPlatform("windows")]
public sealed class ComputerOuMoverService(IOptions<ComputerOuMoverOptions> options) : IComputerOuMoverService
{
    private static readonly SemaphoreSlim MoveGate = new(1, 1);
    private readonly ComputerOuMoverOptions _options = options.Value;

    public Task<IReadOnlyList<UnassignedComputerResponse>> GetUnassignedComputersAsync(
        CancellationToken cancellationToken)
    {
        return Task.Run<IReadOnlyList<UnassignedComputerResponse>>(() =>
        {
            var namingContext = GetDefaultNamingContext();
            var sourceDn = ResolveSourceContainer(namingContext);
            var destinations = ResolveDestinations(namingContext);
            using var source = new DirectoryEntry($"LDAP://{sourceDn}");
            using var searcher = new DirectorySearcher(source)
            {
                Filter = "(&(objectClass=computer)(objectCategory=computer))",
                SearchScope = SearchScope.OneLevel
            };
            searcher.PropertiesToLoad.AddRange(["name", "objectGUID"]);

            using var results = searcher.FindAll();
            var computers = new List<UnassignedComputerResponse>(results.Count);
            foreach (SearchResult result in results)
            {
                var name = GetStringProperty(result, "name");
                if (string.IsNullOrWhiteSpace(name))
                    throw new InvalidOperationException("An Active Directory computer object has no name attribute.");

                var guidValue = result.Properties["objectGUID"].Count > 0
                    ? result.Properties["objectGUID"][0]
                    : null;
                if (guidValue is not byte[] guidBytes || guidBytes.Length != 16)
                    throw new InvalidOperationException($"Computer '{name}' did not return a valid object GUID.");

                var destination = GetDestination(name, destinations);
                computers.Add(new UnassignedComputerResponse(
                    new Guid(guidBytes),
                    name,
                    destination?.Name,
                    destination?.Path,
                    destination?.DistinguishedName));
            }

            return computers.OrderBy(computer => computer.Name, StringComparer.OrdinalIgnoreCase).ToArray();
        }, cancellationToken);
    }

    public async Task<ComputerMoveResponse> MoveComputerAsync(Guid objectGuid, CancellationToken cancellationToken)
    {
        await MoveGate.WaitAsync(cancellationToken);
        try
        {
            return await Task.Run(() => MoveComputer(objectGuid), cancellationToken);
        }
        finally
        {
            MoveGate.Release();
        }
    }

    private ComputerMoveResponse MoveComputer(Guid objectGuid)
    {
        var namingContext = GetDefaultNamingContext();
        var sourceDn = ResolveSourceContainer(namingContext);
        using var domainRoot = new DirectoryEntry($"LDAP://{namingContext}");
        using var searcher = new DirectorySearcher(domainRoot)
        {
            Filter = $"(&(objectClass=computer)(objectGUID={EscapeLdapBinary(objectGuid.ToByteArray())}))",
            SearchScope = SearchScope.Subtree,
            SizeLimit = 2
        };
        searcher.PropertiesToLoad.AddRange(["name", "objectGUID"]);

        using var results = searcher.FindAll();
        if (results.Count == 0)
            throw new ComputerOuMoverException(HttpStatusCode.NotFound, "The computer object was not found in Active Directory.");
        if (results.Count != 1)
            throw new InvalidOperationException("The computer GUID returned more than one Active Directory object.");

        var result = results[0];
        var name = GetStringProperty(result, "name");
        if (string.IsNullOrWhiteSpace(name))
            throw new InvalidOperationException("The computer object has no name attribute.");

        var destinationName = GetDestinationName(name);
        if (destinationName is null)
            throw new ComputerOuMoverException(
                HttpStatusCode.BadRequest,
                $"Computer '{name}' has an unsupported prefix. Only DBO- and SDL-prefixed computers can be moved.");

        using var computerEntry = result.GetDirectoryEntry();
        using var parent = computerEntry.Parent;
        var parentDn = parent?.Properties["distinguishedName"].Value?.ToString();
        if (!string.Equals(parentDn, sourceDn, StringComparison.OrdinalIgnoreCase))
            throw new ComputerOuMoverException(
                HttpStatusCode.Conflict,
                $"Computer '{name}' is no longer directly inside the default Computers container.");

        var destinationPath = destinationName == "DBO"
            ? _options.DboDestinationPath
            : _options.SdlDestinationPath;
        var destination = ResolveDestination(namingContext, destinationPath, destinationName);
        using var destinationEntry = new DirectoryEntry($"LDAP://{destination.DistinguishedName}");
        computerEntry.MoveTo(destinationEntry);

        return new ComputerMoveResponse(
            name,
            destination.Name,
            destination.Path,
            destination.DistinguishedName,
            $"Computer '{name}' was moved to {destination.Path}.");
    }

    private string GetDefaultNamingContext()
    {
        if (string.IsNullOrWhiteSpace(_options.DomainDnsName) ||
            _options.DomainDnsName.Contains('/', StringComparison.Ordinal) ||
            _options.DomainDnsName.Contains('\\', StringComparison.Ordinal))
        {
            throw new InvalidOperationException("ComputerOuMover:DomainDnsName must be a DNS domain name.");
        }

        using var rootDse = new DirectoryEntry($"LDAP://{_options.DomainDnsName}/RootDSE");
        return rootDse.Properties["defaultNamingContext"].Value?.ToString()
            ?? throw new InvalidOperationException("Active Directory did not return a default naming context.");
    }

    private string ResolveSourceContainer(string namingContext)
    {
        if (string.IsNullOrWhiteSpace(_options.SourceContainerName))
            throw new InvalidOperationException("ComputerOuMover:SourceContainerName is not configured.");

        var sourceDn = ResolveDirectChild(namingContext, _options.SourceContainerName, "container");
        if (sourceDn is null)
            throw new ComputerOuMoverException(
                HttpStatusCode.InternalServerError,
                $"The configured source container '{_options.SourceContainerName}' was not found directly under the domain naming context.");
        return sourceDn;
    }

    private ResolvedDestinationSet ResolveDestinations(string namingContext)
    {
        var sdl = ResolveDestination(namingContext, _options.SdlDestinationPath, "SDL");
        var dbo = ResolveDestination(namingContext, _options.DboDestinationPath, "DBO");
        return new ResolvedDestinationSet(sdl, dbo);
    }

    private ResolvedDestination ResolveDestination(string namingContext, string[]? path, string name)
    {
        if (path is not { Length: > 0 } || path.Any(string.IsNullOrWhiteSpace))
            throw new ComputerOuMoverException(
                HttpStatusCode.InternalServerError,
                $"ComputerOuMover:{name}DestinationPath is not configured correctly.");

        var currentDn = namingContext;
        foreach (var segment in path)
        {
            var childDn = ResolveDirectChild(currentDn, segment, "organizationalUnit");
            if (childDn is null)
            {
                throw new ComputerOuMoverException(
                    HttpStatusCode.InternalServerError,
                    $"The configured {name} destination '{string.Join("/", path)}' does not resolve to existing organizational units.");
            }

            currentDn = childDn;
        }

        return new ResolvedDestination(name, string.Join("/", path), currentDn);
    }

    private static string? ResolveDirectChild(string parentDn, string name, string objectClass)
    {
        using var parent = new DirectoryEntry($"LDAP://{parentDn}");
        using var searcher = new DirectorySearcher(parent)
        {
            Filter = $"(&(objectClass={objectClass})(name={EscapeLdapFilterValue(name)}))",
            SearchScope = SearchScope.OneLevel,
            SizeLimit = 2
        };
        searcher.PropertiesToLoad.Add("distinguishedName");
        using var results = searcher.FindAll();

        if (results.Count > 1)
            throw new InvalidOperationException($"More than one direct child named '{name}' was found in Active Directory.");
        return results.Count == 1
            ? GetStringProperty(results[0], "distinguishedName")
            : null;
    }

    private static ResolvedDestination? GetDestination(string name, ResolvedDestinationSet destinations)
    {
        return GetDestinationName(name) switch
        {
            "DBO" => destinations.Dbo,
            "SDL" => destinations.Sdl,
            _ => null
        };
    }

    private static string? GetDestinationName(string name)
    {
        if (name.StartsWith("DBO", StringComparison.OrdinalIgnoreCase))
            return "DBO";
        if (name.StartsWith("SDL", StringComparison.OrdinalIgnoreCase))
            return "SDL";
        return null;
    }

    private static string? GetStringProperty(SearchResult result, string propertyName) =>
        result.Properties[propertyName].Count > 0
            ? result.Properties[propertyName][0]?.ToString()
            : null;

    private static string EscapeLdapFilterValue(string value) =>
        value.Replace("\\", "\\5c", StringComparison.Ordinal)
            .Replace("*", "\\2a", StringComparison.Ordinal)
            .Replace("(", "\\28", StringComparison.Ordinal)
            .Replace(")", "\\29", StringComparison.Ordinal)
            .Replace("\0", "\\00", StringComparison.Ordinal);

    private static string EscapeLdapBinary(byte[] value)
    {
        var escaped = new StringBuilder(value.Length * 3);
        foreach (var octet in value)
            escaped.Append('\\').Append(octet.ToString("X2", System.Globalization.CultureInfo.InvariantCulture));
        return escaped.ToString();
    }

    private sealed record ResolvedDestination(string Name, string Path, string DistinguishedName);
    private sealed record ResolvedDestinationSet(ResolvedDestination Sdl, ResolvedDestination Dbo);
}

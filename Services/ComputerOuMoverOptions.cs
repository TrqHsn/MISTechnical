namespace ADApi.Services;

public sealed class ComputerOuMoverOptions
{
    public const string SectionName = "ComputerOuMover";

    public string DomainDnsName { get; set; } = "dewhirst.grp";
    public string SourceContainerName { get; set; } = "Computers";
    public string[] SdlDestinationPath { get; set; } = [];
    public string[] DboDestinationPath { get; set; } = [];
}

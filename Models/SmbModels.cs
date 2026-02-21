namespace ADApi.Models;

public class SmbEntryDto
{
    public string Name { get; set; } = string.Empty;
    public string FullPath { get; set; } = string.Empty;
    public bool IsDirectory { get; set; }
    public long? Size { get; set; }
    public DateTime LastModified { get; set; }
    public string Extension { get; set; } = string.Empty;
    public bool IsHidden { get; set; }
    public bool IsSystem { get; set; }
    public string Type { get; set; } = string.Empty;
}

public class SmbBrowseResponseDto
{
    public string Path { get; set; } = string.Empty;
    public List<SmbEntryDto> Items { get; set; } = new();
}

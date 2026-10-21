using System.Net;

namespace ADApi.Services;

public sealed class ComputerOuMoverException(HttpStatusCode statusCode, string message) : Exception(message)
{
    public HttpStatusCode StatusCode { get; } = statusCode;
}

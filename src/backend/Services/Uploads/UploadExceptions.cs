namespace ChessWeb.Services.Uploads;

/// <summary>An upload was refused because of its type, content, or a malware detection. The message is safe to show to users.</summary>
public class UploadRejectedException : Exception
{
    public UploadRejectedException(string message) : base(message)
    {
    }
}

/// <summary>The upload pipeline cannot accept files right now (scanner down, processing busy or timed out); uploads fail closed.</summary>
public class UploadUnavailableException : Exception
{
    public const string UserMessage = "File processing is temporarily unavailable. Please try again later.";

    public UploadUnavailableException(string message, Exception? innerException = null) : base(message, innerException)
    {
    }
}

/// <summary>The malware scanner could not be reached or answered unexpectedly.</summary>
public class MalwareScannerUnavailableException : UploadUnavailableException
{
    public MalwareScannerUnavailableException(string message, Exception? innerException = null) : base(message, innerException)
    {
    }
}

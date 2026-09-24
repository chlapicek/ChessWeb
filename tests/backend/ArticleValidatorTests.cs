using ChessWeb.DTOs;
using ChessWeb.Validators;
using Xunit;

namespace ChessWeb.Tests.Validators;

public class ArticleValidatorTests
{
    private readonly CreateArticleRequestValidator _validator = new();
    private readonly CreateCommentRequestValidator _commentValidator = new();

    [Fact]
    public void ValidArticle_PassesValidation()
    {
        var request = new CreateArticleRequest(
            Title: "Mastering the Sicilian Defense",
            Content: "The Sicilian Defense begins with 1. e4 c5...",
            Summary: null,
            PgnData: "1. e4 c5 2. Nf3 d6",
            FenData: "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"
        );

        var result = _validator.Validate(request);
        Assert.True(result.IsValid);
    }

    [Fact]
    public void EmptyTitle_FailsValidation()
    {
        var request = new CreateArticleRequest(
            Title: "",
            Content: "Some content",
            Summary: null,
            PgnData: null,
            FenData: null
        );

        var result = _validator.Validate(request);
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == nameof(request.Title));
    }

    [Fact]
    public void ExceedingTitleLength_FailsValidation()
    {
        var longTitle = new string('A', 250);
        var request = new CreateArticleRequest(
            Title: longTitle,
            Content: "Some content",
            Summary: null,
            PgnData: null,
            FenData: null
        );

        var result = _validator.Validate(request);
        Assert.False(result.IsValid);
    }

    [Fact]
    public void ExceedingContentLength_FailsValidation()
    {
        var longContent = new string('B', 35000); // Limit is 30,000
        var request = new CreateArticleRequest(
            Title: "Valid Title",
            Content: longContent,
            Summary: null,
            PgnData: null,
            FenData: null
        );

        var result = _validator.Validate(request);
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == nameof(request.Content));
    }

    [Fact]
    public void ValidComment_PassesValidation()
    {
        var request = new CreateCommentRequest("Great game analysis! 18. Bd6 was brilliant.");
        var result = _commentValidator.Validate(request);
        Assert.True(result.IsValid);
    }

    [Fact]
    public void EmptyComment_FailsValidation()
    {
        var request = new CreateCommentRequest("");
        var result = _commentValidator.Validate(request);
        Assert.False(result.IsValid);
    }
}

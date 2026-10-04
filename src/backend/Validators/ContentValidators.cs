using FluentValidation;
using ChessWeb.Domain.Entities;
using ChessWeb.DTOs;
using ChessWeb.Services;

namespace ChessWeb.Validators;

public class CreateArticleRequestValidator : AbstractValidator<CreateArticleRequest>
{
    public const int MaxTitleLength = 200;
    public const int MaxSummaryLength = 1000;
    public const int MaxContentLength = 30000; // Character limit for articles
    public const int MaxRichContentLength = 50000; // Raw JSON limit for rich articles

    public static int MaxContentLengthFor(ArticleContentFormat format) =>
        format == ArticleContentFormat.RichJson ? MaxRichContentLength : MaxContentLength;

    public CreateArticleRequestValidator()
    {
        RuleFor(x => x.Title)
            .NotEmpty().WithMessage("Article title is required.")
            .MaximumLength(MaxTitleLength).WithMessage($"Title cannot exceed {MaxTitleLength} characters.");

        RuleFor(x => x.ContentFormat)
            .IsInEnum().WithMessage("Content format is invalid.");

        RuleFor(x => x.Content)
            .NotEmpty().WithMessage("Article content is required.")
            .Must((request, content) => content == null || content.Length <= MaxContentLengthFor(request.ContentFormat))
            .WithMessage(request => $"Article content cannot exceed {MaxContentLengthFor(request.ContentFormat)} characters.");

        RuleFor(x => x.PgnData)
            .MaximumLength(15000).WithMessage("PGN data cannot exceed 15,000 characters.");

        RuleFor(x => x.FenData)
            .MaximumLength(150).WithMessage("FEN data cannot exceed 150 characters.");
    }
}

public class CreateCommentRequestValidator : AbstractValidator<CreateCommentRequest>
{
    public const int MaxContentLength = 5000; // Character limit for article comments

    public CreateCommentRequestValidator()
    {
        RuleFor(x => x.Content)
            .NotEmpty().WithMessage("Comment content is required.")
            .MaximumLength(MaxContentLength).WithMessage($"Comment content cannot exceed {MaxContentLength} characters.");
    }
}


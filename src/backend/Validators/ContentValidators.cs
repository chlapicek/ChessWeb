using FluentValidation;
using ChessWeb.DTOs;
using ChessWeb.Services;

namespace ChessWeb.Validators;

public class CreateArticleRequestValidator : AbstractValidator<CreateArticleRequest>
{
    public const int MaxTitleLength = 200;
    public const int MaxSummaryLength = 1000;
    public const int MaxContentLength = 30000; // Character limit for articles

    public CreateArticleRequestValidator()
    {
        RuleFor(x => x.Title)
            .NotEmpty().WithMessage("Article title is required.")
            .MaximumLength(MaxTitleLength).WithMessage($"Title cannot exceed {MaxTitleLength} characters.");

        RuleFor(x => x.Content)
            .NotEmpty().WithMessage("Article content is required.")
            .MaximumLength(MaxContentLength).WithMessage($"Article content cannot exceed {MaxContentLength} characters.");

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


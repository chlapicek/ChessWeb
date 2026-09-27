using ChessWeb.Validators;
using Xunit;

namespace ChessWeb.Tests.Validators;

public class RichContentValidatorTests
{
    private static string Doc(string blocks) => $$"""{"type":"doc","content":[{{blocks}}]}""";

    [Fact]
    public void ValidDocument_WithChessNodes_IsAcceptedAndPlainTextExtracted()
    {
        var attachmentId = Guid.NewGuid();
        var collectionGameId = Guid.NewGuid();
        var json = Doc($$$"""
            {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Opening"}]},
            {"type":"paragraph","content":[
                {"type":"text","text":"After "},
                {"type":"moveRef","attrs":{"gameKey":"p0","ply":4,"san":"Nf3"}},
                {"type":"text","text":" white is ","marks":[{"type":"bold"}]},
                {"type":"text","text":"better","marks":[{"type":"link","attrs":{"href":"https://lichess.org","target":"_blank","rel":"noopener noreferrer nofollow","class":null}}]},
                {"type":"hardBreak"},
                {"type":"moveRef","attrs":{"gameKey":"c:{{{collectionGameId}}}","ply":0,"san":"e4"}}
            ]},
            {"type":"chessPosition","attrs":{"fen":"8/8/8/8/8/8/8/K6k w - - 0 1","caption":"Bare kings"}},
            {"type":"chessGame","attrs":{"gameKey":"p1"}},
            {"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Point"}]}]}]},
            {"type":"orderedList","attrs":{"start":1},"content":[{"type":"listItem","content":[{"type":"paragraph"}]}]},
            {"type":"codeBlock","attrs":{"language":null},"content":[{"type":"text","text":"code"}]},
            {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Quote"}]}]},
            {"type":"horizontalRule"},
            {"type":"attachmentImage","attrs":{"attachmentId":"{{{attachmentId}}}","alt":"diagram"}},
            {"type":"attachmentFile","attrs":{"attachmentId":"{{{attachmentId}}}"}}
            """);

        var result = RichContentValidator.Validate(json);

        Assert.True(result.IsValid, result.Error);
        Assert.Equal("Opening\nAfter Nf3 white is better\ne4\nBare kings\nPoint\ncode\nQuote", result.PlainText);
        Assert.Equal(attachmentId, Assert.Single(result.AttachmentIds));
    }

    [Theory]
    [InlineData("""{"type":"paragraph","content":[]}""")]
    [InlineData("""{"type":"doc"}""")]
    [InlineData("""[]""")]
    [InlineData("""not json""")]
    public void InvalidRoot_IsRejected(string json)
    {
        Assert.False(RichContentValidator.Validate(json).IsValid);
    }

    [Theory]
    [InlineData("""{"type":"iframe","attrs":{"src":"https://evil.example"}}""")]
    [InlineData("""{"type":"paragraph","attrs":{"style":"color:red"}}""")]
    [InlineData("""{"type":"paragraph","onclick":"alert(1)"}""")]
    [InlineData("""{"type":"heading","attrs":{"level":5},"content":[{"type":"text","text":"x"}]}""")]
    [InlineData("""{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"link","attrs":{"href":"javascript:alert(1)"}}]}]}""")]
    [InlineData("""{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"link","attrs":{"href":"/relative"}}]}]}""")]
    [InlineData("""{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"highlight"}]}]}""")]
    [InlineData("""{"type":"paragraph","content":[{"type":"moveRef","attrs":{"gameKey":"x1","ply":1,"san":"e4"}}]}""")]
    [InlineData("""{"type":"paragraph","content":[{"type":"moveRef","attrs":{"gameKey":"p0","ply":1001,"san":"e4"}}]}""")]
    [InlineData("""{"type":"attachmentImage","attrs":{"attachmentId":"not-a-guid"}}""")]
    [InlineData("""{"type":"chessPosition","attrs":{"fen":""}}""")]
    [InlineData("""{"type":"horizontalRule","content":[{"type":"text","text":"x"}]}""")]
    [InlineData("""{"type":"doc","content":[]}""")]
    public void DisallowedNodesMarksOrAttributes_AreRejected(string block)
    {
        Assert.False(RichContentValidator.Validate(Doc(block)).IsValid);
    }

    [Fact]
    public void ExcessiveDepth_IsRejected()
    {
        var nested = "{\"type\":\"paragraph\"}";
        for (var i = 0; i < RichContentValidator.MaxDepth; i++)
        {
            nested = $$"""{"type":"blockquote","content":[{{nested}}]}""";
        }

        Assert.False(RichContentValidator.Validate(Doc(nested)).IsValid);
    }

    [Fact]
    public void TooManyNodes_IsRejected()
    {
        var blocks = string.Join(",", Enumerable.Repeat("{\"type\":\"horizontalRule\"}", RichContentValidator.MaxNodes));
        Assert.False(RichContentValidator.Validate(Doc(blocks)).IsValid);
    }
}

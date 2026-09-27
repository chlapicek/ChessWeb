using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace ChessWeb.Validators;

public sealed record RichContentValidationResult(
    bool IsValid,
    string? Error,
    string PlainText,
    IReadOnlySet<Guid> AttachmentIds)
{
    public static RichContentValidationResult Invalid(string error) => new(false, error, string.Empty, new HashSet<Guid>());
}

/// <summary>Validates TipTap/ProseMirror document JSON against a strict allowlist and extracts its plain text.</summary>
public static partial class RichContentValidator
{
    public const int MaxDepth = 20;
    public const int MaxNodes = 5000;

    private static readonly HashSet<string> NodeProperties = ["type", "content", "attrs", "marks", "text"];
    private static readonly HashSet<string> MarkProperties = ["type", "attrs"];
    private static readonly HashSet<string> SimpleMarks = ["bold", "italic", "strike", "code", "underline"];
    private static readonly HashSet<string> ContainerNodes = ["paragraph", "heading", "bulletList", "orderedList", "listItem", "blockquote", "codeBlock"];
    private static readonly HashSet<string> LeafNodes = ["text", "hardBreak", "horizontalRule", "attachmentImage", "attachmentFile", "chessPosition", "chessGame", "moveRef"];
    private static readonly HashSet<string> InlineNodes = ["text", "hardBreak", "moveRef"];

    [GeneratedRegex(@"^(p(0|[1-9][0-9]{0,3})|c:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$")]
    private static partial Regex GameKeyRegex();

    [GeneratedRegex(@"^[a-zA-Z0-9+#_-]{1,50}$")]
    private static partial Regex CodeLanguageRegex();

    [GeneratedRegex(@"^[a-z ]{1,100}$")]
    private static partial Regex LinkRelRegex();

    [GeneratedRegex(@"\n{3,}")]
    private static partial Regex ExcessNewlinesRegex();

    public static bool IsValidGameKey(string? gameKey) => gameKey != null && GameKeyRegex().IsMatch(gameKey);

    public static RichContentValidationResult Validate(string json)
    {
        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(json, new JsonDocumentOptions { MaxDepth = MaxDepth * 3 + 4 });
        }
        catch (JsonException)
        {
            return RichContentValidationResult.Invalid("Rich content is not valid JSON.");
        }

        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object ||
                !root.TryGetProperty("type", out var rootType) || rootType.ValueKind != JsonValueKind.String || rootType.GetString() != "doc" ||
                !root.TryGetProperty("content", out var rootContent) || rootContent.ValueKind != JsonValueKind.Array)
            {
                return RichContentValidationResult.Invalid("Rich content must be a document with a content array.");
            }

            var walker = new Walker();
            var error = walker.VisitNode(root, depth: 1, isRoot: true);
            if (error != null)
            {
                return RichContentValidationResult.Invalid(error);
            }

            var text = ExcessNewlinesRegex().Replace(walker.Text.ToString().Replace("\r", string.Empty), "\n\n").Trim();
            return new RichContentValidationResult(true, null, text, walker.AttachmentIds);
        }
    }

    private sealed class Walker
    {
        public StringBuilder Text { get; } = new();
        public HashSet<Guid> AttachmentIds { get; } = [];
        private int _nodeCount;

        public string? VisitNode(JsonElement node, int depth, bool isRoot = false)
        {
            if (depth > MaxDepth) return $"Rich content exceeds the maximum nesting depth of {MaxDepth}.";
            if (++_nodeCount > MaxNodes) return $"Rich content exceeds the maximum of {MaxNodes} nodes.";
            if (node.ValueKind != JsonValueKind.Object) return "Every rich content node must be an object.";

            foreach (var property in node.EnumerateObject())
            {
                if (!NodeProperties.Contains(property.Name)) return $"Unknown node property '{property.Name}'.";
            }

            if (!node.TryGetProperty("type", out var typeElement) || typeElement.ValueKind != JsonValueKind.String)
            {
                return "Every rich content node must have a type.";
            }

            var type = typeElement.GetString()!;
            if (type == "doc" && !isRoot) return "Nested documents are not allowed.";
            if (type != "doc" && !ContainerNodes.Contains(type) && !LeafNodes.Contains(type)) return $"Node type '{type}' is not allowed.";

            var hasContent = node.TryGetProperty("content", out var content);
            if (hasContent && (LeafNodes.Contains(type) || content.ValueKind != JsonValueKind.Array))
            {
                return $"Node type '{type}' cannot have content.";
            }

            if (node.TryGetProperty("marks", out var marks))
            {
                if (type != "text") return $"Node type '{type}' cannot have marks.";
                var markError = ValidateMarks(marks);
                if (markError != null) return markError;
            }

            var hasText = node.TryGetProperty("text", out var textElement);
            if (type == "text")
            {
                if (!hasText || textElement.ValueKind != JsonValueKind.String) return "Text nodes must contain text.";
            }
            else if (hasText)
            {
                return $"Node type '{type}' cannot have text.";
            }

            var attrs = node.TryGetProperty("attrs", out var attrsElement) ? attrsElement : (JsonElement?)null;
            if (attrs is { ValueKind: not JsonValueKind.Object and not JsonValueKind.Null })
            {
                return $"Attributes of '{type}' must be an object.";
            }

            var attrError = ValidateAttrs(type, attrs is { ValueKind: JsonValueKind.Object } a ? a : null);
            if (attrError != null) return attrError;

            switch (type)
            {
                case "text":
                    Text.Append(textElement.GetString());
                    break;
                case "hardBreak":
                    Text.Append('\n');
                    break;
                case "moveRef":
                    Text.Append(attrs!.Value.GetProperty("san").GetString());
                    break;
                case "chessPosition":
                    if (TryGetString(attrs, "caption", out var caption)) Text.Append(caption);
                    break;
            }

            if (hasContent)
            {
                foreach (var child in content.EnumerateArray())
                {
                    var childError = VisitNode(child, depth + 1);
                    if (childError != null) return childError;
                }
            }

            if (!InlineNodes.Contains(type) && Text.Length > 0 && Text[^1] != '\n')
            {
                Text.Append('\n');
            }

            return null;
        }

        private string? ValidateAttrs(string type, JsonElement? attrs)
        {
            switch (type)
            {
                case "heading":
                    if (!AllowOnly(attrs, "level")) return UnknownAttr(type);
                    return TryGetInt(attrs, "level", out var level) && level is >= 1 and <= 4 ? null : "Heading level must be between 1 and 4.";
                case "orderedList":
                    if (!AllowOnly(attrs, "start")) return UnknownAttr(type);
                    return IsNullOrMissing(attrs, "start") || TryGetInt(attrs, "start", out var start) && start is >= 0 and <= 100000 ? null : "Ordered list start must be a non-negative integer.";
                case "codeBlock":
                    if (!AllowOnly(attrs, "language")) return UnknownAttr(type);
                    return IsNullOrMissing(attrs, "language") || TryGetString(attrs, "language", out var language) && CodeLanguageRegex().IsMatch(language) ? null : "Code block language is invalid.";
                case "attachmentImage":
                    if (!AllowOnly(attrs, "attachmentId", "alt")) return UnknownAttr(type);
                    if (!IsNullOrMissing(attrs, "alt") && !(TryGetString(attrs, "alt", out var alt) && alt.Length <= 300)) return "Image alt text cannot exceed 300 characters.";
                    return ReadAttachmentId(attrs);
                case "attachmentFile":
                    if (!AllowOnly(attrs, "attachmentId")) return UnknownAttr(type);
                    return ReadAttachmentId(attrs);
                case "chessPosition":
                    if (!AllowOnly(attrs, "fen", "caption")) return UnknownAttr(type);
                    if (!(TryGetString(attrs, "fen", out var fen) && fen.Length is > 0 and <= 150)) return "Chess position FEN is required and cannot exceed 150 characters.";
                    return IsNullOrMissing(attrs, "caption") || TryGetString(attrs, "caption", out var caption) && caption.Length <= 300 ? null : "Chess position caption cannot exceed 300 characters.";
                case "chessGame":
                    if (!AllowOnly(attrs, "gameKey")) return UnknownAttr(type);
                    return TryGetString(attrs, "gameKey", out var gameKey) && IsValidGameKey(gameKey) ? null : "Chess game key is invalid.";
                case "moveRef":
                    if (!AllowOnly(attrs, "gameKey", "ply", "san")) return UnknownAttr(type);
                    if (!(TryGetString(attrs, "gameKey", out var moveGameKey) && IsValidGameKey(moveGameKey))) return "Move reference game key is invalid.";
                    if (!(TryGetInt(attrs, "ply", out var ply) && ply is >= 0 and <= 1000)) return "Move reference ply must be between 0 and 1000.";
                    return TryGetString(attrs, "san", out var san) && san.Length is > 0 and <= 20 ? null : "Move reference SAN is required and cannot exceed 20 characters.";
                default:
                    return AllowOnly(attrs) ? null : UnknownAttr(type);
            }
        }

        private string? ReadAttachmentId(JsonElement? attrs)
        {
            if (!TryGetString(attrs, "attachmentId", out var value) || !Guid.TryParse(value, out var attachmentId))
            {
                return "Attachment id must be a valid GUID.";
            }

            AttachmentIds.Add(attachmentId);
            return null;
        }

        private static string? ValidateMarks(JsonElement marks)
        {
            if (marks.ValueKind != JsonValueKind.Array) return "Marks must be an array.";
            foreach (var mark in marks.EnumerateArray())
            {
                if (mark.ValueKind != JsonValueKind.Object) return "Every mark must be an object.";
                foreach (var property in mark.EnumerateObject())
                {
                    if (!MarkProperties.Contains(property.Name)) return $"Unknown mark property '{property.Name}'.";
                }

                if (!mark.TryGetProperty("type", out var typeElement) || typeElement.ValueKind != JsonValueKind.String) return "Every mark must have a type.";
                var type = typeElement.GetString()!;
                var attrs = mark.TryGetProperty("attrs", out var attrsElement) && attrsElement.ValueKind == JsonValueKind.Object ? attrsElement : (JsonElement?)null;
                if (mark.TryGetProperty("attrs", out var rawAttrs) && rawAttrs.ValueKind is not JsonValueKind.Object and not JsonValueKind.Null) return "Mark attributes must be an object.";

                if (SimpleMarks.Contains(type))
                {
                    if (!AllowOnly(attrs)) return $"Mark '{type}' does not accept attributes.";
                    continue;
                }

                if (type != "link") return $"Mark type '{type}' is not allowed.";
                if (!AllowOnly(attrs, "href", "target", "rel", "class")) return "Link mark has unknown attributes.";
                if (!TryGetString(attrs, "href", out var href) || !IsSafeHref(href)) return "Links must be absolute http, https or mailto URLs.";
                if (!IsNullOrMissing(attrs, "target") && !(TryGetString(attrs, "target", out var target) && target == "_blank")) return "Link target must be _blank or null.";
                if (!IsNullOrMissing(attrs, "rel") && !(TryGetString(attrs, "rel", out var rel) && LinkRelRegex().IsMatch(rel))) return "Link rel is invalid.";
                if (!IsNullOrMissing(attrs, "class")) return "Link class must be null.";
            }

            return null;
        }

        private static bool IsSafeHref(string href) =>
            href.Length <= 2000 &&
            Uri.TryCreate(href, UriKind.Absolute, out var uri) &&
            (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeMailto);

        private static string UnknownAttr(string type) => $"Node type '{type}' has unknown attributes.";

        private static bool AllowOnly(JsonElement? attrs, params string[] allowed) =>
            attrs is not { } value || value.EnumerateObject().All(property => allowed.Contains(property.Name));

        private static bool IsNullOrMissing(JsonElement? attrs, string name) =>
            attrs is not { } value || !value.TryGetProperty(name, out var property) || property.ValueKind == JsonValueKind.Null;

        private static bool TryGetString(JsonElement? attrs, string name, out string result)
        {
            result = string.Empty;
            if (attrs is not { } value || !value.TryGetProperty(name, out var property) || property.ValueKind != JsonValueKind.String) return false;
            result = property.GetString()!;
            return true;
        }

        private static bool TryGetInt(JsonElement? attrs, string name, out int result)
        {
            result = 0;
            return attrs is { } value && value.TryGetProperty(name, out var property) &&
                   property.ValueKind == JsonValueKind.Number && property.TryGetInt32(out result);
        }
    }
}

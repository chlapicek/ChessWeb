using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using ChessWeb.Domain.Entities;
using ChessWeb.DTOs;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace ChessWeb.Tests.Integration;

public class ArticlesControllerTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public ArticlesControllerTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    private async Task<HttpClient> CreateAuthenticatedClientAsync(string email, string password)
    {
        var client = _factory.CreateClient();
        var loginResponse = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, password));
        var auth = await loginResponse.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(auth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.Token);
        return client;
    }

    private static async Task<(HttpClient client, UserDto user)> RegisterAndLoginAsync(
        HttpClient anonymousFactoryClient,
        string? fullName = null,
        string? chessRating = null,
        string? nickname = null)
    {
        fullName ??= $"Test Author {Guid.NewGuid():N}";
        var registerResponse = await anonymousFactoryClient.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            $"test-{Guid.NewGuid():N}@chessweb.local", "Player123!#", fullName, chessRating, null, nickname));
        Assert.Equal(HttpStatusCode.OK, registerResponse.StatusCode);
        var auth = await registerResponse.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(auth);
        anonymousFactoryClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.Token);
        return (anonymousFactoryClient, auth.User);
    }

    private static MultipartFormDataContent BuildCreateArticleForm(string title, string content, string? summary = null, string? pgnData = null, string? fenData = null, ArticleContentFormat? contentFormat = null, Guid? gameCollectionId = null)
    {
        var form = new MultipartFormDataContent
        {
            { new StringContent(title), "Title" },
            { new StringContent(content), "Content" }
        };
        if (summary != null) form.Add(new StringContent(summary), "Summary");
        if (pgnData != null) form.Add(new StringContent(pgnData), "PgnData");
        if (fenData != null) form.Add(new StringContent(fenData), "FenData");
        if (contentFormat != null) form.Add(new StringContent(((int)contentFormat.Value).ToString()), "ContentFormat");
        if (gameCollectionId != null) form.Add(new StringContent(gameCollectionId.Value.ToString()), "GameCollectionId");
        return form;
    }

    private static string RichDoc(params string[] blocks) => $$"""{"type":"doc","content":[{{string.Join(",", blocks)}}]}""";

    private static string Paragraph(string text) => $$"""{"type":"paragraph","content":[{"type":"text","text":"{{text}}"}]}""";

    private static string ImageNode(Guid attachmentId) => $$$"""{"type":"attachmentImage","attrs":{"attachmentId":"{{{attachmentId}}}","alt":"diagram"}}""";

    private static async Task<AttachmentDto> UploadInlineAttachmentAsync(HttpClient client)
    {
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(ChessWeb.Tests.TestImages.Png());
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "file", "diagram.png");
        var response = await client.PostAsync("/api/articles/attachments", form);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var dto = await response.Content.ReadFromJsonAsync<AttachmentDto>();
        Assert.NotNull(dto);
        return dto!;
    }

    private static async Task<ArticleDto> CreateArticleAsync(HttpClient client, string title = "My Article", string content = "Some content about chess.")
    {
        var response = await client.PostAsync("/api/articles", BuildCreateArticleForm(title, content));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var dto = await response.Content.ReadFromJsonAsync<ArticleDto>();
        Assert.NotNull(dto);
        return dto!;
    }

    [Fact]
    public async Task GetArticleById_ReturnsNotFound_ForMissingArticle()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/articles/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task AnonymousUser_CannotCreateArticle()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync("/api/articles", BuildCreateArticleForm("Title", "Content"));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task RegisteredUser_CanCreateArticle_ThenGetById()
    {
        var client = _factory.CreateClient();
        var (author, _) = await RegisterAndLoginAsync(client);

        var created = await CreateArticleAsync(author, "How to play the Sicilian", "Detailed content here.");
        Assert.Equal("How to play the Sicilian", created.Title);

        var getResponse = await author.GetAsync($"/api/articles/{created.Id}");
        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
        var fetched = await getResponse.Content.ReadFromJsonAsync<ArticleDto>();
        Assert.NotNull(fetched);
        Assert.Equal(created.Id, fetched!.Id);
    }

    [Fact]
    public async Task AnonymousUser_SeesNicknameInsteadOfArticleAndCommentRealNamesOrRatings()
    {
        var authorNickname = $"KnightWriter-{Guid.NewGuid():N}";
        var commenterNickname = $"TacticalMind-{Guid.NewGuid():N}";
        var authorClient = _factory.CreateClient();
        var (author, _) = await RegisterAndLoginAsync(authorClient, "Private Article Author", "2100", authorNickname);
        var created = await CreateArticleAsync(author);

        var commenterClient = _factory.CreateClient();
        var (commenter, _) = await RegisterAndLoginAsync(commenterClient, "Private Comment Author", "1800", commenterNickname);
        await commenter.PostAsJsonAsync($"/api/articles/{created.Id}/comments", new CreateCommentRequest("Private comment"));

        var response = await _factory.CreateClient().GetAsync($"/api/articles/{created.Id}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var article = await response.Content.ReadFromJsonAsync<ArticleDto>();

        Assert.NotNull(article);
        Assert.Equal(authorNickname, article!.AuthorName);
        Assert.Null(article.AuthorRating);
        Assert.Equal(1, article.CommentsCount);
        var comments = await _factory.CreateClient().GetFromJsonAsync<PagedResult<ArticleCommentDto>>($"/api/articles/{created.Id}/comments");
        var comment = Assert.Single(comments!.Items);
        Assert.Equal(commenterNickname, comment.AuthorName);
        Assert.Null(comment.AuthorRating);
    }

    [Fact]
    public async Task AuthorWithoutTeamMembership_CanSeeTheirOwnFullNameAndRating()
    {
        var client = _factory.CreateClient();
        var fullName = $"Private Author {Guid.NewGuid():N}";
        var (author, _) = await RegisterAndLoginAsync(client, fullName, "2050", $"author-{Guid.NewGuid():N}");
        var created = await CreateArticleAsync(author);

        var response = await author.GetAsync($"/api/articles/{created.Id}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var article = await response.Content.ReadFromJsonAsync<ArticleDto>();

        Assert.NotNull(article);
        Assert.Equal(fullName, article!.AuthorName);
        Assert.Equal("2050", article.AuthorRating);
    }

    [Fact]
    public async Task TeamMember_SeesPrivateArticleAuthorIdentityForSharedTeam()
    {
        var authorClient = _factory.CreateClient();
        var fullName = $"Team Article Author {Guid.NewGuid():N}";
        var (author, authorUser) = await RegisterAndLoginAsync(authorClient, fullName, "1950", $"author-{Guid.NewGuid():N}");
        var created = await CreateArticleAsync(author);
        var viewerClient = _factory.CreateClient();
        var (viewer, viewerUser) = await RegisterAndLoginAsync(viewerClient);
        var admin = await CreateAuthenticatedClientAsync("admin@chessweb.local", "Admin123!#");

        var createTeamResponse = await admin.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Article privacy {Guid.NewGuid():N}"));
        Assert.Equal(HttpStatusCode.Created, createTeamResponse.StatusCode);
        var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
        Assert.NotNull(team);
        try
        {
            Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync($"/api/teams/{team!.Id}/members", new AssignTeamMemberRequest(authorUser.Id))).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync($"/api/teams/{team.Id}/members", new AssignTeamMemberRequest(viewerUser.Id))).StatusCode);

            var response = await viewer.GetAsync($"/api/articles/{created.Id}");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var article = await response.Content.ReadFromJsonAsync<ArticleDto>();

            Assert.NotNull(article);
            Assert.Equal(fullName, article!.AuthorName);
            Assert.Equal("1950", article.AuthorRating);
        }
        finally
        {
            await admin.DeleteAsync($"/api/teams/{team!.Id}");
        }
    }

    [Fact]
    public async Task UnpublishedArticleAndAttachment_AreVisibleOnlyToAuthorAndAdministrators()
    {
        var authorClient = _factory.CreateClient();
        var (author, _) = await RegisterAndLoginAsync(authorClient);
        Guid? articleId = null;
        var additionalDraftIds = new List<Guid>();
        try
        {
            using var form = BuildCreateArticleForm("Private draft", "Draft content.");
            form.Add(new ByteArrayContent(System.Text.Encoding.UTF8.GetBytes("private attachment")), "attachments", "private.txt");
            var createResponse = await author.PostAsync("/api/articles", form);
            Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
            var created = await createResponse.Content.ReadFromJsonAsync<ArticleDto>();
            Assert.NotNull(created);
            articleId = created!.Id;
            var attachmentId = Assert.Single(created.Attachments).Id;
            var unrelated = await RegisterAndLoginAsync(_factory.CreateClient());
            var preexistingCommentResponse = await unrelated.client.PostAsJsonAsync($"/api/articles/{created.Id}/comments", new CreateCommentRequest("Comment before unpublishing"));
            Assert.Equal(HttpStatusCode.OK, preexistingCommentResponse.StatusCode);
            var preexistingComment = await preexistingCommentResponse.Content.ReadFromJsonAsync<ArticleCommentDto>();
            Assert.NotNull(preexistingComment);

            var unpublishResponse = await author.PutAsJsonAsync($"/api/articles/{created.Id}",
                new UpdateArticleRequest(created.Title, created.Content, created.Summary, created.PgnData, created.FenData, false));
            Assert.Equal(HttpStatusCode.OK, unpublishResponse.StatusCode);

            var anonymous = _factory.CreateClient();
            Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/api/articles/{created.Id}")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/api/articles/attachments/{attachmentId}")).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync($"/api/articles/{created.Id}/comments", new CreateCommentRequest("Anonymous draft comment"))).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync($"/api/articles/{created.Id}/reactions", new ToggleReactionRequest(ArticleReactionType.Like))).StatusCode);

            Assert.Equal(HttpStatusCode.NotFound, (await unrelated.client.GetAsync($"/api/articles/{created.Id}")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await unrelated.client.GetAsync($"/api/articles/attachments/{attachmentId}")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await unrelated.client.PutAsJsonAsync($"/api/articles/{created.Id}",
                new UpdateArticleRequest("Hijacked draft", "Changed content", null, null, null, false))).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await unrelated.client.DeleteAsync($"/api/articles/{created.Id}")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await unrelated.client.DeleteAsync($"/api/articles/comments/{preexistingComment!.Id}")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await unrelated.client.PostAsJsonAsync($"/api/articles/{created.Id}/comments", new CreateCommentRequest("Hidden draft comment"))).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await unrelated.client.PostAsJsonAsync($"/api/articles/{created.Id}/reactions", new ToggleReactionRequest(ArticleReactionType.Like))).StatusCode);

            var ownerArticle = await author.GetAsync($"/api/articles/{created.Id}");
            Assert.Equal(HttpStatusCode.OK, ownerArticle.StatusCode);
            var ownerAttachment = await author.GetAsync($"/api/articles/attachments/{attachmentId}");
            Assert.Equal(HttpStatusCode.OK, ownerAttachment.StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await author.PostAsJsonAsync($"/api/articles/{created.Id}/comments", new CreateCommentRequest("Owner draft comment"))).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await author.PostAsJsonAsync($"/api/articles/{created.Id}/reactions", new ToggleReactionRequest(ArticleReactionType.Like))).StatusCode);

            foreach (var credentials in new[]
            {
                (Email: "admin@chessweb.local", Password: "Admin123!#"),
                (Email: "superadmin@chessweb.local", Password: "SuperAdmin123!#")
            })
            {
                var administrator = await CreateAuthenticatedClientAsync(credentials.Email, credentials.Password);
                Assert.Equal(HttpStatusCode.OK, (await administrator.GetAsync($"/api/articles/{created.Id}")).StatusCode);
                Assert.Equal(HttpStatusCode.OK, (await administrator.GetAsync($"/api/articles/attachments/{attachmentId}")).StatusCode);
                Assert.Equal(HttpStatusCode.OK, (await administrator.PutAsJsonAsync($"/api/articles/{created.Id}",
                    new UpdateArticleRequest(created.Title, created.Content, created.Summary, created.PgnData, created.FenData, false))).StatusCode);
                Assert.Equal(HttpStatusCode.OK, (await administrator.PostAsJsonAsync($"/api/articles/{created.Id}/comments", new CreateCommentRequest("Administrator draft comment"))).StatusCode);
                Assert.Equal(HttpStatusCode.OK, (await administrator.PostAsJsonAsync($"/api/articles/{created.Id}/reactions", new ToggleReactionRequest(ArticleReactionType.Chess))).StatusCode);

                var deletableDraft = await CreateArticleAsync(author, $"Draft delete {Guid.NewGuid():N}", "Private draft.");
                additionalDraftIds.Add(deletableDraft.Id);
                await author.PutAsJsonAsync($"/api/articles/{deletableDraft.Id}", new UpdateArticleRequest(deletableDraft.Title, deletableDraft.Content, null, null, null, false));
                Assert.Equal(HttpStatusCode.NoContent, (await administrator.DeleteAsync($"/api/articles/{deletableDraft.Id}")).StatusCode);
            }
        }
        finally
        {
            foreach (var additionalDraftId in additionalDraftIds)
            {
                await author.DeleteAsync($"/api/articles/{additionalDraftId}");
            }
            if (articleId is Guid createdArticleId)
            {
                await author.DeleteAsync($"/api/articles/{createdArticleId}");
            }
        }
    }

    [Fact]
    public async Task Administrator_SeesNicknamesInArticlesWhileRatingsRemainVisible()
    {
        var authorClient = _factory.CreateClient();
        var (author, _) = await RegisterAndLoginAsync(authorClient, "Private Article Author", "2100", $"KnightWriter-{Guid.NewGuid():N}");
        var created = await CreateArticleAsync(author);

        var admin = await CreateAuthenticatedClientAsync("admin@chessweb.local", "Admin123!#");
        var response = await admin.GetAsync($"/api/articles/{created.Id}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var article = await response.Content.ReadFromJsonAsync<ArticleDto>();

        Assert.NotNull(article);
        Assert.Equal("KnightWriter", article!.AuthorName[..12]);
        Assert.Equal("2100", article.AuthorRating);
        Assert.DoesNotContain("Private Article Author", article.AuthorName);
    }

    [Fact]
    public async Task CreateArticle_RejectsOverlongPgnData()
    {
        var client = _factory.CreateClient();
        var (author, _) = await RegisterAndLoginAsync(client);

        var response = await author.PostAsync("/api/articles",
            BuildCreateArticleForm("Title", "Content", pgnData: new string('e', 15001)));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Owner_CanUpdateOwnArticle_ButNonOwnerNonAdminIsForbidden_AndAdminCan()
    {
        var client = _factory.CreateClient();
        var (author, _) = await RegisterAndLoginAsync(client);
        var created = await CreateArticleAsync(author);

        var ownUpdate = await author.PutAsJsonAsync($"/api/articles/{created.Id}",
            new UpdateArticleRequest("Updated Title", "Updated content", null, null, null));
        Assert.Equal(HttpStatusCode.OK, ownUpdate.StatusCode);
        var updated = await ownUpdate.Content.ReadFromJsonAsync<ArticleDto>();
        Assert.Equal("Updated Title", updated!.Title);

        var otherClient = _factory.CreateClient();
        var (other, _) = await RegisterAndLoginAsync(otherClient);
        var forbiddenUpdate = await other.PutAsJsonAsync($"/api/articles/{created.Id}",
            new UpdateArticleRequest("Hijacked", "Hijacked content", null, null, null));
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenUpdate.StatusCode);

        var admin = await CreateAuthenticatedClientAsync("admin@chessweb.local", "Admin123!#");
        var adminUpdate = await admin.PutAsJsonAsync($"/api/articles/{created.Id}",
            new UpdateArticleRequest("Admin Edited", "Admin edited content", null, null, null));
        Assert.Equal(HttpStatusCode.OK, adminUpdate.StatusCode);
    }

    [Theory]
    [InlineData("", "Some content")]
    [InlineData("Title", "")]
    public async Task UpdateArticle_RejectsEmptyTitleOrContent(string title, string content)
    {
        var client = _factory.CreateClient();
        var (author, _) = await RegisterAndLoginAsync(client);
        var created = await CreateArticleAsync(author);

        var response = await author.PutAsJsonAsync($"/api/articles/{created.Id}",
            new UpdateArticleRequest(title, content, null, null, null));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UpdateArticle_RejectsOverlongPgnAndFenData()
    {
        var client = _factory.CreateClient();
        var (author, _) = await RegisterAndLoginAsync(client);
        var created = await CreateArticleAsync(author);

        var overlongPgn = await author.PutAsJsonAsync($"/api/articles/{created.Id}",
            new UpdateArticleRequest("Title", "Content", null, new string('e', 15001), null));
        Assert.Equal(HttpStatusCode.BadRequest, overlongPgn.StatusCode);

        var overlongFen = await author.PutAsJsonAsync($"/api/articles/{created.Id}",
            new UpdateArticleRequest("Title", "Content", null, null, new string('r', 151)));
        Assert.Equal(HttpStatusCode.BadRequest, overlongFen.StatusCode);
    }

    [Fact]
    public async Task Owner_CanDeleteOwnArticle_ButNonOwnerNonAdminIsForbidden()
    {
        var client = _factory.CreateClient();
        var (author, _) = await RegisterAndLoginAsync(client);
        var created = await CreateArticleAsync(author);

        var otherClient = _factory.CreateClient();
        var (other, _) = await RegisterAndLoginAsync(otherClient);
        var forbiddenDelete = await other.DeleteAsync($"/api/articles/{created.Id}");
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenDelete.StatusCode);

        var deleteResponse = await author.DeleteAsync($"/api/articles/{created.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);

        var getAfterDelete = await author.GetAsync($"/api/articles/{created.Id}");
        Assert.Equal(HttpStatusCode.NotFound, getAfterDelete.StatusCode);
    }

    [Fact]
    public async Task GetArticles_SupportsPagination()
    {
        var client = _factory.CreateClient();
        var (author, _) = await RegisterAndLoginAsync(client);
        for (var i = 0; i < 3; i++)
        {
            await CreateArticleAsync(author, $"Pagination Article {Guid.NewGuid():N}", "Content for pagination test.");
        }

        var response = await _factory.CreateClient().GetAsync("/api/articles?page=1&pageSize=2");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var paged = await response.Content.ReadFromJsonAsync<PagedResult<ArticleDto>>();
        Assert.NotNull(paged);
        Assert.Equal(2, paged!.Items.Count);
        Assert.Equal(1, paged.PageNumber);
        Assert.Equal(2, paged.PageSize);
        Assert.True(paged.TotalPages >= 2);
    }

    [Fact]
    public async Task AddComment_Works_AndOnlyAuthorOrAdminCanDelete()
    {
        var client = _factory.CreateClient();
        var (author, _) = await RegisterAndLoginAsync(client);
        var created = await CreateArticleAsync(author);

        var commenterClient = _factory.CreateClient();
        var (commenter, _) = await RegisterAndLoginAsync(commenterClient);

        var addResponse = await commenter.PostAsJsonAsync($"/api/articles/{created.Id}/comments", new CreateCommentRequest("Great article!"));
        Assert.Equal(HttpStatusCode.OK, addResponse.StatusCode);
        var comment = await addResponse.Content.ReadFromJsonAsync<ArticleCommentDto>();
        Assert.NotNull(comment);
        Assert.Equal("Great article!", comment!.Content);

        var otherClient = _factory.CreateClient();
        var (other, _) = await RegisterAndLoginAsync(otherClient);
        var forbiddenDelete = await other.DeleteAsync($"/api/articles/comments/{comment.Id}");
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenDelete.StatusCode);

        var ownDelete = await commenter.DeleteAsync($"/api/articles/comments/{comment.Id}");
        Assert.Equal(HttpStatusCode.NoContent, ownDelete.StatusCode);
    }

    [Fact]
    public async Task AddComment_RejectsEmptyContent()
    {
        var client = _factory.CreateClient();
        var (author, _) = await RegisterAndLoginAsync(client);
        var created = await CreateArticleAsync(author);

        var response = await author.PostAsJsonAsync($"/api/articles/{created.Id}/comments", new CreateCommentRequest(""));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ToggleReaction_AddsThenRemovesReaction()
    {
        var client = _factory.CreateClient();
        var (author, _) = await RegisterAndLoginAsync(client);
        var created = await CreateArticleAsync(author);

        var reactorClient = _factory.CreateClient();
        var (reactor, _) = await RegisterAndLoginAsync(reactorClient);

        var addResponse = await reactor.PostAsJsonAsync($"/api/articles/{created.Id}/reactions",
            new ToggleReactionRequest(ChessWeb.Domain.Entities.ArticleReactionType.Like));
        Assert.Equal(HttpStatusCode.OK, addResponse.StatusCode);
        var afterAdd = await addResponse.Content.ReadFromJsonAsync<List<ReactionSummaryDto>>();
        Assert.NotNull(afterAdd);
        var likeSummary = Assert.Single(afterAdd!, r => r.ReactionType == ChessWeb.Domain.Entities.ArticleReactionType.Like);
        Assert.Equal(1, likeSummary.Count);
        Assert.True(likeSummary.UserReacted);

        var removeResponse = await reactor.PostAsJsonAsync($"/api/articles/{created.Id}/reactions",
            new ToggleReactionRequest(ChessWeb.Domain.Entities.ArticleReactionType.Like));
        Assert.Equal(HttpStatusCode.OK, removeResponse.StatusCode);
        var afterRemove = await removeResponse.Content.ReadFromJsonAsync<List<ReactionSummaryDto>>();
        Assert.NotNull(afterRemove);
        var likeAfterRemove = Assert.Single(afterRemove!, r => r.ReactionType == ChessWeb.Domain.Entities.ArticleReactionType.Like);
        Assert.Equal(0, likeAfterRemove.Count);
        Assert.False(likeAfterRemove.UserReacted);
    }

    [Fact]
    public async Task ToggleReaction_RejectsUndefinedReactionType()
    {
        var client = _factory.CreateClient();
        var (author, _) = await RegisterAndLoginAsync(client);
        var created = await CreateArticleAsync(author);

        var response = await author.PostAsJsonAsync($"/api/articles/{created.Id}/reactions",
            new ToggleReactionRequest((ChessWeb.Domain.Entities.ArticleReactionType)999));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task GetComments_ReturnsPagedCommentsInCreationOrder_AndHidesUnpublishedArticles()
    {
        var (author, _) = await RegisterAndLoginAsync(_factory.CreateClient());
        var created = await CreateArticleAsync(author);
        for (var i = 1; i <= 3; i++)
        {
            Assert.Equal(HttpStatusCode.OK, (await author.PostAsJsonAsync($"/api/articles/{created.Id}/comments", new CreateCommentRequest($"Comment {i}"))).StatusCode);
        }

        var anonymous = _factory.CreateClient();
        var firstPage = await anonymous.GetFromJsonAsync<PagedResult<ArticleCommentDto>>($"/api/articles/{created.Id}/comments?page=1&pageSize=2");
        Assert.NotNull(firstPage);
        Assert.Equal(3, firstPage!.TotalCount);
        Assert.Equal(2, firstPage.TotalPages);
        Assert.Equal(new[] { "Comment 1", "Comment 2" }, firstPage.Items.Select(c => c.Content));
        Assert.All(firstPage.Items, c => Assert.False(c.CanEdit || c.CanDelete));

        var secondPage = await author.GetFromJsonAsync<PagedResult<ArticleCommentDto>>($"/api/articles/{created.Id}/comments?page=2&pageSize=2");
        var last = Assert.Single(secondPage!.Items);
        Assert.Equal("Comment 3", last.Content);
        Assert.True(last.CanEdit);
        Assert.True(last.CanDelete);

        var clamped = await anonymous.GetFromJsonAsync<PagedResult<ArticleCommentDto>>($"/api/articles/{created.Id}/comments?pageSize=500");
        Assert.Equal(50, clamped!.PageSize);

        var detail = await anonymous.GetFromJsonAsync<ArticleDto>($"/api/articles/{created.Id}");
        Assert.Equal(3, detail!.CommentsCount);

        await author.PutAsJsonAsync($"/api/articles/{created.Id}", new UpdateArticleRequest(created.Title, created.Content, null, null, null, false));
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/api/articles/{created.Id}/comments")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await author.GetAsync($"/api/articles/{created.Id}/comments")).StatusCode);
        await author.DeleteAsync($"/api/articles/{created.Id}");
    }

    [Fact]
    public async Task UpdateComment_OnlyCommentAuthorCanEdit()
    {
        var (author, _) = await RegisterAndLoginAsync(_factory.CreateClient());
        var created = await CreateArticleAsync(author);
        var (commenter, _) = await RegisterAndLoginAsync(_factory.CreateClient());
        var comment = await (await commenter.PostAsJsonAsync($"/api/articles/{created.Id}/comments", new CreateCommentRequest("Original"))).Content.ReadFromJsonAsync<ArticleCommentDto>();
        Assert.NotNull(comment);
        Assert.Null(comment!.UpdatedAt);

        var edit = await commenter.PutAsJsonAsync($"/api/articles/comments/{comment.Id}", new CreateCommentRequest("Edited"));
        Assert.Equal(HttpStatusCode.OK, edit.StatusCode);
        var edited = await edit.Content.ReadFromJsonAsync<ArticleCommentDto>();
        Assert.Equal("Edited", edited!.Content);
        Assert.NotNull(edited.UpdatedAt);

        Assert.Equal(HttpStatusCode.BadRequest, (await commenter.PutAsJsonAsync($"/api/articles/comments/{comment.Id}", new CreateCommentRequest(new string('x', 5001)))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await author.PutAsJsonAsync($"/api/articles/comments/{comment.Id}", new CreateCommentRequest("Article author edit"))).StatusCode);
        var admin = await CreateAuthenticatedClientAsync("admin@chessweb.local", "Admin123!#");
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PutAsJsonAsync($"/api/articles/comments/{comment.Id}", new CreateCommentRequest("Admin edit"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await commenter.PutAsJsonAsync($"/api/articles/comments/{Guid.NewGuid()}", new CreateCommentRequest("Missing"))).StatusCode);

        var adminView = await admin.GetFromJsonAsync<PagedResult<ArticleCommentDto>>($"/api/articles/{created.Id}/comments");
        var adminComment = Assert.Single(adminView!.Items);
        Assert.False(adminComment.CanEdit);
        Assert.True(adminComment.CanDelete);
    }

    [Fact]
    public async Task ToggleCommentReaction_AddsThenRemovesReaction()
    {
        var (author, _) = await RegisterAndLoginAsync(_factory.CreateClient());
        var created = await CreateArticleAsync(author);
        var comment = await (await author.PostAsJsonAsync($"/api/articles/{created.Id}/comments", new CreateCommentRequest("React to me"))).Content.ReadFromJsonAsync<ArticleCommentDto>();
        var (reactor, _) = await RegisterAndLoginAsync(_factory.CreateClient());

        var added = await (await reactor.PostAsJsonAsync($"/api/articles/comments/{comment!.Id}/reactions", new ToggleReactionRequest(ArticleReactionType.Heart))).Content.ReadFromJsonAsync<List<ReactionSummaryDto>>();
        var heart = Assert.Single(added!, r => r.ReactionType == ArticleReactionType.Heart);
        Assert.Equal(1, heart.Count);
        Assert.True(heart.UserReacted);

        var listed = await reactor.GetFromJsonAsync<PagedResult<ArticleCommentDto>>($"/api/articles/{created.Id}/comments");
        Assert.True(Assert.Single(listed!.Items).Reactions.Single(r => r.ReactionType == ArticleReactionType.Heart).UserReacted);

        var removed = await (await reactor.PostAsJsonAsync($"/api/articles/comments/{comment.Id}/reactions", new ToggleReactionRequest(ArticleReactionType.Heart))).Content.ReadFromJsonAsync<List<ReactionSummaryDto>>();
        var heartAfter = Assert.Single(removed!, r => r.ReactionType == ArticleReactionType.Heart);
        Assert.Equal(0, heartAfter.Count);
        Assert.False(heartAfter.UserReacted);

        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().PostAsJsonAsync($"/api/articles/comments/{comment.Id}/reactions", new ToggleReactionRequest(ArticleReactionType.Like))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await reactor.PostAsJsonAsync($"/api/articles/comments/{comment.Id}/reactions", new ToggleReactionRequest((ArticleReactionType)999))).StatusCode);
    }

    [Fact]
    public async Task CommentsLock_BlocksOtherUsers_ButArticleAuthorAndAdminCanStillPost()
    {
        var (author, _) = await RegisterAndLoginAsync(_factory.CreateClient());
        var created = await CreateArticleAsync(author);
        var (other, _) = await RegisterAndLoginAsync(_factory.CreateClient());
        var otherComment = await (await other.PostAsJsonAsync($"/api/articles/{created.Id}/comments", new CreateCommentRequest("Before lock"))).Content.ReadFromJsonAsync<ArticleCommentDto>();
        var admin = await CreateAuthenticatedClientAsync("admin@chessweb.local", "Admin123!#");

        Assert.Equal(HttpStatusCode.Forbidden, (await other.PutAsJsonAsync($"/api/articles/{created.Id}/comments-lock", new SetCommentsLockRequest(true))).StatusCode);
        var lockResponse = await author.PutAsJsonAsync($"/api/articles/{created.Id}/comments-lock", new SetCommentsLockRequest(true));
        Assert.Equal(HttpStatusCode.OK, lockResponse.StatusCode);
        Assert.True((await lockResponse.Content.ReadFromJsonAsync<CommentsLockDto>())!.CommentsLocked);
        Assert.True((await other.GetFromJsonAsync<ArticleDto>($"/api/articles/{created.Id}"))!.CommentsLocked);

        Assert.Equal(HttpStatusCode.Forbidden, (await other.PostAsJsonAsync($"/api/articles/{created.Id}/comments", new CreateCommentRequest("After lock"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await other.PutAsJsonAsync($"/api/articles/comments/{otherComment!.Id}", new CreateCommentRequest("Edit after lock"))).StatusCode);
        var otherView = await other.GetFromJsonAsync<PagedResult<ArticleCommentDto>>($"/api/articles/{created.Id}/comments");
        Assert.False(Assert.Single(otherView!.Items).CanEdit);

        Assert.Equal(HttpStatusCode.OK, (await author.PostAsJsonAsync($"/api/articles/{created.Id}/comments", new CreateCommentRequest("Author after lock"))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync($"/api/articles/{created.Id}/comments", new CreateCommentRequest("Admin after lock"))).StatusCode);

        var unlock = await admin.PutAsJsonAsync($"/api/articles/{created.Id}/comments-lock", new SetCommentsLockRequest(false));
        Assert.False((await unlock.Content.ReadFromJsonAsync<CommentsLockDto>())!.CommentsLocked);
        Assert.Equal(HttpStatusCode.OK, (await other.PostAsJsonAsync($"/api/articles/{created.Id}/comments", new CreateCommentRequest("After unlock"))).StatusCode);
    }

    [Fact]
    public async Task InlineUpload_IsPrivateUntilLinked_ThenRichArticleLinksIt()
    {
        var (author, _) = await RegisterAndLoginAsync(_factory.CreateClient());
        var upload = await UploadInlineAttachmentAsync(author);
        var anonymous = _factory.CreateClient();
        var (other, _) = await RegisterAndLoginAsync(_factory.CreateClient());

        Assert.Equal(HttpStatusCode.OK, (await author.GetAsync($"/api/articles/attachments/{upload.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/articles/attachments/{upload.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/api/articles/attachments/{upload.Id}")).StatusCode);

        var content = RichDoc(Paragraph("See the diagram"), ImageNode(upload.Id));
        var otherAttempt = await other.PostAsync("/api/articles", BuildCreateArticleForm("Stolen image", content, contentFormat: ArticleContentFormat.RichJson));
        Assert.Equal(HttpStatusCode.BadRequest, otherAttempt.StatusCode);

        var response = await author.PostAsync("/api/articles", BuildCreateArticleForm("Rich with image", content, contentFormat: ArticleContentFormat.RichJson));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var article = await response.Content.ReadFromJsonAsync<ArticleDto>();
        Assert.Equal(ArticleContentFormat.RichJson, article!.ContentFormat);
        Assert.Contains(article.Attachments, a => a.Id == upload.Id);
        Assert.Equal("See the diagram", article.Excerpt);

        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync($"/api/articles/attachments/{upload.Id}")).StatusCode);
        var reuseAttempt = await author.PostAsync("/api/articles", BuildCreateArticleForm("Reuse image", content, contentFormat: ArticleContentFormat.RichJson));
        Assert.Equal(HttpStatusCode.BadRequest, reuseAttempt.StatusCode);

        var update = await author.PutAsJsonAsync($"/api/articles/{article.Id}",
            new UpdateArticleRequest(article.Title, RichDoc(Paragraph("Image removed")), ContentFormat: ArticleContentFormat.RichJson));
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        var updated = await update.Content.ReadFromJsonAsync<ArticleDto>();
        Assert.Contains(updated!.Attachments, a => a.Id == upload.Id);

        await author.DeleteAsync($"/api/articles/{article.Id}");
    }

    [Fact]
    public async Task CreateArticle_RejectsInvalidRichContent()
    {
        var (author, _) = await RegisterAndLoginAsync(_factory.CreateClient());
        var script = RichDoc("""{"type":"script","content":[{"type":"text","text":"x"}]}""");
        Assert.Equal(HttpStatusCode.BadRequest, (await author.PostAsync("/api/articles", BuildCreateArticleForm("Bad rich", script, contentFormat: ArticleContentFormat.RichJson))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await author.PostAsync("/api/articles", BuildCreateArticleForm("Bad rich", "not json", contentFormat: ArticleContentFormat.RichJson))).StatusCode);
        var missingImage = RichDoc(ImageNode(Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.BadRequest, (await author.PostAsync("/api/articles", BuildCreateArticleForm("Bad rich", missingImage, contentFormat: ArticleContentFormat.RichJson))).StatusCode);
    }

    [Fact]
    public async Task SearchMatchesExtractedTextOfRichArticle()
    {
        var (author, _) = await RegisterAndLoginAsync(_factory.CreateClient());
        var keyword = $"zugzwang{Guid.NewGuid():N}";
        var response = await author.PostAsync("/api/articles", BuildCreateArticleForm($"Rich search {Guid.NewGuid():N}", RichDoc(Paragraph($"A lesson on {keyword}")), contentFormat: ArticleContentFormat.RichJson));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var article = await response.Content.ReadFromJsonAsync<ArticleDto>();

        var result = await _factory.CreateClient().GetFromJsonAsync<PagedResult<ArticleDto>>($"/api/articles?search={keyword}");
        var found = Assert.Single(result!.Items);
        Assert.Equal(article!.Id, found.Id);
        Assert.Equal($"A lesson on {keyword}", found.Excerpt);
        Assert.Null(found.Collection);

        await author.DeleteAsync($"/api/articles/{article.Id}");
    }

    [Fact]
    public async Task GameCollectionLink_RequiresOwnership_IsReturnedInDetail_AndIsClearedOnCollectionDelete()
    {
        var (author, _) = await RegisterAndLoginAsync(_factory.CreateClient());
        var (other, _) = await RegisterAndLoginAsync(_factory.CreateClient());
        var collectionRequest = new CreateGameCollectionRequest("Linked games", new List<CreateGameCollectionGameRequest> { new("1. e4 e5", "Game A"), new("1. d4 d5", "Game B") });
        var otherCollection = await (await other.PostAsJsonAsync("/api/gamecollections", collectionRequest)).Content.ReadFromJsonAsync<GameCollectionDetailDto>();
        var ownCollection = await (await author.PostAsJsonAsync("/api/gamecollections", collectionRequest)).Content.ReadFromJsonAsync<GameCollectionDetailDto>();

        Assert.Equal(HttpStatusCode.Forbidden, (await author.PostAsync("/api/articles", BuildCreateArticleForm("Foreign collection", "Content", gameCollectionId: otherCollection!.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await author.PostAsync("/api/articles", BuildCreateArticleForm("Missing collection", "Content", gameCollectionId: Guid.NewGuid()))).StatusCode);

        var response = await author.PostAsync("/api/articles", BuildCreateArticleForm("Own collection", "Content", gameCollectionId: ownCollection!.Id));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var article = await response.Content.ReadFromJsonAsync<ArticleDto>();

        var detail = await _factory.CreateClient().GetFromJsonAsync<ArticleDto>($"/api/articles/{article!.Id}");
        Assert.Equal(ownCollection.Id, detail!.GameCollectionId);
        Assert.Equal(new[] { "Game A", "Game B" }, detail.Collection!.Games.Select(g => g.Label));
        Assert.Equal(ownCollection.Games.Select(g => g.Id), detail.Collection.Games.Select(g => g.Id));

        var foreignUpdate = await author.PutAsJsonAsync($"/api/articles/{article.Id}", new UpdateArticleRequest("Own collection", "Content", GameCollectionId: otherCollection.Id));
        Assert.Equal(HttpStatusCode.Forbidden, foreignUpdate.StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await author.DeleteAsync($"/api/gamecollections/{ownCollection.Id}")).StatusCode);
        var afterDelete = await author.GetFromJsonAsync<ArticleDto>($"/api/articles/{article.Id}");
        Assert.Null(afterDelete!.GameCollectionId);
        Assert.Null(afterDelete.Collection);

        await author.DeleteAsync($"/api/articles/{article.Id}");
        await other.DeleteAsync($"/api/gamecollections/{otherCollection.Id}");
    }
}

using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
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

    private static async Task<(HttpClient client, UserDto user)> RegisterAndLoginAsync(HttpClient anonymousFactoryClient, string? fullName = null)
    {
        fullName ??= $"Test Author {Guid.NewGuid():N}";
        var registerResponse = await anonymousFactoryClient.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            $"test-{Guid.NewGuid():N}@chessweb.local", "Player123!#", fullName, null, null, null));
        Assert.Equal(HttpStatusCode.OK, registerResponse.StatusCode);
        var auth = await registerResponse.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(auth);
        anonymousFactoryClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.Token);
        return (anonymousFactoryClient, auth.User);
    }

    private static MultipartFormDataContent BuildCreateArticleForm(string title, string content, string? summary = null, string? pgnData = null, string? fenData = null)
    {
        var form = new MultipartFormDataContent
        {
            { new StringContent(title), "Title" },
            { new StringContent(content), "Content" }
        };
        if (summary != null) form.Add(new StringContent(summary), "Summary");
        if (pgnData != null) form.Add(new StringContent(pgnData), "PgnData");
        if (fenData != null) form.Add(new StringContent(fenData), "FenData");
        return form;
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
}

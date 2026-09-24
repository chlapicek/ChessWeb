using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using ChessWeb.DTOs;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace ChessWeb.Tests.Integration;

public class GameCollectionsControllerTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public GameCollectionsControllerTests(WebApplicationFactory<Program> factory)
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

    private static CreateGameCollectionRequest SampleRequest(string name = "Match Games", int gameCount = 2) =>
        new(name, Enumerable.Range(1, gameCount)
            .Select(i => new CreateGameCollectionGameRequest($"1. e4 e5 2. Nf3 Nc6 {i}-{i}", $"Game {i}"))
            .ToList());

    [Fact]
    public async Task AnonymousUser_CannotAccessCollections()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/gamecollections");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task CreateListGetUpdateDelete_FullLifecycle_WorksForOwner()
    {
        var client = await CreateAuthenticatedClientAsync("anna.novakova@chessweb.local", "Player123!#");

        var createResponse = await client.PostAsJsonAsync("/api/gamecollections", SampleRequest("Championship Round 1"));
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        var created = await createResponse.Content.ReadFromJsonAsync<GameCollectionDetailDto>();
        Assert.NotNull(created);
        Assert.Equal(2, created!.Games.Count);
        Assert.Equal(0, created.Games[0].OrderIndex);
        Assert.Equal(1, created.Games[1].OrderIndex);

        var listResponse = await client.GetAsync("/api/gamecollections");
        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        var list = await listResponse.Content.ReadFromJsonAsync<List<GameCollectionSummaryDto>>();
        Assert.Contains(list!, c => c.Id == created.Id && c.GameCount == 2);

        var getResponse = await client.GetAsync($"/api/gamecollections/{created.Id}");
        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);

        var updateRequest = new UpdateGameCollectionRequest("Championship Round 1 (Updated)", new List<CreateGameCollectionGameRequest>
        {
            new("1. d4 d5 2. c4 e6", "Game 1 replay")
        });
        var updateResponse = await client.PutAsJsonAsync($"/api/gamecollections/{created.Id}", updateRequest);
        Assert.Equal(HttpStatusCode.OK, updateResponse.StatusCode);
        var updated = await updateResponse.Content.ReadFromJsonAsync<GameCollectionDetailDto>();
        Assert.NotNull(updated);
        Assert.Single(updated!.Games);
        Assert.Equal("Championship Round 1 (Updated)", updated.Name);

        var deleteResponse = await client.DeleteAsync($"/api/gamecollections/{created.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);

        var getAfterDelete = await client.GetAsync($"/api/gamecollections/{created.Id}");
        Assert.Equal(HttpStatusCode.NotFound, getAfterDelete.StatusCode);
    }

    [Fact]
    public async Task NonOwner_CannotAccessOrModifyOthersCollection_ButAdminCan()
    {
        var owner = await CreateAuthenticatedClientAsync("petr.svoboda@chessweb.local", "Player123!#");
        var createResponse = await owner.PostAsJsonAsync("/api/gamecollections", SampleRequest("Petr's Private Games"));
        var created = await createResponse.Content.ReadFromJsonAsync<GameCollectionDetailDto>();
        Assert.NotNull(created);

        var other = await CreateAuthenticatedClientAsync("lucie.dvorakova@chessweb.local", "Player123!#");
        var forbiddenGet = await other.GetAsync($"/api/gamecollections/{created!.Id}");
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenGet.StatusCode);

        var forbiddenUpdate = await other.PutAsJsonAsync($"/api/gamecollections/{created.Id}", new UpdateGameCollectionRequest("Hijacked", new List<CreateGameCollectionGameRequest> { new("1. e4 e5", null) }));
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenUpdate.StatusCode);

        var forbiddenDelete = await other.DeleteAsync($"/api/gamecollections/{created.Id}");
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenDelete.StatusCode);

        var forbiddenExport = await other.GetAsync($"/api/gamecollections/{created.Id}/export");
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenExport.StatusCode);

        var admin = await CreateAuthenticatedClientAsync("admin@chessweb.local", "Admin123!#");
        var adminGet = await admin.GetAsync($"/api/gamecollections/{created.Id}");
        Assert.Equal(HttpStatusCode.OK, adminGet.StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task CreateCollection_RejectsEmptyName(string name)
    {
        var client = await CreateAuthenticatedClientAsync("jan.cerny@chessweb.local", "Player123!#");
        var response = await client.PostAsJsonAsync("/api/gamecollections", SampleRequest(name));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CreateCollection_RejectsEmptyGamesList()
    {
        var client = await CreateAuthenticatedClientAsync("eva.prochazkova@chessweb.local", "Player123!#");
        var response = await client.PostAsJsonAsync("/api/gamecollections", new CreateGameCollectionRequest("No games", new List<CreateGameCollectionGameRequest>()));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CreateCollection_RejectsOversizedPgn()
    {
        var client = await CreateAuthenticatedClientAsync("tomas.kucera@chessweb.local", "Player123!#");
        var oversizedPgn = new string('e', 15001);
        var response = await client.PostAsJsonAsync("/api/gamecollections", new CreateGameCollectionRequest("Oversized", new List<CreateGameCollectionGameRequest> { new(oversizedPgn, null) }));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CreateCollection_RejectsMoreThan100Games()
    {
        var client = await CreateAuthenticatedClientAsync("michaela.vesela@chessweb.local", "Player123!#");
        var games = Enumerable.Range(1, 101).Select(i => new CreateGameCollectionGameRequest("1. e4 e5", $"Game {i}")).ToList();
        var response = await client.PostAsJsonAsync("/api/gamecollections", new CreateGameCollectionRequest("Too many", games));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ExportCollection_ProducesWellFormedMultiGamePgn()
    {
        var client = await CreateAuthenticatedClientAsync("ondrej.horak@chessweb.local", "Player123!#");
        var createResponse = await client.PostAsJsonAsync("/api/gamecollections", SampleRequest("Export Test", gameCount: 3));
        var created = await createResponse.Content.ReadFromJsonAsync<GameCollectionDetailDto>();
        Assert.NotNull(created);

        var exportResponse = await client.GetAsync($"/api/gamecollections/{created!.Id}/export");
        Assert.Equal(HttpStatusCode.OK, exportResponse.StatusCode);
        Assert.Equal("application/x-chess-pgn", exportResponse.Content.Headers.ContentType?.MediaType);
        Assert.Contains("attachment", exportResponse.Content.Headers.ContentDisposition?.DispositionType);
        Assert.Contains(".pgn", exportResponse.Content.Headers.ContentDisposition?.FileName);

        var pgnText = await exportResponse.Content.ReadAsStringAsync();
        var games = pgnText.Split("\n\n");
        Assert.Equal(3, games.Length);
        Assert.All(games, game => Assert.Contains("e4 e5", game));
    }
}

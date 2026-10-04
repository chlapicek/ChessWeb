using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using ChessWeb.Domain.Entities;
using ChessWeb.DTOs;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace ChessWeb.Tests.Integration;

public class PartnersControllerTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public PartnersControllerTests(WebApplicationFactory<Program> factory)
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

    private static Partner SamplePartner(string? name = null) => new()
    {
        Name = name ?? $"Partner {Guid.NewGuid():N}",
        Url = "https://example.com",
        LogoUrl = "https://example.com/logo.png"
    };

    [Fact]
    public async Task AnonymousUser_CanListActivePartners()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/partners");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var partners = await response.Content.ReadFromJsonAsync<List<Partner>>();
        Assert.NotNull(partners);
        Assert.All(partners!, p => Assert.True(p.IsActive));
    }

    [Fact]
    public async Task AnonymousUser_CannotAddPartner()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/partners", SamplePartner());
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task RegisteredUser_CannotAddPartner()
    {
        var client = await CreateAuthenticatedClientAsync("anna.novakova@chessweb.local", "Player123!#");
        var response = await client.PostAsJsonAsync("/api/partners", SamplePartner());
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Admin_CanCreateListAndDeletePartner()
    {
        var admin = await CreateAuthenticatedClientAsync("admin@chessweb.local", "Admin123!#");

        var createResponse = await admin.PostAsJsonAsync("/api/partners", SamplePartner("Test Chess Club"));
        Assert.Equal(HttpStatusCode.OK, createResponse.StatusCode);
        var created = await createResponse.Content.ReadFromJsonAsync<Partner>();
        Assert.NotNull(created);
        Assert.Equal("Test Chess Club", created!.Name);

        var listResponse = await _factory.CreateClient().GetAsync("/api/partners");
        var partners = await listResponse.Content.ReadFromJsonAsync<List<Partner>>();
        Assert.Contains(partners!, p => p.Id == created.Id);

        var deleteResponse = await admin.DeleteAsync($"/api/partners/{created.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);

        var deleteAgain = await admin.DeleteAsync($"/api/partners/{created.Id}");
        Assert.Equal(HttpStatusCode.NotFound, deleteAgain.StatusCode);
    }

    [Fact]
    public async Task Admin_CreatePartner_RejectsInvalidUrl()
    {
        var admin = await CreateAuthenticatedClientAsync("admin@chessweb.local", "Admin123!#");
        var invalid = SamplePartner();
        invalid.Url = "not-a-url";
        var response = await admin.PostAsJsonAsync("/api/partners", invalid);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private static MultipartFormDataContent BuildUploadForm(string name, string url, byte[] fileBytes, string fileName, string contentType)
    {
        var form = new MultipartFormDataContent
        {
            { new StringContent(name), "name" },
            { new StringContent(url), "url" },
            { new StringContent("true"), "isActive" }
        };
        var fileContent = new ByteArrayContent(fileBytes);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(fileContent, "logoFile", fileName);
        return form;
    }

    [Fact]
    public async Task Admin_CanUploadPartnerLogo_AndRetrieveIt()
    {
        var admin = await CreateAuthenticatedClientAsync("admin@chessweb.local", "Admin123!#");
        var form = BuildUploadForm("Logo Partner", "https://example.com", ChessWeb.Tests.TestImages.Png(), "logo.png", "image/png");

        var uploadResponse = await admin.PostAsync("/api/partners/upload", form);
        Assert.Equal(HttpStatusCode.OK, uploadResponse.StatusCode);
        var partner = await uploadResponse.Content.ReadFromJsonAsync<Partner>();
        Assert.NotNull(partner);
        Assert.NotEmpty(partner!.LogoFileName);

        var logoResponse = await _factory.CreateClient().GetAsync($"/api/partners/{partner.Id}/logo");
        Assert.Equal(HttpStatusCode.OK, logoResponse.StatusCode);
    }

    [Fact]
    public async Task Admin_UploadPartnerLogo_RejectsDisallowedFileType()
    {
        var admin = await CreateAuthenticatedClientAsync("admin@chessweb.local", "Admin123!#");
        var form = BuildUploadForm("Bad Logo Partner", "https://example.com",
            Encoding.UTF8.GetBytes("#!/bin/sh\necho hi"), "logo.exe", "application/octet-stream");

        var uploadResponse = await admin.PostAsync("/api/partners/upload", form);
        Assert.Equal(HttpStatusCode.BadRequest, uploadResponse.StatusCode);
    }

    [Fact]
    public async Task Admin_UploadPartnerLogo_RequiresLogoFile()
    {
        var admin = await CreateAuthenticatedClientAsync("admin@chessweb.local", "Admin123!#");
        var form = new MultipartFormDataContent
        {
            { new StringContent("No Logo Partner"), "name" },
            { new StringContent("https://example.com"), "url" },
            { new StringContent("true"), "isActive" }
        };

        var response = await admin.PostAsync("/api/partners/upload", form);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Admin_CanUpdatePartner_RejectsDisallowedFileTypeOnReplacementLogo()
    {
        var admin = await CreateAuthenticatedClientAsync("admin@chessweb.local", "Admin123!#");
        var createResponse = await admin.PostAsJsonAsync("/api/partners", SamplePartner("Update Target Partner"));
        var created = await createResponse.Content.ReadFromJsonAsync<Partner>();
        Assert.NotNull(created);

        var updateForm = new MultipartFormDataContent
        {
            { new StringContent("Updated Name"), "name" },
            { new StringContent("https://example.com/updated"), "url" },
            { new StringContent("true"), "isActive" }
        };
        var updateResponse = await admin.PutAsync($"/api/partners/{created!.Id}", updateForm);
        Assert.Equal(HttpStatusCode.OK, updateResponse.StatusCode);
        var updated = await updateResponse.Content.ReadFromJsonAsync<Partner>();
        Assert.Equal("Updated Name", updated!.Name);

        var badUpdateForm = BuildUploadForm("Updated Name", "https://example.com/updated",
            Encoding.UTF8.GetBytes("bad content"), "malware.exe", "application/octet-stream");
        var badUpdateResponse = await admin.PutAsync($"/api/partners/{created.Id}", badUpdateForm);
        Assert.Equal(HttpStatusCode.BadRequest, badUpdateResponse.StatusCode);
    }
}

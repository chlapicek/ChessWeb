using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http.HttpResults;

namespace ChessWeb.Backend
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateSlimBuilder(args);

            builder.WebHost.UseKestrelHttpsConfiguration();

            // Allow frontend to call backend during development.
            // For production, replace AllowAnyOrigin with specific .WithOrigins("https://your-frontend")
            builder.Services.AddCors(options =>
            {
                options.AddPolicy("AllowFrontend", policy =>
                {
                    policy.AllowAnyOrigin()
                          .AllowAnyMethod()
                          .AllowAnyHeader();
                });
            });

            builder.Services.ConfigureHttpJsonOptions(options =>
            {
                options.SerializerOptions.TypeInfoResolverChain.Insert(0, AppJsonSerializerContext.Default);
            });

            // Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
            builder.Services.AddOpenApi();

            var app = builder.Build();

            // Use CORS before mapping endpoints
            app.UseCors("AllowFrontend");

            if (app.Environment.IsDevelopment())
            {
                app.MapOpenApi();
            }

            // Simple root handler so GET / doesn't 404
            app.MapGet("/", () => Results.Text("ChessWeb Backend. Use /todos to get sample data.", "text/plain"));

            Todo[] sampleTodos =
            [
                new(1, "Walk the dog"),
                new(2, "Do the dishes", DateOnly.FromDateTime(DateTime.Now)),
                new(3, "Do the laundry", DateOnly.FromDateTime(DateTime.Now.AddDays(1))),
                new(4, "Clean the bathroom"),
                new(5, "Clean the car", DateOnly.FromDateTime(DateTime.Now.AddDays(2)))
            ];

            var todosApi = app.MapGroup("/todos");
            todosApi.MapGet("/", () => sampleTodos)
                    .WithName("GetTodos");

            todosApi.MapGet("/{id}", Results<Ok<Todo>, NotFound> (int id) =>
                sampleTodos.FirstOrDefault(a => a.Id == id) is { } todo
                    ? TypedResults.Ok(todo)
                    : TypedResults.NotFound())
                .WithName("GetTodoById");

            app.Run();
        }
    }

    public record Todo(int Id, string? Title, DateOnly? DueBy = null, bool IsComplete = false);

    [JsonSerializable(typeof(Todo[]))]
    internal partial class AppJsonSerializerContext : JsonSerializerContext
    {

    }
}

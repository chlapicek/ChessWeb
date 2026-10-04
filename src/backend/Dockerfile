# =========================
# Build stage
# =========================
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Restore dependencies
COPY ChessWeb.csproj .
RUN dotnet restore "ChessWeb.csproj"

# Build and publish
COPY . .
RUN dotnet publish "ChessWeb.csproj" -c Release -o /app/publish /p:UseAppHost=false

# =========================
# Runtime stage
# =========================
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

COPY --from=build /app/publish .

# Expose HTTP port
EXPOSE 8080

ENTRYPOINT ["dotnet", "ChessWeb.dll"]

# =========================
# Build stage
# =========================
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Native AOT prerequisites
RUN apt-get update && \
    apt-get install -y build-essential clang && \
    rm -rf /var/lib/apt/lists/*

# Restore
COPY ChessWeb.csproj .
RUN dotnet restore "ChessWeb.csproj"

# Build
COPY . .
RUN dotnet publish "ChessWeb.csproj" -c Release -r linux-x64 -o /app/publish

# =========================
# Runtime stage
# =========================
FROM mcr.microsoft.com/dotnet/runtime-deps:10.0 AS runtime
WORKDIR /app

COPY --from=build /app/publish .

EXPOSE 8080

# Run native executable
ENTRYPOINT ["./ChessWeb"]

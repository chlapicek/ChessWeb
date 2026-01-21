# Multi-stage Dockerfile for .NET 10 backend
ARG LAUNCHING_FROM_VS
ARG FINAL_BASE_IMAGE=${LAUNCHING_FROM_VS:+aotdebug}

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Install native AOT prerequisites so the publish/linker can run:
# clang (or gcc) and zlib development headers are required for Native AOT.
RUN apt-get update \
    && apt-get install -y --no-install-recommends clang zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy only the project file first to leverage Docker cache.
# This assumes ChessWeb.csproj is next to this Dockerfile (src/backend/ChessWeb.csproj).
COPY ["ChessWeb.csproj", "./"]
RUN dotnet restore "ChessWeb.csproj"

# Copy the rest of the source and build.
COPY . .
RUN dotnet build "ChessWeb.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "ChessWeb.csproj" -c Release -o /app/publish /p:UseAppHost=true

# Optional debug stage (used by Visual Studio fast-debug scenarios)
FROM base AS aotdebug
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends gdb

# Runtime image
FROM ${FINAL_BASE_IMAGE:-mcr.microsoft.com/dotnet/runtime-deps:10.0} AS final
WORKDIR /app
EXPOSE 8080
COPY --from=publish /app/publish .
ENTRYPOINT ["./ChessWeb"]
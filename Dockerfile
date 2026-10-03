# ---- web -------------------------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /src/web
COPY web/package*.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build   # writes to ../src/Tacitly.Api/wwwroot

# ---- api -------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
WORKDIR /src
COPY src/Tacitly.Api/Tacitly.Api.csproj src/Tacitly.Api/
RUN dotnet restore src/Tacitly.Api/Tacitly.Api.csproj
COPY db/ db/
COPY src/ src/
COPY --from=web /src/src/Tacitly.Api/wwwroot src/Tacitly.Api/wwwroot
RUN dotnet publish src/Tacitly.Api/Tacitly.Api.csproj -c Release -o /app --no-restore

# ---- runtime ---------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=api /app .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
USER app
ENTRYPOINT ["dotnet", "Tacitly.Api.dll"]

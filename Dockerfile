# ---- web -------------------------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /src/web
COPY web/package*.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build   # writes to ../src/InsideOut.Api/wwwroot

# ---- api -------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
WORKDIR /src
COPY src/InsideOut.Api/InsideOut.Api.csproj src/InsideOut.Api/
RUN dotnet restore src/InsideOut.Api/InsideOut.Api.csproj
COPY db/ db/
COPY src/ src/
COPY --from=web /src/src/InsideOut.Api/wwwroot src/InsideOut.Api/wwwroot
RUN dotnet publish src/InsideOut.Api/InsideOut.Api.csproj -c Release -o /app --no-restore

# ---- runtime ---------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=api /app .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
USER app
ENTRYPOINT ["dotnet", "InsideOut.Api.dll"]

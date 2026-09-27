using System.Data;
using ChessWeb.Domain.Entities;
using ChessWeb.Domain.Enums;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace ChessWeb.Data;

public static class DbInitializer
{
    public static async Task SeedAsync(IServiceProvider serviceProvider)
    {
        using var scope = serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<ApplicationRole>>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        static void EnsureIdentitySuccess(IdentityResult result, string operation)
        {
            if (!result.Succeeded)
            {
                var errors = string.Join("; ", result.Errors.Select(error => error.Description));
                throw new InvalidOperationException($"{operation} failed: {errors}");
            }
        }

        if (context.Database.IsSqlite())
        {
            var connection = context.Database.GetDbConnection();
            if (connection.State != ConnectionState.Open)
            {
                await connection.OpenAsync();
            }

            var existingTables = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            using (var tableCheck = connection.CreateCommand())
            {
                tableCheck.CommandText = "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';";
                using var reader = await tableCheck.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    existingTables.Add(reader.GetString(0));
                }
            }

            var requiredTables = new[]
            {
                "AspNetRoles",
                "AspNetUsers",
                "AspNetUserRoles",
                "AspNetUserClaims",
                "AspNetUserLogins",
                "AspNetUserTokens",
                "AspNetRoleClaims",
                "Partners"
            };

            var missingRequiredTables = requiredTables.Where(t => !existingTables.Contains(t)).ToArray();
            if (missingRequiredTables.Length > 0)
            {
                if (connection.State == ConnectionState.Open)
                {
                    await connection.CloseAsync();
                }

                var dbFilePath = context.Database.GetDbConnection().Database;
                if (!string.IsNullOrWhiteSpace(dbFilePath) && File.Exists(dbFilePath))
                {
                    File.Delete(dbFilePath);
                }
            }
            else
            {
                await context.Database.ExecuteSqlRawAsync(
                    "CREATE TABLE IF NOT EXISTS \"Partners\" (\"Id\" TEXT NOT NULL CONSTRAINT \"PK_Partners\" PRIMARY KEY, \"Name\" TEXT NOT NULL, \"Url\" TEXT NOT NULL, \"LogoUrl\" TEXT NOT NULL, \"LogoFileName\" TEXT NOT NULL DEFAULT '', \"IsActive\" INTEGER NOT NULL, \"DisplayOrder\" INTEGER NOT NULL DEFAULT 0, \"CreatedAt\" TEXT NOT NULL);");

                using var command = connection.CreateCommand();
                command.CommandText = "PRAGMA table_info('Partners');";
                using var partnerReader = await command.ExecuteReaderAsync();
                var columns = new HashSet<string>();
                while (await partnerReader.ReadAsync())
                {
                    columns.Add(partnerReader.GetString(1));
                }

                if (!columns.Contains("LogoFileName"))
                {
                    await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Partners\" ADD COLUMN \"LogoFileName\" TEXT NOT NULL DEFAULT ''; ");
                }

                if (!columns.Contains("DisplayOrder"))
                {
                    await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Partners\" ADD COLUMN \"DisplayOrder\" INTEGER NOT NULL DEFAULT 0;");
                }

                await context.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS \"Teams\" (\"Id\" TEXT NOT NULL CONSTRAINT \"PK_Teams\" PRIMARY KEY, \"Name\" TEXT NOT NULL, \"CreatedAt\" TEXT NOT NULL);");
                await context.Database.ExecuteSqlRawAsync("CREATE UNIQUE INDEX IF NOT EXISTS \"IX_Teams_Name\" ON \"Teams\" (\"Name\");");
                using (var teamColumnsCommand = connection.CreateCommand())
                {
                    teamColumnsCommand.CommandText = "PRAGMA table_info('Teams');";
                    using var teamColumnsReader = await teamColumnsCommand.ExecuteReaderAsync();
                    var teamColumns = new HashSet<string>();
                    while (await teamColumnsReader.ReadAsync()) teamColumns.Add(teamColumnsReader.GetString(1));
                    if (!teamColumns.Contains("CaptainUserId")) await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Teams\" ADD COLUMN \"CaptainUserId\" TEXT NULL;");
                    if (!teamColumns.Contains("SeasonStartDate")) await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Teams\" ADD COLUMN \"SeasonStartDate\" TEXT NULL;");
                    if (!teamColumns.Contains("SeasonEndDate")) await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Teams\" ADD COLUMN \"SeasonEndDate\" TEXT NULL;");
                }
                await context.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS \"TeamMemberships\" (\"TeamId\" TEXT NOT NULL, \"UserId\" TEXT NOT NULL, \"CreatedAt\" TEXT NOT NULL, CONSTRAINT \"PK_TeamMemberships\" PRIMARY KEY (\"TeamId\", \"UserId\"), CONSTRAINT \"FK_TeamMemberships_Teams_TeamId\" FOREIGN KEY (\"TeamId\") REFERENCES \"Teams\" (\"Id\") ON DELETE CASCADE, CONSTRAINT \"FK_TeamMemberships_AspNetUsers_UserId\" FOREIGN KEY (\"UserId\") REFERENCES \"AspNetUsers\" (\"Id\") ON DELETE CASCADE);");
                await context.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS \"IX_TeamMemberships_UserId\" ON \"TeamMemberships\" (\"UserId\");");
                await context.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS \"Competitions\" (\"Id\" TEXT NOT NULL CONSTRAINT \"PK_Competitions\" PRIMARY KEY, \"Name\" TEXT NOT NULL, \"Season\" TEXT NOT NULL, \"League\" TEXT NOT NULL, \"Venue\" TEXT NOT NULL, \"StartDate\" TEXT NOT NULL, \"EndDate\" TEXT NOT NULL, \"TeamId\" TEXT NULL, \"CaptainUserId\" TEXT NULL, CONSTRAINT \"FK_Competitions_Teams_TeamId\" FOREIGN KEY (\"TeamId\") REFERENCES \"Teams\" (\"Id\") ON DELETE SET NULL, CONSTRAINT \"FK_Competitions_AspNetUsers_CaptainUserId\" FOREIGN KEY (\"CaptainUserId\") REFERENCES \"AspNetUsers\" (\"Id\") ON DELETE SET NULL);");
                await context.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS \"TeamAvailabilityDates\" (\"Id\" TEXT NOT NULL CONSTRAINT \"PK_TeamAvailabilityDates\" PRIMARY KEY, \"TeamId\" TEXT NOT NULL, \"RoundNumber\" INTEGER NOT NULL, \"MatchDate\" TEXT NOT NULL, \"OpponentTeam\" TEXT NOT NULL, \"Location\" TEXT NOT NULL, \"IsHomeMatch\" INTEGER NOT NULL, \"CreatedAt\" TEXT NOT NULL, CONSTRAINT \"FK_TeamAvailabilityDates_Teams_TeamId\" FOREIGN KEY (\"TeamId\") REFERENCES \"Teams\" (\"Id\") ON DELETE CASCADE);");
                await context.Database.ExecuteSqlRawAsync("CREATE UNIQUE INDEX IF NOT EXISTS \"IX_TeamAvailabilityDates_TeamId_MatchDate\" ON \"TeamAvailabilityDates\" (\"TeamId\", \"MatchDate\");");
                await context.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS \"TeamAvailabilityPlayers\" (\"Id\" TEXT NOT NULL CONSTRAINT \"PK_TeamAvailabilityPlayers\" PRIMARY KEY, \"TeamId\" TEXT NOT NULL, \"PlayerUserId\" TEXT NULL, \"PlayerName\" TEXT NOT NULL, \"PlayerRating\" TEXT NULL, \"CreatedAt\" TEXT NOT NULL, CONSTRAINT \"FK_TeamAvailabilityPlayers_Teams_TeamId\" FOREIGN KEY (\"TeamId\") REFERENCES \"Teams\" (\"Id\") ON DELETE CASCADE, CONSTRAINT \"FK_TeamAvailabilityPlayers_AspNetUsers_PlayerUserId\" FOREIGN KEY (\"PlayerUserId\") REFERENCES \"AspNetUsers\" (\"Id\") ON DELETE SET NULL);");
                await context.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS \"IX_TeamAvailabilityPlayers_TeamId_PlayerUserId\" ON \"TeamAvailabilityPlayers\" (\"TeamId\", \"PlayerUserId\");");
                using (var playerColumnsCommand = connection.CreateCommand())
                {
                    playerColumnsCommand.CommandText = "PRAGMA table_info('TeamAvailabilityPlayers');";
                    using var playerColumnsReader = await playerColumnsCommand.ExecuteReaderAsync();
                    var playerColumns = new HashSet<string>();
                    while (await playerColumnsReader.ReadAsync()) playerColumns.Add(playerColumnsReader.GetString(1));
                    if (!playerColumns.Contains("IsZaklad")) await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"TeamAvailabilityPlayers\" ADD COLUMN \"IsZaklad\" INTEGER NOT NULL DEFAULT 0;");
                    if (!playerColumns.Contains("Tag")) await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"TeamAvailabilityPlayers\" ADD COLUMN \"Tag\" INTEGER NOT NULL DEFAULT 0;");
                }
                await context.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS \"TeamAvailabilityEntries\" (\"Id\" TEXT NOT NULL CONSTRAINT \"PK_TeamAvailabilityEntries\" PRIMARY KEY, \"TeamId\" TEXT NOT NULL, \"PlayerUserId\" TEXT NULL, \"PlayerName\" TEXT NOT NULL, \"PlayerRating\" TEXT NULL, \"RoundNumber\" INTEGER NOT NULL, \"MatchDate\" TEXT NOT NULL, \"OpponentTeam\" TEXT NOT NULL, \"Location\" TEXT NOT NULL, \"IsHomeMatch\" INTEGER NOT NULL, \"Status\" INTEGER NOT NULL, \"IsDriver\" INTEGER NOT NULL, \"Notes\" TEXT NULL, \"UpdatedAt\" TEXT NOT NULL, CONSTRAINT \"FK_TeamAvailabilityEntries_Teams_TeamId\" FOREIGN KEY (\"TeamId\") REFERENCES \"Teams\" (\"Id\") ON DELETE RESTRICT, CONSTRAINT \"FK_TeamAvailabilityEntries_AspNetUsers_PlayerUserId\" FOREIGN KEY (\"PlayerUserId\") REFERENCES \"AspNetUsers\" (\"Id\") ON DELETE SET NULL);");
                using (var availabilityColumnsCommand = connection.CreateCommand())
                {
                    availabilityColumnsCommand.CommandText = "PRAGMA table_info('TeamAvailabilityEntries');";
                    using var availabilityColumnsReader = await availabilityColumnsCommand.ExecuteReaderAsync();
                    var availabilityColumns = new HashSet<string>();
                    while (await availabilityColumnsReader.ReadAsync()) availabilityColumns.Add(availabilityColumnsReader.GetString(1));
                    if (!availabilityColumns.Contains("TeamId")) await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"TeamAvailabilityEntries\" ADD COLUMN \"TeamId\" TEXT NULL;");
                }
                await context.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS \"GameCollections\" (\"Id\" TEXT NOT NULL CONSTRAINT \"PK_GameCollections\" PRIMARY KEY, \"Name\" TEXT NOT NULL, \"CreatedByUserId\" TEXT NOT NULL, \"CreatedAt\" TEXT NOT NULL, \"UpdatedAt\" TEXT NOT NULL, CONSTRAINT \"FK_GameCollections_AspNetUsers_CreatedByUserId\" FOREIGN KEY (\"CreatedByUserId\") REFERENCES \"AspNetUsers\" (\"Id\") ON DELETE RESTRICT);");
                await context.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS \"GameCollectionGames\" (\"Id\" TEXT NOT NULL CONSTRAINT \"PK_GameCollectionGames\" PRIMARY KEY, \"GameCollectionId\" TEXT NOT NULL, \"OrderIndex\" INTEGER NOT NULL, \"Pgn\" TEXT NOT NULL, \"Label\" TEXT NULL, CONSTRAINT \"FK_GameCollectionGames_GameCollections_GameCollectionId\" FOREIGN KEY (\"GameCollectionId\") REFERENCES \"GameCollections\" (\"Id\") ON DELETE CASCADE);");
                await context.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS \"IX_GameCollectionGames_GameCollectionId_OrderIndex\" ON \"GameCollectionGames\" (\"GameCollectionId\", \"OrderIndex\");");
                await context.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS \"LoggingSettings\" (\"Id\" TEXT NOT NULL CONSTRAINT \"PK_LoggingSettings\" PRIMARY KEY, \"MinimumLevel\" TEXT NOT NULL, \"RetainedFileCountLimit\" INTEGER NOT NULL, \"UpdatedAt\" TEXT NOT NULL);");

                using (var articleColumnsCommand = connection.CreateCommand())
                {
                    articleColumnsCommand.CommandText = "PRAGMA table_info('Articles');";
                    using var articleColumnsReader = await articleColumnsCommand.ExecuteReaderAsync();
                    var articleColumns = new HashSet<string>();
                    while (await articleColumnsReader.ReadAsync()) articleColumns.Add(articleColumnsReader.GetString(1));
                    if (articleColumns.Count > 0)
                    {
                        if (!articleColumns.Contains("ContentFormat")) await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Articles\" ADD COLUMN \"ContentFormat\" INTEGER NOT NULL DEFAULT 0;");
                        if (!articleColumns.Contains("ContentText")) await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Articles\" ADD COLUMN \"ContentText\" TEXT NULL;");
                        if (!articleColumns.Contains("CommentsLocked")) await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Articles\" ADD COLUMN \"CommentsLocked\" INTEGER NOT NULL DEFAULT 0;");
                        if (!articleColumns.Contains("GameCollectionId")) await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Articles\" ADD COLUMN \"GameCollectionId\" TEXT NULL CONSTRAINT \"FK_Articles_GameCollections_GameCollectionId\" REFERENCES \"GameCollections\" (\"Id\");");
                        await context.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS \"IX_Articles_GameCollectionId\" ON \"Articles\" (\"GameCollectionId\");");
                        await context.Database.ExecuteSqlRawAsync("UPDATE \"Articles\" SET \"ContentText\" = \"Content\" WHERE \"ContentText\" IS NULL;");
                    }
                }
                using (var attachmentColumnsCommand = connection.CreateCommand())
                {
                    attachmentColumnsCommand.CommandText = "PRAGMA table_info('Attachments');";
                    using var attachmentColumnsReader = await attachmentColumnsCommand.ExecuteReaderAsync();
                    var attachmentColumns = new HashSet<string>();
                    while (await attachmentColumnsReader.ReadAsync()) attachmentColumns.Add(attachmentColumnsReader.GetString(1));
                    if (attachmentColumns.Count > 0 && !attachmentColumns.Contains("UploadedByUserId")) await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Attachments\" ADD COLUMN \"UploadedByUserId\" TEXT NULL;");
                }
                await context.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS \"ArticleCommentReactions\" (\"Id\" TEXT NOT NULL CONSTRAINT \"PK_ArticleCommentReactions\" PRIMARY KEY, \"ReactionType\" INTEGER NOT NULL, \"CreatedAt\" TEXT NOT NULL, \"CommentId\" TEXT NOT NULL, \"UserId\" TEXT NOT NULL, CONSTRAINT \"FK_ArticleCommentReactions_ArticleComments_CommentId\" FOREIGN KEY (\"CommentId\") REFERENCES \"ArticleComments\" (\"Id\") ON DELETE CASCADE, CONSTRAINT \"FK_ArticleCommentReactions_AspNetUsers_UserId\" FOREIGN KEY (\"UserId\") REFERENCES \"AspNetUsers\" (\"Id\") ON DELETE RESTRICT);");
                await context.Database.ExecuteSqlRawAsync("CREATE UNIQUE INDEX IF NOT EXISTS \"IX_ArticleCommentReactions_CommentId_UserId_ReactionType\" ON \"ArticleCommentReactions\" (\"CommentId\", \"UserId\", \"ReactionType\");");
                await context.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS \"IX_ArticleCommentReactions_UserId\" ON \"ArticleCommentReactions\" (\"UserId\");");

                using (var userColumnsCommand = connection.CreateCommand())
                {
                    userColumnsCommand.CommandText = "PRAGMA table_info('AspNetUsers');";
                    using var userColumnsReader = await userColumnsCommand.ExecuteReaderAsync();
                    var userColumns = new HashSet<string>();
                    while (await userColumnsReader.ReadAsync()) userColumns.Add(userColumnsReader.GetString(1));
                    if (!userColumns.Contains("Nickname")) await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"AspNetUsers\" ADD COLUMN \"Nickname\" TEXT NULL;");
                }
                await context.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS \"IX_AspNetUsers_Nickname\" ON \"AspNetUsers\" (\"Nickname\");");
                await context.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS \"EventSubscriptions\" (\"Id\" TEXT NOT NULL CONSTRAINT \"PK_EventSubscriptions\" PRIMARY KEY, \"UserId\" TEXT NOT NULL, \"CalendarEventId\" TEXT NOT NULL, \"CreatedAt\" TEXT NOT NULL, CONSTRAINT \"FK_EventSubscriptions_AspNetUsers_UserId\" FOREIGN KEY (\"UserId\") REFERENCES \"AspNetUsers\" (\"Id\") ON DELETE CASCADE, CONSTRAINT \"FK_EventSubscriptions_CalendarEvents_CalendarEventId\" FOREIGN KEY (\"CalendarEventId\") REFERENCES \"CalendarEvents\" (\"Id\") ON DELETE CASCADE);");
                await context.Database.ExecuteSqlRawAsync("CREATE UNIQUE INDEX IF NOT EXISTS \"IX_EventSubscriptions_UserId_CalendarEventId\" ON \"EventSubscriptions\" (\"UserId\", \"CalendarEventId\");");
                await context.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS \"Notifications\" (\"Id\" TEXT NOT NULL CONSTRAINT \"PK_Notifications\" PRIMARY KEY, \"Title\" TEXT NOT NULL, \"Message\" TEXT NOT NULL, \"InternalLink\" TEXT NULL, \"SenderUserId\" TEXT NULL, \"SenderName\" TEXT NOT NULL, \"CreatedAt\" TEXT NOT NULL, CONSTRAINT \"FK_Notifications_AspNetUsers_SenderUserId\" FOREIGN KEY (\"SenderUserId\") REFERENCES \"AspNetUsers\" (\"Id\") ON DELETE SET NULL);");
                await context.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS \"IX_Notifications_CreatedAt_Id\" ON \"Notifications\" (\"CreatedAt\", \"Id\");");
                await context.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS \"NotificationRecipients\" (\"NotificationId\" TEXT NOT NULL, \"UserId\" TEXT NOT NULL, \"IsRead\" INTEGER NOT NULL, \"ReadAt\" TEXT NULL, CONSTRAINT \"PK_NotificationRecipients\" PRIMARY KEY (\"NotificationId\", \"UserId\"), CONSTRAINT \"FK_NotificationRecipients_Notifications_NotificationId\" FOREIGN KEY (\"NotificationId\") REFERENCES \"Notifications\" (\"Id\") ON DELETE CASCADE, CONSTRAINT \"FK_NotificationRecipients_AspNetUsers_UserId\" FOREIGN KEY (\"UserId\") REFERENCES \"AspNetUsers\" (\"Id\") ON DELETE CASCADE);");
                await context.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS \"IX_NotificationRecipients_UserId_NotificationId\" ON \"NotificationRecipients\" (\"UserId\", \"NotificationId\");");
            }
        }

        await context.Database.EnsureCreatedAsync();
        await RemoveRetiredFeatureSchemaAsync(context);

        if (!context.Database.IsSqlite())
        {
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[Teams]', N'U') IS NULL BEGIN CREATE TABLE [Teams] ([Id] uniqueidentifier NOT NULL CONSTRAINT [PK_Teams] PRIMARY KEY, [Name] nvarchar(100) NOT NULL, [CreatedAt] datetime2 NOT NULL); CREATE UNIQUE INDEX [IX_Teams_Name] ON [Teams] ([Name]); END");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[Teams]', N'U') IS NOT NULL AND COL_LENGTH(N'Teams', N'CaptainUserId') IS NULL ALTER TABLE [Teams] ADD [CaptainUserId] uniqueidentifier NULL;");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[Teams]', N'U') IS NOT NULL AND COL_LENGTH(N'Teams', N'SeasonStartDate') IS NULL ALTER TABLE [Teams] ADD [SeasonStartDate] datetime2 NULL;");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[Teams]', N'U') IS NOT NULL AND COL_LENGTH(N'Teams', N'SeasonEndDate') IS NULL ALTER TABLE [Teams] ADD [SeasonEndDate] datetime2 NULL;");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[TeamMemberships]', N'U') IS NULL BEGIN CREATE TABLE [TeamMemberships] ([TeamId] uniqueidentifier NOT NULL, [UserId] uniqueidentifier NOT NULL, [CreatedAt] datetime2 NOT NULL, CONSTRAINT [PK_TeamMemberships] PRIMARY KEY ([TeamId], [UserId]), CONSTRAINT [FK_TeamMemberships_Teams_TeamId] FOREIGN KEY ([TeamId]) REFERENCES [Teams] ([Id]) ON DELETE CASCADE, CONSTRAINT [FK_TeamMemberships_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [AspNetUsers] ([Id]) ON DELETE CASCADE); CREATE INDEX [IX_TeamMemberships_UserId] ON [TeamMemberships] ([UserId]); END");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[Competitions]', N'U') IS NULL BEGIN CREATE TABLE [Competitions] ([Id] uniqueidentifier NOT NULL CONSTRAINT [PK_Competitions] PRIMARY KEY, [Name] nvarchar(200) NOT NULL, [Season] nvarchar(50) NOT NULL, [League] nvarchar(100) NOT NULL, [Venue] nvarchar(300) NOT NULL, [StartDate] datetime2 NOT NULL, [EndDate] datetime2 NOT NULL, [TeamId] uniqueidentifier NULL, [CaptainUserId] uniqueidentifier NULL, CONSTRAINT [FK_Competitions_Teams_TeamId] FOREIGN KEY ([TeamId]) REFERENCES [Teams] ([Id]) ON DELETE SET NULL, CONSTRAINT [FK_Competitions_AspNetUsers_CaptainUserId] FOREIGN KEY ([CaptainUserId]) REFERENCES [AspNetUsers] ([Id]) ON DELETE SET NULL); END");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[TeamAvailabilityDates]', N'U') IS NULL BEGIN CREATE TABLE [TeamAvailabilityDates] ([Id] uniqueidentifier NOT NULL CONSTRAINT [PK_TeamAvailabilityDates] PRIMARY KEY, [TeamId] uniqueidentifier NOT NULL, [RoundNumber] int NOT NULL, [MatchDate] datetime2 NOT NULL, [OpponentTeam] nvarchar(150) NOT NULL, [Location] nvarchar(300) NOT NULL, [IsHomeMatch] bit NOT NULL, [CreatedAt] datetime2 NOT NULL, CONSTRAINT [FK_TeamAvailabilityDates_Teams_TeamId] FOREIGN KEY ([TeamId]) REFERENCES [Teams] ([Id]) ON DELETE CASCADE); CREATE UNIQUE INDEX [IX_TeamAvailabilityDates_TeamId_MatchDate] ON [TeamAvailabilityDates] ([TeamId], [MatchDate]); END");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[TeamAvailabilityPlayers]', N'U') IS NULL BEGIN CREATE TABLE [TeamAvailabilityPlayers] ([Id] uniqueidentifier NOT NULL CONSTRAINT [PK_TeamAvailabilityPlayers] PRIMARY KEY, [TeamId] uniqueidentifier NOT NULL, [PlayerUserId] uniqueidentifier NULL, [PlayerName] nvarchar(150) NOT NULL, [PlayerRating] nvarchar(50) NULL, [CreatedAt] datetime2 NOT NULL, CONSTRAINT [FK_TeamAvailabilityPlayers_Teams_TeamId] FOREIGN KEY ([TeamId]) REFERENCES [Teams] ([Id]) ON DELETE CASCADE, CONSTRAINT [FK_TeamAvailabilityPlayers_AspNetUsers_PlayerUserId] FOREIGN KEY ([PlayerUserId]) REFERENCES [AspNetUsers] ([Id]) ON DELETE SET NULL); CREATE INDEX [IX_TeamAvailabilityPlayers_TeamId_PlayerUserId] ON [TeamAvailabilityPlayers] ([TeamId], [PlayerUserId]); END");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[TeamAvailabilityEntries]', N'U') IS NULL BEGIN CREATE TABLE [TeamAvailabilityEntries] ([Id] uniqueidentifier NOT NULL CONSTRAINT [PK_TeamAvailabilityEntries] PRIMARY KEY, [TeamId] uniqueidentifier NOT NULL, [PlayerUserId] uniqueidentifier NULL, [PlayerName] nvarchar(150) NOT NULL, [PlayerRating] nvarchar(50) NULL, [RoundNumber] int NOT NULL, [MatchDate] datetime2 NOT NULL, [OpponentTeam] nvarchar(150) NOT NULL, [Location] nvarchar(300) NOT NULL, [IsHomeMatch] bit NOT NULL, [Status] int NOT NULL, [IsDriver] bit NOT NULL, [Notes] nvarchar(1000) NULL, [UpdatedAt] datetime2 NOT NULL, CONSTRAINT [FK_TeamAvailabilityEntries_Teams_TeamId] FOREIGN KEY ([TeamId]) REFERENCES [Teams] ([Id]) ON DELETE NO ACTION, CONSTRAINT [FK_TeamAvailabilityEntries_AspNetUsers_PlayerUserId] FOREIGN KEY ([PlayerUserId]) REFERENCES [AspNetUsers] ([Id]) ON DELETE SET NULL); CREATE INDEX [IX_TeamAvailabilityEntries_TeamId_MatchDate_RoundNumber] ON [TeamAvailabilityEntries] ([TeamId], [MatchDate], [RoundNumber]); END");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[TeamAvailabilityEntries]', N'U') IS NOT NULL AND COL_LENGTH(N'TeamAvailabilityEntries', N'TeamId') IS NULL ALTER TABLE [TeamAvailabilityEntries] ADD [TeamId] uniqueidentifier NULL;");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[TeamAvailabilityPlayers]', N'U') IS NOT NULL AND COL_LENGTH(N'TeamAvailabilityPlayers', N'IsZaklad') IS NULL ALTER TABLE [TeamAvailabilityPlayers] ADD [IsZaklad] bit NOT NULL DEFAULT 0;");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[TeamAvailabilityPlayers]', N'U') IS NOT NULL AND COL_LENGTH(N'TeamAvailabilityPlayers', N'Tag') IS NULL ALTER TABLE [TeamAvailabilityPlayers] ADD [Tag] int NOT NULL DEFAULT 0;");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[GameCollections]', N'U') IS NULL BEGIN CREATE TABLE [GameCollections] ([Id] uniqueidentifier NOT NULL CONSTRAINT [PK_GameCollections] PRIMARY KEY, [Name] nvarchar(200) NOT NULL, [CreatedByUserId] uniqueidentifier NOT NULL, [CreatedAt] datetime2 NOT NULL, [UpdatedAt] datetime2 NOT NULL, CONSTRAINT [FK_GameCollections_AspNetUsers_CreatedByUserId] FOREIGN KEY ([CreatedByUserId]) REFERENCES [AspNetUsers] ([Id]) ON DELETE NO ACTION); END");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[GameCollectionGames]', N'U') IS NULL BEGIN CREATE TABLE [GameCollectionGames] ([Id] uniqueidentifier NOT NULL CONSTRAINT [PK_GameCollectionGames] PRIMARY KEY, [GameCollectionId] uniqueidentifier NOT NULL, [OrderIndex] int NOT NULL, [Pgn] nvarchar(max) NOT NULL, [Label] nvarchar(200) NULL, CONSTRAINT [FK_GameCollectionGames_GameCollections_GameCollectionId] FOREIGN KEY ([GameCollectionId]) REFERENCES [GameCollections] ([Id]) ON DELETE CASCADE); CREATE INDEX [IX_GameCollectionGames_GameCollectionId_OrderIndex] ON [GameCollectionGames] ([GameCollectionId], [OrderIndex]); END");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[LoggingSettings]', N'U') IS NULL BEGIN CREATE TABLE [LoggingSettings] ([Id] uniqueidentifier NOT NULL CONSTRAINT [PK_LoggingSettings] PRIMARY KEY, [MinimumLevel] nvarchar(20) NOT NULL, [RetainedFileCountLimit] int NOT NULL, [UpdatedAt] datetime2 NOT NULL); END");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[AspNetUsers]', N'U') IS NOT NULL BEGIN IF COL_LENGTH(N'AspNetUsers', N'Nickname') IS NULL ALTER TABLE [AspNetUsers] ADD [Nickname] nvarchar(100) NULL; ELSE IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[AspNetUsers]') AND name = N'Nickname' AND max_length = -1) ALTER TABLE [AspNetUsers] ALTER COLUMN [Nickname] nvarchar(100) NULL; IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[AspNetUsers]') AND name = N'IX_AspNetUsers_Nickname') CREATE INDEX [IX_AspNetUsers_Nickname] ON [AspNetUsers] ([Nickname]); END");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[EventSubscriptions]', N'U') IS NULL BEGIN CREATE TABLE [EventSubscriptions] ([Id] uniqueidentifier NOT NULL CONSTRAINT [PK_EventSubscriptions] PRIMARY KEY, [UserId] uniqueidentifier NOT NULL, [CalendarEventId] uniqueidentifier NOT NULL, [CreatedAt] datetime2 NOT NULL, CONSTRAINT [FK_EventSubscriptions_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [AspNetUsers] ([Id]) ON DELETE CASCADE, CONSTRAINT [FK_EventSubscriptions_CalendarEvents_CalendarEventId] FOREIGN KEY ([CalendarEventId]) REFERENCES [CalendarEvents] ([Id]) ON DELETE CASCADE); CREATE UNIQUE INDEX [IX_EventSubscriptions_UserId_CalendarEventId] ON [EventSubscriptions] ([UserId], [CalendarEventId]); END");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[Notifications]', N'U') IS NULL BEGIN CREATE TABLE [Notifications] ([Id] uniqueidentifier NOT NULL CONSTRAINT [PK_Notifications] PRIMARY KEY, [Title] nvarchar(120) NOT NULL, [Message] nvarchar(4000) NOT NULL, [InternalLink] nvarchar(300) NULL, [SenderUserId] uniqueidentifier NULL, [SenderName] nvarchar(200) NOT NULL, [CreatedAt] datetime2 NOT NULL, CONSTRAINT [FK_Notifications_AspNetUsers_SenderUserId] FOREIGN KEY ([SenderUserId]) REFERENCES [AspNetUsers] ([Id]) ON DELETE SET NULL); CREATE INDEX [IX_Notifications_CreatedAt_Id] ON [Notifications] ([CreatedAt], [Id]); END");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[NotificationRecipients]', N'U') IS NULL BEGIN CREATE TABLE [NotificationRecipients] ([NotificationId] uniqueidentifier NOT NULL, [UserId] uniqueidentifier NOT NULL, [IsRead] bit NOT NULL, [ReadAt] datetime2 NULL, CONSTRAINT [PK_NotificationRecipients] PRIMARY KEY ([NotificationId], [UserId]), CONSTRAINT [FK_NotificationRecipients_Notifications_NotificationId] FOREIGN KEY ([NotificationId]) REFERENCES [Notifications] ([Id]) ON DELETE CASCADE, CONSTRAINT [FK_NotificationRecipients_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [AspNetUsers] ([Id]) ON DELETE CASCADE); CREATE INDEX [IX_NotificationRecipients_UserId_NotificationId] ON [NotificationRecipients] ([UserId], [NotificationId]); END");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[Notifications]', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[Notifications]') AND name = N'IX_Notifications_CreatedAt_Id') CREATE INDEX [IX_Notifications_CreatedAt_Id] ON [Notifications] ([CreatedAt], [Id]);");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[NotificationRecipients]', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[NotificationRecipients]') AND name = N'IX_NotificationRecipients_UserId_NotificationId') CREATE INDEX [IX_NotificationRecipients_UserId_NotificationId] ON [NotificationRecipients] ([UserId], [NotificationId]);");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[Articles]', N'U') IS NOT NULL AND COL_LENGTH(N'Articles', N'ContentFormat') IS NULL ALTER TABLE [Articles] ADD [ContentFormat] int NOT NULL DEFAULT 0;");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[Articles]', N'U') IS NOT NULL AND COL_LENGTH(N'Articles', N'ContentText') IS NULL ALTER TABLE [Articles] ADD [ContentText] nvarchar(max) NULL;");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[Articles]', N'U') IS NOT NULL AND COL_LENGTH(N'Articles', N'CommentsLocked') IS NULL ALTER TABLE [Articles] ADD [CommentsLocked] bit NOT NULL DEFAULT 0;");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[Articles]', N'U') IS NOT NULL AND COL_LENGTH(N'Articles', N'GameCollectionId') IS NULL ALTER TABLE [Articles] ADD [GameCollectionId] uniqueidentifier NULL;");
            await context.Database.ExecuteSqlRawAsync("IF COL_LENGTH(N'Articles', N'GameCollectionId') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Articles_GameCollections_GameCollectionId') ALTER TABLE [Articles] ADD CONSTRAINT [FK_Articles_GameCollections_GameCollectionId] FOREIGN KEY ([GameCollectionId]) REFERENCES [GameCollections] ([Id]) ON DELETE NO ACTION;");
            await context.Database.ExecuteSqlRawAsync("IF COL_LENGTH(N'Articles', N'GameCollectionId') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[Articles]') AND name = N'IX_Articles_GameCollectionId') CREATE INDEX [IX_Articles_GameCollectionId] ON [Articles] ([GameCollectionId]);");
            await context.Database.ExecuteSqlRawAsync("IF COL_LENGTH(N'Articles', N'ContentText') IS NOT NULL UPDATE [Articles] SET [ContentText] = [Content] WHERE [ContentText] IS NULL;");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[Attachments]', N'U') IS NOT NULL AND COL_LENGTH(N'Attachments', N'UploadedByUserId') IS NULL ALTER TABLE [Attachments] ADD [UploadedByUserId] uniqueidentifier NULL;");
            await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[ArticleCommentReactions]', N'U') IS NULL BEGIN CREATE TABLE [ArticleCommentReactions] ([Id] uniqueidentifier NOT NULL CONSTRAINT [PK_ArticleCommentReactions] PRIMARY KEY, [ReactionType] int NOT NULL, [CreatedAt] datetime2 NOT NULL, [CommentId] uniqueidentifier NOT NULL, [UserId] uniqueidentifier NOT NULL, CONSTRAINT [FK_ArticleCommentReactions_ArticleComments_CommentId] FOREIGN KEY ([CommentId]) REFERENCES [ArticleComments] ([Id]) ON DELETE CASCADE, CONSTRAINT [FK_ArticleCommentReactions_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [AspNetUsers] ([Id]) ON DELETE NO ACTION); CREATE UNIQUE INDEX [IX_ArticleCommentReactions_CommentId_UserId_ReactionType] ON [ArticleCommentReactions] ([CommentId], [UserId], [ReactionType]); CREATE INDEX [IX_ArticleCommentReactions_UserId] ON [ArticleCommentReactions] ([UserId]); END");
        }

        await EnsureAvailabilityTeamOwnershipAsync(context);

        // 1. Seed Roles
        foreach (var roleName in Roles.AllRoles)
        {
            if (!await roleManager.RoleExistsAsync(roleName))
            {
                var role = new ApplicationRole(roleName)
                {
                    Description = roleName switch
                    {
                        Roles.Admin => "Administrator with full moderation & system access",
                        Roles.ClubMember => "Club member assigned by an administrator",
                        Roles.RegisteredUser => "Standard registered member who can publish articles and comments",
                        Roles.SuperAdmin => "Highest privilege level; manages system-wide settings such as logging; limited to one instance",
                        _ => string.Empty
                    }
                };
                EnsureIdentitySuccess(await roleManager.CreateAsync(role), $"Creating role {roleName}");
            }
        }

        var configuration = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var environment = scope.ServiceProvider.GetRequiredService<IHostEnvironment>();

        // Logging settings must exist in every environment (not gated behind SeedDemoData).
        // Uses a fixed row id + try/catch so concurrent app startups against the same DB can't create duplicates (PK collision is swallowed).
        if (!await context.LoggingSettings.AnyAsync())
        {
            try
            {
                context.LoggingSettings.Add(new LoggingSettings { Id = LoggingSettings.SingletonId });
                await context.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                // Another concurrent startup already inserted the singleton row; nothing to do.
                context.ChangeTracker.Clear();
            }
        }

        var seedDemoData = configuration.GetValue<bool>("SeedDemoData");
        if (!seedDemoData)
        {
            return;
        }

        if (!environment.IsDevelopment())
        {
            throw new InvalidOperationException("SeedDemoData can only be enabled in the Development environment.");
        }

        // 2. Seed Default Admin User
        const string adminEmail = "admin@chessweb.local";
        const string adminPassword = "Admin123!#";
        var adminUser = await userManager.FindByEmailAsync(adminEmail);
        if (adminUser == null)
        {
            adminUser = new ApplicationUser
            {
                UserName = adminEmail,
                Email = adminEmail,
                FullName = "Grandmaster Administrator",
                EmailConfirmed = true,
                ChessRating = "2200",
                FideId = "1234567"
            };
            EnsureIdentitySuccess(await userManager.CreateAsync(adminUser, adminPassword), "Creating demo admin");
            EnsureIdentitySuccess(await userManager.AddToRoleAsync(adminUser, Roles.Admin), "Assigning admin role");
        }

        adminUser ??= await userManager.FindByEmailAsync(adminEmail);
        if (adminUser != null)
        {
            if (configuration.GetValue<bool>("ResetDemoAdminPassword") &&
                !await userManager.CheckPasswordAsync(adminUser, adminPassword))
            {
                var removePasswordResult = await userManager.RemovePasswordAsync(adminUser);
                if (!removePasswordResult.Succeeded)
                {
                    throw new InvalidOperationException("Unable to reset the demo admin password.");
                }

                var addPasswordResult = await userManager.AddPasswordAsync(adminUser, adminPassword);
                if (!addPasswordResult.Succeeded)
                {
                    throw new InvalidOperationException("Unable to set the demo admin password.");
                }
            }

            var adminRoles = await userManager.GetRolesAsync(adminUser);
            var missingAdminRoles = new[] { Roles.Admin }
                .Except(adminRoles)
                .ToArray();
            if (missingAdminRoles.Length > 0)
            {
                var addRolesResult = await userManager.AddToRolesAsync(adminUser, missingAdminRoles);
                if (!addRolesResult.Succeeded)
                {
                    throw new InvalidOperationException("Unable to assign the demo admin roles.");
                }
            }
        }

        // 3. Seed Default SuperAdmin User
        const string superAdminEmail = "superadmin@chessweb.local";
        const string superAdminPassword = "SuperAdmin123!#";
        var superAdminUser = await userManager.FindByEmailAsync(superAdminEmail);
        if (superAdminUser == null)
        {
            superAdminUser = new ApplicationUser
            {
                UserName = superAdminEmail,
                Email = superAdminEmail,
                FullName = "System SuperAdmin",
                EmailConfirmed = true
            };
            EnsureIdentitySuccess(await userManager.CreateAsync(superAdminUser, superAdminPassword), "Creating demo super admin");
            EnsureIdentitySuccess(await userManager.AddToRoleAsync(superAdminUser, Roles.SuperAdmin), "Assigning super admin role");
        }

        superAdminUser ??= await userManager.FindByEmailAsync(superAdminEmail);
        if (superAdminUser != null)
        {
            if (configuration.GetValue<bool>("ResetDemoAdminPassword") &&
                !await userManager.CheckPasswordAsync(superAdminUser, superAdminPassword))
            {
                var removePasswordResult = await userManager.RemovePasswordAsync(superAdminUser);
                if (!removePasswordResult.Succeeded)
                {
                    throw new InvalidOperationException("Unable to reset the demo super admin password.");
                }

                var addPasswordResult = await userManager.AddPasswordAsync(superAdminUser, superAdminPassword);
                if (!addPasswordResult.Succeeded)
                {
                    throw new InvalidOperationException("Unable to set the demo super admin password.");
                }
            }

            var superAdminRoles = await userManager.GetRolesAsync(superAdminUser);
            var missingSuperAdminRoles = new[] { Roles.SuperAdmin }
                .Except(superAdminRoles)
                .ToArray();
            if (missingSuperAdminRoles.Length > 0)
            {
                var addRolesResult = await userManager.AddToRolesAsync(superAdminUser, missingSuperAdminRoles);
                if (!addRolesResult.Succeeded)
                {
                    throw new InvalidOperationException("Unable to assign the demo super admin roles.");
                }
            }
        }

        var testPlayers = new[]
        {
            ("anna.novakova@chessweb.local", "Anna Novakova", "1985"),
            ("petr.svoboda@chessweb.local", "Petr Svoboda", "2100"),
            ("lucie.dvorakova@chessweb.local", "Lucie Dvorakova", "1750"),
            ("jan.cerny@chessweb.local", "Jan Cerny", "1880"),
            ("eva.prochazkova@chessweb.local", "Eva Prochazkova", "2020"),
            ("tomas.kucera@chessweb.local", "Tomas Kucera", "1650"),
            ("michaela.vesela@chessweb.local", "Michaela Vesela", "1930"),
            ("ondrej.horak@chessweb.local", "Ondrej Horak", "2180"),
            ("katerina.nemcova@chessweb.local", "Katerina Nemcova", "1810"),
            ("filip.marek@chessweb.local", "Filip Marek", "1550"),
            ("barbora.pokorna@chessweb.local", "Barbora Pokorna", "2075"),
            ("martin.jelinek@chessweb.local", "Martin Jelinek", "2290"),
            ("tereza.sedlakova@chessweb.local", "Tereza Sedlakova", "1700"),
            ("radek.fiala@chessweb.local", "Radek Fiala", "1995"),
            ("veronika.kralova@chessweb.local", "Veronika Kralova", "1860"),
            ("lukas.benes@chessweb.local", "Lukas Benes", "2125"),
            ("simona.malikova@chessweb.local", "Simona Malikova", "1600")
        };

        foreach (var (email, fullName, rating) in testPlayers)
        {
            if (await userManager.FindByEmailAsync(email) != null)
            {
                continue;
            }

            var player = new ApplicationUser
            {
                UserName = email,
                Email = email,
                FullName = fullName,
                EmailConfirmed = true,
                ChessRating = rating
            };
            EnsureIdentitySuccess(await userManager.CreateAsync(player, "Player123!#"), $"Creating demo player {email}");
            EnsureIdentitySuccess(await userManager.AddToRoleAsync(player, Roles.RegisteredUser), $"Assigning registered user role to {email}");
        }

        // 4. Seed sample articles with varied content and optional PGN data.
        if (adminUser != null)
        {
            var articleSamples = new[]
            {
                ("Immortal Game: Adolf Anderssen vs Lionel Kieseritzky (1851)", "The famous King's Gambit attacking game.", "The Immortal Game remains a model of initiative, sacrifice, and coordination.", "1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7# 1-0"),
                ("Sicilian Defence: Choosing the Right Plan", "A practical guide to common Sicilian middlegames.", "The Sicilian creates asymmetry from the first move. Focus on development, king safety, and the typical pawn breaks before calculating short tactics.", null),
                ("Three Endgame Rules Every Club Player Should Know", "Simple habits that turn equal endgames into reliable points.", "Activate the king, place rooks behind passed pawns, and calculate pawn races exactly. These rules are simple, but applying them consistently wins many practical games.", null),
                ("How to Build a Weekly Calculation Routine", "A training plan for improving visualization and candidate moves.", "Use short daily sessions: solve a few positions without moving the pieces, write down all candidate moves, and compare your calculation with the solution afterward.", null),
                ("Annotated Club Game: Attacking on the Open File", "A complete club-level game with turning points and positional lessons.", "This game shows how a modest space advantage becomes a direct attack after an open file is occupied by both rooks.", "1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. e3 O-O 5. Bd3 d5 6. Nf3 c5 7. O-O Nc6 8. a3 Bxc3 9. bxc3 dxc4 10. Bxc4")
            };

            var articleCount = await context.Articles.CountAsync();
            foreach (var (title, summary, content, pgnData) in articleSamples)
            {
                if (articleCount >= 5 || await context.Articles.AnyAsync(a => a.Title == title))
                {
                    continue;
                }

                context.Articles.Add(new Article
                {
                    Title = title,
                    Summary = summary,
                    Content = content,
                    ContentText = content,
                    PgnData = pgnData,
                    FenData = pgnData == null ? null : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                    AuthorId = adminUser.Id,
                    CreatedAt = DateTime.UtcNow
                });
                articleCount++;
            }

            await context.SaveChangesAsync();
        }

        // Seed one upcoming event for every calendar category.
        var calendarSamples = new[]
        {
            ("Prague Open 2026", "Open weekend tournament for club and visiting players.", "Prague Chess Club", CalendarEventCategory.Tournament, 14, 48),
            ("Extraliga Round 2", "Home league match with team lineup and board assignments.", "Grand Hotel Prague & Club Hall", CalendarEventCategory.LeagueMatch, 21, 5),
            ("Friday Blitz Club Night", "Casual blitz games and post-game analysis for all members.", "Prague Chess Club", CalendarEventCategory.ClubNight, 17, 3),
            ("Endgame Technique Workshop", "Practical rook endgame training with guided exercises.", "Club Study Room", CalendarEventCategory.TrainingSeminar, 19, 2),
            ("Chess Equipment Swap", "Bring spare boards, clocks, and books to exchange with members.", "Club Entrance Hall", CalendarEventCategory.Other, 24, 2)
        };

        foreach (var sample in calendarSamples)
        {
            if (await context.CalendarEvents.AnyAsync(e =>
                    e.Title == sample.Item1 && e.Category == sample.Item4))
            {
                continue;
            }

            var startTime = DateTime.UtcNow.AddDays(sample.Item5);
            if (sample.Item4 is CalendarEventCategory.ClubNight or CalendarEventCategory.TrainingSeminar or CalendarEventCategory.Other)
            {
                startTime = startTime.Date.AddHours(sample.Item4 == CalendarEventCategory.ClubNight ? 18 : sample.Item4 == CalendarEventCategory.TrainingSeminar ? 17 : 16);
            }

            context.CalendarEvents.Add(new CalendarEvent
            {
                Title = sample.Item1,
                Description = sample.Item2,
                Location = sample.Item3,
                StartTime = startTime,
                EndTime = sample.Item4 == CalendarEventCategory.Tournament ? startTime.AddDays(2) : startTime.AddHours(sample.Item6),
                Category = sample.Item4
            });
        }

        // Seed the jmsschess.cz RSS feed, inactive by default until an admin explicitly enables it.
        const string jmssChessFeedUrl = "https://jmsschess.cz/feed/";
        if (!await context.CalendarFeeds.AnyAsync(f => f.Url == jmssChessFeedUrl))
        {
            context.CalendarFeeds.Add(new CalendarFeed
            {
                Name = "Jihomoravský šachový svaz",
                Url = jmssChessFeedUrl,
                Type = FeedType.RssFeed,
                IsActive = false
            });
        }

        await context.SaveChangesAsync();
    }

    private static async Task RemoveRetiredFeatureSchemaAsync(ApplicationDbContext context)
    {
        if (context.Database.IsSqlite())
        {
            await context.Database.ExecuteSqlRawAsync("PRAGMA foreign_keys = OFF;");
            await context.Database.ExecuteSqlRawAsync("DROP TABLE IF EXISTS ForumPosts; DROP TABLE IF EXISTS ForumTopics; DROP TABLE IF EXISTS ForumCategories;");
            await context.Database.ExecuteSqlRawAsync("PRAGMA foreign_keys = ON;");
            // Tag moved from TeamAvailabilityEntries (per-match) to TeamAvailabilityPlayers (per-season); drop the retired column.
            if (await ColumnExistsSqliteAsync(context, "TeamAvailabilityEntries", "Tag"))
            {
                await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"TeamAvailabilityEntries\" DROP COLUMN \"Tag\";");
            }
            return;
        }

        await context.Database.ExecuteSqlRawAsync("IF COL_LENGTH(N'Attachments', N'ForumPostId') IS NOT NULL BEGIN IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Attachments_ForumPostId') DROP INDEX [IX_Attachments_ForumPostId] ON [Attachments]; IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Attachments_ForumPosts_ForumPostId') ALTER TABLE [Attachments] DROP CONSTRAINT [FK_Attachments_ForumPosts_ForumPostId]; ALTER TABLE [Attachments] DROP COLUMN [ForumPostId]; END");
        await context.Database.ExecuteSqlRawAsync("IF COL_LENGTH(N'Attachments', N'CompetitionDocumentId') IS NOT NULL BEGIN IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Attachments_CompetitionDocumentId') DROP INDEX [IX_Attachments_CompetitionDocumentId] ON [Attachments]; IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Attachments_CompetitionDocuments_CompetitionDocumentId') ALTER TABLE [Attachments] DROP CONSTRAINT [FK_Attachments_CompetitionDocuments_CompetitionDocumentId]; ALTER TABLE [Attachments] DROP COLUMN [CompetitionDocumentId]; END");
        await context.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'[ForumPosts]', N'U') IS NOT NULL DROP TABLE [ForumPosts]; IF OBJECT_ID(N'[ForumTopics]', N'U') IS NOT NULL DROP TABLE [ForumTopics]; IF OBJECT_ID(N'[ForumCategories]', N'U') IS NOT NULL DROP TABLE [ForumCategories];");
        // Tag moved from TeamAvailabilityEntries (per-match) to TeamAvailabilityPlayers (per-season); drop the retired column.
        await context.Database.ExecuteSqlRawAsync("IF COL_LENGTH(N'TeamAvailabilityEntries', N'Tag') IS NOT NULL ALTER TABLE [TeamAvailabilityEntries] DROP COLUMN [Tag];");
    }

    private static async Task<bool> ColumnExistsSqliteAsync(ApplicationDbContext context, string tableName, string columnName)
    {
        var connection = context.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open) await connection.OpenAsync();
        using var command = connection.CreateCommand();
        command.CommandText = $"PRAGMA table_info('{tableName}');";
        using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            if (string.Equals(reader.GetString(1), columnName, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }

    private static async Task EnsureAvailabilityTeamOwnershipAsync(ApplicationDbContext context)
    {
        if (context.Database.IsSqlite())
        {
            await context.Database.ExecuteSqlRawAsync("DELETE FROM TeamAvailabilityEntries WHERE TeamId IS NULL;");
            var connection = context.Database.GetDbConnection();
            if (connection.State != ConnectionState.Open) await connection.OpenAsync();
            using var command = connection.CreateCommand();
            command.CommandText = "PRAGMA table_info('TeamAvailabilityEntries');";
            using var reader = await command.ExecuteReaderAsync();
            var teamIdNullable = true;
            var hasCompetitionId = false;
            while (await reader.ReadAsync())
            {
                var columnName = reader.GetString(1);
                if (columnName == "TeamId") teamIdNullable = reader.GetInt32(3) == 0;
                if (columnName == "CompetitionId") hasCompetitionId = true;
            }
            if (teamIdNullable || hasCompetitionId)
            {
                await context.Database.ExecuteSqlRawAsync("PRAGMA foreign_keys = OFF; CREATE TABLE IF NOT EXISTS TeamAvailabilityEntries_new (Id TEXT NOT NULL CONSTRAINT PK_TeamAvailabilityEntries PRIMARY KEY, TeamId TEXT NOT NULL, PlayerUserId TEXT NULL, PlayerName TEXT NOT NULL, PlayerRating TEXT NULL, RoundNumber INTEGER NOT NULL, MatchDate TEXT NOT NULL, OpponentTeam TEXT NOT NULL, Location TEXT NOT NULL, IsHomeMatch INTEGER NOT NULL, Status INTEGER NOT NULL, IsDriver INTEGER NOT NULL, Notes TEXT NULL, UpdatedAt TEXT NOT NULL, CONSTRAINT FK_TeamAvailabilityEntries_Teams_TeamId FOREIGN KEY (TeamId) REFERENCES Teams (Id) ON DELETE RESTRICT, CONSTRAINT FK_TeamAvailabilityEntries_AspNetUsers_PlayerUserId FOREIGN KEY (PlayerUserId) REFERENCES AspNetUsers (Id) ON DELETE SET NULL); INSERT INTO TeamAvailabilityEntries_new SELECT Id, TeamId, PlayerUserId, PlayerName, PlayerRating, RoundNumber, MatchDate, OpponentTeam, Location, IsHomeMatch, Status, IsDriver, Notes, UpdatedAt FROM TeamAvailabilityEntries; DROP TABLE TeamAvailabilityEntries; ALTER TABLE TeamAvailabilityEntries_new RENAME TO TeamAvailabilityEntries; CREATE INDEX IF NOT EXISTS IX_TeamAvailabilityEntries_TeamId_MatchDate_RoundNumber ON TeamAvailabilityEntries (TeamId, MatchDate, RoundNumber); PRAGMA foreign_keys = ON;");
            }
            return;
        }

        await context.Database.ExecuteSqlRawAsync("DELETE FROM TeamAvailabilityEntries WHERE TeamId IS NULL;");
        await context.Database.ExecuteSqlRawAsync("IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[TeamAvailabilityEntries]') AND name = N'CompetitionId') BEGIN IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_TeamAvailabilityEntries_Competitions_CompetitionId') ALTER TABLE [TeamAvailabilityEntries] DROP CONSTRAINT [FK_TeamAvailabilityEntries_Competitions_CompetitionId]; IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_TeamAvailabilityEntries_CompetitionId_MatchDate_RoundNumber') DROP INDEX [IX_TeamAvailabilityEntries_CompetitionId_MatchDate_RoundNumber] ON [TeamAvailabilityEntries]; ALTER TABLE [TeamAvailabilityEntries] DROP COLUMN [CompetitionId]; END");
        await context.Database.ExecuteSqlRawAsync("IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[TeamAvailabilityEntries]') AND name = N'TeamId' AND is_nullable = 1) ALTER TABLE [TeamAvailabilityEntries] ALTER COLUMN [TeamId] uniqueidentifier NOT NULL; IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_TeamAvailabilityEntries_Teams_TeamId') ALTER TABLE [TeamAvailabilityEntries] ADD CONSTRAINT [FK_TeamAvailabilityEntries_Teams_TeamId] FOREIGN KEY ([TeamId]) REFERENCES [Teams] ([Id]) ON DELETE NO ACTION;");
    }
}

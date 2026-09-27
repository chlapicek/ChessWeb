using ChessWeb.Domain.Entities;
using ChessWeb.Services;
using Microsoft.EntityFrameworkCore;

namespace ChessWeb.Data;

// Development-only demo content. Each section is guarded by a marker row so repeated startups never duplicate data.
internal static class DemoDataSeeder
{
    private const string AdminKey = "admin";
    private const string ClubVenue = "Prague Chess Club, Vinohradská 12, Praha 2";
    private static readonly int[] RoundDayOffsets = [-49, -35, -21, -7, 7, 21, 35];

    private sealed record DemoMember(string Key, MatchPlayerTag Tag = MatchPlayerTag.None);
    private sealed record DemoGuest(string Name, string Rating, MatchPlayerTag Tag);
    private sealed record DemoRound(string Opponent, bool IsHome, string AwayVenue);
    private sealed record DemoTeam(string Name, string League, string CaptainKey, int CoreCount, DemoMember[] Members, DemoGuest[] Guests, DemoRound[] Rounds);
    private sealed record DemoArticle(string Title, string AuthorKey, int DaysAgo, string Summary, string Content, DemoCollection? Collection);
    private sealed record DemoGame(string Label, string Pgn);
    private sealed record DemoCollection(string Name, string OwnerKey, DemoGame[] Games);
    private sealed record DemoPartner(string Name, string Url);

    private static readonly DemoTeam[] Teams =
    [
        new("ŠK Praha A", "1. liga", "ondrej.horak", 6,
            [new("martin.jelinek"), new("ondrej.horak"), new("lukas.benes"), new("petr.svoboda"), new("barbora.pokorna"), new("eva.prochazkova"), new("radek.fiala"), new("michaela.vesela")],
            [new("Jiri Holub", "2240", MatchPlayerTag.Host)],
            [new("TJ Slavoj Vyšehrad", true, ""), new("ŠK Kladno", false, "Kulturní dům Kladno"), new("Sokol Brno", true, ""), new("ŠO Pardubice", false, "Dům hudby Pardubice"), new("TJ Bohemians", true, ""), new("ŠK Liberec", false, "Radnice Liberec"), new("Duras Plzeň", true, "")]),
        new("ŠK Praha B", "Krajský přebor", "radek.fiala", 6,
            [new("radek.fiala"), new("michaela.vesela", MatchPlayerTag.Vyssi), new("jan.cerny"), new("veronika.kralova"), new("katerina.nemcova"), new("lucie.dvorakova"), new("tereza.sedlakova"), new("tomas.kucera")],
            [new("Marek Kowalski", "1905", MatchPlayerTag.Cizinec)],
            [new("ŠK Kladno B", false, "Kulturní dům Kladno"), new("TJ Slavoj Vyšehrad B", true, ""), new("Sokol Říčany", false, "Sokolovna Říčany"), new("ŠK Beroun", true, ""), new("TJ Kobylisy", false, "ZŠ Kobylisy"), new("Spartak Vlašim", true, ""), new("ŠK Mělník", false, "Městská knihovna Mělník")]),
        new("ŠK Praha Mládež", "Dorostenecká liga", "filip.marek", 4,
            [new("simona.malikova"), new("filip.marek"), new("tomas.kucera"), new("tereza.sedlakova"), new("lucie.dvorakova")],
            [new("Adam Novotny", "1420", MatchPlayerTag.None)],
            [new("ŠK Kladno Junior", true, ""), new("Sokol Brno Mládež", false, "ZŠ Lesná Brno"), new("TJ Bohemians Junior", true, ""), new("ŠO Pardubice Mládež", false, "DDM Pardubice"), new("ŠK Liberec Junior", true, ""), new("Duras Plzeň Mládež", false, "SVČ Plzeň"), new("TJ Kobylisy Junior", true, "")])
    ];

    private static readonly DemoCollection MiniaturesCollection = new("Classic Miniatures", AdminKey,
        [
            new("Morphy – Duke Karl / Count Isouard, Paris 1858", "[Event \"Paris Opera\"]\n[Site \"Paris FRA\"]\n[Date \"1858.??.??\"]\n[White \"Paul Morphy\"]\n[Black \"Duke Karl / Count Isouard\"]\n[Result \"1-0\"]\n\n1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0"),
            new("Réti – Tartakower, Vienna 1910", "[Event \"Vienna\"]\n[Site \"Vienna AUT\"]\n[Date \"1910.??.??\"]\n[White \"Richard Reti\"]\n[Black \"Savielly Tartakower\"]\n[Result \"1-0\"]\n\n1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nf6 5. Qd3 e5 6. dxe5 Qa5+ 7. Bd2 Qxe5 8. O-O-O Nxe4 9. Qd8+ Kxd8 10. Bg5+ Kc7 11. Bd8# 1-0"),
            new("Légal's Mate", "[Event \"Legal's Mate\"]\n[White \"Legal\"]\n[Black \"Saint Brie\"]\n[Result \"1-0\"]\n\n1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0"),
            new("Scholar's Mate trap", "[Event \"Training\"]\n[White \"White\"]\n[Black \"Black\"]\n[Result \"1-0\"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0")
        ]);

    private static readonly DemoCollection ChampionshipCollection = new("Club Championship 2026 – Round 1", "ondrej.horak",
        [
            new("Horak – Jelinek", "[Event \"Club Championship 2026\"]\n[Site \"Prague Chess Club\"]\n[Round \"1.1\"]\n[White \"Ondrej Horak\"]\n[Black \"Martin Jelinek\"]\n[Result \"1/2-1/2\"]\n\n1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 h6 7. Bh4 b6 8. cxd5 exd5 9. Bd3 Bb7 10. O-O Nbd7 1/2-1/2"),
            new("Svoboda – Benes", "[Event \"Club Championship 2026\"]\n[Site \"Prague Chess Club\"]\n[Round \"1.2\"]\n[White \"Petr Svoboda\"]\n[Black \"Lukas Benes\"]\n[Result \"*\"]\n\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3 Be7 9. Qd2 O-O 10. O-O-O Nbd7 11. g4 b5 12. g5 b4 13. gxf6 bxc3 14. Qxc3 Nxf6 *"),
            new("Pokorna – Prochazkova", "[Event \"Club Championship 2026\"]\n[Site \"Prague Chess Club\"]\n[Round \"1.3\"]\n[White \"Barbora Pokorna\"]\n[Black \"Eva Prochazkova\"]\n[Result \"1/2-1/2\"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O a6 7. a4 O-O 8. Re1 Ba7 9. h3 h6 10. Nbd2 Re8 1/2-1/2")
        ]);

    private static readonly DemoCollection[] Collections = [MiniaturesCollection, ChampionshipCollection];

    private static readonly DemoArticle[] Articles =
    [
        new("Classic Miniatures Every Player Should Know", AdminKey, 12,
            "Four short games that teach development, king safety, and tactical awareness.",
            "Miniatures are the fastest way to learn why development and king safety matter. Step through the collection below and try to spot the decisive idea before it appears on the board.",
            MiniaturesCollection),
        new("Club Championship 2026: Round 1 Report", "ondrej.horak", 5,
            "Two draws on the top boards and a sharp Najdorf still under analysis.",
            "The first round of the club championship delivered solid chess on board one and a razor-sharp English Attack on board two. All games from the round are available in the attached collection.",
            ChampionshipCollection),
        new("Team A Opens the League Season with a Win", "ondrej.horak", 48,
            "A 5:3 home victory against TJ Slavoj Vyšehrad in round one.",
            "Our first team started the 1. liga season with a convincing 5:3 win. Martin converted a long rook endgame on board one and Barbora finished the match with a neat tactical shot.",
            null),
        new("Youth Section: Autumn Training Schedule", "filip.marek", 20,
            "Every other Wednesday we meet for structured youth training.",
            "Youth training runs every other Wednesday from 16:30. Sessions cover tactics, basic endgames, and game analysis. Bring your scoresheets from recent tournaments so we can review them together.",
            null),
        new("An Opening Repertoire for Busy Adults", "barbora.pokorna", 30,
            "Low-maintenance openings that still lead to rich middlegames.",
            "If you only have an hour a week for openings, choose systems built on plans rather than memorised lines. The London System, the Caro-Kann, and the Queen's Gambit Declined are all excellent choices.",
            null)
    ];

    private static readonly string[] CommentPool =
    [
        "Thanks for sharing, very instructive.",
        "I tried this plan in my last league game and it worked nicely.",
        "Could we go through this together at the next club night?",
        "The key moment for me was the pawn break — easy to miss over the board.",
        "Bookmarked. More articles like this, please!",
        "Nice write-up. I would add that king activity matters even earlier.",
        "See you all on Friday!",
        "Great selection of examples."
    ];

    public static async Task SeedAsync(ApplicationDbContext context, ApplicationUser admin, IReadOnlyCollection<string> playerEmails, IReadOnlyCollection<string> baseArticleTitles)
    {
        var users = await context.Users.Where(u => u.Email != null && playerEmails.Contains(u.Email)).ToDictionaryAsync(u => u.Email!.Split('@')[0], StringComparer.OrdinalIgnoreCase);
        users[AdminKey] = admin;
        var today = DateTime.UtcNow.Date;

        await SeedTeamsAsync(context, users, today);
        await SeedCalendarAsync(context, users, today);
        await SeedGameCollectionsAsync(context, users);
        await SeedArticlesAsync(context, users, today, admin, baseArticleTitles);
        await SeedPartnersAsync(context);
        await SeedNotificationsAsync(context, users, admin, today);
    }

    private static async Task SeedTeamsAsync(ApplicationDbContext context, Dictionary<string, ApplicationUser> users, DateTime today)
    {
        foreach (var demo in Teams)
        {
            if (await context.Teams.AnyAsync(t => t.Name == demo.Name)) continue;

            var team = new Team { Name = demo.Name, SeasonStartDate = today.AddDays(-60), SeasonEndDate = today.AddDays(60) };
            context.Teams.Add(team);

            var roster = new List<TeamAvailabilityPlayer>();
            foreach (var member in demo.Members)
            {
                if (!users.TryGetValue(member.Key, out var user)) continue;
                if (await context.TeamMemberships.CountAsync(m => m.UserId == user.Id) >= TeamService.MaxTeamsPerUser) continue;

                context.TeamMemberships.Add(new TeamMembership { TeamId = team.Id, UserId = user.Id });
                roster.Add(new TeamAvailabilityPlayer { TeamId = team.Id, PlayerUserId = user.Id, PlayerName = user.FullName, PlayerRating = user.ChessRating, Tag = member.Tag });
                if (member.Key == demo.CaptainKey) team.CaptainUserId = user.Id;
            }

            roster = roster.OrderByDescending(p => int.TryParse(p.PlayerRating, out var rating) ? rating : 0).ToList();
            for (var i = 0; i < roster.Count; i++) roster[i].IsZaklad = i < demo.CoreCount;
            roster.AddRange(demo.Guests.Select(guest => new TeamAvailabilityPlayer { TeamId = team.Id, PlayerName = guest.Name, PlayerRating = guest.Rating, Tag = guest.Tag }));
            context.TeamAvailabilityPlayers.AddRange(roster);

            for (var round = 0; round < demo.Rounds.Length && round < RoundDayOffsets.Length; round++)
            {
                var info = demo.Rounds[round];
                var offset = RoundDayOffsets[round];
                var matchDate = today.AddDays(offset);
                var location = info.IsHome ? ClubVenue : info.AwayVenue;
                context.TeamAvailabilityDates.Add(new TeamAvailabilityDate { TeamId = team.Id, RoundNumber = round + 1, MatchDate = matchDate, OpponentTeam = info.Opponent, Location = location, IsHomeMatch = info.IsHome });

                for (var p = 0; p < roster.Count; p++)
                {
                    var player = roster[p];
                    var status = PickStatus(p, round, offset);
                    context.TeamAvailabilityEntries.Add(new TeamAvailabilityEntry
                    {
                        TeamId = team.Id,
                        PlayerUserId = player.PlayerUserId,
                        PlayerName = player.PlayerName,
                        PlayerRating = player.PlayerRating,
                        RoundNumber = round + 1,
                        MatchDate = matchDate,
                        OpponentTeam = info.Opponent,
                        Location = location,
                        IsHomeMatch = info.IsHome,
                        Status = status,
                        IsDriver = !info.IsHome && status == AvailabilityStatus.Available && p % 3 == 0,
                        Notes = status switch
                        {
                            AvailabilityStatus.Unavailable => p % 2 == 0 ? "Work trip" : "Family event",
                            AvailabilityStatus.Tentative => "Will confirm by Wednesday",
                            _ => null
                        }
                    });
                }

                AddLeagueMatchEvent(context, demo, round + 1, info, matchDate, location);
            }

            await context.SaveChangesAsync();
        }
    }

    private static void AddLeagueMatchEvent(ApplicationDbContext context, DemoTeam demo, int roundNumber, DemoRound info, DateTime matchDate, string location)
    {
        var homeTeam = info.IsHome ? demo.Name : info.Opponent;
        var awayTeam = info.IsHome ? info.Opponent : demo.Name;
        var start = matchDate.AddHours(10);
        context.CalendarEvents.Add(new CalendarEvent
        {
            Title = $"{demo.League}, round {roundNumber}: {homeTeam} – {awayTeam}",
            Description = $"League match of {demo.Name}. Check the team availability page for the lineup.",
            Location = location,
            StartTime = start,
            EndTime = start.AddHours(6),
            Category = CalendarEventCategory.LeagueMatch
        });
    }

    private static AvailabilityStatus PickStatus(int playerIndex, int roundIndex, int dayOffset)
    {
        var roll = (playerIndex * 7 + roundIndex * 3) % 10;
        if (dayOffset < 0) return roll < 7 ? AvailabilityStatus.Available : roll < 9 ? AvailabilityStatus.Unavailable : AvailabilityStatus.Tentative;
        if (dayOffset > 21) return roll < 2 ? AvailabilityStatus.Available : AvailabilityStatus.Pending;
        return roll < 4 ? AvailabilityStatus.Available : roll < 6 ? AvailabilityStatus.Tentative : roll < 7 ? AvailabilityStatus.Unavailable : AvailabilityStatus.Pending;
    }

    private static async Task SeedCalendarAsync(ApplicationDbContext context, Dictionary<string, ApplicationUser> users, DateTime today)
    {
        const string clubNightTitle = "Weekly Club Night";
        if (await context.CalendarEvents.AnyAsync(e => e.Title == clubNightTitle && e.RecurrenceGroupId != null)) return;

        var events = new List<CalendarEvent>();
        var nextFriday = today.AddDays(((int)DayOfWeek.Friday - (int)today.DayOfWeek + 7) % 7);
        var clubNightGroup = Guid.NewGuid();
        for (var week = -3; week < 5; week++)
        {
            var start = nextFriday.AddDays(week * 7).AddHours(18);
            events.Add(new CalendarEvent { Title = clubNightTitle, Description = "Casual games, blitz, and analysis. Everyone welcome.", Location = ClubVenue, StartTime = start, EndTime = start.AddHours(4), Category = CalendarEventCategory.ClubNight, Recurrence = RecurrenceType.Weekly, RecurrenceGroupId = clubNightGroup });
        }

        var nextWednesday = today.AddDays(((int)DayOfWeek.Wednesday - (int)today.DayOfWeek + 7) % 7);
        var youthGroup = Guid.NewGuid();
        for (var session = -2; session < 4; session++)
        {
            var start = nextWednesday.AddDays(session * 14).AddHours(16).AddMinutes(30);
            events.Add(new CalendarEvent { Title = "Youth Training", Description = "Tactics, endgames, and game review for juniors.", Location = "Club Study Room", StartTime = start, EndTime = start.AddHours(2), Category = CalendarEventCategory.TrainingSeminar, Recurrence = RecurrenceType.BiWeekly, RecurrenceGroupId = youthGroup });
        }

        events.Add(new CalendarEvent { Title = "Winter Rapid Cup", Description = "7-round Swiss, 15+10. Results are published on the club board.", Location = ClubVenue, StartTime = today.AddDays(-30).AddHours(9), EndTime = today.AddDays(-30).AddHours(18), Category = CalendarEventCategory.Tournament });
        events.Add(new CalendarEvent { Title = "Club Blitz Championship", Description = "Double round-robin blitz, 3+2.", Location = ClubVenue, StartTime = today.AddDays(-10).AddHours(17), EndTime = today.AddDays(-10).AddHours(21), Category = CalendarEventCategory.Tournament });
        events.Add(new CalendarEvent { Title = "Simultaneous Exhibition", Description = "Our strongest member plays 20 boards at once. Registration required.", Location = "Club Entrance Hall", StartTime = today.AddDays(28).AddHours(15), EndTime = today.AddDays(28).AddHours(19), Category = CalendarEventCategory.Other });
        events.Add(new CalendarEvent { Title = "Annual General Meeting", Description = "Club finances, season review, and committee elections.", Location = "Club Study Room", StartTime = today.AddDays(40).AddHours(18), EndTime = today.AddDays(40).AddHours(20), Category = CalendarEventCategory.Other });
        events.Add(new CalendarEvent { Title = "Summer Chess Camp", Description = "Five days of training and a closing tournament for juniors.", Location = "Rekreační středisko Sázava", StartTime = today.AddDays(55), EndTime = today.AddDays(60), IsAllDay = true, Category = CalendarEventCategory.TrainingSeminar });

        context.CalendarEvents.AddRange(events);

        var upcoming = events.Where(e => e.StartTime >= today).ToList();
        var subscribers = users.Where(pair => pair.Key != AdminKey).Select(pair => pair.Value).OrderBy(u => u.FullName).ToList();
        for (var i = 0; i < subscribers.Count; i++)
        {
            foreach (var calendarEvent in upcoming.Where((_, index) => (index + i) % 3 == 0))
            {
                context.EventSubscriptions.Add(new EventSubscription { UserId = subscribers[i].Id, CalendarEventId = calendarEvent.Id });
            }
        }
        await context.SaveChangesAsync();
    }

    private static async Task SeedGameCollectionsAsync(ApplicationDbContext context, Dictionary<string, ApplicationUser> users)
    {
        foreach (var (name, ownerKey, games) in Collections)
        {
            if (!users.TryGetValue(ownerKey, out var owner) || await context.GameCollections.AnyAsync(c => c.Name == name && c.CreatedByUserId == owner.Id)) continue;

            context.GameCollections.Add(new GameCollection
            {
                Name = name,
                CreatedByUserId = owner.Id,
                Games = games.Select((game, index) => new GameCollectionGame { OrderIndex = index, Label = game.Label, Pgn = game.Pgn }).ToList()
            });
        }
        await context.SaveChangesAsync();
    }

    private static async Task SeedArticlesAsync(ApplicationDbContext context, Dictionary<string, ApplicationUser> users, DateTime today, ApplicationUser admin, IReadOnlyCollection<string> baseArticleTitles)
    {
        // The first demo article is the section marker; base-article discussions are added only in the same one-time pass.
        if (await context.Articles.AnyAsync(a => a.Title == Articles[0].Title)) return;

        var undiscussedBaseArticles = await context.Articles.Where(a => a.AuthorId == admin.Id && baseArticleTitles.Contains(a.Title) && !a.Comments.Any() && !a.Reactions.Any()).ToListAsync();
        foreach (var article in undiscussedBaseArticles)
        {
            AddDiscussion(context, article, users, article.Title.Length);
        }

        foreach (var demo in Articles)
        {
            if (!users.TryGetValue(demo.AuthorKey, out var author) || await context.Articles.AnyAsync(a => a.Title == demo.Title)) continue;

            Guid? collectionId = null;
            if (demo.Collection != null && users.TryGetValue(demo.Collection.OwnerKey, out var collectionOwner))
            {
                collectionId = await context.GameCollections.Where(c => c.Name == demo.Collection.Name && c.CreatedByUserId == collectionOwner.Id).Select(c => (Guid?)c.Id).FirstOrDefaultAsync();
            }
            var article = new Article
            {
                Title = demo.Title,
                Summary = demo.Summary,
                Content = demo.Content,
                ContentText = demo.Content,
                AuthorId = author.Id,
                GameCollectionId = collectionId,
                CreatedAt = today.AddDays(-demo.DaysAgo).AddHours(9)
            };
            context.Articles.Add(article);
            AddDiscussion(context, article, users, demo.Title.Length);
        }
        await context.SaveChangesAsync();
    }

    private static void AddDiscussion(ApplicationDbContext context, Article article, Dictionary<string, ApplicationUser> users, int seed)
    {
        var participants = users.Where(pair => pair.Key != AdminKey && pair.Value.Id != article.AuthorId).Select(pair => pair.Value).OrderBy(u => u.FullName).ToList();
        if (participants.Count == 0) return;

        var reactionTypes = Enum.GetValues<ArticleReactionType>();
        var commentCount = 2 + seed % 3;
        for (var i = 0; i < commentCount; i++)
        {
            var commenter = participants[(seed + i * 5) % participants.Count];
            var comment = new ArticleComment { ArticleId = article.Id, AuthorId = commenter.Id, Content = CommentPool[(seed + i) % CommentPool.Length], CreatedAt = DiscussionTime(article.CreatedAt, 3 + i * 7, i, commentCount) };
            context.ArticleComments.Add(comment);
            if (i == 0)
            {
                context.ArticleCommentReactions.Add(new ArticleCommentReaction { CommentId = comment.Id, UserId = article.AuthorId, ReactionType = ArticleReactionType.Like });
            }
        }

        var reactionCount = Math.Min(participants.Count, 3 + seed % 5);
        for (var i = 0; i < reactionCount; i++)
        {
            context.ArticleReactions.Add(new ArticleReaction { ArticleId = article.Id, UserId = participants[(seed * 3 + i) % participants.Count].Id, ReactionType = reactionTypes[(seed + i) % reactionTypes.Length], CreatedAt = DiscussionTime(article.CreatedAt, 1 + i, i, reactionCount) });
        }
    }

    // Keeps activity after the article and before now, even for articles created moments ago, while preserving order.
    private static DateTime DiscussionTime(DateTime articleCreatedAt, double preferredHoursAfter, int slot, int slotCount)
    {
        var preferred = TimeSpan.FromHours(preferredHoursAfter);
        var evenlySpaced = (DateTime.UtcNow - articleCreatedAt) * (slot + 1) / (slotCount + 1);
        return articleCreatedAt + (preferred < evenlySpaced ? preferred : evenlySpaced);
    }

    private static async Task SeedPartnersAsync(ApplicationDbContext context)
    {
        if (await context.Partners.AnyAsync()) return;

        DemoPartner[] partners =
        [
            new("Czech Chess Federation", "https://www.chess.cz"),
            new("FIDE", "https://www.fide.com"),
            new("Lichess", "https://lichess.org"),
            new("ChessBase", "https://en.chessbase.com")
        ];
        for (var i = 0; i < partners.Length; i++)
        {
            var partner = new Partner { Name = partners[i].Name, Url = partners[i].Url, DisplayOrder = i };
            // No logo file is stored, so the logo endpoint 404s and the UI falls back to initials.
            partner.LogoUrl = $"/api/partners/{partner.Id}/logo";
            context.Partners.Add(partner);
        }
        await context.SaveChangesAsync();
    }

    private static async Task SeedNotificationsAsync(ApplicationDbContext context, Dictionary<string, ApplicationUser> users, ApplicationUser admin, DateTime today)
    {
        const string markerTitle = "Weekly Club Night moves to the main hall";
        if (await context.Notifications.AnyAsync(n => n.Title == markerTitle)) return;

        var firstTeamName = Teams[0].Name;
        var secondTeamName = Teams[1].Name;
        var teamMembers = await context.TeamMemberships
            .Where(m => m.Team.Name == firstTeamName || m.Team.Name == secondTeamName)
            .Select(m => new { m.Team.Name, m.UserId, CaptainId = m.Team.CaptainUserId })
            .ToListAsync();

        Notification Create(string title, string message, string link, ApplicationUser sender, DateTime createdAt, IEnumerable<Guid> recipients) => new()
        {
            Title = title,
            Message = message,
            InternalLink = link,
            SenderUserId = sender.Id,
            SenderName = sender.FullName,
            CreatedAt = createdAt,
            Recipients = recipients.Distinct().Select((userId, index) => new NotificationRecipient { UserId = userId, IsRead = index % 2 == 0, ReadAt = index % 2 == 0 ? createdAt.AddHours(2) : null }).ToList()
        };

        context.Notifications.Add(Create(markerTitle, "From this week the club night takes place in the main hall on the ground floor.", "/calendar", admin, today.AddDays(-6).AddHours(12), users.Values.Select(u => u.Id)));

        var teamA = teamMembers.Where(m => m.Name == firstTeamName).ToList();
        if (teamA.Count > 0)
        {
            context.Notifications.Add(Create("Lineup for the next round published", "The lineup for the upcoming league match is ready. Please check your board and colour.", "/team-availability", admin, today.AddDays(-2).AddHours(8), teamA.Select(m => m.UserId)));
        }

        var teamB = teamMembers.Where(m => m.Name == secondTeamName).ToList();
        var captainB = teamB.Select(m => m.CaptainId).FirstOrDefault();
        if (captainB is Guid captainId && users.Values.FirstOrDefault(u => u.Id == captainId) is { } captain)
        {
            context.Notifications.Add(Create("Please confirm your availability", "Several cells for the next two rounds are still pending. Please update them by Wednesday.", "/team-availability", captain, today.AddDays(-1).AddHours(19), teamB.Where(m => m.UserId != captainId).Select(m => m.UserId)));
        }

        await context.SaveChangesAsync();
    }
}

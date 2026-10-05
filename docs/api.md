# HTTP API Reference

The API is rooted at `/api`. JSON is used for ordinary request and response bodies; upload routes use `multipart/form-data`. Identifiers in routes are GUIDs. The API is implemented by the controllers in `src/backend/Controllers`; this page intentionally lists only routes mapped in the current source.

## Authentication and CSRF

For authenticated routes, send the access token returned by registration or login:

```http
Authorization: Bearer <token>
```

There is no token refresh endpoint. Although the authentication response contains a `RefreshToken` field, the current API does not expose a refresh workflow; clients should not assume that field can renew an expired access token.

The frontend obtains an antiforgery request token from `GET /api/csrf/token`. The response includes `requestToken` and sets an antiforgery cookie. For browser POST, PUT, PATCH, and DELETE requests, the bundled Axios client sends the token in `X-CSRF-TOKEN` and includes the cookie. The middleware checks the request origin/fetch-site and validates the token when browser request metadata (`Origin` or `Sec-Fetch-Site`) is present. This applies to anonymous browser requests such as registration and login too. Non-browser clients that send neither header are not token-validated by this middleware; requests with an Origin must still be same-host or from a configured trusted origin.

Access labels in the tables:

| Label | Meaning |
| --- | --- |
| Public | Explicitly allows anonymous requests |
| Signed in | Requires a valid bearer token; resource ownership or membership may also be checked |
| Admin | Requires the `Admin` role unless noted otherwise |
| Admin or SuperAdmin | Requires either role |
| SuperAdmin | Requires the `SuperAdmin` role |

## Authentication

Base path: `/api/auth`

| Method | Path | Access | Purpose and input |
| --- | --- | --- | --- |
| POST | `/register` | Public | Create an account; JSON `RegisterRequest` (`Email`, `Password`, `FullName`, optional `ChessRating`, `FideId`, `Nickname`). Assigns `RegisteredUser` and returns an auth response. Passwords must be at least 8 characters. Rate-limited by request IP (default 3/minute). |
| POST | `/login` | Public | Sign in by email or nickname; JSON `LoginRequest` (`EmailOrNickname`, `Password`). Rate-limited by request IP (default 5/minute). |
| GET | `/me` | Signed in | Return the current user's profile and roles. |
| GET | `/users` | Admin or SuperAdmin | List users. |
| POST | `/change-roles` | Admin or SuperAdmin | Set a user's roles; SuperAdmin-specific protections apply to changes involving the SuperAdmin role. JSON `ChangeRoleRequest`. |

## Articles, Comments, Reactions, and Attachments

Base path: `/api/articles`

| Method | Path | Access | Purpose and input |
| --- | --- | --- | --- |
| GET | `/` | Public | Search and page published articles. Query: optional `search`, `page` (default 1), `pageSize` (default 10). Returns `PagedResult<ArticleDto>`. |
| GET | `/{id}` | Public | Read an article. |
| POST | `/` | Signed in | Create an article as multipart form data: `Title`, `Content`, optional `Summary`, `PgnData`, `FenData`, `ContentFormat`, `GameCollectionId`, and repeated `attachments` files. |
| PUT | `/{id}` | Author or Admin/SuperAdmin | Update an article using JSON `UpdateArticleRequest`. Setting `GameCollectionId` to null unlinks the collection. |
| DELETE | `/{id}` | Author or Admin/SuperAdmin | Delete an article. |
| GET | `/{id}/comments` | Public | List paged comments; query `page` (default 1) and `pageSize` (default 10). |
| POST | `/{id}/comments` | Signed in | Add a comment with JSON `CreateCommentRequest`. Comment-lock rules apply. |
| PUT | `/comments/{commentId}` | Comment author | Edit a comment with JSON `CreateCommentRequest`. |
| DELETE | `/comments/{commentId}` | Comment author or Admin/SuperAdmin | Delete a comment. |
| PUT | `/{id}/comments-lock` | Article author or Admin/SuperAdmin | Lock or unlock comments with JSON `{ "locked": true }`. |
| POST | `/{id}/reactions` | Signed in | Toggle an article reaction with JSON `{ "reactionType": <enum> }`. |
| POST | `/comments/{commentId}/reactions` | Signed in | Toggle a comment reaction with JSON `{ "reactionType": <enum> }`. |
| POST | `/attachments` | Signed in | Upload one inline attachment as multipart form field `file`. Attach it to an article through its subsequent create/update workflow. Subject to upload limits and scanning. |
| GET | `/attachments/{attachmentId}` | Public route | Stream an attachment when it is eligible for public access; the action checks the associated content and quarantine state. |

Article request validation includes 200-character titles, 1,000-character summaries, 30,000-character plain text or 50,000-character rich JSON, 15,000-character PGN, and 150-character FEN. Comments are limited to 5,000 characters. Each file is limited to 5 MiB and an extension/content allowlist. See [architecture](architecture.md#upload-handling) for sanitization and scanning.

## Calendar

Base path: `/api/calendar`

| Method | Path | Access | Purpose and input |
| --- | --- | --- | --- |
| GET | `/events` | Public | List events; optional query filters `start`, `end`, and `category`. |
| POST | `/events` | Admin | Create event with JSON `CreateCalendarEventRequest`, including recurrence settings. |
| DELETE | `/events/{id}` | Admin | Delete an event; query `deleteSeries` (default `false`) selects whether to delete the full recurring series. |
| GET | `/events/{id}/ics` | Public | Export one event as iCalendar. |
| GET | `/events/series/{recurrenceGroupId}/ics` | Public | Export a recurring series as iCalendar. |
| GET | `/feeds` | Admin | List configured external feeds. |
| POST | `/feeds` | Admin | Add a calendar feed using a `CalendarFeed` JSON body. |
| POST | `/feeds/{feedId}/sync` | Admin | Synchronize one feed. |
| POST | `/sync-all` | Admin | Synchronize all enabled feeds. |
| POST | `/events/{id}/subscribe` | Signed in | Subscribe to one event. |
| POST | `/events/series/{seriesId}/subscribe` | Signed in | Subscribe to a recurring series. |
| DELETE | `/events/{id}/subscribe` | Signed in | Unsubscribe from one event. |
| DELETE | `/events/series/{seriesId}/subscribe` | Signed in | Unsubscribe from a series. |
| GET | `/my-subscriptions` | Signed in | List the current user's event subscriptions. |

There is no calendar event update route or calendar-feed update/delete route in the current controller.

## Game Collections

All routes require a signed-in user. A user manages their own collections; Admin and SuperAdmin can also access collections. The controller applies these ownership/role checks when a collection ID is supplied.

| Method | Path | Purpose and input |
| --- | --- | --- |
| GET | `/api/gamecollections` | List the current user's collection summaries. |
| GET | `/api/gamecollections/{id}` | Read a collection and its ordered games. |
| POST | `/api/gamecollections` | Create JSON `CreateGameCollectionRequest` with a name and game list. |
| PUT | `/api/gamecollections/{id}` | Replace/update a collection with JSON `UpdateGameCollectionRequest`. Existing game IDs identify retained games; missing or unknown IDs create games. |
| DELETE | `/api/gamecollections/{id}` | Delete an owned collection. |
| GET | `/api/gamecollections/{id}/export` | Export an owned collection as PGN. |

## Notifications

All routes require a signed-in user. Inbox and read-state operations are scoped to the current recipient.

| Method | Path | Purpose and input |
| --- | --- | --- |
| GET | `/api/notifications` | Get inbox; query `page` (default 1), `pageSize` (default 20), and optional `unreadOnly`. |
| GET | `/api/notifications/unread-count` | Get unread count. |
| GET | `/api/notifications/audience-options` | Get the audiences available to the current user. |
| PUT | `/api/notifications/{notificationId}/read` | Mark a recipient's notification as read. |
| DELETE | `/api/notifications/{notificationId}` | Remove a notification from the current user's inbox. |
| POST | `/api/notifications` | Send a notification using `SendNotificationRequest`; allowed audience and recipient rules are checked server-side. |

## Partners

| Method | Path | Access | Purpose and input |
| --- | --- | --- | --- |
| GET | `/api/partners` | Public | List partners. |
| POST | `/api/partners` | Admin | Create a partner with a JSON `Partner` body. |
| POST | `/api/partners/upload` | Admin | Create a partner and optionally upload a logo using multipart fields `name`, `url`, `logoFile`, and `isActive`. |
| PUT | `/api/partners/{id}` | Admin | Update partner fields and optionally its logo using multipart form data. |
| POST | `/api/partners/reorder` | Admin | Set display order using JSON `{ "partnerIds": ["..."] }`. |
| GET | `/api/partners/{id}/logo` | Public | Stream a partner logo. |
| DELETE | `/api/partners/{id}` | Admin | Delete a partner. |

## Players

All routes require a signed-in user unless noted. The fields returned by player/profile routes are subject to API visibility rules.

| Method | Path | Access | Purpose and input |
| --- | --- | --- | --- |
| GET | `/api/player` | Signed in | List player summaries. |
| GET | `/api/player/{id}` | Signed in | Read a player profile. |
| PUT | `/api/player/{id}` | Admin or SuperAdmin | Update a player's profile using `UpdatePlayerRequest`. |
| PUT | `/api/player/me/nickname` | Signed in | Update the current user's nickname using `UpdateNicknameRequest`. |

## Teams and Availability

All team-administration routes require Admin. Team-availability routes require a signed-in user, with additional team membership, captain, or self-edit checks in action logic.

| Method | Path | Access | Purpose and input |
| --- | --- | --- | --- |
| GET | `/api/teams` | Admin | List teams. |
| POST | `/api/teams` | Admin | Create a team using `CreateTeamRequest`. |
| POST | `/api/teams/{teamId}/members` | Admin | Add a member using `AssignTeamMemberRequest`. |
| DELETE | `/api/teams/{teamId}/members/{userId}` | Admin | Remove a member. |
| PUT | `/api/teams/{teamId}/captain` | Admin | Set or clear captain using `AssignTeamCaptainRequest`. |
| DELETE | `/api/teams/{teamId}` | Admin | Delete a team. |
| GET | `/api/teamavailability/teams` | Signed in | List teams visible to the current user. |
| GET | `/api/teamavailability/team/{teamId}` | Team member or Admin | Read team availability, players, dates, and entries. |
| GET | `/api/teamavailability/players` | Signed in | Search players; optional query `teamId` and `query`. |
| POST | `/api/teamavailability/team/{teamId}/entries` | Team manager | Create an availability entry with `UpsertTeamAvailabilityEntryRequest`. |
| POST | `/api/teamavailability/team/{teamId}/dates` | Team manager | Add a match date with `AddTeamAvailabilityDateRequest`. |
| POST | `/api/teamavailability/team/{teamId}/players` | Team manager | Add a roster player with `AddTeamAvailabilityPlayerRequest`. |
| PUT | `/api/teamavailability/entries/{entryId}/self` | Entry owner | Update the current user's availability, driver flag, and notes. |
| PUT | `/api/teamavailability/entries/{entryId}` | Team manager | Update an availability entry. |
| DELETE | `/api/teamavailability/entries/{entryId}` | Team manager | Delete an availability entry. |
| PUT | `/api/teamavailability/team/{teamId}/captain` | Admin | Assign the team captain. |
| PUT | `/api/teamavailability/team/{teamId}/players/{playerId}/zaklad` | Team manager | Set a roster player's `IsZaklad` flag. |
| PUT | `/api/teamavailability/team/{teamId}/players/{playerId}/tag` | Team manager | Update a roster player's match tag. |
| PUT | `/api/teamavailability/team/{teamId}/season` | Team manager | Set season start/end dates. |
| GET | `/api/teamavailability/team/{teamId}/season-report` | Team member or Admin | Get the team's season report. |

The backend's team-manager checks are based on the team captain and administrative rules; they are not separate HTTP roles.

## Logging

| Method | Path | Access | Purpose and input |
| --- | --- | --- | --- |
| GET | `/api/logging/settings` | SuperAdmin | Read persisted minimum level and file retention settings. |
| PUT | `/api/logging/settings` | SuperAdmin | Update settings using `UpdateLoggingSettingsRequest`. |

## CSRF Token

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/api/csrf/token` | Public | Issue the request token and antiforgery cookie used by unsafe HTTP methods. Response is marked `Cache-Control: no-store`. |

## Errors and Development OpenAPI

Responses depend on the action. Common outcomes include `400` for invalid input, `401` when authentication is missing or invalid, `403` for a failed role/resource or cross-site check, `404` for a missing resource, `409` for duplicate/conflicting data, and `429` when an upload, login, or registration rate limit is reached. Calendar feed synchronization returns `502` when an upstream feed operation fails. Uploads can return `503` when malware scanning is enabled but unavailable; they are refused rather than accepted without a scan.

The backend maps the OpenAPI document only in Development, at `/openapi/v1.json`. The development and deployment setup is described in [development.md](development.md) and [deployment.md](deployment.md).
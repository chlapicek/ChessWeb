export interface User {
  id: string;
  email: string;
  nickname?: string;
  fullName: string;
  chessRating?: string;
  fideId?: string;
  roles: string[];
}

export interface NotificationAudienceTeam {
  id: string;
  name: string;
}

export interface NotificationAudienceUser {
  id: string;
  fullName: string;
  email: string;
}

export interface NotificationAudienceOptions {
  teams: NotificationAudienceTeam[];
  users: NotificationAudienceUser[];
  roles: string[];
  isAdministrator: boolean;
}

export interface NotificationInboxItem {
  id: string;
  title: string;
  message: string;
  internalLink?: string;
  senderName: string;
  createdAt: string;
  isRead: boolean;
  readAt?: string;
}

export interface NotificationInbox {
  items: NotificationInboxItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface Team {
  id: string;
  name: string;
  memberCount: number;
  userIds: string[];
  captainUserId?: string;
  captainName?: string;
}

export interface TeamPlayer {
  userId: string;
  fullName: string;
  chessRating?: string;
}

export interface ExistingPlayer extends TeamPlayer {
  isTeamMember: boolean;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  expiresAt: string;
  user: User;
}

export interface Attachment {
  id: string;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
  uploadedAt: string;
}

export type ArticleReactionType = 0 | 1 | 2 | 3 | 4; // 0: Like, 1: Heart, 2: Chess, 3: Insightful, 4: Trophy

export interface ReactionSummary {
  reactionType: ArticleReactionType;
  count: number;
  userReacted: boolean;
}

export interface ArticleComment {
  id: string;
  articleId: string;
  content: string;
  createdAt: string;
  updatedAt?: string | null;
  authorId: string;
  authorName: string;
  authorRating?: string | null;
  reactions: ReactionSummary[];
  canEdit: boolean;
  canDelete: boolean;
}

export type ArticleContentFormat = 0 | 1; // 0: PlainText (legacy), 1: RichJson

export interface CommentsLockResult {
  commentsLocked: boolean;
}

export interface GameCollectionSummary {
  id: string;
  name: string;
  gameCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GameCollectionGame {
  id: string;
  orderIndex: number;
  pgn: string;
  label?: string;
}

export interface GameCollectionDetail {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  games: GameCollectionGame[];
}


export interface ArticleCollection {
  id: string;
  name: string;
  games: GameCollectionGame[];
}

export interface Article {
  id: string;
  title: string;
  summary?: string | null;
  content: string;
  contentFormat: ArticleContentFormat;
  excerpt: string;
  pgnData?: string | null;
  fenData?: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt?: string | null;
  authorId: string;
  authorName: string;
  authorRating?: string | null;
  attachments: Attachment[];
  reactions: ReactionSummary[];
  commentsCount: number;
  commentsLocked: boolean;
  gameCollectionId?: string | null;
  collection?: ArticleCollection | null;
}

export type RecurrenceType = 0 | 1 | 2 | 3 | 4;

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  category: number;
  recurrence: RecurrenceType;
  recurrenceGroupId?: string;
  externalUrl?: string;
  externalUid?: string;
  sourceFeedName?: string;
  createdAt: string;
}

export interface Partner {
  id: string;
  name: string;
  url: string;
  logoUrl: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
}

export interface PlayerSummary {
  id: string;
  fullName: string | null;
  nickname: string | null;
  chessRating: string | null;
  fideId: string | null;
}

export interface PlayerProfile {
  id: string;
  fullName: string | null;
  nickname: string | null;
  chessRating: string | null;
  fideId: string | null;
  isSelf: boolean;
}

export type AvailabilityStatus = 0 | 1 | 2 | 3;
export type MatchPlayerTag = 0 | 1 | 2 | 3;

export interface TeamAvailabilityTeam {
  id: string;
  name: string;
  memberCount: number;
  captainUserId?: string;
  captainName?: string;
}

export interface TeamMember {
  userId: string;
  fullName: string;
  chessRating?: string;
}

export interface TeamAvailabilityEntry {
  id: string;
  teamId: string;
  playerUserId?: string;
  playerName: string;
  playerRating?: string;
  roundNumber: number;
  matchDate: string;
  opponentTeam: string;
  location: string;
  isHomeMatch: boolean;
  status: AvailabilityStatus;
  isDriver: boolean;
  notes?: string;
  updatedAt: string;
}

export interface TeamAvailabilityDate {
  id: string;
  teamId: string;
  roundNumber: number;
  matchDate: string;
  opponentTeam: string;
  location: string;
  isHomeMatch: boolean;
  isClosed: boolean;
}

export interface TeamAvailabilityPlayer {
  id: string;
  teamId: string;
  playerUserId?: string;
  playerName: string;
  playerRating?: string;
  isZaklad: boolean;
  tag: MatchPlayerTag;
}

export interface TeamAvailability {
  teamId: string;
  teamName: string;
  teamMembers: TeamMember[];
  captainUserId?: string;
  captainName?: string;
  seasonStartDate?: string;
  seasonEndDate?: string;
  dates: TeamAvailabilityDate[];
  players: TeamAvailabilityPlayer[];
  entries: TeamAvailabilityEntry[];
}

export interface SeasonReportEntry {
  playerId: string;
  playerName: string;
  matchesPlayed: number;
  meetsMinimum: boolean;
}

export interface UpsertTeamAvailabilityEntryRequest {
  playerUserId?: string | null;
  playerName: string;
  playerRating?: string | null;
  roundNumber: number;
  matchDate: string;
  opponentTeam: string;
  location: string;
  isHomeMatch: boolean;
  status: AvailabilityStatus;
  isDriver: boolean;
  notes?: string | null;
}

export interface AddTeamAvailabilityDateRequest {
  matchDate: string;
  opponentTeam?: string | null;
  location?: string | null;
  isHomeMatch: boolean;
}

export interface AddTeamAvailabilityPlayerRequest {
  playerUserId?: string | null;
  playerName?: string | null;
  isZaklad?: boolean;
  tag?: MatchPlayerTag;
}

export interface UpdateOwnTeamAvailabilityRequest {
  status: AvailabilityStatus;
  isDriver: boolean;
  notes?: string | null;
}

export interface UpdateZakladRequest {
  isZaklad: boolean;
}

export interface UpdateTagRequest {
  tag: MatchPlayerTag;
}

export interface UpdateTagRequest {
  tag: MatchPlayerTag;
}

export interface UpdateTeamSeasonRequest {
  seasonStartDate?: string | null;
  seasonEndDate?: string | null;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
}

export interface LoggingSettings {
  minimumLevel: string;
  retainedFileCountLimit: number;
  updatedAt: string;
}

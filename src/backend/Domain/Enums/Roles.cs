namespace ChessWeb.Domain.Enums;

public static class Roles
{
    public const string Admin = "Admin";
    public const string ClubMember = "ClubMember";
    public const string RegisteredUser = "RegisteredUser";
    public const string SuperAdmin = "SuperAdmin";

    public static readonly IReadOnlyList<string> AllRoles = [Admin, ClubMember, RegisteredUser, SuperAdmin];
}

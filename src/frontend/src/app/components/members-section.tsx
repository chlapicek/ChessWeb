import { Trophy, BookOpen, Users, Calendar, FileText, Award, Search, Trash2, Shield, UserCog } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import { Input } from "@/app/components/ui/input";
import { useState } from "react";
import { Button } from "@/app/components/ui/button";

interface ClubMember {
  id: number;
  name: string;
  rating: number;
  rank: number;
  wins: number;
  losses: number;
  draws: number;
  role?: "admin" | "moderator" | "member";
}

interface ClubAnnouncement {
  id: number;
  title: string;
  date: string;
  content: string;
  priority: "high" | "normal" | "low";
}

const mockLeaderboard: ClubMember[] = [
  { id: 1, name: "Alexandra Chen", rating: 2245, rank: 1, wins: 42, losses: 8, draws: 12, role: "member" },
  { id: 2, name: "Marcus Rodriguez", rating: 2198, rank: 2, wins: 38, losses: 12, draws: 15, role: "admin" },
  { id: 3, name: "Sarah Johnson", rating: 2156, rank: 3, wins: 35, losses: 14, draws: 11, role: "moderator" },
  { id: 4, name: "David Kim", rating: 2089, rank: 4, wins: 32, losses: 18, draws: 13, role: "member" },
  { id: 5, name: "Emma Williams", rating: 2034, rank: 5, wins: 28, losses: 20, draws: 14, role: "member" }
];

const mockAnnouncements: ClubAnnouncement[] = [
  {
    id: 1,
    title: "New Club Hours Starting February",
    date: "January 15, 2026",
    content: "Starting February 1st, the club will be open Tuesday-Sunday from 2 PM to 10 PM. Monday remains our maintenance day.",
    priority: "high"
  },
  {
    id: 2,
    title: "Annual Membership Renewal",
    date: "January 10, 2026",
    content: "Membership renewals for 2026 are now open. Early bird discount available until January 31st!",
    priority: "high"
  },
  {
    id: 3,
    title: "New Study Materials Available",
    date: "January 5, 2026",
    content: "We've added new endgame training books and video courses to our library. Check them out in the resources section!",
    priority: "normal"
  }
];

const clubResources = [
  {
    icon: BookOpen,
    title: "Chess Library",
    description: "Access to 200+ chess books and digital resources"
  },
  {
    icon: Trophy,
    title: "Training Programs",
    description: "Structured lessons for all skill levels"
  },
  {
    icon: Users,
    title: "Study Groups",
    description: "Weekly study sessions and game analysis"
  },
  {
    icon: Award,
    title: "Coaching",
    description: "One-on-one sessions with titled players"
  }
];

export function MembersSection({ isAdmin = false }: { isAdmin?: boolean }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [members, setMembers] = useState<ClubMember[]>(mockLeaderboard);

  const filteredMembers = members.filter((member) => {
    const query = searchQuery.toLowerCase();
    return (
      member.name.toLowerCase().includes(query) ||
      (member.role && member.role.toLowerCase().includes(query))
    );
  });

  const handleDeleteMember = (memberId: number) => {
    setMembers(members.filter(m => m.id !== memberId));
  };

  const getRoleBadge = (role?: string) => {
    if (role === "admin") return <Badge className="bg-red-600">Admin</Badge>;
    if (role === "moderator") return <Badge className="bg-blue-600">Moderator</Badge>;
    return <Badge variant="secondary">Member</Badge>;
  };

  const filteredAnnouncements = mockAnnouncements.filter((announcement) => {
    const query = searchQuery.toLowerCase();
    return (
      announcement.title.toLowerCase().includes(query) ||
      announcement.content.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl mb-2">Members Area</h2>
        <p className="text-muted-foreground">Club information, rankings, and resources for members</p>
      </div>

      <Tabs defaultValue="announcements" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
        </TabsList>

        <TabsContent value="announcements" className="space-y-4 mt-6">
          {/* Search Bar for Announcements */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search announcements..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {filteredAnnouncements.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No announcements found matching "{searchQuery}"
              </CardContent>
            </Card>
          ) : (
            filteredAnnouncements.map((announcement) => (
              <Card key={announcement.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {announcement.priority === "high" && (
                          <Badge variant="destructive">Important</Badge>
                        )}
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Calendar className="size-3" />
                          {announcement.date}
                        </span>
                      </div>
                      <CardTitle className="text-xl">{announcement.title}</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{announcement.content}</p>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="leaderboard" className="space-y-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search members by name or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          {filteredMembers.map((member, index) => (
            <Card key={member.id} className={index < 3 ? "border-2 border-primary/20" : ""}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="text-3xl font-bold text-muted-foreground">
                      #{member.rank}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">{member.name}</h3>
                        {getRoleBadge(member.role)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        <div className="flex items-center gap-1">
                          <Trophy className="size-4" />
                          <span>{member.rating}</span>
                        </div>
                        <div>
                          W: {member.wins} / L: {member.losses} / D: {member.draws}
                        </div>
                      </div>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                      >
                        <UserCog className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteMember(member.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="resources" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            {clubResources.map((resource, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <resource.icon className="size-5" />
                    {resource.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{resource.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-5" />
                Club Documents
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="p-3 rounded border hover:bg-accent cursor-pointer transition-colors">
                📄 Club Constitution & Bylaws
              </div>
              <div className="p-3 rounded border hover:bg-accent cursor-pointer transition-colors">
                📄 Code of Conduct
              </div>
              <div className="p-3 rounded border hover:bg-accent cursor-pointer transition-colors">
                📄 Tournament Rules & Regulations
              </div>
              <div className="p-3 rounded border hover:bg-accent cursor-pointer transition-colors">
                📄 Membership Benefits Guide
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
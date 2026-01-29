import { User, Mail, Phone, MapPin, Calendar, Trophy, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Avatar, AvatarFallback } from "@/app/components/ui/avatar";

interface UserProfileProps {
  username: string;
  isAdmin: boolean;
}

export function UserProfile({ username, isAdmin }: UserProfileProps) {
  // Mock user data
  const userData = {
    name: username,
    email: "user@gmchessclub.com",
    phone: "(555) 123-4567",
    location: "New York, USA",
    joinDate: "January 2020",
    rating: 1850,
    gamesPlayed: 247,
    winRate: 58,
    role: isAdmin ? "Admin" : "Member"
  };

  const recentActivity = [
    { type: "forum", title: "Posted in Strategy Discussion", time: "2 hours ago" },
    { type: "event", title: "Registered for Monthly Blitz Tournament", time: "1 day ago" },
    { type: "game", title: "Won against KnightRider", time: "3 days ago" },
    { type: "forum", title: "Replied to Best opening for beginners?", time: "5 days ago" }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl mb-2">Profile</h2>
        <p className="text-muted-foreground">Your account information and activity</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Profile Info */}
        <div className="md:col-span-1">
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <Avatar className="size-24">
                  <AvatarFallback className="text-2xl">
                    {username.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
              <CardTitle className="text-xl">{userData.name}</CardTitle>
              <Badge className={isAdmin ? "bg-red-600" : "bg-blue-600"}>
                {userData.role}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="size-4 text-muted-foreground" />
                <span>{userData.email}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="size-4 text-muted-foreground" />
                <span>{userData.phone}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="size-4 text-muted-foreground" />
                <span>{userData.location}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="size-4 text-muted-foreground" />
                <span>Joined {userData.joinDate}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats and Activity */}
        <div className="md:col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Target className="size-4" />
                  Rating
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{userData.rating}</div>
                <p className="text-xs text-muted-foreground mt-1">Standard rating</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Trophy className="size-4" />
                  Games Played
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{userData.gamesPlayed}</div>
                <p className="text-xs text-muted-foreground mt-1">Total games</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Target className="size-4" />
                  Win Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{userData.winRate}%</div>
                <p className="text-xs text-muted-foreground mt-1">Success rate</p>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-start gap-3 pb-4 border-b last:border-0 last:pb-0">
                    <div className={`mt-1 size-2 rounded-full ${
                      activity.type === 'forum' ? 'bg-blue-500' :
                      activity.type === 'event' ? 'bg-green-500' :
                      'bg-purple-500'
                    }`} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{activity.title}</p>
                      <p className="text-xs text-muted-foreground">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Achievements */}
          <Card>
            <CardHeader>
              <CardTitle>Achievements</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <Trophy className="size-8 mx-auto mb-2 text-yellow-600" />
                  <p className="text-xs font-medium">Tournament Winner</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <User className="size-8 mx-auto mb-2 text-blue-600" />
                  <p className="text-xs font-medium">Active Member</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <Target className="size-8 mx-auto mb-2 text-green-600" />
                  <p className="text-xs font-medium">100 Wins</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <Calendar className="size-8 mx-auto mb-2 text-purple-600" />
                  <p className="text-xs font-medium">3 Year Member</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

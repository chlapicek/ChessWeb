import { Trophy, Users, Award, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";

export function ClubHistory() {
  const milestones = [
    {
      year: "1985",
      title: "Club Founded",
      description: "Grandmaster Chess Club was established by a group of passionate chess enthusiasts.",
      icon: Trophy
    },
    {
      year: "1992",
      title: "First Tournament Victory",
      description: "Our club won the Regional Chess Championship for the first time.",
      icon: Award
    },
    {
      year: "2000",
      title: "200 Members Milestone",
      description: "The club reached 200 active members, becoming one of the largest in the region.",
      icon: Users
    },
    {
      year: "2010",
      title: "New Club House",
      description: "Moved to our current location with dedicated tournament halls and training rooms.",
      icon: Trophy
    },
    {
      year: "2015",
      title: "International Recognition",
      description: "Hosted the International Chess Masters Tournament with players from 25 countries.",
      icon: Award
    },
    {
      year: "2020",
      title: "Digital Transformation",
      description: "Launched online platform and virtual tournaments during the pandemic.",
      icon: Calendar
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl mb-2">Club History</h2>
        <p className="text-muted-foreground">Our journey through the years</p>
      </div>

      {/* Overview Stats */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Established
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">1985</div>
            <p className="text-xs text-muted-foreground mt-1">38 years of excellence</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Members
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">200+</div>
            <p className="text-xs text-muted-foreground mt-1">And growing</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Championships Won
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">47</div>
            <p className="text-xs text-muted-foreground mt-1">Regional and national</p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <div className="space-y-8 mt-8">
        <h3 className="text-xl font-semibold">Major Milestones</h3>
        <div className="relative border-l-2 border-border pl-8 space-y-10">
          {milestones.map((milestone, index) => {
            const Icon = milestone.icon;
            return (
              <div key={index} className="relative">
                {/* Timeline dot */}
                <div className="absolute -left-10 top-1 bg-primary text-primary-foreground rounded-full p-2">
                  <Icon className="size-4" />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-primary">{milestone.year}</span>
                  </div>
                  <h4 className="text-lg font-semibold">{milestone.title}</h4>
                  <p className="text-muted-foreground">{milestone.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legacy Section */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Our Legacy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            For nearly four decades, Grandmaster Chess Club has been a cornerstone of the chess community,
            fostering talent, promoting strategic thinking, and building lifelong friendships through the
            royal game.
          </p>
          <p className="text-muted-foreground">
            Our club has produced numerous master-level players, hosted international tournaments, and
            contributed significantly to chess education in our region. We continue to uphold the traditions
            of excellence while embracing innovation in chess training and competition.
          </p>
          <div className="grid md:grid-cols-2 gap-4 mt-6">
            <div className="bg-muted p-4 rounded-lg">
              <h5 className="font-semibold mb-2">Notable Alumni</h5>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• GM Alexandra Chen - International Master</li>
                <li>• IM Robert Martinez - National Champion 2018</li>
                <li>• FM Sarah Johnson - Youth Champion</li>
              </ul>
            </div>
            <div className="bg-muted p-4 rounded-lg">
              <h5 className="font-semibold mb-2">Major Achievements</h5>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• 12 Regional Championships</li>
                <li>• 3 National Team Victories</li>
                <li>• 100+ Youth Players Developed</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

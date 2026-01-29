import { Calendar, MapPin, Users, Clock, Search, Pin, Trash2, Edit } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { useState } from "react";

interface ChessEvent {
  id: number;
  title: string;
  date: string;
  time: string;
  location: string;
  type: string;
  participants: number;
  maxParticipants: number;
  description: string;
  status: "upcoming" | "registration-open" | "full";
  pinned?: boolean;
  pinnedUntil?: string;
}

const mockEvents: ChessEvent[] = [
  {
    id: 1,
    title: "Monthly Blitz Tournament",
    date: "January 25, 2026",
    time: "7:00 PM - 10:00 PM",
    location: "Main Club Hall",
    type: "Tournament",
    participants: 18,
    maxParticipants: 24,
    description: "Fast-paced blitz tournament with 5-minute games. All skill levels welcome!",
    status: "registration-open"
  },
  {
    id: 2,
    title: "Beginner's Workshop: Chess Fundamentals",
    date: "January 28, 2026",
    time: "6:00 PM - 8:00 PM",
    location: "Training Room A",
    type: "Workshop",
    participants: 8,
    maxParticipants: 12,
    description: "Learn the basics of chess strategy, tactics, and opening principles. Perfect for new players!",
    status: "registration-open"
  },
  {
    id: 3,
    title: "Simultaneous Exhibition with GM Alexandra Chen",
    date: "February 2, 2026",
    time: "2:00 PM - 5:00 PM",
    location: "Main Club Hall",
    type: "Special Event",
    participants: 20,
    maxParticipants: 20,
    description: "Play against Grandmaster Alexandra Chen in a simultaneous exhibition. Limited spots available!",
    status: "full"
  },
  {
    id: 4,
    title: "Club Championship - Round 1",
    date: "February 8, 2026",
    time: "1:00 PM - 6:00 PM",
    location: "Main Club Hall",
    type: "Championship",
    participants: 32,
    maxParticipants: 32,
    description: "Annual club championship begins! Classical time control (90min + 30sec increment).",
    status: "upcoming"
  },
  {
    id: 5,
    title: "Casual Game Night",
    date: "January 22, 2026",
    time: "7:00 PM - 11:00 PM",
    location: "Main Club Hall",
    type: "Social",
    participants: 15,
    maxParticipants: 40,
    description: "Relaxed evening of casual games, analysis, and socializing. Bring your friends!",
    status: "registration-open"
  }
];

export function EventsSection({ isAdmin = false }: { isAdmin?: boolean }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [events, setEvents] = useState<ChessEvent[]>(mockEvents);

  const togglePin = (eventId: number) => {
    setEvents(prevEvents => 
      prevEvents.map(event => {
        if (event.id === eventId) {
          if (event.pinned) {
            // Unpin
            return { ...event, pinned: false, pinnedUntil: undefined };
          } else {
            // Pin for 7 days
            const pinnedUntil = new Date();
            pinnedUntil.setDate(pinnedUntil.getDate() + 7);
            return { ...event, pinned: true, pinnedUntil: pinnedUntil.toISOString() };
          }
        }
        return event;
      })
    );
  };

  const handleDeleteEvent = (eventId: number) => {
    setEvents(events.filter(event => event.id !== eventId));
  };

  const filteredEvents = events
    .filter((event) => {
      const query = searchQuery.toLowerCase();
      return (
        event.title.toLowerCase().includes(query) ||
        event.location.toLowerCase().includes(query) ||
        event.type.toLowerCase().includes(query) ||
        event.description.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      // Pinned events first
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0;
    });

  const getStatusBadge = (status: ChessEvent["status"]) => {
    switch (status) {
      case "registration-open":
        return <Badge className="bg-green-600">Registration Open</Badge>;
      case "full":
        return <Badge variant="destructive">Full</Badge>;
      case "upcoming":
        return <Badge variant="secondary">Upcoming</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl mb-2">Events</h2>
          <p className="text-muted-foreground">Tournaments, workshops, and club activities</p>
        </div>
        <Button>Create Event</Button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search events by title, location, or type..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {filteredEvents.length === 0 ? (
          <div className="col-span-2">
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No events found matching "{searchQuery}"
              </CardContent>
            </Card>
          </div>
        ) : (
          filteredEvents.map((event) => (
            <Card key={event.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{event.type}</Badge>
                    {getStatusBadge(event.status)}
                    {event.pinned && (
                      <Badge className="bg-blue-600 flex items-center gap-1">
                        <Pin className="size-3" />
                        Pinned
                      </Badge>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePin(event.id);
                        }}
                        className={event.pinned ? "text-blue-600" : ""}
                      >
                        <Pin className={`size-4 ${event.pinned ? "fill-current" : ""}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                      >
                        <Edit className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteEvent(event.id);
                        }}
                        className="text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <CardTitle className="text-xl">{event.title}</CardTitle>
                <CardDescription>{event.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-2 text-sm">
                  <Calendar className="size-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <div>{event.date}</div>
                    <div className="text-muted-foreground flex items-center gap-1">
                      <Clock className="size-3" />
                      {event.time}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="size-4 text-muted-foreground" />
                  <span>{event.location}</span>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <Users className="size-4 text-muted-foreground" />
                  <span>{event.participants}/{event.maxParticipants} participants</span>
                </div>

                <Button 
                  className="w-full mt-4" 
                  disabled={event.status === "full"}
                >
                  {event.status === "full" ? "Event Full" : "Register"}
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
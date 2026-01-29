import { MessageSquare, ThumbsUp, User, Search, Pin, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { useState } from "react";
import { CreatePostDialog } from "@/app/components/create-post-dialog";
import { PostDetailDialog } from "@/app/components/post-detail-dialog";

interface ForumPost {
  id: number;
  title: string;
  author: string;
  category: string;
  replies: number;
  likes: number;
  timestamp: string;
  excerpt: string;
  pinned?: boolean;
  pinnedUntil?: string;
  content?: string;
}

const mockForumPosts: ForumPost[] = [
  {
    id: 1,
    title: "Best opening for beginners?",
    author: "ChessMaster92",
    category: "Strategy",
    replies: 24,
    likes: 15,
    timestamp: "2 hours ago",
    excerpt: "I've been teaching my nephew chess and wondering what opening would be best to start with..."
  },
  {
    id: 2,
    title: "Analysis of yesterday's tournament game",
    author: "KnightRider",
    category: "Analysis",
    replies: 8,
    likes: 32,
    timestamp: "5 hours ago",
    excerpt: "Looking for feedback on my Sicilian Defense game from round 3. I think I made a mistake on move 14..."
  },
  {
    id: 3,
    title: "Online chess platforms comparison",
    author: "PawnStorm",
    category: "General",
    replies: 45,
    likes: 28,
    timestamp: "1 day ago",
    excerpt: "What's everyone's favorite platform for playing online? I've been using chess.com but curious about alternatives..."
  },
  {
    id: 4,
    title: "Endgame study group - Week 3",
    author: "QueenGambit",
    category: "Study",
    replies: 12,
    likes: 19,
    timestamp: "1 day ago",
    excerpt: "This week we're focusing on rook endgames. Here are some positions to practice..."
  },
  {
    id: 5,
    title: "Club ladder challenge update",
    author: "RookMate",
    category: "Club News",
    replies: 31,
    likes: 22,
    timestamp: "2 days ago",
    excerpt: "Congratulations to all participants! Current standings and next round pairings are now available..."
  }
];

export function ForumSection({ isAdmin = false }: { isAdmin?: boolean }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [posts, setPosts] = useState<ForumPost[]>(mockForumPosts);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<ForumPost | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const togglePin = (postId: number) => {
    setPosts(prevPosts => 
      prevPosts.map(post => {
        if (post.id === postId) {
          if (post.pinned) {
            // Unpin
            return { ...post, pinned: false, pinnedUntil: undefined };
          } else {
            // Pin for 7 days
            const pinnedUntil = new Date();
            pinnedUntil.setDate(pinnedUntil.getDate() + 7);
            return { ...post, pinned: true, pinnedUntil: pinnedUntil.toISOString() };
          }
        }
        return post;
      })
    );
  };

  const filteredPosts = posts
    .filter((post) => {
      const query = searchQuery.toLowerCase();
      return (
        post.title.toLowerCase().includes(query) ||
        post.author.toLowerCase().includes(query) ||
        post.category.toLowerCase().includes(query) ||
        post.excerpt.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      // Pinned posts first
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0;
    });

  const handleCreatePost = (newPost: { title: string; category: string; content: string; file?: File }) => {
    const post: ForumPost = {
      id: posts.length + 1,
      title: newPost.title,
      author: "CurrentUser",
      category: newPost.category,
      replies: 0,
      likes: 0,
      timestamp: "Just now",
      excerpt: newPost.content.substring(0, 100) + "...",
      content: newPost.content,
    };
    setPosts([post, ...posts]);
  };

  const handleDeletePost = (postId: number) => {
    setPosts(posts.filter(post => post.id !== postId));
  };

  const handlePostClick = (post: ForumPost) => {
    setSelectedPost(post);
    setDetailDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl mb-2">Forum</h2>
          <p className="text-muted-foreground">Discuss chess strategy, share games, and connect with members</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>New Topic</Button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search forum topics, authors, or categories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="space-y-4">
        {filteredPosts.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No posts found matching "{searchQuery}"
            </CardContent>
          </Card>
        ) : (
          filteredPosts.map((post) => (
            <Card 
              key={post.id} 
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => handlePostClick(post)}
            >
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary">{post.category}</Badge>
                      {post.pinned && (
                        <Badge className="bg-blue-600 flex items-center gap-1">
                          <Pin className="size-3" />
                          Pinned
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-xl mb-2">{post.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">{post.excerpt}</p>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePin(post.id);
                        }}
                        className={post.pinned ? "text-blue-600" : ""}
                      >
                        <Pin className={`size-4 ${post.pinned ? "fill-current" : ""}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePost(post.id);
                        }}
                        className="text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <User className="size-4" />
                      <span>{post.author}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MessageSquare className="size-4" />
                      <span>{post.replies} replies</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <ThumbsUp className="size-4" />
                      <span>{post.likes}</span>
                    </div>
                  </div>
                  <span>{post.timestamp}</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      
      <CreatePostDialog 
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreatePost}
      />
      
      <PostDetailDialog
        post={selectedPost}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
      />
    </div>
  );
}
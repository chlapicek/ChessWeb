import { MessageSquare, ThumbsUp, User, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Textarea } from "@/app/components/ui/textarea";
import { useState } from "react";

interface ForumPost {
  id: number;
  title: string;
  author: string;
  category: string;
  replies: number;
  likes: number;
  timestamp: string;
  excerpt: string;
  content?: string;
  pinned?: boolean;
}

interface PostDetailDialogProps {
  post: ForumPost | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PostDetailDialog({ post, open, onOpenChange }: PostDetailDialogProps) {
  const [replyText, setReplyText] = useState("");
  const [replies, setReplies] = useState<Array<{ author: string; text: string; timestamp: string }>>([
    {
      author: "PawnStorm",
      text: "Great insights! I've been struggling with this opening myself.",
      timestamp: "1 hour ago"
    },
    {
      author: "QueenGambit",
      text: "Have you considered the Sicilian Defense? It might work better in this position.",
      timestamp: "45 minutes ago"
    }
  ]);

  if (!post) return null;

  const handleReply = () => {
    if (!replyText.trim()) return;
    
    setReplies([...replies, {
      author: "CurrentUser",
      text: replyText,
      timestamp: "Just now"
    }]);
    setReplyText("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="secondary">{post.category}</Badge>
            {post.pinned && (
              <Badge className="bg-blue-600">Pinned</Badge>
            )}
          </div>
          <DialogTitle className="text-2xl">{post.title}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Post metadata */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <User className="size-4" />
              <span>{post.author}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="size-4" />
              <span>{post.timestamp}</span>
            </div>
            <div className="flex items-center gap-1">
              <ThumbsUp className="size-4" />
              <span>{post.likes} likes</span>
            </div>
          </div>

          {/* Post content */}
          <div className="prose max-w-none">
            <p>{post.excerpt}</p>
            {post.content && <p className="mt-4">{post.content}</p>}
          </div>

          {/* Replies section */}
          <div className="border-t pt-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <MessageSquare className="size-5" />
              {replies.length} Replies
            </h3>
            
            <div className="space-y-4 mb-6">
              {replies.map((reply, index) => (
                <div key={index} className="bg-muted p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <User className="size-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{reply.author}</span>
                    <span className="text-xs text-muted-foreground">• {reply.timestamp}</span>
                  </div>
                  <p className="text-sm">{reply.text}</p>
                </div>
              ))}
            </div>

            {/* Reply form */}
            <div className="space-y-3">
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a reply..."
                rows={3}
              />
              <div className="flex justify-end">
                <Button onClick={handleReply}>Post Reply</Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

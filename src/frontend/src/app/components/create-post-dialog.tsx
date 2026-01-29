import { useState } from "react";
import { X, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { useTranslation } from "react-i18next";

interface CreatePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (post: {
    title: string;
    category: string;
    content: string;
    file?: File;
  }) => void;
}

export function CreatePostDialog({ open, onOpenChange, onSubmit }: CreatePostDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      title,
      category,
      content,
      ...(file && { file }),
    });
    // Reset form
    setTitle("");
    setCategory("");
    setContent("");
    setFile(null);
    onOpenChange(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t("createNewForumPost")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">{t("title")}</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("enterPostTitle")}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">{t("category")}</Label>
            <Select value={category} onValueChange={setCategory} required>
              <SelectTrigger>
                <SelectValue placeholder={t("selectCategory")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Strategy">{t("strategy")}</SelectItem>
                <SelectItem value="Analysis">{t("analysis")}</SelectItem>
                <SelectItem value="General">{t("general")}</SelectItem>
                <SelectItem value="Study">{t("study")}</SelectItem>
                <SelectItem value="Club News">{t("clubNews")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">{t("content")}</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("writePostContent")}
              rows={6}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="file">{t("attachment")}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="file"
                type="file"
                onChange={handleFileChange}
                accept=".pgn,.pdf,.jpg,.jpeg,.png,.gif"
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById("file")?.click()}
                className="w-full"
              >
                <Upload className="size-4 mr-2" />
                {file ? file.name : t("chooseFile")}
              </Button>
              {file && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setFile(null)}
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("supportedFormats")}
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit">{t("createPost")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
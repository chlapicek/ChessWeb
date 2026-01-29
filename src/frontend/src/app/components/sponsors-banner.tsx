import { Card } from "@/app/components/ui/card";
import { useTranslation } from "react-i18next";

const sponsors = [
  { name: "ChessMaster Pro", logo: "♔" },
  { name: "Knight & Bishop Coffee", logo: "☕" },
  { name: "Strategic Minds Academy", logo: "🎓" },
  { name: "Rook Financial", logo: "🏦" },
  { name: "Queen's Gambit Bookstore", logo: "📚" },
  { name: "Endgame Solutions", logo: "💼" },
];

export function SponsorsBanner() {
  const { t } = useTranslation();
  
  return (
    <aside className="hidden lg:block fixed left-0 top-32 w-48 p-4 z-40">
      <Card className="p-4 bg-card">
        <h3 className="text-sm font-semibold mb-4 text-muted-foreground">
          {t("ourSponsors")}
        </h3>
        <div className="space-y-3">
          {sponsors.map((sponsor, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-2 rounded hover:bg-accent transition-colors cursor-pointer"
            >
              <span className="text-xl">{sponsor.logo}</span>
              <span className="text-xs font-medium leading-tight">{sponsor.name}</span>
            </div>
          ))}
        </div>
      </Card>
    </aside>
  );
}
import { useState } from "react";
import { Trophy, Menu, X, LogOut, User, Globe, BookOpen, UserCircle } from "lucide-react";
import { ForumSection } from "@/app/components/forum-section";
import { EventsSection } from "@/app/components/events-section";
import { MembersSection } from "@/app/components/members-section";
import { LoginPage } from "@/app/components/login-page";
import { SponsorsBanner } from "@/app/components/sponsors-banner";
import { ClubHistory } from "@/app/components/club-history";
import { UserProfile } from "@/app/components/user-profile";
import { ThemeToggle } from "@/app/components/theme-toggle";
import { Button } from "@/app/components/ui/button";
import { useTranslation } from "react-i18next";
import "@/i18n";
import FetchButton from "./components/ui/fetch-button";

type Section = "forum" | "events" | "members" | "profile" | "history";

export default function App() {
  const { t, i18n } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>("forum");

  const handleLogin = (username: string) => {
    setUser(username);
    // Set admin if username is "admin"
    setIsAdmin(username.toLowerCase() === "admin");
  };

  const handleLogout = () => {
    setUser(null);
    setIsAdmin(false);
  };

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === "en" ? "cs" : "en");
  };

  // Show login page if not authenticated
  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Trophy className="size-8 text-primary" />
              <div>
                <h1 className="text-2xl">{t("clubName")}</h1>
                <p className="text-sm text-muted-foreground hidden sm:block">
                  {t("clubSubtitle")}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="p-8">
                <h1 className="text-2xl font-bold mb-4">HERE</h1>
                <FetchButton />
              </div>
              {/* Desktop Navigation */}
              <nav className="hidden md:flex items-center gap-2 mr-4">
                <Button
                  variant={activeSection === "forum" ? "default" : "ghost"}
                  onClick={() => setActiveSection("forum")}
                >
                  {t("forum")}
                </Button>
                <Button
                  variant={activeSection === "events" ? "default" : "ghost"}
                  onClick={() => setActiveSection("events")}
                >
                  {t("events")}
                </Button>
                <Button
                  variant={activeSection === "members" ? "default" : "ghost"}
                  onClick={() => setActiveSection("members")}
                >
                  {t("members")}
                </Button>
                <Button
                  variant={activeSection === "profile" ? "default" : "ghost"}
                  onClick={() => setActiveSection("profile")}
                >
                  <UserCircle className="size-4 mr-2" />
                  {t("profile")}
                </Button>
                <Button
                  variant={activeSection === "history" ? "default" : "ghost"}
                  onClick={() => setActiveSection("history")}
                >
                  <BookOpen className="size-4 mr-2" />
                  {t("history")}
                </Button>
              </nav>

              {/* Language Switcher */}
              <ThemeToggle />
              
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleLanguage}
                className="hidden md:flex"
              >
                <Globe className="size-4 mr-2" />
                {i18n.language === "en" ? "CS" : "EN"}
              </Button>

              {/* User info - hidden on mobile */}
              <div className="hidden md:flex items-center gap-2 mr-2">
                <User className="size-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{user}</span>
                {isAdmin && (
                  <span className="text-xs bg-red-600 text-white px-2 py-1 rounded">
                    {t("admin")}
                  </span>
                )}
              </div>
              
              {/* Logout button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="hidden md:flex"
              >
                <LogOut className="size-4 mr-2" />
                {t("logout")}
              </Button>

              {/* Mobile menu button */}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
              </Button>
            </div>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="md:hidden mt-4 pt-4 border-t space-y-2">
              <div className="bg-muted p-3 rounded-lg mb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="size-4 text-muted-foreground" />
                    <span className="text-sm">{user}</span>
                    {isAdmin && (
                      <span className="text-xs bg-red-600 text-white px-2 py-1 rounded">
                        {t("admin")}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLogout}
                  >
                    <LogOut className="size-4 mr-2" />
                    {t("logout")}
                  </Button>
                </div>
              </div>

              <Button
                variant={activeSection === "forum" ? "default" : "ghost"}
                onClick={() => {
                  setActiveSection("forum");
                  setMobileMenuOpen(false);
                }}
                className="w-full justify-start"
              >
                {t("forum")}
              </Button>
              <Button
                variant={activeSection === "events" ? "default" : "ghost"}
                onClick={() => {
                  setActiveSection("events");
                  setMobileMenuOpen(false);
                }}
                className="w-full justify-start"
              >
                {t("events")}
              </Button>
              <Button
                variant={activeSection === "members" ? "default" : "ghost"}
                onClick={() => {
                  setActiveSection("members");
                  setMobileMenuOpen(false);
                }}
                className="w-full justify-start"
              >
                {t("members")}
              </Button>
              <Button
                variant={activeSection === "profile" ? "default" : "ghost"}
                onClick={() => {
                  setActiveSection("profile");
                  setMobileMenuOpen(false);
                }}
                className="w-full justify-start"
              >
                <UserCircle className="size-4 mr-2" />
                {t("profile")}
              </Button>
              <Button
                variant={activeSection === "history" ? "default" : "ghost"}
                onClick={() => {
                  setActiveSection("history");
                  setMobileMenuOpen(false);
                }}
                className="w-full justify-start"
              >
                <BookOpen className="size-4 mr-2" />
                {t("history")}
              </Button>
              <Button
                variant="ghost"
                onClick={toggleLanguage}
                className="w-full justify-start"
              >
                <Globe className="size-4 mr-2" />
                {i18n.language === "en" ? "Čeština" : "English"}
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Sponsors Banner */}
      <SponsorsBanner />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 lg:pl-56">
        {activeSection === "forum" && <ForumSection isAdmin={isAdmin} />}
        {activeSection === "events" && <EventsSection isAdmin={isAdmin} />}
        {activeSection === "members" && <MembersSection isAdmin={isAdmin} />}
        {activeSection === "profile" && <UserProfile username={user || ""} isAdmin={isAdmin} />}
        {activeSection === "history" && <ClubHistory />}
      </main>

      {/* Footer */}
      <footer className="border-t mt-16 py-8 bg-card">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h3 className="font-semibold mb-3">{t("aboutUs")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("aboutUsText")}
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-3">{t("contact")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("email")}: info@gmchessclub.com<br />
                {t("phone")}: (555) 123-4567<br />
                {t("address")}: 123 Chess Boulevard
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-3">{t("hours")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("hoursText")}<br />
                {t("mondayClosed")}<br />
                {t("specialEvents")}
              </p>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t text-center text-sm text-muted-foreground">
            {t("copyright")}
          </div>
        </div>
      </footer>
    </div>
  );
}
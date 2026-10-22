// Admin layout: grouped sidebar navigation on desktop, a slide-out menu on
// phones, and a page header for the current section.
import { useState, type ComponentType, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpenCheck,
  CalendarRange,
  Bot,
  ExternalLink,
  FileQuestion,
  Home,
  Keyboard,
  Layers,
  Library,
  ListChecks,
  LogOut,
  Megaphone,
  Menu,
  Newspaper,
  MessageSquareText,
  NotebookPen,
  PlugZap,
  Settings2,
  Sparkles,
  SquarePen,
  Target,
  Users,
  UserSquare2,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Icon = ComponentType<{ className?: string }>;

export type AdminSectionId =
  | "home"
  | "flashcards"
  | "mcq"
  | "mcqPractice"
  | "saathi"
  | "saathiAnswers"
  | "ca.daily"
  | "ca.monthly"
  | "ca.custom"
  | "ca.settings"
  | "bot.broadcast"
  | "bot.commands"
  | "bot.replies"
  | "bot.messages"
  | "bot.stats"
  | "bot.users"
  | "bot.connection"
  | "bot.flashcards"
  | "bot.mcq"
  | "users";

type SectionDef = { id: AdminSectionId; label: string; icon: Icon; description: string };

export const ADMIN_GROUPS: { label: string; sections: SectionDef[] }[] = [
  {
    label: "Website",
    sections: [
      {
        id: "home",
        label: "Home page",
        icon: Home,
        description: "Banners, call-to-action and which features show on the homepage.",
      },
    ],
  },
  {
    label: "Study content",
    sections: [
      {
        id: "flashcards",
        label: "Flashcards",
        icon: Layers,
        description: "Flashcard decks by subject and topic.",
      },
      {
        id: "mcq",
        label: "MCQ tests",
        icon: ListChecks,
        description: "Timed multiple-choice tests.",
      },
      {
        id: "mcqPractice",
        label: "MCQ practice",
        icon: Target,
        description: "Practice questions with instant feedback.",
      },
    ],
  },
  {
    label: "SAATHI",
    sections: [
      {
        id: "saathi",
        label: "Knowledge base",
        icon: Sparkles,
        description:
          "Study material SAATHI answers from. SAATHI only answers from what you save here.",
      },
      {
        id: "saathiAnswers",
        label: "Answer writing",
        icon: NotebookPen,
        description: "RAS Mains model answers, and the answer blueprints SAATHI learns from them.",
      },
    ],
  },
  {
    label: "Current affairs",
    sections: [
      {
        id: "ca.daily",
        label: "Daily magazine",
        icon: Newspaper,
        description:
          "Upload the day's sources, review the news items and approve the bilingual magazine for the channel.",
      },
      {
        id: "ca.monthly",
        label: "Monthly magazine",
        icon: CalendarRange,
        description: "The whole month in one magazine, with later corrections applied.",
      },
      {
        id: "ca.custom",
        label: "Custom magazines",
        icon: Library,
        description:
          "Special magazines on a theme over any dates, sorted into sections and subsections by the AI.",
      },
      {
        id: "ca.settings",
        label: "Magazine settings",
        icon: Settings2,
        description: "Channel, posting time, logos and PDF set-up.",
      },
    ],
  },
  {
    label: "Telegram bot",
    sections: [
      {
        id: "bot.broadcast",
        label: "Broadcast",
        icon: Megaphone,
        description: "Send or schedule messages to bot users.",
      },
      {
        id: "bot.commands",
        label: "Commands",
        icon: Keyboard,
        description: "Commands users type, like /notes, and the / menu.",
      },
      {
        id: "bot.replies",
        label: "Auto-replies",
        icon: MessageSquareText,
        description: "Automatic answers to messages containing keywords.",
      },
      {
        id: "bot.messages",
        label: "Messages & profile",
        icon: SquarePen,
        description: "What the bot says, its name and descriptions, and the menu button.",
      },
      {
        id: "bot.stats",
        label: "Stats",
        icon: BarChart3,
        description: "How the bot is being used.",
      },
      {
        id: "bot.users",
        label: "Bot users",
        icon: Users,
        description: "People who have used the bot.",
      },
      {
        id: "bot.connection",
        label: "Connection",
        icon: PlugZap,
        description: "Webhook status and security.",
      },
      {
        id: "bot.flashcards",
        label: "Bot flashcards",
        icon: BookOpenCheck,
        description: "Flashcards used only inside the bot.",
      },
      {
        id: "bot.mcq",
        label: "Bot MCQs",
        icon: FileQuestion,
        description: "MCQ quizzes used only inside the bot.",
      },
    ],
  },
  {
    label: "People",
    sections: [
      {
        id: "users",
        label: "Mini App users",
        icon: UserSquare2,
        description: "People who signed in through the Telegram Mini App.",
      },
    ],
  },
];

const ALL_SECTIONS = ADMIN_GROUPS.flatMap((g) => g.sections);

export function isAdminSection(id: unknown): id is AdminSectionId {
  return typeof id === "string" && ALL_SECTIONS.some((s) => s.id === id);
}

function NavList({
  current,
  onSelect,
}: {
  current: AdminSectionId;
  onSelect: (id: AdminSectionId) => void;
}) {
  return (
    <nav className="space-y-5" aria-label="Admin sections">
      {ADMIN_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </div>
          <ul className="space-y-0.5">
            {group.sections.map((s) => {
              const active = s.id === current;
              const Icon = s.icon;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(s.id)}
                    aria-current={active ? "page" : undefined}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      active
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-foreground/75 hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-3">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Bot className="h-4 w-4" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold">FlashGyan</div>
        <div className="text-xs text-muted-foreground">Admin</div>
      </div>
    </div>
  );
}

function FooterLinks({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="space-y-0.5 border-t border-border pt-3">
      <Link
        to="/"
        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground/75 hover:bg-muted hover:text-foreground"
      >
        <ExternalLink className="h-4 w-4" /> View website
      </Link>
      <button
        type="button"
        onClick={onSignOut}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-foreground/75 hover:bg-muted hover:text-foreground"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}

export function AdminShell({
  section,
  onNavigate,
  onSignOut,
  children,
}: {
  section: AdminSectionId;
  onNavigate: (id: AdminSectionId) => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const current = ALL_SECTIONS.find((s) => s.id === section) ?? ALL_SECTIONS[0];
  const group = ADMIN_GROUPS.find((g) => g.sections.some((s) => s.id === current.id));

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:sticky lg:top-0 lg:h-dvh lg:flex-col lg:gap-5 lg:border-r lg:border-border lg:bg-card/60 lg:px-3 lg:py-5">
        <Brand />
        <div className="-mx-3 min-h-0 flex-1 overflow-y-auto px-3">
          <NavList current={current.id} onSelect={onNavigate} />
        </div>
        <FooterLinks onSignOut={onSignOut} />
      </aside>

      {/* Phone top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="grid h-9 w-9 place-items-center rounded-lg border border-border"
          aria-label="Open admin menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <div className="truncate text-xs text-muted-foreground">{group?.label}</div>
          <div className="truncate text-sm font-semibold">{current.label}</div>
        </div>
      </header>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="flex w-72 flex-col gap-5 overflow-y-auto p-3 pt-5">
          <SheetHeader className="sr-only">
            <SheetTitle>Admin menu</SheetTitle>
          </SheetHeader>
          <Brand />
          <div className="flex-1">
            <NavList
              current={current.id}
              onSelect={(id) => {
                onNavigate(id);
                setMenuOpen(false);
              }}
            />
          </div>
          <FooterLinks onSignOut={onSignOut} />
        </SheetContent>
      </Sheet>

      <main className="min-w-0 px-4 py-6 pb-24 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          <div className="hidden lg:block">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {group?.label}
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{current.label}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{current.description}</p>
          </div>
          <p className="text-sm text-muted-foreground lg:hidden">{current.description}</p>
          {children}
        </div>
      </main>
    </div>
  );
}

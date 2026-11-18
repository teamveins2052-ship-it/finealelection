import {
  BookOpen,
  Briefcase,
  Camera,
  Code2,
  Landmark,
  Lightbulb,
  Music,
  Palette,
  Rocket,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Positions store a lucide icon *name* (SCHEMA positions.icon); map it to a component here. */
const ICONS: Record<string, LucideIcon> = {
  Landmark,
  Trophy,
  Camera,
  Sparkles,
  Music,
  Code2,
  BookOpen,
  Users,
  Palette,
  Rocket,
  Briefcase,
  TrendingUp,
  Lightbulb,
};

export const CLUB_ICON_NAMES = Object.keys(ICONS);
export const CLUB_COLORS = [
  "#0BA5EC",
  "#F79009",
  "#10B981",
  "#FF5A36",
  "#EE46BC",
  "#12B76A",
  "#5B3DF5",
  "#667085",
];

export const CLUB_LOGOS: Record<string, string> = {
  // mapped by position id
  "genai-lead": "/clubs/genai.png",
  "tech-lead": "/clubs/tech-lead.png",
  "edc-lead": "/clubs/edc.png",
  "media-head": "/clubs/media.jpg",
  "arts-head": "/clubs/art.png",
  "sports-president": "/clubs/sports.png",
  // mapped by icon name
  Sparkles: "/clubs/genai.png",
  Code2: "/clubs/tech-lead.png",
  Rocket: "/clubs/edc.png",
  Camera: "/clubs/media.jpg",
  Palette: "/clubs/art.png",
  Trophy: "/clubs/sports.png",
};

export function ClubIcon({
  name,
  id,
  color,
  className = "size-5",
  preferIcon = false,
}: {
  name: string;
  id?: string;
  color?: string;
  className?: string;
  preferIcon?: boolean;
}) {
  const logo = !preferIcon && ((id && CLUB_LOGOS[id]) || CLUB_LOGOS[name]);

  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt={`${name} logo`}
        className={cn("object-contain shrink-0", className)}
      />
    );
  }

  const Icon = ICONS[name] ?? Users;
  return <Icon className={className} style={{ color }} strokeWidth={1.75} aria-hidden />;
}

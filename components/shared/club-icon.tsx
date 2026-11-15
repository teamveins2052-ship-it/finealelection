import { BookOpen, Camera, Code2, Landmark, Music, Sparkles, Trophy, Users, type LucideIcon } from "lucide-react";

/** Positions store a lucide icon *name* (SCHEMA positions.icon); map it to a component here. */
const ICONS: Record<string, LucideIcon> = { Landmark, Trophy, Camera, Sparkles, Music, Code2, BookOpen, Users };

export const CLUB_ICON_NAMES = Object.keys(ICONS);
export const CLUB_COLORS = ["#5B3DF5", "#12B76A", "#FF5A36", "#0BA5EC", "#EE46BC", "#F79009", "#667085"];

export function ClubIcon({ name, color, className = "size-5" }: { name: string; color?: string; className?: string }) {
  const Icon = ICONS[name] ?? Users;
  return <Icon className={className} style={{ color }} strokeWidth={1.75} aria-hidden />;
}

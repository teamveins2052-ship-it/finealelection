export const POSITIONS = [
  { id: "nsgc-president",   name: "NSGC President",        club: "NSGC",     color: "#5B3DF5", icon: "Landmark", weights: [45, 35, 20] },
  { id: "sports-president", name: "Sports Club President", club: "Sports",   color: "#12B76A", icon: "Trophy",   weights: [50, 37, 13] },
  { id: "media-head",       name: "Media Club Head",       club: "Media",    color: "#FF5A36", icon: "Camera",   weights: [34, 33, 33] },
  { id: "genai-lead",       name: "GenAI Club Lead",       club: "GenAI",    color: "#0BA5EC", icon: "Sparkles", weights: [60, 40] },
  { id: "cultural-head",    name: "Cultural Club Head",    club: "Cultural", color: "#EE46BC", icon: "Music",    weights: [40, 40, 20] },
  { id: "tech-lead",        name: "Tech Club Lead",        club: "Tech",     color: "#F79009", icon: "Code2",    weights: [70, 30] },
  { id: "literary-head",    name: "Literary Club Head",    club: "Literary", color: "#667085", icon: "BookOpen", weights: [55, 45] },
] as const;

export type SeedPosition = (typeof POSITIONS)[number];

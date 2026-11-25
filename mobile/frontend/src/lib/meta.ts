import type { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

export type IconName = ComponentProps<typeof Ionicons>["name"];
export type Gradient = readonly [string, string];

type FestivalMeta = { label: string; icon: IconName; gradient: Gradient };

export const FESTIVAL_TYPES: Record<string, FestivalMeta> = {
  DIWALI: { label: "Diwali", icon: "flame", gradient: ["#7A1F2B", "#E8590C"] },
  DUSSEHRA: { label: "Dussehra", icon: "locate", gradient: ["#8A2B0F", "#D9822B"] },
  NAVRATRI: { label: "Navratri", icon: "musical-notes", gradient: ["#8E1F5B", "#E8590C"] },
  GANESH_CHATURTHI: { label: "Ganesh Chaturthi", icon: "star", gradient: ["#B8470D", "#F5A623"] },
  CHRISTMAS: { label: "Christmas", icon: "snow", gradient: ["#1F5C3A", "#B42318"] },
  NEW_YEAR: { label: "New Year", icon: "sparkles", gradient: ["#1E2A5A", "#8E3FBF"] },
  PONGAL: { label: "Pongal", icon: "leaf", gradient: ["#A86A00", "#F5C542"] },
  ONAM: { label: "Onam", icon: "flower", gradient: ["#2F7D4F", "#F5A623"] },
  HOLI: { label: "Holi", icon: "color-palette", gradient: ["#B52B7E", "#2E86DE"] },
  EID: { label: "Eid", icon: "moon", gradient: ["#14584B", "#3B8F7A"] },
  RAKSHA_BANDHAN: { label: "Raksha Bandhan", icon: "link", gradient: ["#A3283F", "#E58A3C"] },
  JANMASHTAMI: { label: "Janmashtami", icon: "water", gradient: ["#1B4F8A", "#2F9E8F"] },
  UGADI: { label: "Ugadi / Gudi Padwa", icon: "leaf", gradient: ["#2F7D4F", "#C99A2E"] },
  RAMA_NAVAMI: { label: "Rama Navami", icon: "sunny", gradient: ["#A3481A", "#E8A33D"] },
  MAHA_SHIVARATRI: { label: "Maha Shivaratri", icon: "moon", gradient: ["#1E2A5A", "#4B5BA8"] },
  AKSHAYA_TRITIYA: { label: "Akshaya Tritiya", icon: "sparkles", gradient: ["#A86A00", "#F5C542"] },
  MAKAR_SANKRANTI: { label: "Makar Sankranti", icon: "sunny", gradient: ["#B8470D", "#F5A623"] },
  VASANT_PANCHAMI: { label: "Vasant Panchami", icon: "flower", gradient: ["#A86A00", "#E7C23B"] },
  DURGA_PUJA: { label: "Durga Puja", icon: "flame", gradient: ["#8E1F2B", "#E8590C"] },
  KARVA_CHAUTH: { label: "Karva Chauth", icon: "moon", gradient: ["#7A1F2B", "#C2417A"] },
  BUDDHA_PURNIMA: { label: "Buddha Purnima", icon: "flower", gradient: ["#8A5A00", "#D9A441"] },
  MAHAVIR_JAYANTI: { label: "Mahavir Jayanti", icon: "leaf", gradient: ["#1F5C3A", "#6BAA75"] },
  PARYUSHAN: { label: "Paryushan", icon: "leaf", gradient: ["#2F6F5C", "#7DB89A"] },
  VAISAKHI: { label: "Vaisakhi", icon: "sunny", gradient: ["#A86A00", "#E58A1F"] },
  GURPURAB: { label: "Gurpurab", icon: "sunny", gradient: ["#1B4F8A", "#D9A441"] },
  BANDI_CHHOR: { label: "Bandi Chhor Divas", icon: "flame", gradient: ["#1B4F8A", "#E58A1F"] },
  EASTER: { label: "Easter", icon: "sparkles", gradient: ["#6B4C9A", "#E7C23B"] },
  GOOD_FRIDAY: { label: "Good Friday", icon: "book", gradient: ["#2A2A3A", "#6B6B85"] },
  EPIPHANY: { label: "Epiphany", icon: "star", gradient: ["#1E2A5A", "#C99A2E"] },
  RAMADAN: { label: "Ramadan", icon: "moon", gradient: ["#14584B", "#2F7D4F"] },
  EID_AL_FITR: { label: "Eid al-Fitr", icon: "moon", gradient: ["#14584B", "#3B8F7A"] },
  EID_AL_ADHA: { label: "Eid al-Adha", icon: "moon", gradient: ["#0F4C5C", "#3B8F7A"] },
  MUHARRAM: { label: "Muharram", icon: "moon", gradient: ["#2A2A3A", "#14584B"] },
  MILAD_UN_NABI: { label: "Milad-un-Nabi", icon: "moon", gradient: ["#14584B", "#6BAA75"] },
  NAVROZ: { label: "Navroz", icon: "bonfire", gradient: ["#A3481A", "#E58A1F"] },
  OTHER: { label: "Our own festival", icon: "sparkles", gradient: ["#6B1A2A", "#C8962E"] },
};

const FALLBACK: FestivalMeta = { label: "Festival", icon: "sparkles", gradient: ["#6B1A2A", "#C8962E"] };

export function festivalMeta(type: string): FestivalMeta {
  return FESTIVAL_TYPES[type] ?? FALLBACK;
}

export const CATEGORIES: Record<string, { label: string; icon: IconName }> = {
  RITUAL: { label: "Ritual", icon: "flame" },
  FOOD: { label: "Food", icon: "restaurant" },
  DECORATION: { label: "Decoration", icon: "color-wand" },
  CLOTHING: { label: "Clothing", icon: "shirt" },
  FAMILY: { label: "Family", icon: "people" },
  RELIGIOUS: { label: "Religious", icon: "library" },
  SOCIAL: { label: "Social", icon: "chatbubbles" },
  MUSIC: { label: "Music", icon: "musical-notes" },
  GIFTING: { label: "Gifting", icon: "gift" },
  TRAVEL: { label: "Travel", icon: "car" },
  CUSTOM: { label: "Custom", icon: "sparkles" },
};

/** The faiths a group can say it follows. Icons are deliberately neutral: no sacred symbols. */
export const FAITHS: readonly { value: string; label: string; icon: IconName }[] = [
  { value: "hindu", label: "Hindu", icon: "flame" },
  { value: "muslim", label: "Muslim", icon: "moon" },
  { value: "christian", label: "Christian", icon: "book" },
  { value: "sikh", label: "Sikh", icon: "sunny" },
  { value: "jain", label: "Jain", icon: "leaf" },
  { value: "buddhist", label: "Buddhist", icon: "flower" },
  { value: "parsi", label: "Parsi", icon: "bonfire" },
];

/** The faith each festival type belongs to; "general" is for celebrations anyone keeps. */
export const FESTIVAL_FAITH: Record<string, string> = {
  DIWALI: "hindu", DUSSEHRA: "hindu", NAVRATRI: "hindu", GANESH_CHATURTHI: "hindu", PONGAL: "hindu",
  ONAM: "hindu", HOLI: "hindu", RAKSHA_BANDHAN: "hindu", JANMASHTAMI: "hindu", UGADI: "hindu",
  RAMA_NAVAMI: "hindu", MAHA_SHIVARATRI: "hindu", AKSHAYA_TRITIYA: "hindu", MAKAR_SANKRANTI: "hindu",
  VASANT_PANCHAMI: "hindu", DURGA_PUJA: "hindu", KARVA_CHAUTH: "hindu",
  CHRISTMAS: "christian", EASTER: "christian", GOOD_FRIDAY: "christian", EPIPHANY: "christian",
  EID: "muslim", RAMADAN: "muslim", EID_AL_FITR: "muslim", EID_AL_ADHA: "muslim", MUHARRAM: "muslim", MILAD_UN_NABI: "muslim",
  VAISAKHI: "sikh", GURPURAB: "sikh", BANDI_CHHOR: "sikh",
  MAHAVIR_JAYANTI: "jain", PARYUSHAN: "jain", BUDDHA_PURNIMA: "buddhist", NAVROZ: "parsi",
  NEW_YEAR: "general", OTHER: "general",
};

/** The festival to pre-select: the first one of the person's first faith, else a custom festival. */
export function defaultFestival(faiths: string[]): string {
  for (const faith of faiths) {
    const code = Object.keys(FESTIVAL_TYPES).find((c) => FESTIVAL_FAITH[c] === faith);
    if (code) return code;
  }
  return "OTHER";
}

export type GroupKind = "household" | "friends" | "office" | "other";

export const GROUP_KINDS: readonly { value: GroupKind; label: string; icon: IconName; hint: string }[] = [
  { value: "household", label: "Household", icon: "home", hint: "Your family. Keeps traditions too." },
  { value: "friends", label: "Friends", icon: "people", hint: "Trips, parties, shared costs." },
  { value: "office", label: "Office", icon: "briefcase", hint: "Team events and celebrations." },
  { value: "other", label: "Other", icon: "ellipsis-horizontal-circle", hint: "Anything else." },
];

export const GROUP_COLORS = [
  "#C2410C", "#B42318", "#A21C5C", "#6B4C9A", "#1B4F8A", "#0F766E", "#2F7D4F", "#A86A00",
] as const;

/** Emoji a group can pick as its icon: the user's own choice, never used in the app's own chrome. */
export const GROUP_EMOJIS = [
  "🏠", "🪔", "🎉", "🎊", "🥳", "🎂", "🍰", "🍽️", "🥘", "🍛", "☕", "🌸",
  "🌺", "🌼", "⭐", "✨", "🔥", "🌙", "☀️", "🌈", "🎶", "🎁", "🏖️", "⛰️",
  "✈️", "🚗", "🏡", "💼", "🎓", "⚽", "🎮", "📚", "🐶", "🐱", "💛", "🤝",
] as const;

export const GROUP_SYMBOLS: readonly IconName[] = [
  "home", "people", "briefcase", "flame", "sparkles", "gift", "restaurant", "car",
  "airplane", "calendar", "musical-notes", "leaf", "flower", "star", "heart", "moon",
] as const;

export function defaultGroupIcon(kind: GroupKind): IconName {
  return GROUP_KINDS.find((k) => k.value === kind)?.icon ?? "people";
}

export const EXPENSE_CATEGORIES: readonly { value: string; label: string; icon: IconName }[] = [
  { value: "food", label: "Food", icon: "restaurant" },
  { value: "groceries", label: "Groceries", icon: "cart" },
  { value: "venue", label: "Venue", icon: "business" },
  { value: "decor", label: "Decor", icon: "color-wand" },
  { value: "gifts", label: "Gifts", icon: "gift" },
  { value: "travel", label: "Travel", icon: "car" },
  { value: "shopping", label: "Shopping", icon: "bag" },
  { value: "utilities", label: "Utilities", icon: "flash" },
  { value: "rent", label: "Rent", icon: "key" },
  { value: "entertainment", label: "Fun", icon: "musical-notes" },
  { value: "other", label: "Other", icon: "ellipsis-horizontal-circle" },
];

export const categoryIcon = (value: string): IconName =>
  EXPENSE_CATEGORIES.find((c) => c.value === value)?.icon ?? "ellipsis-horizontal-circle";

export const faithLabel = (value: string) =>
  FAITHS.find((f) => f.value === value)?.label ?? titleCase(value);

export const SCOPES = [
  { value: "family", label: "Our family" },
  { value: "community", label: "Community" },
  { value: "regional", label: "Regional" },
  { value: "global", label: "Widely shared" },
] as const;

export const RELATIONSHIPS = [
  "FATHER",
  "MOTHER",
  "SON",
  "DAUGHTER",
  "GRANDFATHER",
  "GRANDMOTHER",
  "UNCLE",
  "AUNT",
  "COUSIN",
  "BROTHER",
  "SISTER",
] as const;

export const titleCase = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

export function categoryMeta(category: string) {
  return CATEGORIES[category] ?? { label: titleCase(category), icon: "sparkles" };
}

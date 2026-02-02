// ============================================================
// CHAT CHIPS - Server-side helpers (for API routes)
// NO "use client" - this is server code!
// ============================================================

export type ChipType =
  | "suggestion"
  | "onboarding_option"
  | "navigation"
  | "product_confirm"
  | "action";

export interface ChatChip {
  type: ChipType;
  label: string;
  value?: string;
  step?: string;
  href?: string;
  productId?: string;
  action?: "confirm" | "reject";
  apiEndpoint?: string;
  payload?: Record<string, any>;
}

// ============================================================
// CHIP FACTORY
// ============================================================

export const chip = {
  suggestion: (label: string, value?: string): ChatChip => ({
    type: "suggestion",
    label,
    value: value || label,
  }),

  onboarding: (label: string, step: string, value?: string): ChatChip => ({
    type: "onboarding_option",
    label,
    step,
    value: value || label,
  }),

  navigation: (label: string, href: string): ChatChip => ({
    type: "navigation",
    label,
    href,
  }),

  productConfirm: (productName: string, productId: string): ChatChip => ({
    type: "product_confirm",
    label: productName,
    productId,
    action: "confirm",
  }),

  productReject: (productName: string, productId: string): ChatChip => ({
    type: "product_confirm",
    label: productName,
    productId,
    action: "reject",
  }),

  action: (label: string, apiEndpoint: string, payload?: Record<string, any>): ChatChip => ({
    type: "action",
    label,
    apiEndpoint,
    payload,
  }),
};

// ============================================================
// LEGACY CONVERTER
// ============================================================

export function convertLegacyChips(chips: any[] | undefined): ChatChip[] {
  if (!chips) return [];

  return chips.map((c) => {
    if (typeof c === "object" && c.type) {
      return c as ChatChip;
    }

    const label = String(c);

    // Navigation chips
    if (label.toLowerCase().includes("otvori") || label.toLowerCase().includes("settings")) {
      const hrefMap: Record<string, string> = {
        "otvori calendar": "/calendar",
        "otvori kalendar": "/calendar",
        "otvori settings": "/settings",
        "otvori postavke": "/settings",
        "poveži instagram": "/settings",
        "otvori export": "/export",
        "otvori profile": "/profile",
        "otvori profil": "/profile",
      };
      const lowerLabel = label.toLowerCase();
      for (const [key, href] of Object.entries(hrefMap)) {
        if (lowerLabel.includes(key) || lowerLabel.includes(key.split(" ")[1])) {
          return { type: "navigation" as ChipType, label, href };
        }
      }
    }

    // Default: suggestion
    return { type: "suggestion" as ChipType, label, value: label };
  });
}

// ============================================================
// ONBOARDING QUESTIONS DEFINITION
// ============================================================

export interface OnboardingQuestion {
  id: string;
  text: string;
  chips: ChatChip[];
  required: boolean;
  extractValue?: (answer: string) => string;
}

export const ONBOARDING_QUESTIONS: Record<string, OnboardingQuestion> = {
  // OBAVEZNA PITANJA
  profile_type: {
    id: "profile_type",
    text: "Koji tip profila te najbolje opisuje?",
    chips: [
      chip.onboarding("🏷️ Product brand", "profile_type", "product"),
      chip.onboarding("🌿 Lifestyle", "profile_type", "lifestyle"),
      chip.onboarding("👤 Creator/Influencer", "profile_type", "creator"),
      chip.onboarding("📝 Content/Media", "profile_type", "content"),
    ],
    required: true,
  },
  industry: {
    id: "industry",
    text: "Koja je tvoja industrija ili kategorija?",
    chips: [
      chip.onboarding("📚 Knjige/Izdavaštvo", "industry", "books"),
      chip.onboarding("👗 Moda", "industry", "fashion"),
      chip.onboarding("🍕 Hrana/Restoran", "industry", "food"),
      chip.onboarding("💻 Tech/Software", "industry", "tech"),
      chip.onboarding("💪 Fitness/Zdravlje", "industry", "fitness"),
      chip.onboarding("🏠 Usluge", "industry", "services"),
      chip.onboarding("🎨 Drugo...", "industry", "other"),
    ],
    required: true,
  },
  goal: {
    id: "goal",
    text: "Koji je tvoj glavni cilj za idući mjesec?",
    chips: [
      chip.onboarding("💬 Više engagementa", "goal", "engagement"),
      chip.onboarding("📈 Rast pratitelja", "goal", "growth"),
      chip.onboarding("🛍️ Promocija proizvoda", "goal", "promotion"),
      chip.onboarding("📖 Storytelling/Autoritet", "goal", "authority"),
    ],
    required: true,
  },

  // OPCIONALNA PITANJA (za "ubijanje dosade")
  frequency: {
    id: "frequency",
    text: "Koliko objava tjedno planiraš?",
    chips: [
      chip.onboarding("3-4 objave", "frequency", "3-4"),
      chip.onboarding("5-7 objava", "frequency", "5-7"),
      chip.onboarding("Svaki dan", "frequency", "daily"),
    ],
    required: false,
  },
  content_preference: {
    id: "content_preference",
    text: "Preferiraš li više slika ili videa?",
    chips: [
      chip.onboarding("📷 Više slika", "content_preference", "images"),
      chip.onboarding("🎬 Više videa/Reels", "content_preference", "videos"),
      chip.onboarding("🔀 Mix svega", "content_preference", "mix"),
    ],
    required: false,
  },
  tone: {
    id: "tone",
    text: "Koji ton komunikacije ti najbolje odgovara?",
    chips: [
      chip.onboarding("📋 Formalan/Profesionalan", "tone", "formal"),
      chip.onboarding("😊 Opušten/Prijateljski", "tone", "casual"),
      chip.onboarding("😄 Duhovit/Zabavan", "tone", "funny"),
      chip.onboarding("🎯 Izravan/Konkretan", "tone", "direct"),
    ],
    required: false,
  },
  emoji_usage: {
    id: "emoji_usage",
    text: "Koristiš li emoji u objavama?",
    chips: [
      chip.onboarding("🎉 Da, puno!", "emoji_usage", "lots"),
      chip.onboarding("👍 Ponekad", "emoji_usage", "sometimes"),
      chip.onboarding("❌ Ne koristim", "emoji_usage", "never"),
    ],
    required: false,
  },
  target_audience: {
    id: "target_audience",
    text: "Tko ti je ciljna publika?",
    chips: [
      chip.onboarding("👦 Mladi (18-25)", "target_audience", "young"),
      chip.onboarding("👨‍👩‍👧 Obitelji", "target_audience", "families"),
      chip.onboarding("💼 Profesionalci", "target_audience", "professionals"),
      chip.onboarding("🌍 Široka publika", "target_audience", "general"),
    ],
    required: false,
  },
  seasonal: {
    id: "seasonal",
    text: "Imaš li sezonske promocije ili kampanje?",
    chips: [
      chip.onboarding("📅 Da, imam planirane", "seasonal", "yes"),
      chip.onboarding("🤷 Možda, ovisi", "seasonal", "maybe"),
      chip.onboarding("❌ Ne, standardno", "seasonal", "no"),
    ],
    required: false,
  },
  hashtag_strategy: {
    id: "hashtag_strategy",
    text: "Imaš li hashtag strategiju?",
    chips: [
      chip.onboarding("✅ Da, koristim svoje", "hashtag_strategy", "yes"),
      chip.onboarding("💡 Ne, predloži mi", "hashtag_strategy", "suggest"),
      chip.onboarding("🚫 Ne koristim hashtage", "hashtag_strategy", "no"),
    ],
    required: false,
  },
};

export const REQUIRED_QUESTIONS = Object.values(ONBOARDING_QUESTIONS).filter(q => q.required);
export const OPTIONAL_QUESTIONS = Object.values(ONBOARDING_QUESTIONS).filter(q => !q.required);

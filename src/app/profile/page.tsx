// ============================================================
// PROFILE PAGE
// ============================================================
// Brand profil control center - pregled i editiranje
// svih AI-generiranih podataka o brandu
// ============================================================

"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import { ColorPicker } from "@/ui/ColorPicker";
import { MultiSelect } from "@/ui/MultiSelect";
import { ProgressBar } from "@/ui/ProgressBar";
import { ProductCard } from "@/ui/ProductCard";

// ============================================================
// TYPES
// ============================================================

interface BrandProfile {
  _metadata: {
    confidence_level: "auto" | "manual" | "hybrid";
    based_on_posts: number;
    last_manual_override: string | null;
    auto_generated_at: string;
    version: number;
  };
  visual_style: {
    dominant_colors: string[];
    photography_styles: string[];
    lighting_preferences: string[];
    mood: string;
    composition_patterns: string[];
  };
  products: Array<{
    id: string;
    name: string;
    category: string;
    frequency: number;
    visual_features: string[];
    locked: boolean;
  }>;
  content_themes: string[];
  caption_patterns: {
    average_length: number;
    tone: string;
    emoji_usage: boolean;
    hashtag_avg: number;
  };
  brand_consistency: {
    color_consistency_score: number;
    style_consistency_score: number;
    overall_aesthetic: string;
  };
}

interface Product {
  id: string;
  name: string;
  category: string;
  frequency: number;
  visual_features: string[];
  locked: boolean;
}

interface ProfileData {
  brand_profile: BrandProfile | null;
  instagram_connected: boolean;
  posts_analyzed: number;
  pending_products: number;
  confirmed_products: Product[];
  references: {
    style_reference: number;
    product_reference: number;
    character_reference: number;
  };
  reference_images: {
    style_reference: Array<{ id: string; url: string }>;
    product_reference: Array<{ id: string; url: string }>;
    character_reference: Array<{ id: string; url: string }>;
  };
  last_rebuild: string | null;
}

// ============================================================
// CONSTANTS
// ============================================================

const PHOTOGRAPHY_STYLES = [
  "lifestyle",
  "studio",
  "flat_lay",
  "product_focus",
  "outdoor",
  "portrait",
  "macro",
  "aerial"
];

const LIGHTING_OPTIONS = [
  "natural",
  "studio",
  "golden_hour",
  "soft",
  "dramatic",
  "harsh",
  "backlit",
  "low_key"
];

const MOOD_OPTIONS = [
  "cozy",
  "professional",
  "playful",
  "minimal",
  "luxurious",
  "energetic",
  "calm",
  "bold",
  "romantic"
];

const COMPOSITION_OPTIONS = [
  "rule_of_thirds",
  "centered",
  "symmetrical",
  "diagonal",
  "framing",
  "leading_lines",
  "negative_space"
];

const THEME_SUGGESTIONS = [
  "cosmetics",
  "lifestyle",
  "self-care",
  "home_decor",
  "fashion",
  "food",
  "travel",
  "fitness",
  "tech",
  "art",
  "education",
  "business"
];

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function ProfilePage() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [rebuildInProgress, setRebuildInProgress] = useState(false);
  const [newTheme, setNewTheme] = useState("");

  // Local state for editing
  const [editedProfile, setEditedProfile] = useState<BrandProfile | null>(null);
  const [editedProducts, setEditedProducts] = useState<Product[]>([]);

  // ============================================================
  // FETCH DATA
  // ============================================================

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/profile");
      const result = await res.json();
      setData(result);
      setEditedProfile(result.brand_profile);
      setEditedProducts(result.confirmed_products || []);
    } catch (error) {
      console.error("Failed to fetch profile:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // ============================================================
  // SAVE CHANGES
  // ============================================================

  const handleSave = async () => {
    if (!editedProfile || !hasChanges) return;
    setSaving(true);

    try {
      // Save profile changes
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visual_style: editedProfile.visual_style,
          content_themes: editedProfile.content_themes,
          caption_patterns: editedProfile.caption_patterns
        })
      });

      // Save product changes
      for (const product of editedProducts) {
        await fetch(`/api/products/${product.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: product.name,
            category: product.category,
            locked: product.locked
          })
        });
      }

      setHasChanges(false);
      await fetchProfile();
    } catch (error) {
      console.error("Failed to save:", error);
      alert("Greška pri spremanju. Pokušaj ponovo.");
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // REBUILD PROFILE
  // ============================================================

  const handleRebuild = async () => {
    if (!confirm("Ponovno analizirati brand profil?\n\nZaključani proizvodi će biti sačuvani.")) {
      return;
    }

    setRebuildInProgress(true);

    try {
      const res = await fetch("/api/profile/rebuild", { method: "POST" });
      const result = await res.json();

      if (result.success) {
        alert("Brand rebuild pokrenut! Osvježi stranicu za 10-15 sekundi.");
      } else {
        alert("Greška: " + (result.error || "Nepoznata greška"));
      }
    } catch (error) {
      console.error("Rebuild failed:", error);
      alert("Greška pri pokretanju rebuild-a.");
    } finally {
      setRebuildInProgress(false);
    }
  };

  // ============================================================
  // UPDATE HANDLERS
  // ============================================================

  const updateVisualStyle = (key: keyof BrandProfile["visual_style"], value: any) => {
    if (!editedProfile) return;
    setEditedProfile({
      ...editedProfile,
      visual_style: { ...editedProfile.visual_style, [key]: value }
    });
    setHasChanges(true);
  };

  const updateProduct = (index: number, updatedProduct: Product) => {
    const newProducts = [...editedProducts];
    newProducts[index] = updatedProduct;
    setEditedProducts(newProducts);
    setHasChanges(true);
  };

  const deleteProduct = async (index: number) => {
    const product = editedProducts[index];
    
    try {
      await fetch(`/api/products/${product.id}`, { method: "DELETE" });
      const newProducts = editedProducts.filter((_, i) => i !== index);
      setEditedProducts(newProducts);
    } catch (error) {
      console.error("Delete failed:", error);
      alert("Greška pri brisanju proizvoda.");
    }
  };

  const addTheme = () => {
    if (!editedProfile || !newTheme.trim()) return;
    if (editedProfile.content_themes.includes(newTheme.trim().toLowerCase())) {
      setNewTheme("");
      return;
    }
    setEditedProfile({
      ...editedProfile,
      content_themes: [...editedProfile.content_themes, newTheme.trim().toLowerCase()]
    });
    setNewTheme("");
    setHasChanges(true);
  };

  const removeTheme = (index: number) => {
    if (!editedProfile) return;
    const newThemes = editedProfile.content_themes.filter((_, i) => i !== index);
    setEditedProfile({ ...editedProfile, content_themes: newThemes });
    setHasChanges(true);
  };

  // ============================================================
  // RENDER: LOADING
  // ============================================================

  if (loading) {
    return (
      <main className="space-y-4">
        <Card>
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900"></div>
            <span className="ml-3 text-zinc-600">Učitavanje profila...</span>
          </div>
        </Card>
      </main>
    );
  }

  // ============================================================
  // RENDER: NO PROFILE
  // ============================================================

  if (!data?.brand_profile || !editedProfile) {
    return (
      <main className="space-y-4">
        <Card>
          <div className="text-center py-12">
            <div className="text-4xl mb-4">📊</div>
            <h2 className="text-lg font-semibold mb-2">Brand profil nije pronađen</h2>
            <p className="text-zinc-600 mb-6">
              Poveži Instagram i pričekaj analizu postova da bi se kreirao profil.
            </p>
            <div className="flex justify-center gap-3">
              <a
                href="/chat"
                className="px-4 py-2 bg-zinc-900 text-white text-sm font-semibold rounded-xl hover:bg-zinc-800"
              >
                Otvori Chat
              </a>
              <a
                href="/settings"
                className="px-4 py-2 border border-zinc-200 text-zinc-700 text-sm font-semibold rounded-xl hover:bg-zinc-50"
              >
                Otvori Settings
              </a>
            </div>
          </div>
        </Card>
      </main>
    );
  }

  const profile = editedProfile;
  const meta = profile._metadata || {
    confidence_level: "auto" as const,
    based_on_posts: 0,
    last_manual_override: null,
    auto_generated_at: new Date().toISOString(),
    version: 1
  };
  
  // Ensure all profile sections have default values
  const visualStyle = profile.visual_style || {
    dominant_colors: [],
    photography_styles: [],
    lighting_preferences: [],
    mood: "professional",
    composition_patterns: []
  };
  
  const brandConsistency = profile.brand_consistency || {
    color_consistency_score: 0,
    style_consistency_score: 0,
    overall_aesthetic: "Not analyzed yet"
  };
  
  const captionPatterns = profile.caption_patterns || {
    average_length: 0,
    tone: "neutral",
    emoji_usage: false,
    hashtag_avg: 0
  };
  
  const contentThemes = profile.content_themes || [];

  // ============================================================
  // RENDER: PROFILE PAGE
  // ============================================================

  return (
    <main className="space-y-4">
      {/* Header */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Brand Profil</h1>
            <p className="text-sm text-zinc-600 mt-1">
              Tvoj AI-generirani brand guide
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
                hasChanges
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
              }`}
            >
              {saving ? "Spremam..." : "Spremi promjene"}
            </button>
            <Badge tone={data.instagram_connected ? "good" : "warn"}>
              {data.instagram_connected ? "IG Connected" : "Not connected"}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Metadata Banner */}
      <Card>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="flex items-center gap-1.5">
            📊 Bazirano na <strong>{meta.based_on_posts}</strong> postova
          </span>
          <span className="text-zinc-300">•</span>
          <span>Verzija {meta.version}</span>
          <span className="text-zinc-300">•</span>
          <span className="flex items-center gap-1.5">
            🕐 {new Date(meta.auto_generated_at).toLocaleDateString("hr-HR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            })}
          </span>
          {meta.last_manual_override && (
            <>
              <span className="text-zinc-300">•</span>
              <span className="flex items-center gap-1.5">
                ✏️ Editirano: {new Date(meta.last_manual_override).toLocaleDateString("hr-HR")}
              </span>
            </>
          )}
        </div>
        <button
          onClick={handleRebuild}
          disabled={rebuildInProgress}
          className="mt-3 text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1.5"
        >
          {rebuildInProgress ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              Pokrećem...
            </>
          ) : (
            <>🔄 Ponovno analiziraj</>
          )}
        </button>
      </Card>

      {/* Visual Style + Brand Consistency */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Visual Style */}
        <Card>
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            🎨 Visual Style
          </h2>

          {/* Dominant Colors */}
          <div className="mb-5">
            <label className="text-xs font-medium text-zinc-600 uppercase tracking-wide">
              Dominant Colors
            </label>
            <div className="mt-2">
              <ColorPicker
                colors={visualStyle.dominant_colors || []}
                onChange={(colors) => updateVisualStyle("dominant_colors", colors)}
                maxColors={5}
              />
            </div>
          </div>

          {/* Photography Style */}
          <div className="mb-5">
            <label className="text-xs font-medium text-zinc-600 uppercase tracking-wide">
              Photography Style
            </label>
            <div className="mt-2">
              <MultiSelect
                selected={visualStyle.photography_styles || []}
                options={PHOTOGRAPHY_STYLES}
                onChange={(val) => updateVisualStyle("photography_styles", val)}
              />
            </div>
          </div>

          {/* Lighting */}
          <div className="mb-5">
            <label className="text-xs font-medium text-zinc-600 uppercase tracking-wide">
              Lighting
            </label>
            <div className="mt-2">
              <MultiSelect
                selected={visualStyle.lighting_preferences || []}
                options={LIGHTING_OPTIONS}
                onChange={(val) => updateVisualStyle("lighting_preferences", val)}
              />
            </div>
          </div>

          {/* Mood */}
          <div className="mb-5">
            <label className="text-xs font-medium text-zinc-600 uppercase tracking-wide">
              Mood
            </label>
            <select
              value={visualStyle.mood || "professional"}
              onChange={(e) => updateVisualStyle("mood", e.target.value)}
              className="mt-2 w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            >
              {MOOD_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Composition */}
          <div>
            <label className="text-xs font-medium text-zinc-600 uppercase tracking-wide">
              Composition
            </label>
            <div className="mt-2">
              <MultiSelect
                selected={visualStyle.composition_patterns || []}
                options={COMPOSITION_OPTIONS}
                onChange={(val) => updateVisualStyle("composition_patterns", val)}
              />
            </div>
          </div>
        </Card>

        {/* Brand Consistency + Caption Patterns */}
        <div className="space-y-4">
          {/* Brand Consistency */}
          <Card>
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              📈 Brand Consistency
            </h2>

            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-zinc-600">Color Consistency</span>
                <span className="font-medium">{brandConsistency.color_consistency_score}%</span>
              </div>
              <ProgressBar value={brandConsistency.color_consistency_score} />
            </div>

            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-zinc-600">Style Consistency</span>
                <span className="font-medium">{brandConsistency.style_consistency_score}%</span>
              </div>
              <ProgressBar value={brandConsistency.style_consistency_score} />
            </div>

            <div className="p-3 bg-zinc-50 rounded-lg">
              <span className="text-xs text-zinc-500">Overall Aesthetic:</span>
              <p className="text-sm font-medium mt-1">
                {brandConsistency.overall_aesthetic || "N/A"}
              </p>
            </div>
          </Card>

          {/* Caption Patterns */}
          <Card>
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              ✍️ Caption Patterns
            </h2>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-600">Prosječna dužina:</span>
                <span className="font-medium">{captionPatterns.average_length} znakova</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-600">Ton:</span>
                <span className="font-medium capitalize">{captionPatterns.tone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-600">Emoji:</span>
                <span className="font-medium">
                  {captionPatterns.emoji_usage ? "✅ Da" : "❌ Ne"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-600">Hashtags:</span>
                <span className="font-medium">~{captionPatterns.hashtag_avg} po postu</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Products */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            📦 Proizvodi ({editedProducts.length})
          </h2>
          {data.pending_products > 0 && (
            <a
              href="/chat"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              {data.pending_products} čeka potvrdu →
            </a>
          )}
        </div>

        {editedProducts.length === 0 ? (
          <div className="text-center py-8 text-zinc-500">
            <p>Nema potvrđenih proizvoda.</p>
            <a href="/chat" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
              Potvrdi proizvode u chatu →
            </a>
          </div>
        ) : (
          <div className="space-y-2">
            {editedProducts.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                onUpdate={(updated) => updateProduct(index, updated)}
                onDelete={() => deleteProduct(index)}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Content Themes */}
      <Card>
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
          🏷️ Content Themes
        </h2>

        <div className="flex flex-wrap gap-2">
          {contentThemes.map((theme, index) => (
            <span
              key={theme}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-sm"
            >
              {theme}
              <button
                onClick={() => removeTheme(index)}
                className="hover:text-red-600 transition-colors"
              >
                ×
              </button>
            </span>
          ))}
          
          {/* Add new theme */}
          <div className="inline-flex items-center gap-1">
            <input
              type="text"
              value={newTheme}
              onChange={(e) => setNewTheme(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTheme()}
              placeholder="Nova tema..."
              className="w-24 px-2 py-1 border border-dashed border-zinc-300 rounded-full text-sm focus:outline-none focus:border-zinc-400"
              list="theme-suggestions"
            />
            <datalist id="theme-suggestions">
              {THEME_SUGGESTIONS.filter(t => !contentThemes.includes(t)).map(t => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <button
              onClick={addTheme}
              className="px-2 py-1 border border-dashed border-zinc-300 rounded-full text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
            >
              +
            </button>
          </div>
        </div>
      </Card>

      {/* Reference Images */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            🖼️ Reference Slike
          </h2>
          <a
            href="/chat"
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Upravljaj →
          </a>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Style References */}
          <div>
            <div className="text-xs font-medium text-zinc-600 uppercase tracking-wide mb-2">
              Style ({data.references.style_reference})
            </div>
            <div className="flex gap-2">
              {data.reference_images.style_reference.length > 0 ? (
                data.reference_images.style_reference.map((img) => (
                  <div key={img.id} className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-100">
                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                  </div>
                ))
              ) : (
                <div className="w-16 h-16 rounded-lg border-2 border-dashed border-zinc-200 flex items-center justify-center text-zinc-400 text-xs">
                  –
                </div>
              )}
            </div>
          </div>

          {/* Product References */}
          <div>
            <div className="text-xs font-medium text-zinc-600 uppercase tracking-wide mb-2">
              Product ({data.references.product_reference})
            </div>
            <div className="flex gap-2">
              {data.reference_images.product_reference.length > 0 ? (
                data.reference_images.product_reference.map((img) => (
                  <div key={img.id} className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-100">
                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                  </div>
                ))
              ) : (
                <div className="w-16 h-16 rounded-lg border-2 border-dashed border-zinc-200 flex items-center justify-center text-zinc-400 text-xs">
                  –
                </div>
              )}
            </div>
          </div>

          {/* Character References */}
          <div>
            <div className="text-xs font-medium text-zinc-600 uppercase tracking-wide mb-2">
              Character ({data.references.character_reference})
            </div>
            <div className="flex gap-2">
              {data.reference_images.character_reference.length > 0 ? (
                data.reference_images.character_reference.map((img) => (
                  <div key={img.id} className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-100">
                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                  </div>
                ))
              ) : (
                <div className="w-16 h-16 rounded-lg border-2 border-dashed border-zinc-200 flex items-center justify-center text-zinc-400 text-xs">
                  –
                </div>
              )}
            </div>
          </div>
        </div>
        
        <p className="mt-4 text-xs text-zinc-500">
          💡 Tip: Koristi "uploaj slike" u chatu za dodavanje referenci.
        </p>
      </Card>
    </main>
  );
}

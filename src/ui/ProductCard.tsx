// ============================================================
// UI: ProductCard
// ============================================================
// Kartica za prikaz i editiranje proizvoda
// ============================================================

"use client";

import { useState } from "react";

interface Product {
  id: string;
  name: string;
  category: string;
  frequency?: number;
  visual_features?: string[];
  locked: boolean;
}

interface ProductCardProps {
  product: Product;
  onUpdate: (product: Product) => void;
  onDelete: () => void;
  categories?: string[];
}

const DEFAULT_CATEGORIES = [
  "cosmetics",
  "clothing",
  "food",
  "electronics",
  "home_decor",
  "books",
  "jewelry",
  "sports",
  "toys",
  "other"
];

export function ProductCard({ 
  product, 
  onUpdate, 
  onDelete,
  categories = DEFAULT_CATEGORIES
}: ProductCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(product.name);
  const [editCategory, setEditCategory] = useState(product.category);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = () => {
    onUpdate({
      ...product,
      name: editName.trim() || product.name,
      category: editCategory
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(product.name);
    setEditCategory(product.category);
    setIsEditing(false);
  };

  const handleToggleLock = () => {
    onUpdate({
      ...product,
      locked: !product.locked
    });
  };

  const handleDelete = () => {
    if (confirmDelete) {
      onDelete();
    } else {
      setConfirmDelete(true);
      // Auto-reset after 3s
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  if (isEditing) {
    return (
      <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/30">
        <div className="space-y-3">
          {/* Name input */}
          <div>
            <label className="text-xs font-medium text-zinc-600">Naziv proizvoda</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="Naziv proizvoda"
            />
          </div>

          {/* Category select */}
          <div>
            <label className="text-xs font-medium text-zinc-600">Kategorija</label>
            <select
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Spremi
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 border border-zinc-200 text-zinc-600 text-sm font-medium rounded-lg hover:bg-zinc-50 transition-colors"
            >
              Odustani
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 transition-colors group">
      <div className="flex items-start justify-between gap-3">
        {/* Left: Product info */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Lock icon */}
          <button
            onClick={handleToggleLock}
            className={`mt-0.5 flex-shrink-0 ${product.locked ? "text-amber-500" : "text-zinc-300 hover:text-zinc-400"} transition-colors`}
            title={product.locked ? "Zaključano - neće se mijenjati pri rebuild-u" : "Klikni za zaključavanje"}
          >
            {product.locked ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
              </svg>
            )}
          </button>

          {/* Product details */}
          <div className="min-w-0">
            <div className="font-medium text-zinc-900 truncate">{product.name}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
              <span className="px-1.5 py-0.5 bg-zinc-100 rounded">{product.category}</span>
              {product.frequency !== undefined && product.frequency > 0 && (
                <span>×{product.frequency}</span>
              )}
            </div>
            {product.visual_features && product.visual_features.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {product.visual_features.map((feature, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-zinc-50 text-zinc-600 text-xs rounded">
                    {feature}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
            title="Uredi"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={handleDelete}
            className={`p-1.5 rounded-lg transition-colors ${
              confirmDelete 
                ? "text-white bg-red-500 hover:bg-red-600" 
                : "text-zinc-400 hover:text-red-500 hover:bg-red-50"
            }`}
            title={confirmDelete ? "Klikni ponovo za potvrdu" : "Obriši"}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

import {
  Boxes,
  Loader2,
  Plus,
  RefreshCcw,
  Trash2,
} from "lucide-react"
import { useState } from "react"
import {
  Badge,
  Button,
  PageHeader,
} from "../components"
import { useAdminCategories } from "../features/hooks/useAdminCategories"

export function CategoriesPage() {
  const {
    categories: items,
    loading,
    error,
    actionLoading,
    createCategory,
    updateCategory,
    deleteCategory,
    refetch,
  } = useAdminCategories()

  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [description, setDescription] = useState("")
  const [formError, setFormError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!name.trim()) return
    setFormError(null)

    // Normalize slug to valid lowercase alphanumeric with dashes
    const rawSlug = slug.trim() || name.trim()
    const categorySlug = rawSlug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")

    if (!categorySlug) {
      setFormError("A valid slug could not be generated. Please enter letters or numbers.")
      return
    }

    try {
      await createCategory({
        name: name.trim(),
        slug: categorySlug,
        description: description.trim() || undefined,
        isActive: true,
      })
      setName("")
      setSlug("")
      setDescription("")
    } catch (err: any) {
      setFormError(err?.message || "Failed to create category.")
    }
  }

  const handleToggleVisibility = async (cat: any) => {
    try {
      await updateCategory(cat.id, {
        isActive: !cat.isActive,
      })
    } catch (err: any) {
      alert(err?.message || "Failed to update category visibility.")
    }
  }

  const handleDelete = async (id: string, catName: string) => {
    if (!confirm(`Are you sure you want to delete category "${catName}"? This cannot be undone if products reference it.`)) {
      return
    }
    try {
      await deleteCategory(id)
    } catch (err: any) {
      alert(err?.message || "Failed to delete category.")
    }
  }

  return (
    <>
      <PageHeader
        title="Category management"
        description="Persisted catalog categories, active status, hierarchy, and product relationships."
        action={
          <Button variant="ghost" onClick={refetch} title="Refresh categories">
            <RefreshCcw size={15} />
          </Button>
        }
      />

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-white shadow-xs">
          {loading ? (
            <div className="flex h-56 flex-col items-center justify-center gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-brand" />
              <p className="text-sm font-medium text-slate-500">Loading catalog categories...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center">
              <Boxes className="mx-auto h-10 w-10 text-slate-300" />
              <h3 className="mt-2 text-base font-bold text-slate-700">No categories found</h3>
              <p className="text-xs text-slate-500 mt-1">Create your first category using the panel on the right.</p>
            </div>
          ) : (
          <>
            {/* Desktop & Tablet Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Slug</th>
                    <th>Sort Order</th>
                    <th>Visibility</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={item.imageUrl || "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=300&q=80"}
                            alt=""
                            className="h-10 w-10 sm:h-11 sm:w-11 rounded-lg object-cover bg-slate-100 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <b className="block font-semibold text-slate-900 truncate">{item.name}</b>
                            {item.description && (
                              <small className="line-clamp-1 text-slate-500 max-w-xs">{item.description}</small>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="font-mono text-xs text-slate-600">/{item.slug}</td>
                      <td>{item.sortOrder ?? 0}</td>
                      <td>
                        <button
                          disabled={actionLoading}
                          onClick={() => handleToggleVisibility(item)}
                          className="cursor-pointer hover:opacity-80"
                        >
                          <Badge tone={item.isActive ? "success" : "neutral"}>
                            {item.isActive ? "Visible" : "Hidden"}
                          </Badge>
                        </button>
                      </td>
                      <td>
                        <button
                          disabled={actionLoading}
                          onClick={() => handleDelete(item.id, item.name)}
                          className="table-action text-red-600 hover:bg-red-50"
                          title="Delete Category"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="block md:hidden divide-y divide-border">
              {items.map((item) => (
                <div key={item.id} className="p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <img
                        src={item.imageUrl || "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=300&q=80"}
                        alt=""
                        className="h-10 w-10 rounded-lg object-cover bg-slate-100 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <b className="block text-xs sm:text-sm font-bold text-slate-900 truncate">{item.name}</b>
                        <span className="block font-mono text-[10px] sm:text-xs text-slate-400 truncate">/{item.slug}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        disabled={actionLoading}
                        onClick={() => handleToggleVisibility(item)}
                        className="cursor-pointer hover:opacity-80"
                      >
                        <Badge tone={item.isActive ? "success" : "neutral"}>
                          {item.isActive ? "Visible" : "Hidden"}
                        </Badge>
                      </button>
                      <button
                        disabled={actionLoading}
                        onClick={() => handleDelete(item.id, item.name)}
                        className="table-action text-red-600 hover:bg-red-50"
                        title="Delete Category"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  {item.description && (
                    <p className="text-[11px] sm:text-xs text-slate-500 line-clamp-2">{item.description}</p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
        </div>

        <aside className="h-fit min-w-0 rounded-xl border border-border bg-white p-4 sm:p-5 shadow-xs">
          <h2 className="text-base sm:text-lg font-black text-slate-900">Add category</h2>
          <p className="text-xs text-slate-500 mt-1">Create an authoritative category in the database.</p>

          {formError && (
            <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
              {formError}
            </div>
          )}

          <label className="field-label mt-4 block text-xs font-bold uppercase tracking-wider text-slate-600">
            Category name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="field mt-1.5 w-full"
              placeholder="e.g. CPVC Pipes"
            />
          </label>

          <label className="field-label mt-3 block text-xs font-bold uppercase tracking-wider text-slate-600">
            Slug (optional)
            <input
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              className="field mt-1.5 w-full font-mono text-sm"
              placeholder="e.g. cpvc-pipes"
            />
          </label>

          <label className="field-label mt-3 block text-xs font-bold uppercase tracking-wider text-slate-600">
            Description (optional)
            <textarea
              className="field mt-1.5 w-full resize-none"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Category overview and standards..."
            />
          </label>

          <Button
            disabled={!name.trim() || actionLoading}
            onClick={handleCreate}
            className="mt-5 w-full"
          >
            {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Create Category
          </Button>
        </aside>
      </div>
    </>
  )
}

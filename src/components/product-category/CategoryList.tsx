"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Edit,
  Trash2,
  Search,
  X,
  LayoutGrid,
  Table as TableIcon,
  FolderOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Result, Category } from "@/types/globals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import CategoryFormModal from "./CategoryFormModal";
import DeleteCategoryDialog from "./DeleteCategoryDialog";
import {
  createCategory,
  getCategories,
  removeCategory,
  updateCategory,
} from "@/actions/product-category";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { BulkImportDialog } from "@/components/admin/import/BulkImportDialog";

interface CategoryListProps {
  initialResult: Result<Category[]>;
  // handleAdd: () => void;
}

export default function CategoryList({ initialResult }: CategoryListProps) {
  const router = useRouter();

  // Local state for categories and UI
  const [categories, setCategories] = useState<Category[]>(
    initialResult.success ? initialResult.data : [],
  );
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(
    null,
  );
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(8);

  // Client-side filter by name or description — categories lists are small
  // enough that a full round trip to the server isn't needed here.
  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (category) =>
        category.name.toLowerCase().includes(q) ||
        (category.description || "").toLowerCase().includes(q),
    );
  }, [categories, searchQuery]);

  const pageCount = Math.max(1, Math.ceil(filteredCategories.length / limit));

  const paginatedCategories = useMemo(() => {
    const start = (page - 1) * limit;
    return filteredCategories.slice(start, start + limit);
  }, [filteredCategories, page, limit]);

  // A narrower search shouldn't leave the user stranded on a now-empty page.
  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  // Deleting items (or switching per-page count) can push the current page
  // past the end of the list — snap back into range instead of showing blank.
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  // If initial fetch failed, show error
  if (!initialResult.success) {
    return (
      <div className="text-center py-10 text-red-500">
        Failed to load categories: {initialResult.message}
      </div>
    );
  }

  const handleAdd = () => {
    setEditingCategory(null);
    setIsFormOpen(true);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setIsFormOpen(true);
  };

  const handleDelete = (category: Category) => {
    setDeletingCategory(category);
  };

  const onFormSubmit = async (data: {
    name: string;
    description?: string | null;
  }) => {
    try {
      let result;
      if (editingCategory) {
        result = await updateCategory({ id: editingCategory.id, ...data });
      } else {
        result = await createCategory(data);
      }

      if (!result.success) {
        toast.error("Error", { description: result.message });
        return;
      }

      toast.success("Success", {
        description: editingCategory
          ? "Category updated successfully"
          : "Category created successfully",
      });

      // Refresh the list
      const refreshResult = await getCategories();
      if (refreshResult.success) {
        setCategories(refreshResult.data);
      }
      setIsFormOpen(false);
      router.refresh();
    } catch (error: any) {
      toast.error("Error", { description: "An unexpected error occurred" });
    }
  };

  const onDeleteConfirm = async () => {
    if (!deletingCategory) return;
    try {
      const result = await removeCategory(deletingCategory.id);
      if (!result.success) {
        toast.error("Error", { description: result.message });
        return;
      }

      toast.success("Success", {
        description: "Category deleted successfully",
      });

      // Refresh list
      const refreshResult = await getCategories();
      if (refreshResult.success) {
        setCategories(refreshResult.data);
      }
      setDeletingCategory(null);
      router.refresh();
    } catch (error: any) {
      toast.error("Error", { description: "An unexpected error occurred" });
    }
  };

  const refreshCategories = async () => {
    const refreshResult = await getCategories();
    if (refreshResult.success) {
      setCategories(refreshResult.data);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <div>
          <h2 className="text-xl font-semibold">All Categories</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {categories.length} categor{categories.length === 1 ? "y" : "ies"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <BulkImportDialog
            initialType="categories"
            availableCategories={categories}
            onSuccess={refreshCategories}
          />
          <Button onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" /> Add Category
          </Button>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          No categories found. Create your first category.
        </div>
      ) : (
        <>
          {/* Search + view toggle bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4 rounded-xl border bg-card p-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search categories by name or description..."
                className="pl-9 pr-9 h-10 bg-background text-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1 self-start sm:self-auto shrink-0">
              <Button
                type="button"
                variant={viewMode === "table" ? "default" : "ghost"}
                size="sm"
                className="h-8 gap-1.5 px-3 text-sm shadow-none"
                onClick={() => setViewMode("table")}
                aria-pressed={viewMode === "table"}
              >
                <TableIcon className="h-3.5 w-3.5" />
                Table
              </Button>
              <Button
                type="button"
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="sm"
                className="h-8 gap-1.5 px-3 text-sm shadow-none"
                onClick={() => setViewMode("grid")}
                aria-pressed={viewMode === "grid"}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Grid
              </Button>
            </div>
          </div>

          {filteredCategories.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[200px] rounded-xl border border-dashed p-8 text-center bg-card">
              <Search className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <h4 className="text-sm font-semibold text-foreground">
                No categories match your search
              </h4>
              <p className="text-sm text-muted-foreground max-w-sm mt-1">
                Try a different name or clear the search to see all categories.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 text-sm gap-1.5"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-3.5 w-3.5" />
                Clear Search
              </Button>
            </div>
          ) : (
            <>
            {viewMode === "table" ? (
            <Card>
              <CardContent>
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedCategories.map((category) => (
                        <TableRow key={category.id} className="text-sm">
                          <TableCell className="font-medium">
                            {category.name}
                          </TableCell>
                          <TableCell>{category.description || "—"}</TableCell>
                          <TableCell>
                            {new Date(category.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(category)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(category)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {paginatedCategories.map((category) => (
                <Card
                  key={category.id}
                  className="group flex flex-col justify-between overflow-hidden border transition-all duration-200 hover:shadow-md hover:border-primary/50"
                >
                  <CardHeader className="p-3.5 pb-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                        <FolderOpen className="h-4 w-4" />
                      </div>
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                        <CalendarDays className="h-3 w-3" />
                        {new Date(category.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <CardTitle
                      className="text-sm font-bold leading-tight line-clamp-1"
                      title={category.name}
                    >
                      {category.name}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="p-3.5 pt-0">
                    <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2rem]">
                      {category.description || "No description provided."}
                    </p>
                  </CardContent>

                  <CardFooter className="p-2.5 pt-2 border-t bg-muted/10 flex items-center justify-end gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-sm"
                      onClick={() => handleEdit(category)}
                    >
                      <Edit className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-8 gap-1.5 text-sm"
                      onClick={() => handleDelete(category)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
            )}

            {/* Pagination — shared by both table and grid views */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 mt-4 border-t px-1">
              <div className="text-sm text-muted-foreground">
                Showing page {page} of {pageCount} ({filteredCategories.length}{" "}
                {filteredCategories.length === 1 ? "category" : "categories"})
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span>Per page:</span>
                  <Select
                    value={String(limit)}
                    onValueChange={(val) => {
                      setLimit(Number(val));
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="h-8 w-16 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="8">8</SelectItem>
                      <SelectItem value="12">12</SelectItem>
                      <SelectItem value="24">24</SelectItem>
                      <SelectItem value="48">48</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 text-sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Prev
                  </Button>
                  <div className="text-sm font-semibold px-2">
                    {page} / {pageCount}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 text-sm"
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={page >= pageCount}
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
            </>
          )}
        </>
      )}

      {/* Add/Edit Modal */}
      <CategoryFormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        initialData={editingCategory}
        onSubmit={onFormSubmit}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteCategoryDialog
        open={!!deletingCategory}
        onOpenChange={(open) => !open && setDeletingCategory(null)}
        categoryName={deletingCategory?.name || ""}
        onConfirm={onDeleteConfirm}
      />
    </div>
  );
}
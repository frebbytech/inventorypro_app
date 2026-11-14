"use client";
import { ChangeEvent, useMemo, useState } from "react";
import _ from "lodash";
import { MoreHorizontal, Search } from "lucide-react";
import { currencyFormatter } from "@/config/formatter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Pagination from "../Pagination";
import { Product } from "@/types/globals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";


type ProductTableProps = {
  products: Product[];
};

const ProductTable = ({ products }: ProductTableProps) => {
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedCategory, setSelectedCategory] = useState(""); // Category filter state
  const itemsPerPage = 5; // Number of rows per page

  // Handle search input change
  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to first page on search
  };

  // Handle category filter change
  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    setCurrentPage(1); // Reset to first page on filter change
  };

  // Filter data based on search term and selected category
  const filteredData = useMemo(() => {
    const filteredData = products?.filter((item) => {
      if (selectedCategory === "All" && searchTerm?.trim() === "") {
        return products;
      }

      if (selectedCategory === "All" && searchTerm?.trim() !== "") {
        return (
          item?.name?.toLowerCase()?.includes(searchTerm?.toLowerCase()) ||
          item?.unit_price
            ?.toString()
            ?.toLowerCase()
            ?.includes(searchTerm?.toLowerCase())
        );
      }

      const matchesCategory = selectedCategory
        ? item.category_name === selectedCategory
        : true;
      return searchTerm?.trim() === ""
        ? matchesCategory
        : (item?.name?.toLowerCase()?.includes(searchTerm?.toLowerCase()) ||
            item?.unit_price
              ?.toString()
              ?.toLowerCase()
              ?.includes(searchTerm?.toLowerCase())) &&
            matchesCategory;
    });
    return filteredData;
  }, [products, searchTerm, selectedCategory]);

  // Calculate the indices for slicing the filtered data array
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentData = filteredData?.slice(indexOfFirstItem, indexOfLastItem);

  // Extract unique categories for the dropdown
  const categories = [...new Set(products.map((item) => item.category_name))];

  return (
    <>
      <Card x-chunk="dashboard-05-chunk-3">
        <CardHeader className="px-4">
          <div className="flex justify-between items-center pb-2">
            <CardTitle>
              Products
              <Button variant="outline" className="ml-2 h-7">
                Refresh
              </Button>
            </CardTitle>
            {/* <AddProduct categories={categories}/> */}
          </div>

          <CardDescription className="pb-4">
            Manage products available in the store.
          </CardDescription>

          <div className="flex flex-col md:flex-row justify-between items-center gap-2">
            {/* Category Filter */}
            <Select
              value={selectedCategory}
              onValueChange={handleCategoryChange}
            >
              <SelectTrigger className="w-full md:w-[180px] h-12">
                <SelectValue placeholder="Select Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Categories</SelectLabel>
                  <SelectItem value="All">All Categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <div className="relative w-full  mx-auto md:ml-auto md:mr-0 flex-1 md:grow-0">
              <Search className="absolute left-2.5 top-4.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search..."
                className="w-full rounded-lg bg-background pl-8 py-6  md:w-[220px] lg:w-[320px]"
                value={searchTerm}
                onChange={handleSearchChange}
                // value={searchParams.get("search") || ""}
                // onChange={(e) => handleSearch(e?.target?.value)}
              />
              {/* {isSearchPending && (
              <Loader className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground animate-spin" />
            )} */}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="md:hidden">Product</TableHead>
                <TableHead className="hidden md:table-cell">Product</TableHead>
                <TableHead className="hidden md:table-cell">Category</TableHead>
                <TableHead className="hidden md:table-cell">Stock</TableHead>
                <TableHead className="text-right hidden md:table-cell">
                  Cost Price
                </TableHead>
                <TableHead className="text-right hidden md:table-cell">
                  Unit Price
                </TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead className="hidden md:table-cell">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <>
                {_.isEmpty(currentData) ? (
                  <>
                    {_.isEmpty(searchParams.get("search")) ? (
                      <TableRow>
                        <TableCell className="w-full mx-auto " colSpan={6}>
                          <div className="w-full flex flex-col items-center justify-center">
                            <p>No product available!</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow>
                        <TableCell className="w-full mx-auto " colSpan={6}>
                          <div className="w-full flex flex-col items-center justify-center">
                            <Search />
                            <p>No product match your search!</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ) : (
                  <>
                    {currentData?.map((product) => {
                      return (
                        // <HoverProduct key={product?.id} product={product}>
                        <TableRow
                          key={product?.id}
                          className="bg-accent cursor-pointer"
                        >
                          {/* <ProductItem product={product}> */}
                          <TableCell className="flex gap-4 md:hidden ">
                            <div className="flex-grow">
                              {/* <p className="text-sm sm:block font-medium text-balance">
                                {product?.id}
                              </p> */}
                              <p className="font-medium">{product?.name}</p>
                              <p
                                className={`inline-flex rounded-full bg-opacity-10 px-3 py-1 text-sm font-medium ${
                                  product?.category_name === "pipes"
                                    ? "bg-success text-success"
                                    : product?.category_name === "bar"
                                      ? "bg-danger text-danger"
                                      : "bg-warning text-warning"
                                }`}
                              >
                                {product?.category_name}
                              </p>
                              <p className="text-sm text-primary md:block">
                                {product?.stock_quantity}
                              </p>

                              <Separator className="my-2" />

                              <p className="font-medium text-primary">
                                {currencyFormatter(product?.cost_price)}
                              </p>
                              <p className="font-medium text-primary">
                                {currencyFormatter(product?.unit_price)}
                              </p>

                              <Separator className="my-2" />
                              <div className="flex justify-between items-center">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-sm capitalize text-white",
                                    product?.active === 1
                                      ? " bg-green-500"
                                      : " bg-red-500",
                                  )}
                                >
                                  {product?.active === 1
                                    ? "Active"
                                    : "Disabled"}
                                </Badge>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      aria-haspopup="true"
                                      size="icon"
                                      variant="ghost"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                      <span className="sr-only">
                                        Toggle menu
                                      </span>
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>
                                      Actions
                                    </DropdownMenuLabel>
                                    {/* <ViewProduct product={product} /> */}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem asChild>
                                      <Link
                                        href={`/admin/products/${product?.id}`}
                                      >
                                        View
                                      </Link>
                                    </DropdownMenuItem>
                                    {/* <DropdownMenuItem asChild>
                                      <Link
                                        href={`/admin/products/${product?.id}/edit`}
                                      >
                                        Edit
                                      </Link>
                                    </DropdownMenuItem> */}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          </TableCell>
                          {/* </ProductItem> */}

                          <TableCell className="hidden md:table-cell">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-lg border bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                                {product.photo_url ? (
                                  <img
                                    src={product.photo_url || ""}
                                    alt={product.name}
                                    className="h-full w-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLElement).style.display =
                                        "none";
                                    }}
                                  />
                                ) : (
                                  <span className="text-xs font-semibold text-muted-foreground uppercase">
                                    {product.name?.[0] || "P"}
                                  </span>
                                )}
                              </div>
                              <p className="font-medium text-foreground">
                                {product?.name}
                              </p>
                            </div>
                          </TableCell>
                          {/* </ProductItem> */}

                          <TableCell className="hidden md:table-cell">
                            <p
                              className={`inline-flex rounded-full bg-opacity-10 px-3 py-1 text-sm font-medium ${
                                product?.category_name === "pipes"
                                  ? "bg-success text-success"
                                  : product?.category_name === "bar"
                                    ? "bg-danger text-danger"
                                    : "bg-warning text-warning"
                              }`}
                            >
                              {product?.category_name}
                            </p>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {product?.stock_quantity}
                          </TableCell>
                          <TableCell className="text-right text-green-500 hidden md:table-cell">
                            {currencyFormatter(product?.cost_price)}
                          </TableCell>
                          <TableCell className="text-right text-blue-500 hidden md:table-cell">
                            {currencyFormatter(product?.unit_price)}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-sm capitalize text-white",
                                product?.active === 1
                                  ? " bg-green-500"
                                  : " bg-red-500",
                              )}
                            >
                              {product?.active === 1 ? "Active" : "Disabled"}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  aria-haspopup="true"
                                  size="icon"
                                  variant="ghost"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Toggle menu</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                {/* <ViewProduct product={product} /> */}

                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                  <Link href={`/admin/products/${product?.id}`}>
                                    View
                                  </Link>
                                </DropdownMenuItem>

                                {/* <DropdownMenuItem asChild>
                                  <Link
                                    href={`/admin/products/${product?.id}/edit`}
                                  >
                                    Edit
                                  </Link>
                                </DropdownMenuItem> */}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                        // </HoverProduct>
                      );
                    })}
                  </>
                )}
              </>
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="w-full mx-auto " colSpan={7}>
                  {currentData && (
                    <Pagination
                      data={filteredData}
                      itemsPerPage={5}
                      currentPage={currentPage}
                      setCurrentPage={setCurrentPage}
                    />
                  )}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </>
  );
};

export default ProductTable;

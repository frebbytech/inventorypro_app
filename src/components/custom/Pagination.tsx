import React, { Dispatch, SetStateAction } from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";

type PaginationProps<T> = {
  data: T[];
  currentPage: number;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  itemsPerPage: number;
};

function Pagination<T>({
  data = [],
  currentPage,
  setCurrentPage,
  itemsPerPage = 5,
}: PaginationProps<T>) {
  const totalPages = Math.ceil(data?.length / itemsPerPage);

  const handleClick = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  return (
    <div className="flex justify-center my-4">
      <Button
        size="icon"
        className={cn(
          " text-black rounded",
          currentPage === 1 && "opacity-50 cursor-not-allowed"
        )}
        onClick={() => handleClick(currentPage - 1)}
        disabled={currentPage === 1}
      >
        <ChevronsLeft /> Previous
      </Button>
      {Array.from({ length: totalPages }, (_, index) => (
        <button
          key={index + 1}
          className={cn(
            "px-3 py-1 mx-1 text-sm font-medium bg-transparent text-black rounded ",
            currentPage === index + 1 && "bg-green-700 text-white"
          )}
          onClick={() => handleClick(index + 1)}
        >
          {index + 1}
        </button>
      ))}
      <Button
        size="icon"
        className={cn(
          " text-black rounded",
          currentPage === totalPages && "opacity-50 cursor-not-allowed"
        )}
        onClick={() => handleClick(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        Next
        <ChevronsRight />
      </Button>
    </div>
  );
}

export default Pagination;

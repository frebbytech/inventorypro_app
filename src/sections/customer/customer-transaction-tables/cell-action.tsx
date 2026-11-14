"use client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CustomerSaleView } from "@/types/globals";
import { Eye, MoreHorizontal } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

interface CellActionProps {
  data: CustomerSaleView;
}

export const CellAction: React.FC<CellActionProps> = ({ data }) => {
  const router = useRouter();
  const { id } = useParams();

  return (
    <>
      <DropdownMenu modal>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() =>
              router.push(
                `/admin/customer/${id}/transaction?sales_id=${data?.id}`
              )
            }
          >
            <Eye className="mr-2 h-4 w-4" /> View Details
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};

"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User } from "@/types/globals";

import { Edit, Lock, MoreHorizontal, Unlock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { unlockUser } from "@/actions/_actions";
import { toast } from "sonner";

interface CellActionProps {
  data: User;
}

export const CellAction: React.FC<CellActionProps> = ({ data }) => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const isLocked =
    data.locked_until && new Date(data.locked_until) > new Date();

  const handleUnlock = async () => {
    setLoading(true);
    try {
      const res = await unlockUser(data.id);
      if (res.success) {
        toast.success(`Account for ${data.username} unlocked successfully.`);
        router.refresh();
      } else {
        toast.error(res.message || "Failed to unlock account.");
      }
    } catch {
      toast.error("An error occurred while unlocking account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0" disabled={loading}>
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>

          <DropdownMenuItem
            onClick={() => router.push(`/admin/employee/${data.id}`)}
          >
            <Edit className="mr-2 h-4 w-4" /> View
          </DropdownMenuItem>

          {isLocked && (
            <DropdownMenuItem onClick={handleUnlock}>
              <Unlock className="mr-2 h-4 w-4 text-emerald-600" /> Unlock Account
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};

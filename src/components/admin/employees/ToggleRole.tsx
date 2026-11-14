/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { setRole } from "@/actions/_actions";
import { toast } from "sonner";
import LoadingSpinner from "@/components/custom/spinner/LoadingSpinner";

type ToggleRoleProps = {
  id: string;
  role: "admin" | "member";
};
function ToggleRole({ id, role }: ToggleRoleProps) {
  const [loading, setLoading] = useState(false);

  const handleToggleRole = async (value: "admin" | "member") => {
    setLoading(true);
    try {
      const result = await setRole(id, value);

      if (result) {
        toast.success("User role updated!", {
          position: "top-right",
          className: "p-4 text-success text-base",
        });
      }
    } catch (error: any) {
      toast.error("Failed! An error has occurred.", {
        description: error?.message,
        position: "top-right",
        className: "p-4 text-red-600",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Select value={role} onValueChange={handleToggleRole}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder={role} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Select Role</SelectLabel>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="member">Member</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      {loading && <LoadingSpinner loadingText="Changing Role.Please Wait..." />}
    </>
  );
}

export default ToggleRole;

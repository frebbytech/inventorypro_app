"use client";

import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AuditEntityType, AuditLogView } from "@/types/globals";
import { EntityAuditCell } from "@/components/custom/EntityHoverCard";



interface EmployeeLogsTableProps {
  logs: AuditLogView[];
}

export default function EmployeeLogsTable({ logs }: EmployeeLogsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Action</TableHead>
          <TableHead>Entity</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>IP Address</TableHead>
          <TableHead>User Agent</TableHead>
          <TableHead>Old Values</TableHead>
          <TableHead>New Values</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log) => (
          <TableRow key={log.id}>
            <TableCell>
              <Badge variant="outline" className="capitalize">
                {log.action}
              </Badge>
            </TableCell>
            <TableCell>{log.entity_type || "—"}</TableCell>
            <TableCell>{format(new Date(log.created_at), "PPP p")}</TableCell>
            <TableCell className="text-sm">{log.ip_address || "—"}</TableCell>
            <TableCell className="text-sm truncate max-w-[120px]">
              {log.user_agent || "—"}
            </TableCell>
            <TableCell className="max-w-[150px] truncate">
              <EntityAuditCell
                entityType={log.entity_type as AuditEntityType}
                values={log.old_values}
              />
            </TableCell>
            <TableCell className="max-w-[150px] truncate">
              <EntityAuditCell
                entityType={log.entity_type as AuditEntityType}
                values={log.new_values}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

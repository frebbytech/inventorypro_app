import React from "react";
import { LogValuesHoverCard } from "./LogValuesHoverCard"; // Adjust path accordingly
import { AuditEntityMap, AuditEntityType } from "@/types/globals";

interface EntityAuditCellProps<K extends AuditEntityType> {
  entityType: K;
  values: string | AuditEntityMap[K] | null | undefined;
}

/**
 * Type-safe utility to parse raw audit log objects/strings based on entity type.
 */
export function parseAuditEntity<K extends AuditEntityType>(
  type: K,
  payload: string | AuditEntityMap[K] | null | undefined,
): AuditEntityMap[K] | null {
  if (!payload) return null;
  try {
    return typeof payload === "string"
      ? (JSON.parse(payload) as AuditEntityMap[K])
      : payload;
  } catch (error) {
    console.error(`Failed parsing audit log for entity type [${type}]:`, error);
    return null;
  }
}

/**
 * A wrapper component that automatically switches between entity types,
 * formats them, and passes them to the generic LogValuesHoverCard component.
 */
export function EntityAuditCell<K extends AuditEntityType>({
  entityType,
  values,
}: EntityAuditCellProps<K>) {
  // Pass the explicit generic type dynamically extracted from the map interface
  const parsedData = parseAuditEntity(entityType, values);

  return (
    <LogValuesHoverCard<AuditEntityMap[K]>
      entityType={entityType}
      values={parsedData}
    />
  );
}

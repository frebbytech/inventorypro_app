import { v7 as uuidv7 } from "uuid";

export const generateId = (prefix?: string): string => {
  const id = uuidv7();

  return prefix ? `${prefix}_${id}` : id;
};
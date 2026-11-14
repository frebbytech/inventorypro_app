interface UserInitialsInput {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  firstname?: string | null;
  lastname?: string | null;
}

/**
 * Generates an uppercase 1 or 2 letter initials string for user avatars.
 * Fallbacks cleanly to username slices or a default placeholder.
 */
export function getInitials(user?: UserInitialsInput | null): string {
  if (!user) return "U";

  const first = user.firstName?.trim() || user.firstname?.trim();
  const last = user.lastName?.trim() || user.lastname?.trim();

  // 1. Try combining First Name and Last Name initials
  if (first && last) {
    return `${first[0]}${last[0]}`.toUpperCase();
  }

  // 2. Fallback to just the First Name initial if Last Name is missing
  if (first) {
    return first[0].toUpperCase();
  }

  // 3. Fallback to the first two characters of the username
  const username = user.username?.trim();
  if (username) {
    return username.slice(0, 2).toUpperCase();
  }

  // 4. Ultimate fallback placeholder
  return "U";
}


// lib/receiptFormatting.ts
export function formatCurrency(amount: number, currency = "GHS"): string {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  const d = new Date(date);
  const datePart = d.toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timePart = d.toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
}

export function formatShortDate(date: string | Date): string {
  const d = new Date(date);
  const datePart = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timePart = d.toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart} ${timePart}`;
}

export function toImageSrc(base64OrDataUri: string, mime = "image/png"): string {
  return base64OrDataUri.startsWith("data:")
    ? base64OrDataUri
    : `data:${mime};base64,${base64OrDataUri}`;
}
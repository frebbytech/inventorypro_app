export const currencyFormatter = (amount: string | number | undefined) => {
  const formatter = new Intl.NumberFormat('en-GH', {
    style: "currency",
    currency: "GHS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return formatter.format(typeof amount === undefined ? 0 : Number(amount));
};

export const currencyFormatterWithoutSign = (
  amount: string | number | undefined,
) => {
  const formatter = new Intl.NumberFormat('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return formatter.format(typeof amount === undefined ? 0 : Number(amount));
};

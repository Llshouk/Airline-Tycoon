export const formatGBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0
});

export const formatNumber = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 0
});

export function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

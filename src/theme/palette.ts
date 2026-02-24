export type ThemePaletteEntry = {
  key: string;
  label: string;
  code?: string;
  baseHex: string;
  pickerVisible: boolean;
};

export const DEFAULT_THEME_KEY = "defaultGreen";

export const THEME_PALETTE: ThemePaletteEntry[] = [
  { key: DEFAULT_THEME_KEY, label: "Default Green", baseHex: "#2f855a", pickerVisible: false },
  { key: "silhouette", label: "Silhouette", code: "AF-655", baseHex: "#5A5452", pickerVisible: true },
  { key: "batik", label: "Batik", code: "AF-610", baseHex: "#CBBABA", pickerVisible: true },
  { key: "swissCoffee", label: "Swiss Coffee", code: "OC-45", baseHex: "#EEECE2", pickerVisible: true },
  { key: "narragansettGreen", label: "Narragansett Green", code: "HC-157", baseHex: "#3E4C4D", pickerVisible: true },
  { key: "sherwoodTan", label: "Sherwood Tan", code: "1054", baseHex: "#B79E86", pickerVisible: true },
  { key: "firstCrush", label: "First Crush", code: "CSP-310", baseHex: "#E9DED1", pickerVisible: true },
  { key: "southwestPottery", label: "Southwest Pottery", code: "048", baseHex: "#8B5B54", pickerVisible: true },
  { key: "raindance", label: "Raindance", code: "1572", baseHex: "#AEB8AE", pickerVisible: true },
];

export const PICKER_THEMES = THEME_PALETTE.filter((entry) => entry.pickerVisible);

export const THEME_BY_KEY = Object.fromEntries(THEME_PALETTE.map((entry) => [entry.key, entry]));

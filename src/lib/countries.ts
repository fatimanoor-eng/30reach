// Calendar / profile countries (Slice 17c). Holidays come from Nager.Date, so the list sticks to countries
// it covers; names come from the browser (Intl.DisplayNames), English.
export const COUNTRIES = [
  "US",
  "GB",
  "CA",
  "AU",
  "NZ",
  "IE",
  "DE",
  "FR",
  "ES",
  "IT",
  "NL",
  "BE",
  "CH",
  "AT",
  "SE",
  "NO",
  "DK",
  "FI",
  "PL",
  "PT",
  "BR",
  "MX",
  "AR",
  "CO",
  "CL",
  "ZA",
  "NG",
  "EG",
  "MA",
  "JP",
  "KR",
  "CN",
  "SG",
  "PH",
  "ID",
  "VN",
  "TR",
] as const;

export const LANGUAGES = [
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "nl",
  "sv",
  "pl",
  "tr",
  "ja",
  "ko",
] as const;

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();
const languageNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" });
  } catch {
    return null;
  }
})();

export const countryName = (code: string) => regionNames?.of(code) ?? code;
export const languageName = (code: string) => languageNames?.of(code) ?? code;

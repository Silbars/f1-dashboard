// Circuit.country is the country name from the API; keys cover the spellings it has used.
const COUNTRY_CODE: Record<string, string> = {
  Australia: 'AU', Austria: 'AT', Azerbaijan: 'AZ', Bahrain: 'BH', Belgium: 'BE', Brazil: 'BR', Canada: 'CA', China: 'CN',
  Hungary: 'HU', Italy: 'IT', Japan: 'JP', Malaysia: 'MY', Mexico: 'MX', Monaco: 'MC', Netherlands: 'NL', Qatar: 'QA', Singapore: 'SG',
  Spain: 'ES', 'Saudi Arabia': 'SA', UK: 'GB', 'United Kingdom': 'GB', USA: 'US', 'United States': 'US', UAE: 'AE', 'United Arab Emirates': 'AE',
};

/** Flag images live in public/flags, named by lowercase ISO code. */
export const flagSrc = (country: string) => {
  const code = COUNTRY_CODE[country];
  return code ? `/flags/${code.toLowerCase()}.png` : undefined;
};

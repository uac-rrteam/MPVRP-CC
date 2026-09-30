export const siteConfig = {
  repositoryUrl: 'https://github.com/IFRI-AI-Classes/MPVRP-CC',
  documentationUrl: '', // Replace with the published Google Docs URL.
  startupKitUrl: `${import.meta.env.BASE_URL}assets/mpvrp-cc-startup.zip`,
  scoringVersion: '1.0.0',
} as const;

export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}assets/${path}`;

export type ResumeTemplateAsset = {
  id: string;
  label: string;
  schemaFile: string;
  htmlFile: string;
};

export const RESUME_TEMPLATE_ASSETS: ResumeTemplateAsset[] = [
  {
    id: "basic_modern_minimal_single_column",
    label: "Basic Modern Minimal (Single Column)",
    schemaFile: "basic-modern-minimal-single-column.json",
    htmlFile: "basic-modern-minimal-single-column.html",
  },
];

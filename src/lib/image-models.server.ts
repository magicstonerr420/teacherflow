/** Only the reviewed image pair may participate in automatic model recovery. */
export const PRIMARY_IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";
export const BACKUP_IMAGE_MODEL = "google/gemini-3.1-flash-lite-image";

// Approved after the owner-authorized four-prompt age/level/visual-concept comparison.
// Review evidence: docs/image-backup-evaluation.md. No other model is auto-selected.
export const IMAGE_BACKUP_APPROVED = true;

export function imagePriceApproval(model: string) {
  if (model === PRIMARY_IMAGE_MODEL) return { provider: "google-ai-studio", maxTokenUsd: 0.00006 };
  if (IMAGE_BACKUP_APPROVED && model === BACKUP_IMAGE_MODEL)
    return { provider: "google-vertex/global", maxTokenUsd: 0.00003 };
  return undefined;
}

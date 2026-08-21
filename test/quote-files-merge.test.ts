import { describe, expect, it } from "vitest";

import {
  mergeQuoteFileRecords,
  type QuoteAttachmentRecord,
  type QuoteFileMetadataRecord,
} from "@/lib/quote-files";

const metadata: QuoteFileMetadataRecord = {
  id: "metadata-1",
  legacy_id: "quote-file-legacy-id",
  display_name: "FCCQ20251219 - 1",
  source_file_name: "FCCQ20251219.pdf",
  bubble_created_at: "2025-12-30T07:57:00.000Z",
  created_at: "2026-08-12T07:39:22.000Z",
};

const attachment: QuoteAttachmentRecord = {
  id: "attachment-1",
  source_legacy_row_id: "uploaded-file-legacy-id",
  original_filename: "FCCQ20251219.pdf",
  bucket_id: "attachments",
  object_path: "sha256/e9/file",
  mime_type: "application/pdf",
  size_bytes: 688_128,
  source_modified_at: "2025-12-30T07:57:00.000Z",
  created_at: "2026-08-13T00:00:00.000Z",
};

describe("quote file record merging", () => {
  it("deduplicates separately migrated metadata and bytes by source filename", () => {
    const files = mergeQuoteFileRecords([metadata], [attachment]);

    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      id: "attachment-1",
      name: "FCCQ20251219 - 1",
      sizeBytes: 688_128,
      objectPath: "sha256/e9/file",
      available: true,
    });
  });

  it("does not collapse two real uploads that happen to share a filename", () => {
    const files = mergeQuoteFileRecords(
      [metadata],
      [
        attachment,
        {
          ...attachment,
          id: "attachment-2",
          object_path: "quotes/order/attachment-2.pdf",
          created_at: "2026-08-14T00:00:00.000Z",
        },
      ],
    );

    expect(files).toHaveLength(2);
    expect(files.map((file) => file.id).sort()).toEqual([
      "attachment-1",
      "attachment-2",
    ]);
  });
});

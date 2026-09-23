# Share student materials

Open a saved lesson in My lessons and choose **Share with students**. Select the worksheet, reading, saved listening recording, or homework, and choose a seven- or thirty-day expiry. Preview the student page, then copy the link into your class message. Sharing uses existing saved content and recordings; it does not generate new materials or use another lesson allowance.

Anyone with the link can open the selected materials without a TeacherFlow account. The page includes a print option and picture clues for supported worksheet/reading tasks. Students complete work on paper or in their notebooks; this release does not collect submissions or student identities. Listening can be selected only after a recording has been saved.

The link contains a saved snapshot. Save edits to the original lesson, then choose **Refresh shared materials** to update the same link. Refreshing does not extend its expiry. Revoke a link to stop future access; then create a new link if you need a different selection or expiry. Downloaded, printed, or already-open copies cannot be recalled.

The server builds a strict student-only payload. Answer keys, question evidence/solutions, teacher notes, listening transcripts, account details, and generation diagnostics are excluded before delivery. The original lesson is never serialized into the student route. Public links use random 256-bit tokens; responses disable caching and indexing and suppress referrers. Public reads require no privileged database credential.

Snapshots, ownership, expiry, and revocation use the existing persistent beta database and its backups. Creation, refresh, revocation, and deletion verify the teacher's lesson ownership. Deleting through TeacherFlow disables student links before the remote deletion, including uncertain deletion responses. Changes from late duplicate requests cannot undo a revocation. A failed deletion can be retried from My lessons; sharing remains disabled while deletion is unconfirmed.

Tests cover nested field exclusion, owner isolation, explicit snapshot refresh, expiry, revocation, deletion races, persistence, media validation, account switching, clipboard fallback, mobile layout, and student printing. A separate compiled-server check verifies the public route and response headers using isolated fixture data.

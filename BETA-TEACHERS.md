# Managing private beta teachers

Sign in as the configured owner and open **Beta management** in the main navigation, or visit `/beta-management`. Teacher controls and the budget are on this separate page. Lesson builder provides a shortcut to it.

To invite a teacher, choose **Create invitation → Copy invitation link** on the new card. Paste that link into your own WhatsApp message or email. The key is already inside the link. The teacher opens it, signs in or creates an account, and claims the invitation automatically. The app does not send an invitation message itself.

- See invitation seats, each claimed account, completed lessons, and remaining lesson slots. The beta starts with three invitations.
- Use **Create invitation** to add another single-use key. Each additional teacher receives three lesson slots. Duplicate clicks and retries with the same creation operation cannot create extra keys.
- Save a private label to identify the intended teacher. Labels are notes, not email restrictions. A link can be claimed by one signed-in account.
- Copy an unused invitation link. For older invitations whose original codes were not retained, use the previously saved link or choose **Replace invitation link**.
- Choose **Remove access**, then **Remove access & replace invitation** to revoke a teacher and make that seat unused again. The other two links stay valid. Removing the sole active teacher restores three unused invitations.
- Refresh the list to recover a replacement link if the response or clipboard was interrupted. Refreshing never generates another invitation.
- Use **Deactivate key → Confirm deactivation** to disable an unused or claimed key without making a replacement. For claimed keys, the teacher also loses generation access. Deactivated keys are excluded from the unused invitation count.
- Use **Activate with new link** on a deactivated entry to reopen that seat with a fresh key. The original link stays invalid, and previously removed accounts stay blocked.

Removal disables new beta generation and blocks that account from claiming another invitation in this round. It preserves saved lesson records, recording storage, and the spending ledger. Requests already started may finish, and their results remain retained. It does not delete the Supabase account or erase saved lessons. The shared $10 round budget is not increased or reset by creating, replacing, or deactivating keys.

Confirmed email addresses come from verified Supabase sign-ins. Older claimed invitations can initially show the account ID; the email and last-access-check time appear after that teacher next opens the builder. Previously unrecorded join times remain unknown. Labels can identify these older entries meanwhile.

## My profile

Every signed-in account can open **My profile** at `/profile` to save a full name, school or organization, teaching role, and short bio. The account email is shown read-only. The active profile is stored in Supabase Auth user metadata (`full_name` and the namespaced `teacherflow_profile` object), using the signed-in user's `updateUser` operation. It does not require a database schema migration. The older `public.profiles` table is not used as the source for these new fields.

Only the name and verified email are reflected in the owner roster, after an authenticated beta status check. Profile fields are display information and never determine owner permissions, invitation access, or quotas. Changing an account ID, role, email, or allowance through this profile form is not supported. Saving a profile refreshes the user's beta display state. Profile operations make no AI calls.

All management calls verify the owner ID on the server, use POST with no-store responses, and reject stale seat versions and changed occupants. Public UI visibility is not an authorization boundary. Replacement codes are stored only in the server's persistent beta database until claimed; the owner can retrieve them again without rotation. Removed accounts and the actor/time of invitation replacements are retained in that database. Never publish this database or invitation files.

Validation uses temporary databases, mocked identities, and isolated browser fixtures. It makes no paid AI calls.

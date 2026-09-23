import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ExternalLink, RefreshCw, Share2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StudentShareSection, StudentShareSummary } from "@/lib/student-share";
import {
  createStudentShare,
  getStudentShares,
  refreshStudentShare,
  revokeStudentShare,
} from "@/lib/student-share.functions";

const labels: Record<StudentShareSection, string> = {
  worksheet: "Student worksheet",
  reading: "Reading passage and questions",
  listening: "Listening recording and questions",
  homework: "Homework",
};

/** Every account/lesson gets separate form state, query data, and pending actions. */
export function StudentShareDialog({
  lessonId,
  userId,
}: {
  lessonId: string;
  userId: string | undefined;
}) {
  return userId ? (
    <AccountShareDialog key={`${userId}:${lessonId}`} lessonId={lessonId} userId={userId} />
  ) : null;
}

function AccountShareDialog({ lessonId, userId }: { lessonId: string; userId: string }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const cache = useQueryClient();
  const load = useServerFn(getStudentShares);
  const create = useServerFn(createStudentShare);
  const refresh = useServerFn(refreshStudentShare);
  const revoke = useServerFn(revokeStudentShare);
  const queryKey = ["student-shares", userId, lessonId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { lessonId } }),
    enabled: open,
    retry: false,
  });
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const action = useMutation({
    mutationFn: async (
      input:
        | { kind: "create"; sections: StudentShareSection[]; expiresInDays: 7 | 30 }
        | { kind: "refresh" | "revoke"; id: string },
    ) => {
      if (input.kind === "create")
        return create({
          data: { lessonId, sections: input.sections, expiresInDays: input.expiresInDays },
        });
      if (input.kind === "refresh") return refresh({ data: { id: input.id } });
      return revoke({ data: { id: input.id } });
    },
    onSuccess: async (_, input) => {
      await cache.invalidateQueries({ queryKey });
      if (!mounted.current) return;
      setConfirmRevoke(false);
      setNotice(
        input.kind === "create"
          ? "Student link created. Preview it before sharing."
          : input.kind === "refresh"
            ? "Shared materials updated from your saved lesson."
            : "Link revoked. It no longer opens the materials.",
      );
    },
  });
  const active = query.data?.shares.find((share) => share.status === "active");

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (action.isPending) return;
        setOpen(value);
        setConfirmRevoke(false);
        setNotice("");
        action.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" type="button">
          <Share2 className="size-4" />
          Share with students
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Share with students</DialogTitle>
          <DialogDescription>
            Share selected materials from this saved lesson. Anyone with the link can open them
            without signing in.
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-lg bg-accent/50 p-3 text-sm">
          Answer keys, teacher notes, and your account details are excluded. Review the student
          preview before sending the link.
        </p>
        {query.isPending ? (
          <p role="status">Loading student sharing…</p>
        ) : query.isError ? (
          <div role="alert" className="space-y-2">
            <p>We could not load sharing settings.</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Retry sharing settings
            </Button>
          </div>
        ) : active ? (
          <div className="space-y-4">
            <ActiveLink
              share={active}
              disabled={action.isPending}
              onCopy={(message) => {
                if (mounted.current) setNotice(message);
              }}
            />
            <p className="text-sm text-muted-foreground">
              This link contains a saved copy. Save lesson edits first, then refresh the shared
              materials. Refreshing keeps the same link and expiry date.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={action.isPending}
                onClick={() => {
                  setNotice("");
                  action.mutate({ kind: "refresh", id: active.id });
                }}
              >
                <RefreshCw className="size-4" />
                Refresh shared materials
              </Button>
              <Button
                variant="ghost"
                disabled={action.isPending}
                onClick={() => setConfirmRevoke(true)}
              >
                Revoke link
              </Button>
            </div>
            {confirmRevoke && (
              <div className="space-y-3 rounded-lg border p-3">
                <p className="text-sm">
                  Stop access through this link? Copies already downloaded or printed cannot be
                  recalled. You can create a new link afterward with different sections.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="destructive"
                    disabled={action.isPending}
                    onClick={() => {
                      setNotice("");
                      action.mutate({ kind: "revoke", id: active.id });
                    }}
                  >
                    Confirm revoke
                  </Button>
                  <Button
                    variant="outline"
                    disabled={action.isPending}
                    onClick={() => setConfirmRevoke(false)}
                  >
                    Keep link
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <NewLinkForm
            available={query.data?.availableSections ?? []}
            busy={action.isPending}
            onCreate={(sections, expiresInDays) => {
              setNotice("");
              action.mutate({ kind: "create", sections, expiresInDays });
            }}
          />
        )}
        {action.isPending && (
          <p role="status" className="text-sm">
            Updating student sharing…
          </p>
        )}
        {action.isError && (
          <p role="alert" className="text-sm text-destructive">
            We could not update student sharing. Try again; existing materials are still saved.
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ActiveLink({
  share,
  disabled,
  onCopy,
}: {
  share: StudentShareSummary;
  disabled: boolean;
  onCopy: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const url =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/share/${encodeURIComponent(share.token)}`;
  const id = useId();
  return (
    <div className="space-y-3">
      <ul aria-label="Shared sections" className="list-inside list-disc text-sm">
        {share.sections.map((section) => (
          <li key={section}>{labels[section]}</li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        Expires {new Date(share.expiresAt).toLocaleString()}
      </p>
      <div className="space-y-2">
        <Label htmlFor={id}>Student link</Label>
        <Input
          ref={input}
          id={id}
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={disabled}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              onCopy("Link copied. Paste it into your class message when you are ready.");
            } catch {
              input.current?.focus();
              input.current?.select();
              onCopy("Select the student link above and copy it manually.");
            }
          }}
        >
          <Copy className="size-4" />
          Copy student link
        </Button>
        <Button variant="outline" asChild>
          <a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
            <ExternalLink className="size-4" />
            Preview student view
          </a>
        </Button>
      </div>
    </div>
  );
}

function NewLinkForm({
  available,
  busy,
  onCreate,
}: {
  available: StudentShareSection[];
  busy: boolean;
  onCreate: (sections: StudentShareSection[], days: 7 | 30) => void;
}) {
  const [selected, setSelected] = useState<StudentShareSection[]>(() => [...available]);
  const [days, setDays] = useState<7 | 30>(7);
  const id = useId();
  if (!available.length)
    return (
      <p className="text-sm">
        There are no saved student materials to share yet. Complete the worksheet, reading,
        listening recording, or homework and save the lesson first.
      </p>
    );
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onCreate(
          selected.filter((section) => available.includes(section)),
          days,
        );
      }}
    >
      <fieldset disabled={busy} className="space-y-3">
        <legend className="mb-3 text-sm font-semibold">Choose student materials</legend>
        {(Object.keys(labels) as StudentShareSection[]).map((section) => (
          <label key={section} className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={selected.includes(section)}
              disabled={!available.includes(section)}
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? [...selected, section]
                    : selected.filter((item) => item !== section),
                )
              }
            />
            <span>
              {labels[section]}
              {!available.includes(section) && (
                <span className="block text-xs text-muted-foreground">
                  Not available in this saved lesson
                </span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="space-y-2">
        <Label htmlFor={id}>Link expires after</Label>
        <select
          id={id}
          disabled={busy}
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          value={days}
          onChange={(event) => setDays(Number(event.target.value) as 7 | 30)}
        >
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
        </select>
      </div>
      <p className="text-xs text-muted-foreground">
        Only existing saved materials are copied. Creating a link does not generate new content or
        use another lesson slot.
      </p>
      <Button
        type="submit"
        disabled={busy || !selected.some((section) => available.includes(section))}
      >
        Create student link
      </Button>
    </form>
  );
}

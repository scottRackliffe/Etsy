import { addNotificationEntry } from "@/lib/notifications";
import { dequeueMutation, listMutationQueue, type QueuedMutation } from "@/lib/mutation-queue";

export type ReplayFailure = {
  id: string;
  url: string;
  reason: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ReplayOutcome = "ok" | "fail" | "stop";

async function replayOne(item: QueuedMutation): Promise<ReplayOutcome> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...item.headers,
        },
        body: item.body,
      });

      if (response.ok || response.status === 204) return "ok";
      if (response.status === 409) return "fail";
      if (response.status === 400) return "fail";
      if (response.status === 500 || response.status === 503) {
        if (attempt === 0) {
          await sleep(5000);
          continue;
        }
        return "stop";
      }
      return "fail";
    } catch {
      if (attempt === 0) {
        await sleep(5000);
        continue;
      }
      return "stop";
    }
  }
  return "stop";
}

export async function replayMutationQueue(): Promise<{
  succeeded: number;
  failed: ReplayFailure[];
  stoppedEarly: boolean;
}> {
  const queue = listMutationQueue();
  let succeeded = 0;
  const failed: ReplayFailure[] = [];
  let stoppedEarly = false;

  for (const item of queue) {
    const outcome = await replayOne(item);

    if (outcome === "ok") {
      dequeueMutation(item.id);
      succeeded += 1;
      continue;
    }

    if (outcome === "fail") {
      dequeueMutation(item.id);
      failed.push({
        id: item.id,
        url: item.url,
        reason:
          item.method === "PATCH"
            ? "Record changed or was rejected — reload and re-apply edits."
            : "Server rejected the saved change.",
      });
      continue;
    }

    stoppedEarly = true;
    break;
  }

  if (succeeded > 0 && failed.length === 0 && !stoppedEarly) {
    addNotificationEntry({ type: "success", message: "All changes synced." });
  } else if (failed.length > 0) {
    addNotificationEntry({
      type: "warning",
      message: `${failed.length} change${failed.length === 1 ? "" : "s"} could not be synced.`,
    });
  } else if (stoppedEarly) {
    addNotificationEntry({
      type: "warning",
      message:
        "Some pending changes are still waiting — we will retry when the server is reachable.",
    });
  }

  return { succeeded, failed, stoppedEarly };
}

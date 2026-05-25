"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import type { ApiErrorShape, AiConfig } from "@/types";

type BackupEntry = {
  filename: string;
  created_at: string;
  size_bytes: number;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ConfigPage() {
  const {
    aiConfig, setAiConfig, publishConfig, setPublishConfig,
    iconConfig, setIconConfig,
    setError, setApiError,
  } = useApp();

  const [aiApiKeyDraft, setAiApiKeyDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);

  const loadBackups = useCallback(async () => {
    setBackupLoading(true);
    try {
      const response = await fetch("/api/backup", { headers: { Accept: "application/json" } });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
        backups?: BackupEntry[];
      };
      if (!response.ok) throw data;
      setBackups(data.backups ?? []);
    } catch (err) {
      setApiError("Could not load backups", "We could not load the backup list.", err);
    } finally {
      setBackupLoading(false);
    }
  }, [setApiError]);

  useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  const createBackup = async () => {
    setBackupLoading(true);
    try {
      const response = await fetch("/api/backup", { method: "POST", headers: { Accept: "application/json" } });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { filename?: string; size_bytes?: number };
      if (!response.ok) throw data;
      setError({
        title: "Backup created",
        message: `Saved ${data.filename ?? "backup"} (${formatBytes(data.size_bytes ?? 0)}).`,
        actions: ["Your data is backed up locally."],
      });
      await loadBackups();
    } catch (err) {
      setApiError("Backup failed", "We could not create a backup.", err);
    } finally {
      setBackupLoading(false);
    }
  };

  const restoreBackup = async (filename: string) => {
    setBackupLoading(true);
    try {
      const response = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ filename }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { pre_restore_backup?: string };
      if (!response.ok) throw data;
      setRestoreTarget(null);
      setError({
        title: "Backup restored",
        message: `Restored from ${filename}. A safety backup was saved as ${data.pre_restore_backup ?? "pre-restore backup"}.`,
        actions: ["Refresh the page to load restored data."],
      });
      await loadBackups();
    } catch (err) {
      setApiError("Restore failed", "We could not restore from that backup.", err);
    } finally {
      setBackupLoading(false);
    }
  };

  const deleteBackup = async (filename: string) => {
    setBackupLoading(true);
    try {
      const response = await fetch(`/api/backup/${encodeURIComponent(filename)}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!response.ok && response.status !== 204) {
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
        throw data;
      }
      await loadBackups();
    } catch (err) {
      setApiError("Delete failed", "We could not delete that backup.", err);
    } finally {
      setBackupLoading(false);
    }
  };

  const saveAiSettings = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          provider: "openai",
          model: aiConfig?.model ?? "gpt-4.1-mini",
          api_key: aiApiKeyDraft || undefined,
          base_url: aiConfig?.baseUrl ?? "",
          timeout_ms: aiConfig?.timeoutMs ?? 30000,
          retry_count: aiConfig?.retryCount ?? 1,
          token_budget: aiConfig?.tokenBudget ?? 2000,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { config?: AiConfig };
      if (!response.ok) throw data;
      if (data.config) setAiConfig(data.config);
      setAiApiKeyDraft("");
      setError(null);
    } catch (err) {
      setApiError("Could not save AI settings", "We could not save AI settings.", err);
    } finally {
      setSaving(false);
    }
  };

  const testAiSettings = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/settings/ai/test-connection", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
      if (!response.ok) throw data;
      setError({
        title: "AI connection is ready",
        message: "Your integrated AI provider responded successfully.",
        actions: ["You can now use Generate in app for listing drafts."],
      });
    } catch (err) {
      setApiError("AI connection test failed", "We could not verify AI connection.", err);
    } finally {
      setSaving(false);
    }
  };

  const savePublishSettings = async () => {
    setSaving(true);
    try {
      const updates: Array<{ key: string; value: string }> = [
        { key: "etsy.publish.taxonomy_id", value: publishConfig.taxonomyId.trim() },
        { key: "etsy.publish.shipping_profile_id", value: publishConfig.shippingProfileId.trim() },
        { key: "etsy.publish.readiness_state_id", value: publishConfig.readinessStateId.trim() },
        { key: "etsy.publish.image_ids", value: publishConfig.imageIds.trim() },
        { key: "etsy.publish.who_made", value: publishConfig.whoMade.trim() || "i_did" },
        { key: "etsy.publish.when_made", value: publishConfig.whenMade.trim() || "before_2000" },
        { key: "etsy.publish.image_max_dimension", value: publishConfig.imageMaxDimension.trim() || "2000" },
        { key: "etsy.publish.image_target_dpi", value: publishConfig.imageTargetDpi.trim() || "300" },
        { key: "etsy.publish.image_jpeg_quality", value: publishConfig.imageJpegQuality.trim() || "82" },
        { key: "etsy.publish.allow_partial_image_upload", value: publishConfig.allowPartialImageUpload.trim() || "false" },
        { key: "etsy.publish.image_upload_attempts", value: publishConfig.imageUploadAttempts.trim() || "3" },
      ];
      for (const update of updates) {
        const response = await fetch(`/api/settings/${encodeURIComponent(update.key)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ value: update.value }),
        });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
        if (!response.ok) throw data;
      }
      setError({
        title: "Publish settings saved",
        message: "Etsy publish defaults were saved successfully.",
        actions: ["You can now publish approved listing drafts to Etsy."],
      });
    } catch (err) {
      setApiError("Could not save publish settings", "We could not save Etsy publish settings.", err);
    } finally {
      setSaving(false);
    }
  };

  const saveIconSettings = async () => {
    setSaving(true);
    try {
      const updates: Array<{ key: string; value: string }> = [
        { key: "ui.icons.screen_header_path", value: iconConfig.screenHeaderPath.trim() || "/icons/screen-header.png" },
        { key: "ui.icons.report_header_path", value: iconConfig.reportHeaderPath.trim() || "/icons/report-header.png" },
        { key: "ui.icons.screen_header_size_px", value: iconConfig.screenHeaderSizePx.trim() || "32" },
        { key: "ui.icons.report_header_width_px", value: iconConfig.reportHeaderWidthPx.trim() || "220" },
      ];
      for (const update of updates) {
        const response = await fetch(`/api/settings/${encodeURIComponent(update.key)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ value: update.value }),
        });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
        if (!response.ok) throw data;
      }
      setError({
        title: "Icon settings saved",
        message: "Screen and report icon configuration was updated.",
        actions: ["Refresh or switch tabs to verify icon rendering."],
      });
    } catch (err) {
      setApiError("Could not save icon settings", "We could not save icon settings.", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
      <h3 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">Configuration</h3>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
          <h4 className="mb-2 text-sm font-semibold">AI settings</h4>
          <input
            value={aiConfig?.model ?? ""}
            onChange={(e) =>
              setAiConfig((current) => ({
                provider: current?.provider ?? "openai",
                model: e.target.value,
                baseUrl: current?.baseUrl ?? null,
                timeoutMs: current?.timeoutMs ?? 30000,
                retryCount: current?.retryCount ?? 1,
                tokenBudget: current?.tokenBudget ?? 2000,
                apiKeyConfigured: current?.apiKeyConfigured ?? false,
              }))
            }
            placeholder="Model"
            className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
          />
          <input
            value={aiApiKeyDraft}
            onChange={(e) => setAiApiKeyDraft(e.target.value)}
            placeholder="API key"
            className="mt-2 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
          />
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={saveAiSettings} disabled={saving} className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white">
              Save AI settings
            </button>
            <button type="button" onClick={testAiSettings} disabled={saving} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm">
              Test connection
            </button>
          </div>
        </div>
        <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
          <h4 className="mb-2 text-sm font-semibold">Publish defaults</h4>
          <input value={publishConfig.taxonomyId} onChange={(e) => setPublishConfig((c) => ({ ...c, taxonomyId: e.target.value }))} placeholder="taxonomy_id" className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
          <input value={publishConfig.shippingProfileId} onChange={(e) => setPublishConfig((c) => ({ ...c, shippingProfileId: e.target.value }))} placeholder="shipping_profile_id" className="mt-2 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
          <button type="button" onClick={savePublishSettings} disabled={saving} className="mt-2 rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm">
            Save publish defaults
          </button>
        </div>
        <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
          <h4 className="mb-2 text-sm font-semibold">Icons and sizing</h4>
          <p className="mb-2 text-xs text-[var(--ui-muted)]">Use `/icons/...` paths for bundled install-safe assets.</p>
          <input value={iconConfig.screenHeaderPath} onChange={(e) => setIconConfig((c) => ({ ...c, screenHeaderPath: e.target.value }))} placeholder="/icons/screen-header.png" className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
          <input value={iconConfig.screenHeaderSizePx} onChange={(e) => setIconConfig((c) => ({ ...c, screenHeaderSizePx: e.target.value }))} placeholder="Screen icon size px" className="mt-2 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
          <input value={iconConfig.reportHeaderPath} onChange={(e) => setIconConfig((c) => ({ ...c, reportHeaderPath: e.target.value }))} placeholder="/icons/report-header.png" className="mt-2 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
          <input value={iconConfig.reportHeaderWidthPx} onChange={(e) => setIconConfig((c) => ({ ...c, reportHeaderWidthPx: e.target.value }))} placeholder="Report icon width px" className="mt-2 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
          <button type="button" onClick={saveIconSettings} disabled={saving} className="mt-2 rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm">
            Save icon settings
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-[var(--ui-title)]">Backup and restore</h4>
            <p className="text-xs text-[var(--ui-muted)]">Local SQLite backups (ADR-027). Rolling retention keeps recent copies.</p>
          </div>
          <button
            type="button"
            onClick={createBackup}
            disabled={backupLoading}
            className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Backup now
          </button>
        </div>

        {backupLoading && backups.length === 0 ? (
          <p className="text-sm text-[var(--ui-muted)]">Loading backups…</p>
        ) : backups.length === 0 ? (
          <p className="text-sm text-[var(--ui-muted)]">No backups yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--ui-border)] text-[var(--ui-muted)]">
                  <th className="py-2 pr-3 font-medium">File</th>
                  <th className="py-2 pr-3 font-medium">Created</th>
                  <th className="py-2 pr-3 font-medium">Size</th>
                  <th className="py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.slice(0, 5).map((backup) => (
                  <tr key={backup.filename} className="border-b border-[var(--ui-border)]/60">
                    <td className="py-2 pr-3 text-[var(--ui-body)]">{backup.filename}</td>
                    <td className="py-2 pr-3 text-[var(--ui-muted)]">{backup.created_at}</td>
                    <td className="py-2 pr-3 text-[var(--ui-muted)]">{formatBytes(backup.size_bytes)}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setRestoreTarget(backup.filename)}
                          disabled={backupLoading}
                          className="rounded border border-[var(--ui-border)] px-2 py-1 text-xs"
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteBackup(backup.filename)}
                          disabled={backupLoading}
                          className="rounded border border-[var(--ui-red)]/40 px-2 py-1 text-xs text-[var(--ui-red)]"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {restoreTarget ? (
          <div className="mt-4 rounded-lg border border-[var(--ui-yellow)]/40 bg-[var(--ui-yellow)]/10 p-3">
            <p className="text-sm font-medium text-[var(--ui-title)]">Restore from {restoreTarget}?</p>
            <p className="mt-1 text-xs text-[var(--ui-muted)]">
              This replaces your current database. A safety backup is created first.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void restoreBackup(restoreTarget)}
                disabled={backupLoading}
                className="rounded-lg bg-[var(--ui-red)] px-3 py-2 text-sm font-semibold text-white"
              >
                Restore
              </button>
              <button
                type="button"
                onClick={() => setRestoreTarget(null)}
                className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

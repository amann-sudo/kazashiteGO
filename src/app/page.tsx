"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type RangeMode = "daily" | "weekly" | "monthly";

type Campaign = {
  id: string;
  title: string;
  description: string;
  media_path: string;
  media_type: string;
  enabled: number;
};

type TagSummary = {
  id: string;
  label: string;
  store_name: string;
  shelf_name: string;
  point_value: number;
  enabled: number;
  campaign_id: string | null;
  campaign_title: string | null;
  media_path: string | null;
  today_count: number;
  total_count: number;
};

type AnalyticsRow = {
  period: string;
  tag_id: string;
  tag_label: string;
  campaign_title: string;
  count: number;
};

type ChartPoint = {
  label?: string;
  period: string;
  count: number;
};

type ScanEvent = {
  id: string;
  occurred_at: string;
  occurred_at_jst: string;
  time_jst: string;
  tag_id: string;
  tag_label: string;
  campaign_title: string;
  user_id: string | null;
  user_agent: string | null;
};

type UserSummary = {
  id: string;
  display_name: string;
  linked_at: string | null;
  created_at: string;
  last_seen_at: string;
  balance: number;
  lifetime_points: number;
  reward_count: number;
  latest_reward_at: string | null;
};

type PointStats = {
  awarded_today: number;
  outstanding_points: number;
  user_count: number;
};

type SummaryResponse = {
  day: string;
  range: RangeMode;
  tags: TagSummary[];
  campaigns: Campaign[];
  analytics: AnalyticsRow[];
  charts: Record<RangeMode, ChartPoint[]>;
  events: ScanEvent[];
  users: UserSummary[];
  pointStats: PointStats;
};

type TagDraft = {
  campaignId: string;
  pointValue: number;
  enabled: boolean;
};

const rangeLabels: Record<RangeMode, string> = {
  daily: "日次",
  weekly: "週次",
  monthly: "月次",
};

const nf = new Intl.NumberFormat("ja-JP");

export default function Home() {
  const [range, setRange] = useState<RangeMode>("daily");
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadSummary() {
      setLoading(true);
      try {
        const response = await fetch(`/api/admin/summary?range=${range}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("管理データを取得できませんでした。");
        }

        const data = (await response.json()) as SummaryResponse;
        setSummary(data);
        setMessage("");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setMessage("管理APIまたはD1の状態を確認してください。");
      } finally {
        setLoading(false);
      }
    }

    void loadSummary();

    return () => controller.abort();
  }, [range]);

  const totals = useMemo(() => {
    const tags = summary?.tags ?? [];
    const scans = tags.reduce((sum, tag) => sum + tag.total_count, 0);
    const today = tags.reduce((sum, tag) => sum + tag.today_count, 0);
    const points = Number(summary?.pointStats?.awarded_today ?? 0);
    const users = Number(summary?.pointStats?.user_count ?? 0);
    const outstanding = Number(summary?.pointStats?.outstanding_points ?? 0);

    return { outstanding, points, scans, today, users };
  }, [summary]);

  const currentCampaign = useMemo(() => {
    const activeCampaignId = summary?.tags?.[0]?.campaign_id;

    return (
      summary?.campaigns.find((campaign) => campaign.id === activeCampaignId) ??
      summary?.campaigns[0]
    );
  }, [summary]);

  async function saveTag(tag: TagSummary, draft: TagDraft) {
    setMessage("NFC IDの設定を更新しています。");
    const response = await fetch(`/api/admin/tags/${tag.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: draft.campaignId,
        pointValue: draft.pointValue,
        enabled: draft.enabled,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      setMessage("更新に失敗しました。D1の状態を確認してください。");
      throw new Error(errorText);
    }

    const next = await fetch(`/api/admin/summary?range=${range}`);
    setSummary((await next.json()) as SummaryResponse);
    setMessage("NFC IDの設定を更新しました。");
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">kazashiteGO</p>
          <h1>NFC広告管理画面</h1>
        </div>
        <a className="scan-link" href="/t/kg-0001">
          サンプルNFCを開く
        </a>
      </header>

      <section className="metric-grid" aria-label="主要指標">
        <Metric label="本日の読み取り" value={nf.format(totals.today)} suffix="回" />
        <Metric label="累計読み取り" value={nf.format(totals.scans)} suffix="回" />
        <Metric label="本日の付与ポイント" value={nf.format(totals.points)} suffix="pt" />
        <Metric label="匿名ユーザー" value={nf.format(totals.users)} suffix="人" />
        <Metric label="保有ポイント総数" value={nf.format(totals.outstanding)} suffix="pt" />
      </section>

      <section className="chart-grid" aria-label="読み取りグラフ">
        {(Object.keys(rangeLabels) as RangeMode[]).map((mode) => (
          <ChartCard
            active={range === mode}
            key={mode}
            points={summary?.charts?.[mode] ?? []}
            title={`${rangeLabels[mode]}グラフ`}
          />
        ))}
      </section>

      <section className="workspace-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Tags</p>
              <h2>NFCタグ管理</h2>
            </div>
            <span>{summary?.day ?? "---- -- --"}</span>
          </div>

          <div className="tag-list">
            {loading && <p className="muted">読み込み中です。</p>}
            {!loading &&
              (summary?.tags ?? []).map((tag) => (
                <TagEditor
                  campaigns={summary?.campaigns ?? []}
                  key={`${tag.id}-${tag.campaign_id}-${tag.point_value}-${tag.enabled}`}
                  onSave={(draft) => saveTag(tag, draft)}
                  tag={tag}
                />
              ))}
          </div>
        </div>

        <div className="panel preview-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Creative</p>
              <h2>現在の広告</h2>
            </div>
          </div>
          {currentCampaign && (
            <Image
              className="ad-preview"
              src={currentCampaign.media_path}
              alt={`${currentCampaign.title}の広告`}
              width={1152}
              height={1440}
              priority
            />
          )}
          <div className="creative-copy">
            <p>{currentCampaign?.description ?? "配信中の広告を表示します。"}</p>
            <strong>{currentCampaign?.title ?? "広告未選択"}</strong>
          </div>
        </div>
      </section>

      <section className="panel analytics-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Analytics</p>
            <h2>読み取り分析</h2>
          </div>
          <div className="segment-control" aria-label="集計単位">
            {(Object.keys(rangeLabels) as RangeMode[]).map((mode) => (
              <button
                aria-pressed={range === mode}
                key={mode}
                onClick={() => setRange(mode)}
                type="button"
              >
                {rangeLabels[mode]}
              </button>
            ))}
          </div>
        </div>

        <div className="analytics-table">
          <div className="table-header">
            <span>期間</span>
            <span>NFC</span>
            <span>広告</span>
            <span>読み取り</span>
          </div>
          {(summary?.analytics ?? []).map((row) => (
            <div className="table-row" key={`${row.period}-${row.tag_id}`}>
              <span>{row.period}</span>
              <span>{row.tag_label}</span>
              <span>{row.campaign_title}</span>
              <span>{nf.format(row.count)}回</span>
            </div>
          ))}
          {!loading && (summary?.analytics ?? []).length === 0 && (
            <p className="muted empty">まだ読み取りデータがありません。</p>
          )}
        </div>
      </section>

      <section className="panel analytics-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Timeline</p>
            <h2>今日のかざし履歴</h2>
          </div>
          <span>時刻は日本時間</span>
        </div>
        <div className="event-table">
          <div className="event-header">
            <span>時刻</span>
            <span>NFC ID</span>
            <span>広告</span>
            <span>端末</span>
          </div>
          {(summary?.events ?? []).map((event) => (
            <div className="event-row" key={event.id}>
              <strong>{event.time_jst}</strong>
              <span>{event.tag_id}</span>
              <span>{event.campaign_title}</span>
              <span>{shortUserAgent(event.user_agent)}</span>
            </div>
          ))}
          {!loading && (summary?.events ?? []).length === 0 && (
            <p className="muted empty">
              秒単位の履歴は、イベント保存を追加した後の読み取りから表示されます。
            </p>
          )}
        </div>
      </section>

      <section className="panel analytics-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Users</p>
            <h2>ユーザー別ポイント</h2>
          </div>
          <span>ログイン連携前の匿名ユーザー</span>
        </div>
        <div className="user-table">
          <div className="user-header">
            <span>ユーザー</span>
            <span>残高</span>
            <span>累計</span>
            <span>最終アクセス</span>
          </div>
          {(summary?.users ?? []).map((user) => (
            <div className="user-row" key={user.id}>
              <span>
                {user.display_name}
                <code>{user.id}</code>
              </span>
              <strong>{nf.format(user.balance)}pt</strong>
              <span>{nf.format(user.lifetime_points)}pt</span>
              <span>{formatDateTime(user.last_seen_at)}</span>
            </div>
          ))}
          {!loading && (summary?.users ?? []).length === 0 && (
            <p className="muted empty">まだユーザーがありません。</p>
          )}
        </div>
      </section>

      {message && <p className="status-message">{message}</p>}
    </main>
  );
}

function Metric({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>
        {value}
        <small>{suffix}</small>
      </strong>
    </div>
  );
}

function TagEditor({
  campaigns,
  onSave,
  tag,
}: {
  campaigns: Campaign[];
  onSave: (draft: TagDraft) => Promise<void>;
  tag: TagSummary;
}) {
  const [campaignId, setCampaignId] = useState(tag.campaign_id ?? "");
  const [enabled, setEnabled] = useState(tag.enabled === 1);
  const [localMessage, setLocalMessage] = useState("");
  const [pointValue, setPointValue] = useState(String(tag.point_value));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const nextPointValue = Number(pointValue);

    if (!Number.isInteger(nextPointValue) || nextPointValue < 0 || nextPointValue > 9999) {
      setLocalMessage("ポイントは0から9999の整数で入力してください。");
      return;
    }

    setLocalMessage("");
    setSaving(true);
    try {
      // 管理者がNFC IDに紐付く広告・ポイント・有効状態をまとめて保存できるようにします。
      await onSave({
        campaignId,
        enabled,
        pointValue: nextPointValue,
      });
    } catch {
      setLocalMessage("保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="tag-row">
      <div>
        <p className="tag-title">{tag.label}</p>
        <p className="muted">NFC ID</p>
        <code>{tag.id}</code>
        <p className="muted tag-url-label">NFC書き込みURL</p>
        <code>{`https://kazashitego.kazashitego-go.workers.dev/t/${tag.id}`}</code>
        <p className="muted tag-location">
          {tag.store_name} / {tag.shelf_name}
        </p>
      </div>
      <div className="tag-stats">
        <span>{nf.format(tag.today_count)}回</span>
        <span>累計 {nf.format(tag.total_count)}回</span>
        <span>{nf.format(tag.point_value)}pt</span>
        <span>{tag.enabled === 1 ? "有効" : "停止中"}</span>
      </div>
      <div className="tag-controls">
        <label className="select-label">
          <span>配信広告</span>
          <select
            value={campaignId}
            onChange={(event) => setCampaignId(event.target.value)}
          >
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.title}
              </option>
            ))}
          </select>
        </label>
        <label className="select-label">
          <span>付与ポイント</span>
          <input
            inputMode="numeric"
            max="9999"
            min="0"
            onChange={(event) => setPointValue(event.target.value)}
            type="number"
            value={pointValue}
          />
        </label>
        <label className="toggle-label">
          <input
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            type="checkbox"
          />
          <span>NFC IDを有効にする</span>
        </label>
        <button
          className="save-button"
          disabled={saving}
          onClick={() => void handleSave()}
          type="button"
        >
          {saving ? "保存中" : "このNFC IDの設定を保存"}
        </button>
        {localMessage && <p className="form-message">{localMessage}</p>}
      </div>
    </article>
  );
}

function ChartCard({
  active,
  points,
  title,
}: {
  active: boolean;
  points: ChartPoint[];
  title: string;
}) {
  const max = Math.max(1, ...points.map((point) => point.count));
  const total = points.reduce((sum, point) => sum + point.count, 0);

  return (
    <article className={`chart-card${active ? " active" : ""}`}>
      <div className="chart-heading">
        <h2>{title}</h2>
        <span>{nf.format(total)}回</span>
      </div>
      {points.length === 0 ? (
        <p className="muted empty-chart">まだデータがありません。</p>
      ) : (
        <div className="bars">
          {points.map((point) => {
            const height = Math.max(6, Math.round((point.count / max) * 100));

            return (
              <div className="bar-cell" key={point.period}>
                <div className="bar-wrap">
                  <span className="bar-value">{nf.format(point.count)}</span>
                  <i style={{ height: `${height}%` }} />
                </div>
                <span className="bar-label">{point.label ?? compactPeriod(point.period)}</span>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

function compactPeriod(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value.slice(5);
  }

  return value.replace(/^\d{4}-/, "");
}

function shortUserAgent(value: string | null) {
  const text = value ?? "";

  if (text === "backfilled-from-point-claims") {
    return "過去データから補完";
  }
  if (text.includes("iPhone")) {
    return "iPhone";
  }
  if (text.includes("Windows")) {
    return "Windows";
  }
  if (text.includes("Macintosh")) {
    return "Mac";
  }
  if (text.includes("Android")) {
    return "Android";
  }

  return text ? text.slice(0, 28) : "不明";
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return value.replace("T", " ").slice(0, 16);
}

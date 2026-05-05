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

type SummaryResponse = {
  day: string;
  range: RangeMode;
  tags: TagSummary[];
  campaigns: Campaign[];
  analytics: AnalyticsRow[];
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
          throw new Error("集計データを取得できませんでした。");
        }

        const data = (await response.json()) as SummaryResponse;
        setSummary(data);
        setMessage("");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setMessage(
          "Cloudflare Pages FunctionsとD1を起動すると、ここに実データが表示されます。",
        );
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
    const points = tags.reduce(
      (sum, tag) => sum + tag.today_count * tag.point_value,
      0,
    );

    return { scans, today, points };
  }, [summary]);

  async function updateTag(tag: TagSummary, campaignId: string) {
    setMessage("広告の紐づけを更新しています。");
    const response = await fetch(`/api/admin/tags/${tag.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId,
        pointValue: tag.point_value,
        enabled: tag.enabled === 1,
      }),
    });

    if (!response.ok) {
      setMessage("更新に失敗しました。D1の状態を確認してください。");
      return;
    }

    const next = await fetch(`/api/admin/summary?range=${range}`);
    setSummary((await next.json()) as SummaryResponse);
    setMessage("広告の紐づけを更新しました。");
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">kazashiteGO</p>
          <h1>NFC広告オペレーション</h1>
        </div>
        <a className="scan-link" href="/t/kg-0001">
          サンプルNFCを開く
        </a>
      </header>

      <section className="metric-grid" aria-label="主要指標">
        <Metric label="本日の読取" value={nf.format(totals.today)} suffix="回" />
        <Metric label="累計読取" value={nf.format(totals.scans)} suffix="回" />
        <Metric label="本日の付与予定" value={nf.format(totals.points)} suffix="pt" />
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
                <article className="tag-row" key={tag.id}>
                  <div>
                    <p className="tag-title">{tag.label}</p>
                    <p className="muted">
                      {tag.store_name} / {tag.shelf_name} / {tag.point_value}pt
                    </p>
                  </div>
                  <div className="tag-stats">
                    <span>{nf.format(tag.today_count)}回</span>
                    <span>累計 {nf.format(tag.total_count)}回</span>
                  </div>
                  <label className="select-label">
                    <span>広告</span>
                    <select
                      value={tag.campaign_id ?? ""}
                      onChange={(event) => updateTag(tag, event.target.value)}
                    >
                      {(summary?.campaigns ?? []).map((campaign) => (
                        <option key={campaign.id} value={campaign.id}>
                          {campaign.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </article>
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
          <Image
            className="ad-preview"
            src="/ads/onion-curry.png"
            alt="玉ねぎ売り場向けのカレー広告"
            width={1152}
            height={1440}
            priority
          />
          <div className="creative-copy">
            <p>玉ねぎ棚</p>
            <strong>今夜は、香り立つカレー。</strong>
          </div>
        </div>
      </section>

      <section className="panel analytics-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Analytics</p>
            <h2>読取分析</h2>
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
            <span>読取</span>
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
            <p className="muted">まだ読取データがありません。</p>
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

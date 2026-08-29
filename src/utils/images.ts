export async function imageBlob(
  file: File,
  maxDimension = 1800,
): Promise<Blob> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw new Error("请选择10MB以内的JPG、PNG或WebP图片");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("图片无法读取"));
      i.src = url;
    });
    const ratio = Math.min(1, maxDimension / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * ratio));
    canvas.height = Math.max(1, Math.round(img.height * ratio));
    const c = canvas.getContext("2d");
    if (!c) throw new Error("浏览器不支持图片处理");
    c.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("图片处理失败"))),
        "image/jpeg",
        0.88,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

import type { Snapshot } from "../domain/types";
import { podium } from "../domain/RankingEngine";
export async function watermarkPhoto(blob: Blob, s: Snapshot): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const width = img.naturalWidth,
      scale = width / 900;
    const canvas = document.createElement("canvas"),
      ctx = canvas.getContext("2d")!;
    const lines = [
      s.event.name,
      ...podium(s).map(
        (r) =>
          r.label +
          " · " +
          r.entries
            .map((e) => e.team_name || e.players.map((p) => p.name).join(" / "))
            .join("、"),
      ),
      "比赛日期 · " +
        (s.event.event_date || s.event.finished_at?.slice(0, 10) || ""),
    ];
    const wrapped: string[] = [];
    ctx.font = 24 * scale + "px sans-serif";
    for (const line of lines) {
      let current = "";
      for (const char of line) {
        if (ctx.measureText(current + char).width > width - 72 * scale) {
          wrapped.push(current);
          current = char;
        } else current += char;
      }
      wrapped.push(current);
    }
    const footer = (70 + 38 * wrapped.length) * scale;
    canvas.width = width;
    canvas.height = img.naturalHeight + footer;
    ctx.drawImage(img, 0, 0);
    ctx.fillStyle = "#f4f1e7";
    ctx.fillRect(0, img.naturalHeight, width, footer);
    ctx.fillStyle = "#425652";
    ctx.font = 24 * scale + "px sans-serif";
    wrapped.forEach((line, i) =>
      ctx.fillText(line, 36 * scale, img.naturalHeight + (48 + i * 38) * scale),
    );
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("水印生成失败"))),
        "image/jpeg",
        0.9,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

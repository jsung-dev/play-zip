import { createOutdoorAdResources } from "../../components/delivery/three/outdoor-ad-material";
import { OUTDOOR_AD_FORMATS, type OutdoorAdFormat } from "../../data/delivery-outdoor-ads";

const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export async function run() {
  const pool = createOutdoorAdResources(), records = [];
  const montage = document.createElement("canvas"); montage.width = 960; montage.height = 1000;
  const sheet = montage.getContext("2d")!; sheet.fillStyle = "#e7eee9"; sheet.fillRect(0, 0, 960, 1000);
  const formats = Object.keys(OUTDOOR_AD_FORMATS) as OutdoorAdFormat[];
  for (const [row, format] of formats.entries()) {
    const spec = OUTDOOR_AD_FORMATS[format];
    const fallback = pool.panel({ id: `${format}-empty`, format, image: null }, 8);
    const valid = pool.panel({ id: `${format}-valid`, format, image: `https://outdoor-qa.invalid/${format}.svg` }, 8);
    const wrong = pool.panel({ id: `${format}-wrong`, format, image: `https://outdoor-qa.invalid/${format === "banner" ? "tall" : "wide"}.svg` }, 8);
    const failed = pool.panel({ id: `${format}-404`, format, image: `https://outdoor-qa.invalid/missing-${format}.png` }, 8);
    for (let n = 0; n < 100 && (valid.material.userData.state !== "image" || wrong.material.userData.state !== "image"); n++) await wait(30);
    await wait(100);
    assert(valid.material.userData.state === "image", `${format}: valid image failed`);
    assert(wrong.material.userData.state === "image", `${format}: mismatched image failed`);
    assert(failed.material.userData.state === "fallback", `${format}: error must retain fallback`);
    assert((fallback.material.map!.image as HTMLCanvasElement).toDataURL() === (failed.material.map!.image as HTMLCanvasElement).toDataURL(), `${format}: missing/error fallback differs`);
    assert(Math.abs(valid.scale.x / valid.scale.y - spec.ratio) < 1e-10, `${format}: stretched plane`);
    assert(valid.geometry === fallback.geometry && valid.geometry === wrong.geometry, "Share the unit plane");
    assert(fallback.material === pool.panel({ id: "another-empty", format, image: "" }, 12).material, "Share equivalent fallback material");
    const rect = wrong.material.userData.contentRect;
    const expectedRatio = format === "banner" ? .5 : 4;
    assert(Math.abs(rect.width / rect.height - expectedRatio) < 1e-10, `${format}: image distortion`);
    assert(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= spec.texture[0] + .001 && rect.y + rect.height <= spec.texture[1] + .001, `${format}: clipping`);
    const canvas = wrong.material.map!.image as HTMLCanvasElement, ctx = canvas.getContext("2d")!;
    const margin = ctx.getImageData(1, 1, 1, 1).data;
    assert(margin[0] === 255 && margin[1] === 251 && margin[2] === 237, `${format}: cream letterbox`);
    // Solid red corners in the source must all survive contain, not cover/crop.
    for (const [u, v] of [[.02, .02], [.98, .02], [.02, .98], [.98, .98]]) {
      const pixel = ctx.getImageData(Math.floor(rect.x + rect.width * u), Math.floor(rect.y + rect.height * v), 1, 1).data;
      assert(pixel[0] > 200 && pixel[1] < 80, `${format}: source corner cropped`);
    }
    for (const [column, panel] of [fallback, valid, wrong, failed].entries()) {
      const image = panel.material.map!.image as HTMLCanvasElement;
      const scale = Math.min(220 / image.width, 195 / image.height), width = image.width * scale, height = image.height * scale;
      sheet.drawImage(image, column * 240 + (240 - width) / 2, row * 250 + 40 + (195 - height) / 2, width, height);
      sheet.fillStyle = "#164f40"; sheet.font = "bold 14px sans-serif";
      sheet.fillText(`${format} / ${["empty", "image", "contain", "404"][column]}`, column * 240 + 15, row * 250 + 25);
    }
    records.push({ format, ratio: valid.scale.x / valid.scale.y, texture: spec.texture, loaded: true, failedFallback: true, contained: rect });
  }
  const a = pool.material({ id: "a", format: "square", image: "https://outdoor-qa.invalid/square.svg" });
  const b = pool.material({ id: "b", format: "square", image: "https://outdoor-qa.invalid/alternate.svg" });
  for (let n = 0; n < 100 && b.userData.state !== "image"; n++) await wait(30);
  assert(a !== b && (a.map!.image as HTMLCanvasElement).toDataURL() !== (b.map!.image as HTMLCanvasElement).toDataURL(), "Same format must support different images");
  const corrupt = pool.material({ id: "bad", format: "square", image: "https://outdoor-qa.invalid/corrupt.png" });
  const cors = pool.material({ id: "cors", format: "square", image: "https://outdoor-qa.invalid/no-cors.svg" });
  const disposed = pool.material({ id: "late", format: "square", image: "https://outdoor-qa.invalid/slow.svg" });
  disposed.map!.dispose();
  await wait(700);
  assert(corrupt.userData.state === "fallback" && cors.userData.state === "fallback", "Decode/CORS failure fallback");
  assert(disposed.userData.state !== "image", "Late load must not revive a disposed texture");
  return { records, independentCreatives: true, corruptAndCorsFallback: true, lateLoadSafe: true, montage: montage.toDataURL() };
}

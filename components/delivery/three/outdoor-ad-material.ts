import * as THREE from "three";
import { OUTDOOR_AD_FORMATS, OUTDOOR_AD_STYLE, type OutdoorCreative } from "@/data/delivery-outdoor-ads";

export function containImage(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number) {
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale, height = sourceHeight * scale;
  return { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width, height };
}

// A world owns this pool. Identical format+image uses one GPU texture/material;
// different images on the same format stay independent. Never used by the bike.
export function createOutdoorAdResources() {
  const materials = new Map<string, THREE.MeshBasicMaterial>();
  const plane = new THREE.PlaneGeometry(1, 1);
  function material(creative: OutdoorCreative) {
    const source = creative.image?.trim() || "";
    const key = `${creative.format}:${source}`;
    const cached = materials.get(key);
    if (cached) return cached;
    const spec = OUTDOOR_AD_FORMATS[creative.format];
    const canvas = document.createElement("canvas");
    [canvas.width, canvas.height] = spec.texture;
    const ctx = canvas.getContext("2d")!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    const result = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false });
    result.userData = { outdoor: true, format: creative.format, source, state: "fallback" };
    materials.set(key, result);
    let disposed = false;
    let image: HTMLImageElement | undefined;
    texture.addEventListener("dispose", () => {
      disposed = true;
      if (image) { image.onload = null; image.onerror = null; image.src = ""; }
    });
    const clear = () => {
      ctx.fillStyle = OUTDOOR_AD_STYLE.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    const fallback = () => {
      if (disposed) return;
      clear();
      const { width: w, height: h } = canvas;
      const lines = creative.format === "square" || creative.format === "portrait" ? ["광고주", "구함"] : [OUTDOOR_AD_STYLE.fallback];
      let fontSize = Math.min(w * (lines.length === 2 ? .255 : .145), h * (lines.length === 2 ? .23 : .48));
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = OUTDOOR_AD_STYLE.ink;
      const setFont = () => { ctx.font = `900 ${Math.floor(fontSize)}px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`; };
      setFont();
      while (Math.max(...lines.map(line => ctx.measureText(line).width)) > w * .81) { fontSize--; setFont(); }
      lines.forEach((line, index) => ctx.fillText(line, w / 2, h / 2 + (index - (lines.length - 1) / 2) * fontSize * 1.4));
      result.userData.state = "fallback"; texture.needsUpdate = true;
    };
    fallback();
    // Repaint once fonts are ready, but never overwrite a loaded creative.
    document.fonts?.ready.then(() => { if (!disposed && result.userData.state === "fallback") fallback(); });
    if (source) {
      image = new Image(); image.crossOrigin = "anonymous"; image.decoding = "async";
      image.onload = () => {
        if (disposed) return;
        if (!image?.naturalWidth || !image.naturalHeight) { fallback(); return; }
        try {
          clear();
          const box = containImage(image.naturalWidth, image.naturalHeight, canvas.width, canvas.height);
          ctx.drawImage(image, box.x, box.y, box.width, box.height);
          // Detect a tainted canvas before it can fail later at WebGL upload.
          ctx.getImageData(0, 0, 1, 1);
          result.userData.state = "image"; result.userData.contentRect = box;
          texture.needsUpdate = true;
        } catch {
          // Resizing also clears a tainted bitmap and its security state.
          canvas.width = spec.texture[0]; fallback();
        }
      };
      image.onerror = fallback;
      image.src = source;
    }
    return result;
  }
  function panel(creative: OutdoorCreative, width: number) {
    const mesh = new THREE.Mesh(plane, material(creative));
    mesh.name = `outdoor-ad:${creative.id}`;
    mesh.userData = { outdoorAdId: creative.id, format: creative.format };
    mesh.scale.set(width, width / OUTDOOR_AD_FORMATS[creative.format].ratio, 1);
    return mesh;
  }
  return { material, panel };
}
export type OutdoorAdResources = ReturnType<typeof createOutdoorAdResources>;

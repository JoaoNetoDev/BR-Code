import { cn } from "@/components/lib/utils.js";

/**
 * BR Code 的品牌标记。
 *
 * 仓库里只有位图资产（`public/logo/br-code.png`），没有矢量版本；这里直接引用
 * 缩放后的副本，Vite 会在构建时把相对 URL 解析成打包后的资源地址。
 *
 * 标记本身是装饰性的：可访问名由外层容器承担（例如 welcome screen 里带
 * `role="img"` 和 `aria-label` 的外壳），所以 `alt` 固定为空。
 */
const brCodeLogoUrl = new URL("../../assets/br-code-logo.png", import.meta.url).href;

export function BrCodeAboutLogo({ className }: { className?: string }) {
  return (
    <img
      src={brCodeLogoUrl}
      alt=""
      className={cn("shrink-0 object-contain", className)}
      aria-hidden="true"
    />
  );
}
